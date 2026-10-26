// Kabuk yerleşimi: oyun rayı | (oyun kenar çubuğu) | üst çubuk + içerik. Oyun açıkken tüm sütun
// `data-game` taşır; vurgu rengi ve başlık yazı tipi oyunun kimliğine geçer. Kenardan kenara sayfalarda
// (ana sayfa, `fullBleed` rotalar) üst çubuk görselin üstünde saydam durur, kaydırınca dolar.

import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import clsx from "clsx";
import { useLang, useT } from "@/lib/i18n";
import { useUi } from "@/lib/store";
import { gameModule } from "@/games/registry";
import { CommandPalette } from "./CommandPalette";
import { DropOverlay, FileGamePicker } from "./DropOverlay";
import { GameSidebar } from "./GameSidebar";
import { Home } from "./Home";
import { JobsDock } from "./JobsDock";
import { NxmPrompt } from "./NxmPrompt";
import { Rail } from "./Rail";
import { ReviewDialog } from "./ReviewDialog";
import { Settings } from "./Settings";
import { TopBar } from "./TopBar";
import { UpdateDialog, useUpdateFeed } from "./Updater";

function Column({ crumbs, viewKey, fullBleed, children }: { crumbs: ReactNode[]; viewKey: string; fullBleed?: boolean; children: ReactNode }) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => setScrolled(false), [viewKey]);
  return (
    <div className="relative z-[1] flex min-w-0 flex-1 flex-col">
      <TopBar crumbs={crumbs} floating={fullBleed} overlay={fullBleed && !scrolled} />
      <main
        onScroll={fullBleed ? (e) => setScrolled(e.currentTarget.scrollTop > 120) : undefined}
        className={clsx("min-h-0 flex-1 overflow-y-auto", !fullBleed && "px-8 pb-10 pt-7")}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={viewKey} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18, ease: [0.2, 0.7, 0.2, 1] }}>
            {children}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}

export function AppShell() {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const view = useUi((s) => s.view);
  useUpdateFeed();
  const game = view.kind === "game" ? gameModule(view.game) : undefined;
  const route = game ? (game.routes.find((r) => r.id === (view.kind === "game" ? view.page : "")) ?? game.routes[0]) : undefined;

  return (
    <div className="app-backdrop relative flex h-full">
      <Rail />
      {game && route ? (
        <div data-game={game.id} className="relative z-[1] flex min-w-0 flex-1">
          <GameSidebar game={game} page={route.id} />
          <Column crumbs={[game.short, route.label[lang]]} viewKey={`${game.id}/${route.id}`} fullBleed={route.fullBleed}>
            <route.Component />
          </Column>
        </div>
      ) : (
        <Column crumbs={view.kind === "settings" ? ["Modstead", t.nav.settings] : ["Modstead", t.nav.home]} viewKey={view.kind} fullBleed={view.kind === "home"}>
          {view.kind === "settings" ? <Settings /> : <Home />}
        </Column>
      )}
      <JobsDock />
      <ReviewDialog />
      <UpdateDialog />
      <CommandPalette />
      <NxmPrompt />
      <DropOverlay />
      <FileGamePicker />
    </div>
  );
}
