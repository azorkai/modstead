// Arayüz durumu (gezinme, açık paneller). Sunucu verisi React Query'de (queries.ts).

import { create } from "zustand";
import { isTauri } from "./ipc";
import type { GameId } from "./types";

export type View = { kind: "home" } | { kind: "settings" } | { kind: "game"; game: GameId; page: string };

export interface NxmRequest {
  url: string;
  game: GameId | null;
}

interface UiState {
  view: View;
  /** Her oyunda en son açılan sayfa. */
  lastPage: Record<string, string>;
  paletteOpen: boolean;
  jobsOpen: boolean;
  reviewJobId: string | null;
  nxmQueue: NxmRequest[];
  /** Pencereye ya da ikinci örnekten gelen, oyun seçimi bekleyen dosyalar. */
  pendingFiles: string[];
  go: (v: View) => void;
  openGame: (game: GameId, page?: string) => void;
  setPalette: (open: boolean) => void;
  setJobs: (open: boolean) => void;
  setReview: (id: string | null) => void;
  pushNxm: (r: NxmRequest) => void;
  shiftNxm: () => void;
  setPendingFiles: (paths: string[]) => void;
}

/** Önizleme kipinde adres parametreleri: ?view=home|settings|game:<id>[:<sayfa>]&jobs=1&review=<id>&palette=1 */
function preview(name: string): string | null {
  if (isTauri || typeof location === "undefined") return null;
  return new URLSearchParams(location.search).get(name);
}

function initialView(): View {
  const v = preview("view");
  if (v === "settings") return { kind: "settings" };
  if (v?.startsWith("game:")) {
    const [, game, page] = v.split(":");
    return { kind: "game", game, page: page || "overview" };
  }
  return { kind: "home" };
}

export const useUi = create<UiState>((set, get) => ({
  view: initialView(),
  lastPage: {},
  paletteOpen: preview("palette") === "1",
  jobsOpen: preview("jobs") === "1",
  reviewJobId: preview("review"),
  nxmQueue: [],
  pendingFiles: [],
  go: (view) =>
    set((s) => ({
      view,
      paletteOpen: false,
      lastPage: view.kind === "game" ? { ...s.lastPage, [view.game]: view.page } : s.lastPage,
    })),
  openGame: (game, page) => get().go({ kind: "game", game, page: page ?? get().lastPage[game] ?? "overview" }),
  setPalette: (paletteOpen) => set({ paletteOpen }),
  setJobs: (jobsOpen) => set({ jobsOpen }),
  setReview: (reviewJobId) => set({ reviewJobId, jobsOpen: false }),
  pushNxm: (r) => set((s) => ({ nxmQueue: [...s.nxmQueue.filter((x) => x.url !== r.url), r] })),
  shiftNxm: () => set((s) => ({ nxmQueue: s.nxmQueue.slice(1) })),
  setPendingFiles: (pendingFiles) => set({ pendingFiles }),
}));

/** Şu an açık olan oyun (ana sayfa ve ayarlarda `null`). */
export function useCurrentGame(): GameId | null {
  return useUi((s) => (s.view.kind === "game" ? s.view.game : null));
}
