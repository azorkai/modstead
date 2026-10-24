// Cities: Skylines II verisi: React Query ile önbelleklenir; arka uç olaylarıyla (oyun değişti, görev bitti)
// tazelenir. Mod klasörünü değiştiren eylemler bildirim ve (yerel modlarda) "Geri al" sunar.

import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { EVENTS, isTauri, listen } from "@/lib/ipc";
import { keys as shellKeys, queryClient } from "@/lib/queries";
import { useUi } from "@/lib/store";
import type { JobSnapshot } from "@/lib/types";
import { installFiles, notifyError, openUrl } from "@/shell/actions";
import { api } from "./api";
import { s } from "./i18n";
import type { Fix, ModEntry } from "./types";

export const GAME = "cities2";

export const qk = {
  all: [GAME] as const,
  env: [GAME, "env"] as const,
  settings: [GAME, "settings"] as const,
  snapshot: [GAME, "snapshot"] as const,
  health: [GAME, "health"] as const,
  saves: [GAME, "saves"] as const,
  backups: [GAME, "backups"] as const,
  trash: [GAME, "trash"] as const,
  logs: [GAME, "logs"] as const,
  preview: (id: string, large: boolean) => [GAME, "preview", id, large] as const,
};

export const useEnv = () => useQuery({ queryKey: qk.env, queryFn: api.environment, refetchInterval: 15_000 });
export const useCitiesSettings = () => useQuery({ queryKey: qk.settings, queryFn: api.settings, staleTime: Infinity });
export const useSnapshot = () => useQuery({ queryKey: qk.snapshot, queryFn: api.snapshot, staleTime: 10_000 });
export const useHealth = () => useQuery({ queryKey: qk.health, queryFn: api.health, staleTime: 30_000 });
export const useSaves = () => useQuery({ queryKey: qk.saves, queryFn: api.saves, staleTime: 15_000 });
export const useBackups = () => useQuery({ queryKey: qk.backups, queryFn: api.saveBackups });
export const useTrash = () => useQuery({ queryKey: qk.trash, queryFn: api.trash });

/** Kayıt önizlemesi (data: URL). Önbellekte kalıcıdır; kayıt değişince anahtar (değişiklik zamanı) değişir. */
export function usePreview(id: string | null | undefined, modified: number | undefined, large = false) {
  return useQuery({
    queryKey: [...qk.preview(id ?? "", large), modified ?? 0],
    queryFn: () => api.savePreview(id!, large),
    enabled: !!id,
    staleTime: Infinity,
    gcTime: 10 * 60_000,
  });
}

/** Mod klasörünü etkileyen her değişiklikten sonra: bu oyunun tüm verisi + ana sayfa kartı. */
export function refreshAll() {
  void queryClient.invalidateQueries({ queryKey: qk.all });
  void queryClient.invalidateQueries({ queryKey: shellKeys.games });
}

export function goPage(page: string) {
  useUi.getState().go({ kind: "game", game: GAME, page });
}

/** Kurulu Paradox modlarının katalog bilgisini oturumda bir kez (eksik ya da 12 saatten eskiyse) çeker. */
let metaRefreshed = false;
async function refreshMetaOnce() {
  if (metaRefreshed) return;
  metaRefreshed = true;
  try {
    const n = await api.pdxRefresh(false);
    if (n > 0) refreshAll();
  } catch {
    /* sessiz: çevrimdışıyken son bilinen bilgi kullanılır */
  }
}

/** Arka uç olaylarını bu oyunun sorgularına bağlar (sayfalar bir kez çağırır). */
export function useCitiesSync() {
  useEffect(() => {
    void refreshMetaOnce();
  }, []);
  useEffect(() => {
    const offs = [
      listen<{ game: string }>(EVENTS.gameChanged, (p) => {
        if (p.game === GAME) void queryClient.invalidateQueries({ queryKey: qk.all });
      }),
      listen<JobSnapshot>(EVENTS.job, (j) => {
        if (j.game === GAME && (j.stage === "done" || j.stage === "failed")) void queryClient.invalidateQueries({ queryKey: qk.all });
      }),
    ];
    return () => offs.forEach((off) => off());
  }, []);
}

/** Dosya seçtirip kurulum görevlerini başlatır (her arşiv ortak inceleme penceresinden geçer). */
export async function pickAndInstall() {
  if (!isTauri) return;
  const { open } = await import("@tauri-apps/plugin-dialog");
  const picked = await open({ multiple: true, title: s().mods.pickArchives, filters: [{ name: "ZIP / 7z / RAR", extensions: ["zip", "7z", "rar"] }] });
  const paths = Array.isArray(picked) ? picked : typeof picked === "string" ? [picked] : [];
  if (paths.length) await installFiles(GAME, paths);
}

/** Yerel modu açar/kapatır; bildirimde "Geri al" sunar. */
export async function toggleLocal(m: ModEntry, enabled: boolean) {
  try {
    await api.setEnabled([m.folder], enabled);
    refreshAll();
    const back = enabled ? m.folder.replace(/^\.+/, "") : `.${m.folder.replace(/^\.+/, "")}`;
    toast.success(enabled ? s().mods.enabledToast(m.name) : s().mods.disabledToast(m.name), {
      action: { label: s().common.undo, onClick: () => api.setEnabled([back], !enabled).then(refreshAll).catch(notifyError) },
    });
  } catch (e) {
    notifyError(e);
  }
}

/** Yerel modu çöpe taşır; bildirimde "Geri al" (çöpten geri yükle) sunar. */
export async function removeLocal(m: ModEntry) {
  try {
    const [trashed] = await api.uninstall([m.folder]);
    refreshAll();
    toast.success(s().mods.removed(m.name), {
      action: trashed ? { label: s().common.undo, onClick: () => api.restoreTrash(trashed.id).then(refreshAll).catch(notifyError) } : undefined,
    });
  } catch (e) {
    notifyError(e);
  }
}

/** Sağlık bulgusunun tek tık çözümü. */
export async function runFix(fix: Fix) {
  try {
    const msg = await api.fix(fix.action, fix.folders);
    refreshAll();
    toast.success(msg);
  } catch (e) {
    notifyError(e);
  }
}

export async function openLink(url: string | null) {
  if (url) await openUrl(url);
}

/** Anlık görüntüden türetilen eşlemeler. */
export function useModIndex() {
  const { data, isLoading } = useSnapshot();
  return useMemo(() => {
    const mods = data?.mods ?? [];
    const byPdx = new Map<string, ModEntry>();
    for (const m of mods) if (m.modId) byPdx.set(m.modId, m);
    const byKey = new Map(mods.map((m) => [m.key, m] as const));
    return { mods, byPdx, byKey, snapshot: data, isLoading };
  }, [data, isLoading]);
}

/** Türkçe karakter ve büyük/küçük harf duyarsız arama anahtarı. */
export function norm(v: string): string {
  return v
    .toLocaleLowerCase("tr")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ı/g, "i");
}

/** Modun kurulu sürümü katalogdakinden eskiyse yeni sürümün adı. */
export function pendingUpdate(m: ModEntry): string | null {
  const latest = m.meta?.latestVersion;
  const local = m.version ? Number(m.version) : NaN;
  if (m.source !== "paradox" || !latest || !Number.isFinite(local) || latest <= local) return null;
  return m.meta?.userVersion ?? String(latest);
}

/** Paradox Mods etiketinin görünen adı. */
export function tagLabel(tag: string): string {
  return s().tags[tag] ?? tag;
}

/** "1.6.*" ile "1.6.2f1" → "ok" | "outdated" | "newer" | "unknown" (arka uçtaki `paradox::compat` ile aynı). */
export function compat(required: string | null | undefined, game: string | null | undefined): "ok" | "outdated" | "newer" | "unknown" {
  if (!required || !game) return "unknown";
  const parts = (v: string) => {
    const out: number[] = [];
    for (const p of v.split(".")) {
      const m = p.match(/^\d+/);
      if (!m) break;
      out.push(Number(m[0]));
    }
    return out;
  };
  const want = parts(required.trim());
  const have = parts(game);
  if (!want.length || !have.length) return "unknown";
  const n = Math.min(want.length, have.length);
  for (let i = 0; i < n; i++) {
    if (want[i] < have[i]) return "outdated";
    if (want[i] > have[i]) return "newer";
  }
  return "ok";
}

/** Bir kod modu oyunun sürümüne uyuyor mu (yalnızca kod modlarında anlamlı). */
export function modCompat(m: { kind?: string; tags?: string[]; requiredVersion?: string | null }, game: string | null | undefined) {
  const isCode = m.kind === "code" || (m.tags ?? []).includes("Code Mod");
  return isCode ? compat(m.requiredVersion, game) : "unknown";
}

/** ¢ para birimi (oyunun kendi simgesi). */
export function money(v: number | null | undefined, fmt: (n: number) => string): string {
  if (v === null || v === undefined) return "—";
  return `${v < 0 ? "−" : ""}¢${fmt(Math.abs(v))}`;
}
