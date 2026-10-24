// Oyun kenar çubuğu: oyunun kahraman kartı, sayfaları ve alttaki "Oyna" kartı.
// Tümü oyunun kimliğini (vurgu rengi, başlık yazı tipi) taşır.

import { motion } from "motion/react";
import { FolderOpen, Play } from "lucide-react";
import clsx from "clsx";
import { useArt } from "@/lib/art";
import { useLang, useT } from "@/lib/i18n";
import { useGameStatus } from "@/lib/queries";
import { useUi } from "@/lib/store";
import { Badge, Button, Skeleton } from "@/ui";
import type { GameModule } from "@/games/types";
import { chooseGameFolder, launchGame } from "./actions";
import { GameIcon } from "./GameIcon";

export function GameSidebar({ game, page }: { game: GameModule; page: string }) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const go = useUi((s) => s.go);
  const status = useGameStatus(game.id);
  const install = status?.installs[0];
  const Art = game.Art;
  const hero = useArt(game.id, "hero");
  const logo = useArt(game.id, "logo");

  return (
    <aside className="relative z-[2] flex w-[248px] shrink-0 flex-col border-r border-line bg-[color-mix(in_oklab,var(--bg-2)_70%,var(--bg))]">
      <div data-tauri-drag-region className={clsx("relative m-3 mb-2 flex h-[148px] flex-col overflow-hidden rounded-2xl border border-line p-3.5", !hero && "hero-surface")}>
        {hero ? (
          <>
            <img src={hero} alt="" draggable={false} className="pointer-events-none absolute inset-0 size-full object-cover" style={{ objectPosition: "60% 30%" }} />
            {/* İki temada da koyu: logo ve yazı açık renkli. */}
            <div className="pointer-events-none absolute inset-0" style={{ background: "linear-gradient(180deg, rgb(8 9 12 / 0.1) 15%, rgb(8 9 12 / 0.82) 100%)" }} />
          </>
        ) : (
          Art && <Art className="pointer-events-none absolute -right-8 bottom-0 h-[110%] w-[105%] text-accent opacity-70 [mask-image:linear-gradient(to_right,transparent_8%,black_62%)]" />
        )}
        <GameIcon game={game} size={34} className="pointer-events-none relative" />
        <div className="pointer-events-none relative mt-auto">
          {hero && logo ? (
            <img src={logo} alt={game.name} draggable={false} className="max-h-[42px] max-w-[88%] object-contain object-left drop-shadow-[0_3px_12px_rgb(0_0_0/0.6)]" />
          ) : (
            <div className={clsx("text-display truncate text-[17px] font-semibold leading-tight", hero ? "text-white" : "text-fg")}>{game.name}</div>
          )}
          <div className={clsx("mt-1 truncate text-[11.5px]", hero ? "text-white/75" : "text-fg-2")}>
            {status === undefined
              ? t.common.loading
              : !install
                ? t.home.notInstalled
                : status.installs.length > 1
                  ? // Birden çok kurulum (MSFS 2020 + 2024): mağazasız kısa adlar.
                    status.installs.map((i) => i.label.split(" · ")[0]).join(" + ")
                  : [install.label, install.version].filter(Boolean).join(" · ")}
          </div>
        </div>
      </div>

      <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-2">
        {game.routes.map((r) => {
          const active = r.id === page;
          const badge = r.badge?.(status);
          return (
            <button
              key={r.id}
              onClick={() => go({ kind: "game", game: game.id, page: r.id })}
              className={clsx(
                "relative flex h-9 items-center gap-2.5 rounded-[10px] px-3 text-[13px] transition-colors",
                active ? "text-fg" : "text-fg-2 hover:bg-surface-2/70 hover:text-fg",
              )}
            >
              {active && (
                <motion.span
                  layoutId={`nav-${game.id}`}
                  className="absolute inset-0 rounded-[10px] border border-line-strong bg-surface-2"
                  style={{ boxShadow: "var(--highlight)" }}
                  transition={{ type: "spring", stiffness: 500, damping: 40 }}
                />
              )}
              <r.icon className={clsx("relative size-4", active ? "text-accent" : "text-muted")} />
              <span className="relative flex-1 text-left">{r.label[lang]}</span>
              {!!badge && (
                <Badge tone="accent" className="relative">
                  {badge}
                </Badge>
              )}
            </button>
          );
        })}
      </nav>

      <div className="m-3 mt-1 rounded-2xl border border-line bg-surface/80 p-3" style={{ boxShadow: "var(--highlight)" }}>
        {status === undefined ? (
          <Skeleton className="h-16 w-full" />
        ) : status.installed ? (
          <>
            <div className="mb-2.5 flex items-center justify-between px-0.5 text-[11.5px]">
              <span className="text-muted">{status.running ? t.common.running : t.game.ready}</span>
              <span className="tabular text-fg-2">{t.game.playHint(status.enabled)}</span>
            </div>
            <Button variant="primary" size="lg" className="w-full" icon={<Play className="size-4 fill-current" />} disabled={status.running} onClick={() => launchGame(game.id)}>
              {status.running ? t.common.running : t.common.play}
            </Button>
          </>
        ) : (
          <>
            <div className="mb-2.5 px-0.5 text-[11.5px] text-muted">{t.game.notReady}</div>
            <Button variant="subtle" size="lg" className="w-full" icon={<FolderOpen className="size-4" />} onClick={() => chooseGameFolder(game.id)}>
              {t.common.chooseFolder}
            </Button>
          </>
        )}
      </div>
    </aside>
  );
}
