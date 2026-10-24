// Stardew Valley arayüz modülü (Vadi'den taşındı). Sayfalar `routes`, kurulum incelemesi
// `ReviewPlan` + `confirmJob`, önizleme verisi `mocks` ile kabuğa verilir.

import { ArrowUpCircle, Boxes, Compass, HeartPulse, History, Layers, LayoutDashboard, Settings2, Sprout, Tractor } from "lucide-react";
import type { GameModule } from "@/games/types";
import Activity from "./Activity";
import { api } from "./api";
import { StardewArt } from "./Art";
import Dashboard from "./Dashboard";
import Discover from "./Discover";
import Health from "./Health";
import { mocks } from "./mock";
import Mods from "./Mods";
import Profiles from "./Profiles";
import { refreshAll } from "./queries";
import { ReviewPlan } from "./ReviewPlan";
import Saves from "./Saves";
import Settings from "./Settings";
import Updates from "./Updates";

const stardew: GameModule = {
  id: "stardew",
  name: "Stardew Valley",
  short: "Stardew",
  tagline: { tr: "SMAPI modları, içerik paketleri ve kayıtlar tek yerde.", en: "SMAPI mods, content packs and saves in one place." },
  Icon: Sprout,
  Art: StardewArt,
  routes: [
    { id: "overview", label: { tr: "Genel bakış", en: "Overview" }, icon: LayoutDashboard, Component: Dashboard },
    { id: "mods", label: { tr: "Modlar", en: "Mods" }, icon: Boxes, Component: Mods },
    { id: "discover", label: { tr: "Mod bul", en: "Find mods" }, icon: Compass, Component: Discover },
    { id: "health", label: { tr: "Sağlık", en: "Health" }, icon: HeartPulse, Component: Health, badge: (s) => s?.issues },
    { id: "updates", label: { tr: "Güncellemeler", en: "Updates" }, icon: ArrowUpCircle, Component: Updates, badge: (s) => s?.updates },
    { id: "profiles", label: { tr: "Profiller", en: "Profiles" }, icon: Layers, Component: Profiles },
    { id: "saves", label: { tr: "Kayıtlar", en: "Saves" }, icon: Tractor, Component: Saves },
    { id: "activity", label: { tr: "Etkinlik", en: "Activity" }, icon: History, Component: Activity },
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

export default stardew;
