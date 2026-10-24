// Bannerlord arayüz modülü (Otağ'dan taşındı). Kütüphane oyunun panosudur: başlatma, yükleme sırası,
// sağlık ve tek tık düzeltmeler. Kurulum incelemesi kabuğun ortak penceresinde (`ReviewPlan`, `confirmJob`).

import { useEffect, type ComponentType } from "react";
import { ArchiveRestore, Compass, Layers, Library as LibraryIcon, RefreshCw, Settings2, Swords } from "lucide-react";
import type { GameModule } from "@/games/types";
import { BannerlordArt } from "./Art";
import { api } from "./api";
import { ConfirmDialog } from "./components/Prompts";
import { ReviewPlan, type ReviewOptions } from "./components/ReviewPlan";
import { mocks, reviewJob } from "./mocks";
import { useApp } from "./store";
import { BackupsView } from "./views/Backups";
import { DiscoverView } from "./views/Discover";
import Library from "./views/Library";
import { ProfilesView } from "./views/Profiles";
import SettingsView from "./views/Settings";
import { UpdatesView } from "./views/Updates";

/** Her sayfa: ilk açılışta modülleri yükler ve onay penceresini taşır (useApp().confirm). */
function page(Component: ComponentType): ComponentType {
  return function Page() {
    useEffect(() => {
      if (!useApp.getState().ready && !useApp.getState().loading) void useApp.getState().load(true);
    }, []);
    return (
      <>
        <Component />
        <ConfirmDialog />
      </>
    );
  };
}

const previewReview = typeof location !== "undefined" && new URLSearchParams(location.search).get("review") === reviewJob.id;

const bannerlord: GameModule = {
  id: "bannerlord",
  name: "Mount & Blade II: Bannerlord",
  short: "Bannerlord",
  tagline: { tr: "Modüller, yükleme sırası ve Workshop tek panelde.", en: "Modules, load order and Workshop in one panel." },
  Icon: Swords,
  Art: BannerlordArt,
  routes: [
    {
      id: "library",
      label: { tr: "Kütüphane", en: "Library" },
      icon: LibraryIcon,
      Component: page(Library),
      badge: (s) => s?.issues || null,
    },
    { id: "discover", label: { tr: "Keşfet", en: "Discover" }, icon: Compass, Component: page(DiscoverView) },
    { id: "updates", label: { tr: "Güncellemeler", en: "Updates" }, icon: RefreshCw, Component: page(UpdatesView), badge: (s) => s?.updates || null },
    { id: "profiles", label: { tr: "Profiller", en: "Profiles" }, icon: Layers, Component: page(ProfilesView) },
    { id: "backups", label: { tr: "Yedekler", en: "Backups" }, icon: ArchiveRestore, Component: page(BackupsView) },
    { id: "settings", label: { tr: "Ayarlar", en: "Settings" }, icon: Settings2, Component: page(SettingsView) },
  ],
  ReviewPlan,
  confirmJob: (job, { acceptRisk, options }) => api.confirmJob(job.id, acceptRisk, (options as ReviewOptions | null)?.moduleIds ?? []),
  mocks: previewReview ? { ...mocks, jobs_list: () => [reviewJob] } : mocks,
};

export default bannerlord;
