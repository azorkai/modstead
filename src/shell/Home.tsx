// Ana sayfa: tüm oyunların durumu, son etkinlik, güvenlik ve hesaplar.

import type { ReactNode } from "react";
import { motion } from "motion/react";
import { ArrowRight, Bug, FolderOpen, KeyRound, Link2, Play, Plus, ShieldCheck, Sparkles } from "lucide-react";
import clsx from "clsx";
import { useArt } from "@/lib/art";
import { useLang, useT } from "@/lib/i18n";
import { ago, locale, num } from "@/lib/format";
import { updateSettings, useAppInfo, useGamesStatus, useJobs, useNexus, useNxmStatus, useSecrets, useSettings } from "@/lib/queries";
import { useUi } from "@/lib/store";
import type { GameStatus, JobSnapshot } from "@/lib/types";
import { Badge, Button, EmptyState, Skeleton } from "@/ui";
import { GAMES, gameModule } from "@/games/registry";
import type { GameModule } from "@/games/types";
import { chooseGameFolder, launchGame, notifyError } from "./actions";
import { GameIcon } from "./GameIcon";
import { gamesSetting, visibleGames } from "./Rail";

function greeting(t: ReturnType<typeof useT>): string {
  const h = new Date().getHours();
  if (h < 5) return t.greet.night;
  if (h < 12) return t.greet.morning;
  if (h < 18) return t.greet.day;
  if (h < 22) return t.greet.evening;
  return t.greet.night;
}

function MiniStat({ label, value, tone }: { label: string; value: ReactNode; tone?: "accent" | "warn" }) {
  return (
    <div className="rounded-xl border border-line bg-surface-2/50 px-3 py-2.5">
      <div className={clsx("tabular text-[17px] font-semibold leading-none", tone === "accent" ? "text-accent" : tone === "warn" ? "text-warn" : "text-fg")}>{value}</div>
      <div className="mt-1.5 text-[11px] text-muted">{label}</div>
    </div>
  );
}

function GameCard({ game, status, index }: { game: GameModule; status: GameStatus | undefined; index: number }) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const openGame = useUi((s) => s.openGame);
  const Art = game.Art;
  const hero = useArt(game.id, "hero");
  const logo = useArt(game.id, "logo");
  const installed = status?.installed;
  const attention = status?.notes.filter((n) => n.tone === "warn" || n.tone === "danger") ?? [];
  // Bilinmeyen sayılar ("—") gösterilmez: güncelleme varsa o, yoksa bilinen sorun sayısı.
  const third = status?.updates ? <MiniStat label={t.home.updates} value={status.updates} tone="accent" /> : status?.issues != null ? <MiniStat label={t.home.issues} value={status.issues} tone={status.issues ? "warn" : undefined} /> : null;
  return (
    <motion.article
      data-game={game.id}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: 0.05 * index, ease: [0.2, 0.7, 0.2, 1] }}
      className="card group relative flex flex-col overflow-hidden transition-[box-shadow,border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-md"
    >
      <button className="relative h-[176px] overflow-hidden border-b border-line text-left" onClick={() => openGame(game.id)} aria-label={game.name}>
        {hero ? (
          <>
            <img src={hero} alt="" draggable={false} className="absolute inset-0 size-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]" />
            {/* Görsel alanı iki temada da koyu kalır: logolar açık renklidir. */}
            <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgb(8 9 12 / 0.05) 20%, rgb(8 9 12 / 0.78) 100%)" }} />
          </>
        ) : (
          <div className="hero-surface absolute inset-0">
            {Art && <Art className="pointer-events-none absolute -right-6 bottom-0 h-full w-[118%] text-accent opacity-85 transition-transform duration-500 group-hover:scale-[1.03]" />}
          </div>
        )}
        <div className="relative flex h-full flex-col justify-between p-4">
          <div className="flex items-start justify-between">
            <GameIcon game={game} size={38} />
            {status?.running && (
              <Badge tone="ok" dot className="glass">
                {t.common.running}
              </Badge>
            )}
          </div>
          {logo ? (
            <img src={logo} alt="" draggable={false} className="max-h-[60px] max-w-[72%] self-start object-contain object-left drop-shadow-[0_4px_18px_rgb(0_0_0/0.55)]" />
          ) : (
            logo === null && <span className={clsx("text-display max-w-[80%] text-[21px] font-semibold leading-tight tracking-tight [text-shadow:0_2px_16px_rgb(0_0_0/0.45)]", hero ? "text-white" : "text-fg")}>{game.name}</span>
          )}
        </div>
      </button>
      <div className="flex flex-1 flex-col p-4">
        <h3 className="sr-only">{game.name}</h3>
        <p className="line-clamp-1 text-[12px] text-fg-2">
          {status === undefined ? t.common.loading : installed ? status.installs.map((i) => [i.label, i.version].filter(Boolean).join(" · ")).join("  ·  ") : t.home.notInstalled}
        </p>
        {status === undefined ? (
          <Skeleton className="mt-4 h-[58px] w-full" />
        ) : installed ? (
          <div className={clsx("mt-4 grid gap-2", third ? "grid-cols-3" : "grid-cols-2")}>
            <MiniStat label={t.home.mods} value={num(status.mods)} />
            <MiniStat label={t.home.enabled} value={num(status.enabled)} tone="accent" />
            {third}
          </div>
        ) : (
          <p className="mt-4 text-[12.5px] leading-relaxed text-fg-2">{t.home.notInstalledHint}</p>
        )}
        {attention.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {attention.slice(0, 2).map((n) => (
              <Badge key={n.text} tone={n.tone === "danger" ? "danger" : "warn"} dot className="h-auto whitespace-normal py-0.5">
                {n.text}
              </Badge>
            ))}
          </div>
        )}
        <div className="mt-auto flex gap-2 pt-4">
          <Button variant="secondary" className="flex-1" trailing={<ArrowRight className="size-3.5" />} onClick={() => openGame(game.id)}>
            {t.common.open}
          </Button>
          {installed ? (
            <Button variant="primary" icon={<Play className="size-3.5 fill-current" />} disabled={status?.running} onClick={() => launchGame(game.id)}>
              {t.common.play}
            </Button>
          ) : (
            <Button variant="subtle" icon={<FolderOpen className="size-3.5" />} onClick={() => chooseGameFolder(game.id)} disabled={status === undefined}>
              {t.common.chooseFolder}
            </Button>
          )}
        </div>
      </div>
      <span className="sr-only">{game.tagline[lang]}</span>
    </motion.article>
  );
}

/** Kenar çubuğunda olmayan oyunlar (ilk kurulumda bulunamayan ya da kapatılan): tek tıkla geri eklenir.
 *  Sonradan kurulan bir oyun burada "Bu bilgisayarda bulundu" diye öne çıkar. */
function MoreGames({ games, visible, statusOf, index }: { games: GameModule[]; visible: string[]; statusOf: (id: string) => GameStatus | undefined; index: number }) {
  const t = useT();
  const add = (id: string) => updateSettings({ games: gamesSetting([...visible, id]) }).catch(notifyError);
  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: 0.05 * index, ease: [0.2, 0.7, 0.2, 1] }}
      className="flex flex-col rounded-[18px] border border-dashed border-line-strong p-4"
    >
      <h3 className="text-[13.5px] font-semibold text-fg">{t.home.moreGames}</h3>
      <p className="mt-0.5 text-[12px] leading-relaxed text-fg-2">{t.home.moreGamesHint}</p>
      <ul className="mt-3 flex flex-col gap-1.5">
        {games.map((g) => {
          const here = statusOf(g.id)?.installed;
          return (
            <li key={g.id} data-game={g.id} className="flex items-center gap-3 rounded-xl px-1 py-1.5">
              <GameIcon game={g} size={34} dim={!here} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-medium text-fg">{g.name}</div>
                <div className={clsx("truncate text-[11.5px]", here ? "text-ok" : "text-muted")}>{here ? t.home.foundHere : t.home.notInstalledShort}</div>
              </div>
              <Button size="sm" variant={here ? "subtle" : "ghost"} icon={<Plus className="size-3.5" />} onClick={() => void add(g.id)}>
                {t.home.addGame}
              </Button>
            </li>
          );
        })}
      </ul>
    </motion.section>
  );
}

function ActivityRow({ job }: { job: JobSnapshot }) {
  const t = useT();
  const game = gameModule(job.game);
  const setReview = useUi((s) => s.setReview);
  const tone = job.stage === "done" ? "ok" : job.stage === "failed" ? "danger" : job.stage === "review" ? "warn" : "neutral";
  return (
    <li data-game={job.game} className="flex items-center gap-3 px-5 py-3">
      {game ? (
        <GameIcon game={game} size={32} />
      ) : (
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg accent-soft">
          <Sparkles className="size-4" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-medium text-fg">{job.title}</div>
        <div className="truncate text-[11.5px] text-muted">
          {game?.short} · {ago(job.updated)}
        </div>
      </div>
      {job.stage === "review" ? (
        <Button size="sm" variant="subtle" onClick={() => setReview(job.id)}>
          {t.jobs.review}
        </Button>
      ) : (
        <Badge tone={tone} dot={tone !== "neutral"}>
          {t.jobs.stages[job.stage]}
        </Badge>
      )}
    </li>
  );
}

function TrustRow({ icon, label, value, tone }: { icon: ReactNode; label: string; value: ReactNode; tone: "ok" | "warn" | "neutral" }) {
  return (
    <li className="flex items-center gap-3 px-5 py-3">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-line bg-surface-2 text-fg-2">{icon}</div>
      <div className="min-w-0 flex-1 text-[12.5px] text-fg">{label}</div>
      <Badge tone={tone} dot={tone !== "neutral"}>
        {value}
      </Badge>
    </li>
  );
}

export function Home() {
  const t = useT();
  const go = useUi((s) => s.go);
  const { data: settings } = useSettings();
  const { data: statuses } = useGamesStatus();
  const { data: info } = useAppInfo();
  const { data: nexus } = useNexus();
  const { data: nxm } = useNxmStatus();
  const { data: secrets } = useSecrets();
  const { data: jobs } = useJobs();
  const games = visibleGames(settings);
  const hidden = GAMES.filter((g) => !games.includes(g));
  const statusOf = (id: string) => statuses?.find((s) => s.id === id)?.status;
  const installed = games.filter((g) => statusOf(g.id)?.installed);
  const totalMods = installed.reduce((a, g) => a + (statusOf(g.id)?.mods ?? 0), 0);
  const attention = games.reduce((a, g) => a + (statusOf(g.id)?.notes.filter((n) => n.tone === "warn" || n.tone === "danger").length ?? 0) + (statusOf(g.id)?.issues ?? 0), 0);
  const recent = [...(jobs ?? [])].sort((a, b) => b.updated - a.updated).slice(0, 6);
  const today = new Date().toLocaleDateString(locale(), { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="mx-auto flex max-w-[1240px] flex-col gap-7">
      <header className="flex items-end justify-between gap-6">
        <div>
          <div className="text-[11.5px] font-medium uppercase tracking-[0.1em] text-muted">{today}</div>
          <h1 className="mt-1.5 text-[30px] font-semibold leading-tight tracking-tight text-fg">{greeting(t)}</h1>
          <p className="mt-1.5 text-[14px] text-fg-2">
            {statuses ? (
              <>
                {t.home.summary(installed.length, totalMods)} {attention > 0 ? t.home.attention(attention) : t.home.allGood}
              </>
            ) : (
              t.common.loading
            )}
          </p>
        </div>
      </header>

      <section>
        <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">{t.home.yourGames}</h2>
        <div className="grid grid-cols-3 gap-4">
          {games.map((g, i) => (
            <GameCard key={g.id} game={g} status={statusOf(g.id)} index={i} />
          ))}
          {hidden.length > 0 && <MoreGames games={hidden} visible={games.map((g) => g.id)} statusOf={statusOf} index={games.length} />}
        </div>
      </section>

      <div className="grid grid-cols-[1.55fr_1fr] gap-4">
        <section className="card overflow-hidden">
          <header className="flex items-center justify-between border-b border-line px-5 py-3.5">
            <h3 className="text-[13.5px] font-semibold text-fg">{t.home.activity}</h3>
          </header>
          {recent.length === 0 ? (
            <EmptyState icon={<Sparkles className="size-6" />} title={t.home.noActivity} className="py-10">
              {t.home.noActivityHint}
            </EmptyState>
          ) : (
            <ul className="divide-y divide-[var(--line)]">
              {recent.map((j) => (
                <ActivityRow key={j.id} job={j} />
              ))}
            </ul>
          )}
        </section>

        <section className="card overflow-hidden">
          <header className="flex items-center justify-between border-b border-line px-5 py-3.5">
            <h3 className="text-[13.5px] font-semibold text-fg">{t.home.trust}</h3>
            <Button size="sm" variant="ghost" onClick={() => go({ kind: "settings" })}>
              {t.home.manage}
            </Button>
          </header>
          <ul className="divide-y divide-[var(--line)]">
            <TrustRow
              icon={<Bug className="size-4" />}
              label={t.home.defender}
              value={info?.defenderAvailable === false ? t.home.defenderMissing : t.home.defenderOn}
              tone={info?.defenderAvailable === false ? "warn" : "ok"}
            />
            <TrustRow
              icon={<KeyRound className="size-4" />}
              label={t.home.nexus}
              value={nexus?.user ? t.home.nexusConnected(nexus.user.name) : nexus?.hasKey ? t.settings.stored : t.home.nexusMissing}
              tone={nexus?.user || nexus?.hasKey ? "ok" : "neutral"}
            />
            <TrustRow
              icon={<Link2 className="size-4" />}
              label={t.home.nxm}
              value={nxm?.registered ? t.home.nxmOurs : nxm?.otherHandler ? t.home.nxmOther : t.home.nxmNone}
              tone={nxm?.registered ? "ok" : "neutral"}
            />
            <TrustRow icon={<ShieldCheck className="size-4" />} label={t.home.virustotal} value={secrets?.virustotal ? t.home.vtOn : t.home.vtOff} tone={secrets?.virustotal ? "ok" : "neutral"} />
          </ul>
        </section>
      </div>
    </div>
  );
}
