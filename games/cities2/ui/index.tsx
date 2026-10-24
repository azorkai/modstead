// Cities: Skylines II arayüz modülü. Sayfalar `routes`, kurulum incelemesi `ReviewPlan` + `confirmJob`,
// önizleme verisi `mocks` ile kabuğa verilir.

import { Building2, Compass, HeartPulse, LayoutDashboard, Puzzle, Save, Settings2 } from "lucide-react";
import type { GameModule } from "@/games/types";
import { api } from "./api";
import { CitiesArt } from "./Art";
import Discover from "./Discover";
import Health from "./Health";
import { mocks } from "./mock";
import Mods from "./Mods";
import Overview from "./Overview";
import { refreshAll } from "./queries";
import { ReviewPlan } from "./ReviewPlan";
import Saves from "./Saves";
import Settings from "./Settings";

const cities2: GameModule = {
  id: "cities2",
  name: "Cities: Skylines II",
  short: "Cities II",
  tagline: { tr: "Paradox Mods, yerel modlar ve şehirlerin tek yerde.", en: "Paradox Mods, local mods and your cities in one place." },
  Icon: Building2,
  Art: CitiesArt,
  routes: [
    { id: "overview", label: { tr: "Genel bakış", en: "Overview" }, icon: LayoutDashboard, Component: Overview },
    { id: "mods", label: { tr: "Modlar", en: "Mods" }, icon: Puzzle, Component: Mods },
    { id: "discover", label: { tr: "Mod bul", en: "Find mods" }, icon: Compass, Component: Discover },
    { id: "health", label: { tr: "Sağlık", en: "Health" }, icon: HeartPulse, Component: Health, badge: (s) => s?.issues },
    { id: "saves", label: { tr: "Kayıtlar", en: "Saves" }, icon: Save, Component: Saves },
    { id: "settings", label: { tr: "Oyun ayarları", en: "Game settings" }, icon: Settings2, Component: Settings },
  ],
  ReviewPlan,
  confirmJob: async (job, { acceptRisk, options }) => {
    const r = await api.confirmJob(job.id, acceptRisk, options);
    refreshAll();
    return r;
  },
  mocks,
};

export default cities2;
