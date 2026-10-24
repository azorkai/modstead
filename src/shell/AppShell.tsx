// Kabuk yerleşimi: oyun rayı | (oyun kenar çubuğu) | üst çubuk + içerik. Oyun açıkken tüm sütun
// `data-game` taşır; vurgu rengi ve başlık yazı tipi oyunun kimliğine geçer.

import type { ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
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

function Column({ crumbs, viewKey, children }: { crumbs: ReactNode[]; viewKey: string; children: ReactNode }) {
  return (
    <div className="relative z-[1] flex min-w-0 flex-1 flex-col">
      <TopBar crumbs={crumbs} />
      <main className="min-h-0 flex-1 overflow-y-auto px-8 pb-10 pt-7">
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
  const game = view.kind === "game" ? gameModule(view.game) : undefined;
  const route = game ? (game.routes.find((r) => r.id === (view.kind === "game" ? view.page : "")) ?? game.routes[0]) : undefined;

  return (
    <div className="app-backdrop relative flex h-full">
      <Rail />
      {game && route ? (
        <div data-game={game.id} className="relative z-[1] flex min-w-0 flex-1">
          <GameSidebar game={game} page={route.id} />
          <Column crumbs={[game.name, route.label[lang]]} viewKey={`${game.id}/${route.id}`}>
            <route.Component />
          </Column>
        </div>
      ) : (
        <Column crumbs={view.kind === "settings" ? ["Modstead", t.nav.settings] : ["Modstead", t.nav.home]} viewKey={view.kind}>
          {view.kind === "settings" ? <Settings /> : <Home />}
        </Column>
      )}
      <JobsDock />
      <ReviewDialog />
      <CommandPalette />
      <NxmPrompt />
      <DropOverlay />
      <FileGamePicker />
    </div>
  );
}
