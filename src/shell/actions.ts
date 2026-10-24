// Oyunlar arası ortak eylemler (ana sayfa, kenar çubuğu, komut paleti aynı yolu kullanır).

import { toast } from "sonner";
import { t } from "@/lib/i18n";
import { errorMessage, invoke, isTauri } from "@/lib/ipc";
import { keys, queryClient, upsertJob } from "@/lib/queries";
import type { GameId, GameStatus, JobSnapshot } from "@/lib/types";
import { gameModule } from "@/games/registry";

export function notifyError(e: unknown) {
  toast.error(t().toast.error, { description: errorMessage(e) });
}

export async function launchGame(id: GameId) {
  const name = gameModule(id)?.name ?? id;
  try {
    await invoke("game_launch", { id });
    toast.success(t().toast.launched(name));
    setTimeout(() => queryClient.invalidateQueries({ queryKey: keys.games }), 4000);
  } catch (e) {
    notifyError(e);
  }
}

/** Klasör seçtirip oyuna bağlar. */
export async function chooseGameFolder(id: GameId): Promise<GameStatus | null> {
  if (!isTauri) return null;
  const { open } = await import("@tauri-apps/plugin-dialog");
  const picked = await open({ directory: true, multiple: false, title: gameModule(id)?.name });
  if (typeof picked !== "string") return null;
  try {
    const status = await invoke<GameStatus>("game_set_path", { id, path: picked });
    await queryClient.invalidateQueries({ queryKey: keys.games });
    queryClient.removeQueries({ queryKey: keys.detect(id) });
    return status;
  } catch (e) {
    notifyError(e);
    return null;
  }
}

const ARCHIVE = /\.(zip|7z|rar)$/i;

export function archivesOnly(paths: string[]): string[] {
  return paths.filter((p) => ARCHIVE.test(p));
}

/** Arşivleri bir oyuna kurulum için gönderir (her biri bir görev olur). */
export async function installFiles(id: GameId, paths: string[]) {
  const files = archivesOnly(paths);
  if (files.length === 0) {
    toast.error(t().drop.unsupported);
    return;
  }
  try {
    const jobs = await invoke<JobSnapshot[]>("game_install_files", { id, paths: files });
    jobs.forEach(upsertJob);
  } catch (e) {
    notifyError(e);
  }
}

export async function openUrl(url: string) {
  try {
    await invoke("open_url", { url });
  } catch (e) {
    notifyError(e);
  }
}
