// Stardew verisi: React Query ile önbelleklenir; arka uç olaylarıyla (oyun değişti, görev bitti,
// oyun kapandı) tazelenir. Mod klasörünü değiştiren eylemler "Geri al" bildirimi sunar.

import { useEffect, useMemo } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { EVENTS, isTauri, listen } from "@/lib/ipc";
import { keys as shellKeys, queryClient, upsertJob } from "@/lib/queries";
import { useUi } from "@/lib/store";
import type { JobSnapshot } from "@/lib/types";
import { installFiles, notifyError, openUrl } from "@/shell/actions";
import { api } from "./api";
import { s } from "./i18n";
import { findDependency } from "./nexus";
import type { Fix, GameExited, Issue, JournalEntry, ModInfo, UpdateEntry } from "./types";

export const GAME = "stardew";

export const qk = {
  all: [GAME] as const,
  env: [GAME, "env"] as const,
  settings: [GAME, "settings"] as const,
  snapshot: [GAME, "snapshot"] as const,
  journal: [GAME, "journal"] as const,
  trash: [GAME, "trash"] as const,
  profiles: [GAME, "profiles"] as const,
  saves: [GAME, "saves"] as const,
  log: [GAME, "log"] as const,
};

export const useEnv = () => useQuery({ queryKey: qk.env, queryFn: api.environment, refetchInterval: 15_000 });
export const useStardewSettings = () => useQuery({ queryKey: qk.settings, queryFn: api.settings, staleTime: Infinity });
export const useSnapshot = () => useQuery({ queryKey: qk.snapshot, queryFn: api.snapshot, staleTime: 10_000 });
export const useJournal = () => useQuery({ queryKey: qk.journal, queryFn: api.journal });
export const useTrash = () => useQuery({ queryKey: qk.trash, queryFn: api.trash });
export const useProfiles = () => useQuery({ queryKey: qk.profiles, queryFn: api.profiles });
export const useSaves = () => useQuery({ queryKey: qk.saves, queryFn: api.saves });
export const useLog = () => useQuery({ queryKey: qk.log, queryFn: api.log });

/** Mod klasörünü etkileyen her değişiklikten sonra: bu oyunun tüm verisi + ana sayfa kartı. */
export function refreshAll() {
  void queryClient.invalidateQueries({ queryKey: qk.all });
  void queryClient.invalidateQueries({ queryKey: shellKeys.games });
}

function undoToast(text: string, entry: JournalEntry) {
  if (!entry.actions?.length) {
    toast.success(text);
    return;
  }
  toast.success(text, {
    action: {
      label: s().common.undo,
      onClick: () =>
        api
          .undo(entry.id)
          .then(() => {
            refreshAll();
            toast(s().common.undone);
          })
          .catch(notifyError),
    },
  });
}

/** Bir işlemi yürütür, sonucu bildirir; günlük kaydı dönerse "Geri al" düğmesi sunar. */
export function useAction<A, R>(fn: (a: A) => Promise<R>, opts: { success?: (r: R, a: A) => string | null } = {}) {
  return useMutation({
    mutationFn: fn,
    onSuccess: (r, a) => {
      refreshAll();
      const text = opts.success ? opts.success(r, a) : null;
      if (!text) return;
      const entry = r as unknown as JournalEntry;
      if (entry && typeof entry === "object" && "actions" in entry) undoToast(text, entry);
      else toast.success(text);
    },
    onError: notifyError,
  });
}

/** Otomatik güncelleme denetimi: ayar açıksa ve son denetim 6 saatten eskiyse, oturumda en fazla bir kez. */
let autoChecked = false;
async function autoCheckUpdates() {
  if (autoChecked) return;
  autoChecked = true;
  try {
    const [settings, snap] = await Promise.all([api.settings(), queryClient.fetchQuery({ queryKey: qk.snapshot, queryFn: api.snapshot })]);
    const age = Date.now() - (snap.updates?.checkedAt ?? 0);
    if (!settings.autoCheckUpdates || age < 6 * 3600_000 || !snap.scan.exists) return;
    await api.checkUpdates();
    refreshAll();
  } catch {
    /* sessiz: ağ yoksa bir sonraki açılışta yeniden denenir */
  }
}

/** Arka uç olaylarını bu oyunun sorgularına bağlar (sayfalar bir kez çağırır). */
export function useStardewSync() {
  useEffect(() => {
    void autoCheckUpdates();
  }, []);
  useEffect(() => {
    const offs = [
      listen<{ game: string }>(EVENTS.gameChanged, (p) => {
        if (p.game === GAME) void queryClient.invalidateQueries({ queryKey: qk.all });
      }),
      listen<JobSnapshot>(EVENTS.job, (j) => {
        if (j.game === GAME && (j.stage === "done" || j.stage === "failed")) void queryClient.invalidateQueries({ queryKey: qk.all });
      }),
      listen<GameExited>("stardew://game-exited", () => {
        void queryClient.invalidateQueries({ queryKey: qk.all });
        void queryClient.invalidateQueries({ queryKey: shellKeys.games });
      }),
    ];
    return () => offs.forEach((off) => off());
  }, []);
}

export function goPage(page: string) {
  useUi.getState().go({ kind: "game", game: GAME, page });
}

/** Dosya seçtirip kurulum görevlerini başlatır (her arşiv ortak inceleme penceresinden geçer). */
export async function pickAndInstall() {
  if (!isTauri) return;
  const { open } = await import("@tauri-apps/plugin-dialog");
  const picked = await open({ multiple: true, title: s().mods.pickTitle, filters: [{ name: s().mods.pickFilter, extensions: ["zip", "7z", "rar"] }] });
  const paths = Array.isArray(picked) ? picked : typeof picked === "string" ? [picked] : [];
  if (paths.length) await installFiles(GAME, paths);
}

/** Görevi önbelleğe işler ve görevler panelini açar. */
function showJob(job: JobSnapshot, message: string) {
  upsertJob(job);
  useUi.getState().setJobs(true);
  toast(message);
}

export async function installSmapi() {
  try {
    showJob(await api.installSmapi(), s().fix.smapiStarted);
  } catch (e) {
    notifyError(e);
  }
}

/** Sağlık raporundaki tek tık düzeltmeyi uygular. */
export async function runFix(fix: Fix) {
  try {
    switch (fix.kind) {
      case "enable":
      case "disable": {
        const e = await api.setEnabled(fix.folders, fix.kind === "enable");
        refreshAll();
        undoToast(e.title, e);
        break;
      }
      case "open-folder":
        await api.openPath("mods", fix.folders[0] ?? null);
        break;
      case "install-smapi":
        await installSmapi();
        break;
      case "find-dependency":
        if (fix.target) await findDependency(fix.target);
        break;
      case "install-archive":
        if (fix.target) showJob(await api.installArchive(fix.target), s().fix.archiveStarted);
        break;
      case "open-url":
        if (fix.target) await openUrl(fix.target);
        break;
      case "view-updates":
        goPage("updates");
        break;
      case "open-settings":
        goPage("settings");
        break;
    }
  } catch (e) {
    notifyError(e);
  }
}

/** Anlık görüntüden türetilen, bileşenlerin sık kullandığı eşlemeler. */
export function useModIndex() {
  const { data } = useSnapshot();
  return useMemo(() => {
    const mods = data?.scan.mods ?? [];
    const byId = new Map<string, ModInfo[]>();
    for (const m of mods) {
      if (!m.uniqueId) continue;
      const k = m.uniqueId.toLowerCase();
      byId.set(k, [...(byId.get(k) ?? []), m]);
    }
    const issuesByFolder = new Map<string, Issue[]>();
    for (const i of data?.health.issues ?? []) {
      if (i.kind === "updates" || i.kind === "no-update-keys") continue;
      for (const f of i.mods) issuesByFolder.set(f, [...(issuesByFolder.get(f) ?? []), i]);
    }
    const updateById = new Map<string, UpdateEntry>();
    for (const u of data?.updates?.entries ?? []) updateById.set(u.uniqueId.toLowerCase(), u);
    const updateOf = (m: ModInfo) => (m.uniqueId ? updateById.get(m.uniqueId.toLowerCase()) : undefined);
    const nameOf = (id: string) => byId.get(id.toLowerCase())?.[0]?.name ?? id;
    // Nexus numarası: manifest'teki güncelleme anahtarı, yoksa smapi.io'nun bildirdiği.
    const nexusOf = (m: ModInfo) => m.nexusId ?? updateOf(m)?.nexusId ?? null;
    const byNexus = new Map<number, ModInfo>();
    for (const m of mods) {
      const n = nexusOf(m);
      if (n && (!byNexus.has(n) || m.enabled)) byNexus.set(n, m);
    }
    return { mods, byId, byNexus, issuesByFolder, updateOf, nexusOf, nameOf, snapshot: data };
  }, [data]);
}

/** Türkçe karakter ve büyük/küçük harf duyarsız arama anahtarı. */
export function norm(v: string): string {
  return v
    .toLocaleLowerCase("tr")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ı/g, "i");
}

export function nexusUrl(id: number): string {
  return `https://www.nexusmods.com/stardewvalley/mods/${id}`;
}
