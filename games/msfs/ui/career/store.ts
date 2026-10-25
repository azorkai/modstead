// Kariyer sayfasının arayüz durumu: sekme, açık uçuş ayrıntısı, uçak seçme penceresi.

import { create } from "zustand";

export type CareerTab = "panel" | "jobs" | "logbook" | "licenses" | "hangar";

const saved = (() => {
  try {
    return (sessionStorage.getItem("msfs.career.tab") as CareerTab | null) ?? "panel";
  } catch {
    return "panel" as CareerTab;
  }
})();

export const useCareerUi = create<{
  tab: CareerTab;
  flightId: string | null;
  pickOpen: boolean;
  setTab: (t: CareerTab) => void;
  openFlight: (id: string | null) => void;
  setPick: (open: boolean) => void;
}>((set) => ({
  tab: saved,
  flightId: null,
  pickOpen: false,
  setTab: (tab) => {
    try {
      sessionStorage.setItem("msfs.career.tab", tab);
    } catch {
      // önizleme ya da kısıtlı depolama: sekme hatırlanmaz
    }
    set({ tab });
  },
  openFlight: (flightId) => set({ flightId }),
  setPick: (pickOpen) => set({ pickOpen }),
}));
