// Nexus'tan mod alma akışı (Stardew'deki akışın CS2 karşılığı).
//
// Premium üye: dosya uygulama içinden indirilir. Ücretsiz üye: Nexus'un kuralı gereği dosya sayfası
// tarayıcıda açılır ("Mod Manager Download"); gelen nxm bağlantısı istediğimiz moda aitse kabuğun onay
// penceresi atlanır. Her iki yolda da indirme ortak güvenlik hattından geçer; uygulama içinden başlatılan
// görevlerin inceleme penceresi hazır olunca kendiliğinden açılır.

import { toast } from "sonner";
import { create } from "zustand";
import { locale } from "@/lib/format";
import { EVENTS, invoke, listen } from "@/lib/ipc";
import { keys, queryClient, upsertJob, useJobs } from "@/lib/queries";
import { useUi } from "@/lib/store";
import type { JobSnapshot, NexusStatus, NxmStatus } from "@/lib/types";
import { notifyError, openUrl } from "@/shell/actions";
import { api } from "./api";
import { s } from "./i18n";
import { GAME } from "./queries";

export const nexusModUrl = (id: number) => `https://www.nexusmods.com/citiesskylines2/mods/${id}`;
const nexusFileUrl = (modId: number, fileId?: number | null) => (fileId ? `${nexusModUrl(modId)}?tab=files&file_id=${fileId}&nmm=1` : `${nexusModUrl(modId)}?tab=files`);

/** Uygulama içinden başlatılmış, incelemesi henüz açılmamış görevler. */
const pending: string[] = [];
const jobOfMod = new Map<number, string>();
const expected: { modId: number; until: number }[] = [];
const EXPECT_MS = 20 * 60_000;
const useModJobs = create<{ version: number; bump: () => void }>((set) => ({ version: 0, bump: () => set((x) => ({ version: x.version + 1 })) }));

let started = false;
function init() {
  if (started) return;
  started = true;
  listen<JobSnapshot>(EVENTS.job, (j) => {
    if (j.game === GAME && j.stage === "review") openNextReview(j);
  });
  useUi.subscribe((st, prev) => {
    if (st.nxmQueue !== prev.nxmQueue) takeExpectedNxm();
    if (st.reviewJobId === prev.reviewJobId) return;
    if (st.reviewJobId) {
      const i = pending.indexOf(st.reviewJobId);
      if (i >= 0) pending.splice(i, 1);
    } else queueMicrotask(() => openNextReview());
  });
}

function track(job: JobSnapshot, modId: number) {
  init();
  upsertJob(job);
  pending.push(job.id);
  jobOfMod.set(modId, job.id);
  useModJobs.getState().bump();
  openNextReview();
}

function openNextReview(latest?: JobSnapshot) {
  const ui = useUi.getState();
  const cached = queryClient.getQueryData<JobSnapshot[]>(keys.jobs) ?? [];
  const jobs = latest ? [latest, ...cached.filter((j) => j.id !== latest.id)] : cached;
  if (ui.reviewJobId && jobs.some((j) => j.id === ui.reviewJobId && j.stage === "review")) return;
  for (let i = 0; i < pending.length; i++) {
    const job = jobs.find((j) => j.id === pending[i]);
    if (!job || job.stage === "done" || job.stage === "failed" || job.stage === "cancelled") {
      pending.splice(i--, 1);
      continue;
    }
    if (job.stage === "review") {
      pending.splice(i, 1);
      ui.setReview(job.id);
      return;
    }
  }
}

function takeExpectedNxm() {
  const head = useUi.getState().nxmQueue[0];
  if (!head || head.game !== GAME) return;
  const modId = Number(head.url.match(/mods\/(\d+)\/files\/\d+/i)?.[1]);
  const i = expected.findIndex((e) => e.modId === modId && e.until > Date.now());
  if (i < 0) return;
  expected.splice(i, 1);
  useUi.getState().shiftNxm();
  invoke<JobSnapshot>("nxm_open", { url: head.url })
    .then((job) => {
      track(job, modId);
      toast(s().discover.nxmCaught);
    })
    .catch(notifyError);
}

/** Bu mod için uygulama içinden başlatılan son görev. */
export function useModJob(modId: number): JobSnapshot | undefined {
  useModJobs((x) => x.version);
  const { data: jobs } = useJobs();
  const id = jobOfMod.get(modId);
  return id ? jobs?.find((j) => j.id === id) : undefined;
}

export async function registerNxm() {
  try {
    queryClient.setQueryData(keys.nxm, await invoke<NxmStatus>("nxm_register"));
    toast.success(s().discover.nxmRegistered);
  } catch (e) {
    notifyError(e);
  }
}

/** Bir Nexus modunu indirip incelemeye getirir (ana dosya belirsizse Nexus sayfası açılır). */
export async function getFromNexus(modId: number, name: string) {
  init();
  const t = s().discover;
  try {
    const page = await queryClient.fetchQuery({ queryKey: [GAME, "nexus-mod", modId], queryFn: () => api.nexusMod(modId), staleTime: 5 * 60_000 });
    if (page.mainFileId === null) {
      await openUrl(nexusFileUrl(modId));
      toast(t.pickFile);
      return;
    }
    const [nexus, nxm] = await Promise.all([
      queryClient.fetchQuery({ queryKey: keys.nexus, queryFn: () => invoke<NexusStatus>("nexus_status", { verify: false }), staleTime: 5 * 60_000 }),
      queryClient.fetchQuery({ queryKey: keys.nxm, queryFn: () => invoke<NxmStatus>("nxm_status"), staleTime: 60_000 }),
    ]);
    if (!nexus.hasKey) {
      toast.warning(t.needKeyTitle, { description: t.needKeyBody, action: { label: t.settings, onClick: () => useUi.getState().go({ kind: "settings" }) } });
      return;
    }
    if (nexus.user?.isPremium) {
      track(await api.installNexus(modId, page.mainFileId, name), modId);
      toast(t.started(name), { description: t.startedHint });
      return;
    }
    const now = Date.now();
    for (let i = expected.length - 1; i >= 0; i--) if (expected[i].until < now || expected[i].modId === modId) expected.splice(i, 1);
    expected.push({ modId, until: now + EXPECT_MS });
    await openUrl(nexusFileUrl(modId, page.mainFileId));
    if (nxm.registered) toast(t.openedOnNexus, { description: t.openedHint });
    else toast.warning(t.openedOnNexus, { description: t.nxmMissing, action: { label: t.connect, onClick: () => void registerNxm() } });
  } catch (e) {
    notifyError(e);
  }
}

/** Nexus özetlerindeki HTML varlıklarını çözer (içerik düz metin olarak gösterilir). */
export function decodeEntities(v: string): string {
  return v
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .trim();
}

/** 12 345 → "12 B" / "12K" */
export function compact(n: number): string {
  return new Intl.NumberFormat(locale(), { notation: "compact", maximumFractionDigits: 1 }).format(n);
}
