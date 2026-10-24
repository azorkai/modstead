// Nexus'tan mod alma akışı (Keşfet, güncellemeler, eksik gereksinimler hep buradan geçer).
//
// Premium üye: dosya uygulama içinden indirilir. Ücretsiz üye: Nexus'un kuralı gereği dosya sayfası
// tarayıcıda açılır ("Mod Manager Download"); gelen nxm bağlantısı bizim istediğimiz moda aitse kabuğun
// onay penceresi atlanır (istek zaten kullanıcıdan geldi). Her iki yolda da indirme ortak güvenlik
// hattından geçer ve kurulum yalnızca inceleme penceresindeki onayla yapılır; uygulama içinden
// başlatılan görevlerin inceleme penceresi hazır olunca sırayla kendiliğinden açılır.

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { create } from "zustand";
import { locale } from "@/lib/format";
import { EVENTS, invoke, listen } from "@/lib/ipc";
import { keys, queryClient, upsertJob, useJobs } from "@/lib/queries";
import { useUi } from "@/lib/store";
import type { JobSnapshot, NexusStatus, NxmStatus } from "@/lib/types";
import { notifyError, openUrl } from "@/shell/actions";
import { api } from "./api";
import { s, type Strings } from "./i18n";
import { GAME, goPage, installSmapi } from "./queries";

/** SMAPI'nin Nexus numarası: arşivi bir kurucudur, doğrulanmış GitHub kurulumuna yönlendirilir. */
export const SMAPI_NEXUS_ID = 2400;

export const nexusModUrl = (id: number) => `https://www.nexusmods.com/stardewvalley/mods/${id}`;

/** Nexus dosya sayfası; `nmm=1` doğrudan "Mod Manager Download" akışını başlatır. */
export const nexusFileUrl = (modId: number, fileId?: number | null) => (fileId ? `${nexusModUrl(modId)}?tab=files&file_id=${fileId}&nmm=1` : `${nexusModUrl(modId)}?tab=files`);

export const modPageKey = (modId: number) => [GAME, "nexus-mod", modId] as const;

export function fetchModPage(modId: number) {
  return queryClient.fetchQuery({ queryKey: modPageKey(modId), queryFn: () => api.nexusMod(modId), staleTime: 5 * 60_000 });
}

// ───────────── Mod sayfası çekmecesi ─────────────

interface SheetState {
  modId: number | null;
  /** Gereksinimden gereksinime gezerken geri dönülecek sayfalar. */
  history: number[];
  open: (modId: number) => void;
  back: () => void;
  close: () => void;
}

export const useNexusSheet = create<SheetState>((set) => ({
  modId: null,
  history: [],
  open: (modId) => set((x) => ({ modId, history: x.modId !== null && x.modId !== modId ? [...x.history, x.modId] : x.history })),
  back: () => set((x) => ({ modId: x.history.at(-1) ?? null, history: x.history.slice(0, -1) })),
  close: () => set({ modId: null, history: [] }),
}));

/** Nexus mod sayfasını uygulama içinde açar (Stardew sayfasında değilsek Keşfet'e geçer). */
export function openNexusMod(modId: number) {
  const view = useUi.getState().view;
  if (view.kind !== "game" || view.game !== GAME) goPage("discover");
  useNexusSheet.getState().open(modId);
}

// ───────────── Görev takibi ve nxm beklentileri ─────────────

/** Uygulama içinden başlatılmış, incelemesi henüz açılmamış görevler (eklenme sırasıyla). */
const pending: string[] = [];
/** Mod numarası → son görev (çekmece ve kartlar ilerlemeyi gösterir). */
const jobOfMod = new Map<number, string>();
/** Tarayıcıda açtığımız dosya sayfalarından beklenen nxm bağlantıları. */
const expected: { modId: number; until: number }[] = [];
const EXPECT_MS = 20 * 60_000;

const useModJobs = create<{ version: number; bump: () => void }>((set) => ({ version: 0, bump: () => set((x) => ({ version: x.version + 1 })) }));

let started = false;
function init() {
  if (started) return;
  started = true;
  // Olaydaki görev önbellekten yeni olabilir (kabuğun dinleyicisi sonra çalışabilir); önbelleğe biz
  // yazmayız ki kabuk aşama değişimini görüp bildirimini versin.
  listen<JobSnapshot>(EVENTS.job, (j) => {
    if (j.game === GAME && j.stage === "review") openNextReview(j);
  });
  useUi.subscribe((st, prev) => {
    if (st.nxmQueue !== prev.nxmQueue) takeExpectedNxm();
    if (st.reviewJobId === prev.reviewJobId) return;
    if (st.reviewJobId) {
      // Kullanıcı (ya da biz) açtı: kapatınca yeniden açılmasın.
      const i = pending.indexOf(st.reviewJobId);
      if (i >= 0) pending.splice(i, 1);
    } else queueMicrotask(() => openNextReview());
  });
}

/** Görevi takibe alır: önbelleğe işler, incelemesi hazır olunca pencereyi açar. */
export function track(job: JobSnapshot, modId?: number) {
  init();
  upsertJob(job);
  pending.push(job.id);
  if (modId !== undefined) {
    jobOfMod.set(modId, job.id);
    useModJobs.getState().bump();
  }
  openNextReview();
}

function openNextReview(latest?: JobSnapshot) {
  const ui = useUi.getState();
  const cached = queryClient.getQueryData<JobSnapshot[]>(keys.jobs) ?? [];
  const jobs = latest ? [latest, ...cached.filter((j) => j.id !== latest.id)] : cached;
  // Başka bir inceleme açıksa sırası gelince (pencere kapanınca) açılır.
  if (ui.reviewJobId && jobs.some((j) => j.id === ui.reviewJobId && j.stage === "review")) return;
  for (let i = 0; i < pending.length; i++) {
    const job = jobs.find((j) => j.id === pending[i]);
    if (!job || job.stage === "done" || job.stage === "failed" || job.stage === "cancelled") {
      pending.splice(i--, 1);
      continue;
    }
    if (job.stage === "review") {
      // Her görev bir kez kendiliğinden açılır; kullanıcı kapatırsa görevler panelinde bekler.
      pending.splice(i, 1);
      ui.setReview(job.id);
      return;
    }
  }
}

function expectNxm(modId: number) {
  init();
  const now = Date.now();
  for (let i = expected.length - 1; i >= 0; i--) if (expected[i].until < now || expected[i].modId === modId) expected.splice(i, 1);
  expected.push({ modId, until: now + EXPECT_MS });
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

/** Bu mod için uygulama içinden başlatılan son görev (yoksa `undefined`). */
export function useModJob(modId: number | null): JobSnapshot | undefined {
  useModJobs((x) => x.version);
  const { data: jobs } = useJobs();
  if (modId === null) return undefined;
  const id = jobOfMod.get(modId);
  return id ? jobs?.find((j) => j.id === id) : undefined;
}

// ───────────── Nexus erişimi ─────────────

export interface NexusAccess {
  hasKey: boolean;
  premium: boolean;
  /** Ücretsiz üyelerin "Mod Manager Download" düğmesi Modstead'e gelir mi? */
  nxm: boolean;
}

async function access(): Promise<NexusAccess> {
  const [nexus, nxm] = await Promise.all([
    queryClient.fetchQuery({ queryKey: keys.nexus, queryFn: () => invoke<NexusStatus>("nexus_status", { verify: false }), staleTime: 5 * 60_000 }),
    queryClient.fetchQuery({ queryKey: keys.nxm, queryFn: () => invoke<NxmStatus>("nxm_status"), staleTime: 60_000 }),
  ]);
  return { hasKey: nexus.hasKey, premium: !!nexus.user?.isPremium, nxm: nxm.registered };
}

export async function registerNxm() {
  try {
    queryClient.setQueryData(keys.nxm, await invoke<NxmStatus>("nxm_register"));
    toast.success(s().discover.nxmRegistered);
  } catch (e) {
    notifyError(e);
  }
}

const goSettings = () => useUi.getState().go({ kind: "settings" });

/**
 * Bir Nexus modunu (ya da belirli dosyasını) indirip incelemeye getirir.
 * Dosya verilmezse ana dosya seçilir; seçenekler belirsizse mod sayfası açılır.
 */
export async function getFromNexus(modId: number, opts: { fileId?: number | null; name?: string | null; quiet?: boolean } = {}) {
  init();
  if (modId === SMAPI_NEXUS_ID) return installSmapi();
  const t = s().discover;
  try {
    let { fileId = null, name = null } = opts;
    if (fileId === null) {
      const page = await fetchModPage(modId);
      name ??= page.name;
      fileId = page.mainFileId;
      if (fileId === null) {
        openNexusMod(modId);
        toast(t.pickFile);
        return;
      }
    }
    const a = await access();
    if (!a.hasKey) {
      toast.warning(t.needKeyTitle, { description: t.needKeyBody, action: { label: t.settings, onClick: goSettings } });
      return;
    }
    if (a.premium) {
      track(await api.installNexus(modId, fileId, name), modId);
      if (!opts.quiet) toast(t.started(name ?? `#${modId}`), { description: t.startedHint });
      return;
    }
    expectNxm(modId);
    await openUrl(nexusFileUrl(modId, fileId));
    if (a.nxm) toast(t.openedOnNexus, { description: t.openedHint });
    else toast.warning(t.openedOnNexus, { description: t.nxmMissing, action: { label: t.connect, onClick: () => void registerNxm() } });
  } catch (e) {
    notifyError(e);
  }
}

/** UniqueID'si bilinen bir gereksinimi bulur: Nexus numarası varsa sayfası uygulama içinde açılır. */
export async function findDependency(id: string) {
  const t = toast.loading(s().fix.searching(id));
  try {
    const [r] = await api.lookupMods([id]);
    if (r.nexusId) {
      toast.dismiss(t);
      openNexusMod(r.nexusId);
      return;
    }
    toast.success(r.found ? s().fix.found(r.name ?? id) : s().fix.notFound, { id: t });
    await openUrl(r.url);
  } catch (e) {
    toast.error(e instanceof Error ? e.message : String(e), { id: t });
  }
}

/** Eksik UniqueID'lerin adları ve Nexus numaraları (inceleme penceresi ve çekmece için). */
export function useLookup(ids: string[]) {
  const [data, setData] = useState<Map<string, { name: string | null; nexusId: number | null }>>(new Map());
  const key = [...ids].sort().join("|");
  useEffect(() => {
    if (!key) return;
    let alive = true;
    api
      .lookupMods(key.split("|"))
      .then((rs) => alive && setData(new Map(rs.map((r) => [r.uniqueId.toLowerCase(), { name: r.name, nexusId: r.nexusId }]))))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [key]);
  return data;
}

/** Nexus'un özetlerindeki HTML varlıklarını çözer (içerik düz metin olarak gösterilir). */
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

/** Nexus kategorisinin görünen adı (bilinmeyenler olduğu gibi). */
export function categoryLabel(t: Strings, name: string): string {
  return t.discover.categoryNames[name] ?? name;
}

/** 12 345 → "12 B" / "12K" */
export function compact(n: number): string {
  return new Intl.NumberFormat(locale(), { notation: "compact", maximumFractionDigits: 1 }).format(n);
}
