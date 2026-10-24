// MSFS arayüz durumu: açık mod çekmecesi, kütüphane görünümü ve filtreleri (oturum boyunca korunur).

import { create } from "zustand";
import type { Category, SimId } from "./types";

export type StatusFilter = "all" | "active" | "inactive" | "problems" | "unmanaged";
export type ViewMode = "gallery" | "list";
export type SortKey = "title" | "size" | "recent";

interface MsfsUi {
  /** Ayrıntı çekmecesinde açık mod. */
  selected: string | null;
  query: string;
  status: StatusFilter;
  sim: SimId | "all";
  category: Category | "all";
  sort: SortKey;
  view: ViewMode;
  /** Toplu işlem için seçilen modlar. */
  picked: string[];
  open: (id: string | null) => void;
  set: (p: Partial<Pick<MsfsUi, "query" | "status" | "sim" | "category" | "sort" | "view">>) => void;
  togglePick: (id: string) => void;
  setPicked: (ids: string[]) => void;
}

function savedView(): ViewMode {
  try {
    return localStorage.getItem("msfs.view") === "list" ? "list" : "gallery";
  } catch {
    return "gallery";
  }
}

export const useMsfsUi = create<MsfsUi>((set) => ({
  selected: null,
  query: "",
  status: "all",
  sim: "all",
  category: "all",
  sort: "title",
  view: savedView(),
  picked: [],
  open: (id) => set({ selected: id }),
  set: (p) => {
    if (p.view) {
      try {
        localStorage.setItem("msfs.view", p.view);
      } catch {
        /* tarayıcı depolaması kapalı olabilir */
      }
    }
    set(p);
  },
  togglePick: (id) => set((s) => ({ picked: s.picked.includes(id) ? s.picked.filter((x) => x !== id) : [...s.picked, id] })),
  setPicked: (ids) => set({ picked: ids }),
}));
