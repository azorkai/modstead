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
    <aside className="relative z-[2] flex w-[240px] shrink-0 flex-col border-r border-line bg-[color-mix(in_oklab,var(--bg-2)_60%,var(--bg))]">
      {/* Görsel alanı: iki temada da koyu (logo ve yazı açık renkli); oyunun koyu vurgusu için `data-game` de adada. */}
      <div
        data-tauri-drag-region
        data-theme={hero ? "dark" : undefined}
        data-game={hero ? game.id : undefined}
        className={clsx("relative m-3 mb-2 flex h-[136px] flex-col overflow-hidden rounded-2xl border border-line p-3.5", hero ? "bg-ink" : "hero-surface")}
      >
        {hero ? (
          <>
            <img src={hero} alt="" draggable={false} className="pointer-events-none absolute inset-0 size-full object-cover" style={{ objectPosition: "60% 30%" }} />
            <div className="pointer-events-none absolute inset-0" style={{ background: "linear-gradient(180deg, rgb(7 9 20 / 0.15) 10%, rgb(7 9 20 / 0.86) 100%)" }} />
          </>
        ) : (
          Art && <Art className="pointer-events-none absolute -right-8 bottom-0 h-[110%] w-[105%] text-accent opacity-70 [mask-image:linear-gradient(to_right,transparent_8%,black_62%)]" />
        )}
        <div className="pointer-events-none relative mt-auto">
          {hero && logo ? (
            <img src={logo} alt={game.name} draggable={false} className="-ml-1.5 max-h-[64px] max-w-[92%] object-contain object-left drop-shadow-[0_3px_12px_rgb(0_0_0/0.6)]" />
          ) : (
            <div className="flex items-center gap-2.5">
              <GameIcon game={game} size={30} />
              <div lang="en" className="headline min-w-0 truncate text-[17px] text-fg">{game.short}</div>
            </div>
          )}
          <div className="eyebrow mt-1.5 truncate text-fg-2">
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

      <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-2" aria-label={game.name}>
        {game.routes.map((r) => {
          const active = r.id === page;
          const badge = r.badge?.(status);
          return (
            <button
              key={r.id}
              onClick={() => go({ kind: "game", game: game.id, page: r.id })}
              aria-current={active ? "page" : undefined}
              className={clsx(
                "relative flex h-10 items-center gap-3 rounded-full px-3.5 text-[13.5px] transition-colors",
                active ? "font-semibold text-fg" : "text-fg-2 hover:bg-surface-2/70 hover:text-fg",
              )}
            >
              {active && (
                <motion.span
                  layoutId={`nav-${game.id}`}
                  className="absolute inset-0 rounded-full border border-line-strong bg-surface-2"
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

      <div className="m-3 mt-1 rounded-2xl border border-line bg-surface p-3" style={{ boxShadow: "var(--highlight)" }}>
        {status === undefined ? (
          <Skeleton className="h-16 w-full" />
        ) : status.installed ? (
          <>
            <div className="mb-2.5 flex items-center justify-between gap-2 px-1">
              <span className="eyebrow flex items-center gap-1.5 text-muted">
                <span className={clsx("size-1.5 rounded-full", status.running ? "pulse-dot bg-ok" : "bg-accent")} />
                {status.running ? t.common.running : t.game.ready}
              </span>
              <span className="tabular truncate text-[11.5px] text-fg-2">{t.game.playHint(status.enabled)}</span>
            </div>
            <Button variant="primary" size="lg" className="w-full" icon={<Play className="size-4 fill-current" />} disabled={status.running} onClick={() => launchGame(game.id)}>
              {status.running ? t.common.running : t.common.play}
            </Button>
          </>
        ) : (
          <>
            <div className="eyebrow mb-2.5 px-1 text-muted">{t.game.notReady}</div>
            <Button variant="subtle" size="lg" className="w-full" icon={<FolderOpen className="size-4" />} onClick={() => chooseGameFolder(game.id)}>
              {t.common.chooseFolder}
            </Button>
          </>
        )}
      </div>
    </aside>
  );
}
