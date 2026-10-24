// Sol oyun rayı: Modstead (ana sayfa), oyunlar, ayarlar. Oyunlar gerçek simgeleriyle durur; etkin oyunun
// solunda vurgu renginde bir gösterge ve simgesinin çevresinde halka olur.

import { motion } from "motion/react";
import { Settings2 } from "lucide-react";
import clsx from "clsx";
import { useT } from "@/lib/i18n";
import { useGamesStatus, useSettings } from "@/lib/queries";
import { useUi } from "@/lib/store";
import type { GameStatus, Settings } from "@/lib/types";
import { Tooltip } from "@/ui";
import { GAMES } from "@/games/registry";
import type { GameModule } from "@/games/types";
import { GameIcon } from "./GameIcon";
import { LogoTile } from "./Logo";

/** Ayarlarda seçilen oyunlar (sırasıyla); seçim yoksa hepsi. */
export function visibleGames(settings: Settings | undefined): GameModule[] {
  const ids = settings?.games ?? [];
  if (ids.length === 0) return GAMES;
  return ids.map((id) => GAMES.find((g) => g.id === id)).filter((g): g is GameModule => !!g);
}

function Indicator({ active, color }: { active: boolean; color?: string }) {
  return (
    <motion.span
      className="absolute -left-[14px] top-1/2 w-[4px] -translate-y-1/2 rounded-r-full"
      style={{ background: color ?? "var(--accent)" }}
      initial={false}
      animate={{ height: active ? 30 : 0, opacity: active ? 1 : 0 }}
      transition={{ type: "spring", stiffness: 500, damping: 34 }}
    />
  );
}

function GameTile({ game, active, status, onClick }: { game: GameModule; active: boolean; status: GameStatus | undefined; onClick: () => void }) {
  const installed = status?.installed ?? true;
  return (
    <Tooltip label={game.name}>
      <button data-game={game.id} onClick={onClick} className="group relative flex size-12 items-center justify-center" aria-label={game.name}>
        <Indicator active={active} />
        <GameIcon game={game} size={48} active={active} dim={!installed && !active} className={clsx(!active && "group-hover:brightness-110")} />
        {status?.running && <span className="pulse-dot absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-bg-2 bg-ok" />}
      </button>
    </Tooltip>
  );
}

export function Rail() {
  const t = useT();
  const view = useUi((s) => s.view);
  const go = useUi((s) => s.go);
  const openGame = useUi((s) => s.openGame);
  const { data: settings } = useSettings();
  const { data: statuses } = useGamesStatus();
  const games = visibleGames(settings);

  return (
    <nav data-tauri-drag-region className="relative z-[2] flex w-[76px] shrink-0 flex-col items-center gap-3 border-r border-line bg-bg-2 pb-4 pt-3.5">
      <Tooltip label={`Modstead · ${t.nav.home}`}>
        <button onClick={() => go({ kind: "home" })} className="relative" aria-label={t.nav.home}>
          <Indicator active={view.kind === "home"} color="var(--brand)" />
          <LogoTile size={48} />
        </button>
      </Tooltip>
      <div className="h-px w-8 bg-line-strong" />
      {games.map((g) => (
        <GameTile key={g.id} game={g} active={view.kind === "game" && view.game === g.id} status={statuses?.find((s) => s.id === g.id)?.status} onClick={() => openGame(g.id)} />
      ))}
      <div data-tauri-drag-region className="flex-1" />
      <Tooltip label={t.nav.settings}>
        <button
          onClick={() => go({ kind: "settings" })}
          aria-label={t.nav.settings}
          className={clsx(
            "relative flex size-11 items-center justify-center rounded-[14px] text-fg-2 transition-colors hover:bg-surface-2 hover:text-fg",
            view.kind === "settings" && "bg-surface-2 text-fg",
          )}
        >
          <Indicator active={view.kind === "settings"} color="var(--brand)" />
          <Settings2 className="size-[19px]" />
        </button>
      </Tooltip>
    </nav>
  );
}
