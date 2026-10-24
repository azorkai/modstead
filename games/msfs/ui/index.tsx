// MSFS arayüz modülü (Hangar'dan taşınıyor). Kütüphane oyunun asıl ekranıdır: tüm modlar, her simde tek
// dokunuşla aç/kapat, ayrıntı çekmecesi. Kurulum incelemesi kabuğun ortak penceresinde (`ReviewPlan`, `confirmJob`).

import { Compass, HeartPulse, Layers, LayoutDashboard, Library as LibraryIcon, Plane, Settings2, ShieldCheck } from "lucide-react";
import type { GameModule } from "@/games/types";
import { api } from "./api";
import { MsfsArt } from "./Art";
import { mocks, reviewJob } from "./mocks";
import Discover from "./pages/Discover";
import Health from "./pages/Health";
import Library from "./pages/Library";
import Overview from "./pages/Overview";
import Profiles from "./pages/Profiles";
import Security from "./pages/Security";
import Settings from "./pages/Settings";
import { ReviewPlan } from "./ReviewPlan";
import "./msfs.css";
import type { ConfirmOptions } from "./types";

const previewReview = typeof location !== "undefined" && new URLSearchParams(location.search).get("review") === reviewJob.id;

const msfs: GameModule = {
  id: "msfs",
  name: "Microsoft Flight Simulator",
  short: "MSFS",
  tagline: { tr: "2020 ve 2024 eklentileri tek hangarda.", en: "2020 and 2024 add-ons in one hangar." },
  Icon: Plane,
  Art: MsfsArt,
  routes: [
    { id: "overview", label: { tr: "Genel bakış", en: "Overview" }, icon: LayoutDashboard, Component: Overview },
    { id: "library", label: { tr: "Kütüphane", en: "Library" }, icon: LibraryIcon, Component: Library },
    { id: "discover", label: { tr: "Keşfet", en: "Discover" }, icon: Compass, Component: Discover },
    { id: "health", label: { tr: "Sağlık", en: "Health" }, icon: HeartPulse, Component: Health, badge: (s) => s?.issues || null },
    { id: "profiles", label: { tr: "Profiller", en: "Profiles" }, icon: Layers, Component: Profiles },
    { id: "security", label: { tr: "Güvenlik", en: "Security" }, icon: ShieldCheck, Component: Security },
    { id: "settings", label: { tr: "Ayarlar", en: "Settings" }, icon: Settings2, Component: Settings },
  ],
  ReviewPlan,
  confirmJob: (job, { acceptRisk, options }) => api.confirmJob(job.id, acceptRisk, (options as ConfirmOptions | null) ?? null),
  mocks: previewReview ? { ...mocks, jobs_list: () => [reviewJob] } : mocks,
};

export default msfs;
