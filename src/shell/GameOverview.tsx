// Oyunların "Genel bakış" sayfası için şablon: kahraman alanı, istatistikler, kurulumlar,
// oyuna özel bilgiler (`facts`) ve taşıma sürerken gelecek özellikler.

import type { ReactNode } from "react";
import { motion } from "motion/react";
import { CheckCircle2, ChevronDown, CircleDashed, FolderOpen, HardDrive, Info, Layers, Play, RefreshCw, TriangleAlert, Wrench } from "lucide-react";
import clsx from "clsx";
import { useQueryClient } from "@tanstack/react-query";
import { useArt } from "@/lib/art";
import { useLang, useT } from "@/lib/i18n";
import { ago, num } from "@/lib/format";
import { keys, useGameStatus } from "@/lib/queries";
import type { GameId, Tone } from "@/lib/types";
import { Badge, Button, IconButton, Skeleton, Stat } from "@/ui";
import { gameModule } from "@/games/registry";
import { chooseGameFolder, launchGame } from "./actions";
import { GameIcon } from "./GameIcon";

const noteTone: Record<Tone, "info" | "ok" | "warn" | "danger"> = { info: "info", ok: "ok", warn: "warn", danger: "danger" };

export interface Fact {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
}

export function GameOverview({ id, facts, children }: { id: GameId; facts?: Fact[]; children?: ReactNode }) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const qc = useQueryClient();
  const game = gameModule(id)!;
  const status = useGameStatus(id);
  const Art = game.Art;
  const hero = useArt(id, "hero");
  const logo = useArt(id, "logo");
  const stats: { label: string; value: ReactNode; icon: ReactNode; tone?: "accent" | "warn" }[] = [];
  if (status?.installed) {
    if (status.mods != null) stats.push({ label: t.home.mods, value: num(status.mods), icon: <Layers className="size-3.5" /> });
    if (status.enabled != null) stats.push({ label: t.home.enabled, value: num(status.enabled), icon: <CheckCircle2 className="size-3.5" />, tone: "accent" });
    if (status.issues != null) stats.push({ label: t.home.issues, value: status.issues, icon: <TriangleAlert className="size-3.5" />, tone: status.issues ? "warn" : undefined });
    if (status.updates != null) stats.push({ label: t.home.updates, value: status.updates, icon: <RefreshCw className="size-3.5" />, tone: status.updates ? "accent" : undefined });
  }

  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-5">
      {/* Kahraman alanı */}
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        data-theme={hero ? "dark" : undefined}
        data-game={hero ? id : undefined}
        className={clsx("relative overflow-hidden rounded-[22px] border border-line px-8 pb-7 pt-8", hero ? "min-h-[320px] bg-ink" : "hero-surface")}
      >
        {hero ? (
          <>
            <img src={hero} alt="" draggable={false} className="absolute inset-0 size-full object-cover" style={{ objectPosition: "65% 35%" }} />
            {/* Görsel alanı iki temada da koyu kalır: oyun logoları açık renklidir. */}
            <div
              className="absolute inset-0"
              style={{
                background: "linear-gradient(90deg, rgb(7 9 20 / 0.9) 0%, rgb(7 9 20 / 0.62) 38%, transparent 72%), linear-gradient(0deg, rgb(7 9 20 / 0.6) 0%, transparent 45%)",
              }}
            />
          </>
        ) : (
          Art && <Art className="pointer-events-none absolute -right-6 bottom-0 h-full w-[62%] text-accent opacity-90" />
        )}
        <div className="relative max-w-xl">
          <div className="mb-3 flex items-center gap-2">
            {!logo && <GameIcon game={game} size={38} />}
            {status?.running && (
              <Badge tone="ok" dot>
                {t.common.running}
              </Badge>
            )}
          </div>
          {logo ? (
            <>
              <h1 className="sr-only">{game.name}</h1>
              <img src={logo} alt="" draggable={false} className="mt-1 max-h-[96px] max-w-[380px] object-contain object-left drop-shadow-[0_6px_24px_rgb(0_0_0/0.55)]" />
            </>
          ) : (
            <h1 lang="en" className={clsx("headline text-[40px]", hero ? "text-white" : "text-fg")}>{game.name}</h1>
          )}
          <p className={clsx("mt-2 text-[14px]", hero ? "text-white/80" : "text-fg-2")}>{game.tagline[lang]}</p>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            {status === undefined ? (
              <Skeleton className="h-11 w-36" />
            ) : status.installed ? (
              <Button variant="primary" size="lg" icon={<Play className="size-4 fill-current" />} onClick={() => launchGame(id)} disabled={status.running}>
                {status.running ? t.common.running : t.common.play}
              </Button>
            ) : (
              <Button variant="primary" size="lg" icon={<FolderOpen className="size-4" />} onClick={() => chooseGameFolder(id)}>
                {t.common.chooseFolder}
              </Button>
            )}
            {status?.installs.map((i) => (
              <Badge key={i.path} tone="neutral" className={clsx("h-7 px-3 text-[12px]", hero && "on-image")}>
                {i.label}
                {i.version && <span className="text-muted">· {i.version}</span>}
              </Badge>
            ))}
          </div>
        </div>
      </motion.section>

      {/* İstatistikler: oyunun bilmediği sayı ("—") gösterilmez. */}
      {stats.length > 0 && (
        <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${stats.length}, minmax(0, 1fr))` }}>
          {stats.map((s) => (
            <Stat key={s.label} {...s} />
          ))}
        </div>
      )}

      <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-5">
        <div className="flex flex-col gap-5">
          {children}
          {game.porting && (
            // Taşıma sürerken küçük, açılır bir not: sayfanın asıl işini gölgelemesin.
            <details className="card group overflow-hidden">
              <summary className="flex cursor-default list-none items-center gap-3 px-5 py-3.5 [&::-webkit-details-marker]:hidden">
                <div className="accent-soft flex size-8 shrink-0 items-center justify-center rounded-full">
                  <Wrench className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="title text-[14px] text-fg">{t.game.porting.title}</h3>
                  <p className="truncate text-[12px] text-fg-2">{t.game.porting.body}</p>
                </div>
                <Badge tone="neutral">{game.porting.features.length}</Badge>
                <ChevronDown className="size-4 text-muted transition-transform group-open:rotate-180" />
              </summary>
              <ul className="grid grid-cols-2 gap-px border-t border-line bg-[var(--line)]">
                {game.porting.features.map((f, i, all) => (
                  <li key={f.tr} className={clsx("flex items-center gap-2.5 bg-surface px-5 py-2.5 text-[12.5px] text-fg-2", i === all.length - 1 && all.length % 2 === 1 && "col-span-2")}>
                    <CircleDashed className="size-3.5 shrink-0 text-muted" />
                    <span className="min-w-0 flex-1">{f[lang]}</span>
                  </li>
                ))}
              </ul>
              <footer className="border-t border-line px-5 py-2 font-mono text-[11px] text-muted">{t.game.porting.from(`${game.porting.app} · ${game.porting.path}`)}</footer>
            </details>
          )}
        </div>

        <div className="flex flex-col gap-5">
          <section className="card overflow-hidden">
            <header className="flex items-center justify-between border-b border-line px-5 py-3.5">
              <h3 className="title text-[15px] text-fg">{t.game.installs}</h3>
              <IconButton label={t.common.refresh} size="sm" onClick={() => qc.invalidateQueries({ queryKey: keys.games })}>
                <RefreshCw className="size-3.5" />
              </IconButton>
            </header>
            {status === undefined ? (
              <div className="space-y-2 p-5">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            ) : status.installs.length === 0 ? (
              <div className="px-5 py-4 text-[12.5px] text-fg-2">{t.home.notInstalledHint}</div>
            ) : (
              <ul className="divide-y divide-[var(--line)]">
                {status.installs.map((i) => (
                  <li key={i.path} className="flex items-start gap-3 px-5 py-3">
                    <HardDrive className="mt-0.5 size-4 shrink-0 text-muted" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-[12.5px] font-medium text-fg">
                        {i.label}
                        {i.running && (
                          <Badge tone="ok" dot>
                            {t.common.running}
                          </Badge>
                        )}
                      </div>
                      <div className="truncate font-mono text-[11px] text-muted" title={i.path} data-selectable>
                        {i.path}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {status && <footer className="border-t border-line px-5 py-2 text-[11px] text-muted">{t.home.checkedAgo(ago(status.checkedAt))}</footer>}
          </section>

          {(facts?.length || status?.notes.some((n) => n.tone !== "ok")) ? (
            <section className="card overflow-hidden">
              <header className="border-b border-line px-5 py-3.5">
                <h3 className="title text-[15px] text-fg">{t.game.status}</h3>
              </header>
              <ul className="divide-y divide-[var(--line)]">
                {facts?.map((f) => (
                  <li key={f.label} className="flex items-center gap-3 px-5 py-2.5 text-[12.5px]">
                    <span className="shrink-0 text-muted">{f.icon ?? <Info className="size-3.5" />}</span>
                    <span className="shrink-0 whitespace-nowrap text-fg-2">{f.label}</span>
                    <span className="flex min-w-0 flex-1 justify-end truncate text-right text-fg [&>*]:truncate" title={typeof f.value === "string" ? f.value : undefined}>
                      {f.value}
                    </span>
                  </li>
                ))}
                {status?.notes.filter((n) => n.tone !== "ok").map((n) => (
                  <li key={n.text} className="px-5 py-2.5">
                    <Badge tone={noteTone[n.tone]} dot className={clsx("h-auto whitespace-normal py-0.5")}>
                      {n.text}
                    </Badge>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
