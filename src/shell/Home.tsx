// Ana sayfa: öne çıkan oyunun vitrini (kenardan kenara görsel, başlatma, sayılar), oyunun kendi giriş
// kutucukları (`GameModule.home.Panel`), son indirmeler ve kurulumlar, güvenlik ve hesaplar.
// Vitrin görsel alanıdır: iki temada da koyu kalır (`data-theme="dark"` adası), logo ve yazı açık renklidir.

import type { ReactNode } from "react";
import { motion } from "motion/react";
import { ArrowRight, BadgeCheck, Bug, ChevronRight, ClipboardCheck, FileArchive, FolderOpen, KeyRound, Link2, PackageCheck, Play, Plus, ScanSearch, ShieldCheck } from "lucide-react";
import clsx from "clsx";
import { useArt } from "@/lib/art";
import { useLang, useT } from "@/lib/i18n";
import { ago, num } from "@/lib/format";
import { updateSettings, useAppInfo, useGamesStatus, useJobs, useNexus, useNxmStatus, useSecrets, useSettings } from "@/lib/queries";
import { useUi } from "@/lib/store";
import type { GameStatus, JobSnapshot } from "@/lib/types";
import { Badge, Button, Skeleton } from "@/ui";
import { GAMES, gameModule } from "@/games/registry";
import type { GameModule } from "@/games/types";
import { chooseGameFolder, launchGame, notifyError } from "./actions";
import { GameIcon } from "./GameIcon";
import { gamesSetting, visibleGames } from "./Rail";

const EASE = [0.2, 0.7, 0.2, 1] as const;

/** Görsel üstündeki perdeler: üstte üst çubuk, solda yazı, altta sayılar okunsun. Sabit koyu (görsel alanı). */
const SCRIM = [
  "linear-gradient(180deg, rgb(7 9 20 / 0.72) 0px, rgb(7 9 20 / 0) 150px)",
  "linear-gradient(90deg, rgb(7 9 20 / 0.94) 0%, rgb(7 9 20 / 0.74) 28%, rgb(7 9 20 / 0.12) 58%, rgb(7 9 20 / 0) 72%)",
  "linear-gradient(0deg, rgb(7 9 20 / 0.92) 0%, rgb(7 9 20 / 0.35) 34%, rgb(7 9 20 / 0) 56%)",
  "radial-gradient(45% 60% at 100% 100%, rgb(7 9 20 / 0.7), rgb(7 9 20 / 0) 70%)",
].join(", ");

// ───────────── Vitrin ─────────────

function HeroStat({ label, value, tone }: { label: string; value: ReactNode; tone?: "warn" | "accent" }) {
  return (
    <div className="min-w-[92px] border-l border-white/15 pl-5 first:border-l-0 first:pl-0">
      <div className={clsx("num text-[40px]", tone === "warn" ? "text-warn" : tone === "accent" ? "text-accent" : "text-white")}>{value}</div>
      <div className="eyebrow mt-2 text-white/60">{label}</div>
    </div>
  );
}

function Showcase({ game, status }: { game: GameModule; status: GameStatus | undefined }) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const openGame = useUi((s) => s.openGame);
  const hero = useArt(game.id, "hero");
  const logo = useArt(game.id, "logo");
  const Art = game.Art;
  const Actions = game.home?.Actions;
  const installed = !!status?.installed;
  const issues = status?.issues ?? 0;
  const stats: { label: string; value: ReactNode; tone?: "warn" | "accent" }[] = [];
  if (status?.installed) {
    if (status.mods != null) stats.push({ label: t.home.statMods, value: num(status.mods) });
    if (status.enabled != null) stats.push({ label: t.home.statEnabled, value: num(status.enabled) });
    if (status.issues != null) stats.push({ label: t.home.statIssues, value: status.issues, tone: issues ? "warn" : undefined });
    if (status.updates) stats.push({ label: t.home.statUpdates, value: status.updates, tone: "accent" });
  }
  const state = status === undefined ? t.home.statusChecking : status.running ? t.home.statusRunning : installed ? t.home.statusReady : t.home.statusMissing;

  return (
    <section data-game={game.id} data-theme="dark" className="relative isolate h-[clamp(400px,48vh,520px)] overflow-hidden bg-ink text-fg">
      {hero ? (
        <motion.img
          src={hero}
          alt=""
          draggable={false}
          className="absolute inset-0 -z-10 size-full object-cover"
          style={{ objectPosition: "50% 28%" }}
          initial={{ opacity: 0, scale: 1.03 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.9, ease: EASE }}
        />
      ) : hero === null ? (
        <div className="hero-surface absolute inset-0 -z-10">{Art && <Art className="pointer-events-none absolute -right-6 bottom-0 h-[86%] w-[70%] text-accent opacity-90" />}</div>
      ) : null}
      <div className="pointer-events-none absolute inset-0 -z-10" style={{ background: SCRIM }} />

      <div className="mx-auto flex h-full max-w-[1520px] items-end gap-10 px-10 pb-9 pt-[76px]">
        <div className="min-w-0 max-w-[620px] flex-1">
          <div className="eyebrow flex items-center gap-2 text-white/75">
            <span className={clsx("size-2 rounded-full", status?.running ? "pulse-dot bg-ok" : installed ? "bg-accent" : "bg-white/40")} />
            {state}
            {status && <span className="text-white/45">· {t.home.checkedAgo(ago(status.checkedAt))}</span>}
          </div>
          {logo ? (
            <>
              <h1 className="sr-only">{game.name}</h1>
              <img src={logo} alt="" draggable={false} className="-ml-3 mt-1 max-h-[150px] max-w-[440px] object-contain object-left drop-shadow-[0_8px_30px_rgb(0_0_0/0.6)]" />
            </>
          ) : (
            logo === null && <h1 lang="en" className="headline mt-4 max-w-[14ch] text-[52px] text-white">{game.name}</h1>
          )}
          <p className="mt-1 text-[15px] text-white/80">{game.tagline[lang]}</p>
          {status?.installed && status.installs.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-white/65">
              {status.installs.map((i) => (
                <li key={i.path} className="flex items-center gap-1.5">
                  <span className={clsx("size-1.5 rounded-full", i.running ? "pulse-dot bg-ok" : "bg-white/50")} />
                  {[i.label, i.version].filter(Boolean).join(" · ")}
                </li>
              ))}
            </ul>
          )}
          <div className="mt-6 flex flex-wrap items-center gap-2.5">
            {status === undefined ? (
              <Skeleton className="h-11 w-44 rounded-full" />
            ) : status.installed ? (
              Actions ? (
                <Actions />
              ) : (
                <Button variant="primary" size="lg" icon={<Play className="size-4 fill-current" />} disabled={status.running} onClick={() => launchGame(game.id)}>
                  {status.running ? t.common.running : t.common.play}
                </Button>
              )
            ) : (
              <Button variant="primary" size="lg" icon={<FolderOpen className="size-4" />} onClick={() => chooseGameFolder(game.id)}>
                {t.common.chooseFolder}
              </Button>
            )}
            <Button size="lg" variant="ghost" className="text-white/85 hover:bg-white/10 hover:text-white" trailing={<ArrowRight className="size-4" />} onClick={() => openGame(game.id)}>
              {t.home.openGame(game.short)}
            </Button>
          </div>
        </div>
        {stats.length > 0 && (
          <div className="ml-auto hidden shrink-0 items-end gap-5 pb-1 lg:flex">
            {stats.map((s) => (
              <HeroStat key={s.label} {...s} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

// ───────────── Diğer oyunlar ─────────────

function GameCard({ game, status }: { game: GameModule; status: GameStatus | undefined }) {
  const t = useT();
  const openGame = useUi((s) => s.openGame);
  const hero = useArt(game.id, "hero");
  const logo = useArt(game.id, "logo");
  const Art = game.Art;
  const installed = status?.installed;
  return (
    <article data-game={game.id} className="group relative overflow-hidden rounded-2xl border border-line bg-surface">
      <button data-theme="dark" className="relative block h-[132px] w-full overflow-hidden bg-ink text-left" onClick={() => openGame(game.id)} aria-label={game.name}>
        {hero ? (
          <img src={hero} alt="" draggable={false} className="absolute inset-0 size-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]" />
        ) : (
          <div className="hero-surface absolute inset-0">{Art && <Art className="pointer-events-none absolute -right-6 bottom-0 h-full w-[118%] text-accent opacity-85" />}</div>
        )}
        <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgb(7 9 20 / 0.05) 20%, rgb(7 9 20 / 0.82) 100%)" }} />
        <div className="absolute inset-x-4 bottom-3.5">
          {logo ? (
            <img src={logo} alt="" draggable={false} className="max-h-[48px] max-w-[70%] object-contain object-left drop-shadow-[0_4px_18px_rgb(0_0_0/0.55)]" />
          ) : (
            logo === null && <span lang="en" className="headline block truncate text-[20px] text-white">{game.name}</span>
          )}
        </div>
      </button>
      <div className="flex items-center gap-3 px-4 py-3">
        <GameIcon game={game} size={30} />
        <div className="min-w-0 flex-1 truncate text-[12.5px] text-fg-2">
          {status === undefined ? t.common.loading : installed ? t.home.summary(1, status.mods ?? 0) : t.home.notInstalledShort}
        </div>
        {installed ? (
          <Button size="sm" variant="primary" icon={<Play className="size-3 fill-current" />} disabled={status?.running} onClick={() => launchGame(game.id)}>
            {t.common.play}
          </Button>
        ) : (
          <Button size="sm" variant="subtle" icon={<FolderOpen className="size-3.5" />} onClick={() => chooseGameFolder(game.id)} disabled={status === undefined}>
            {t.common.chooseFolder}
          </Button>
        )}
      </div>
    </article>
  );
}

/** Kenar çubuğunda olmayan oyunlar (ilk kurulumda bulunamayan ya da kapatılan): tek tıkla geri eklenir. */
function MoreGames({ games, visible, statusOf }: { games: GameModule[]; visible: string[]; statusOf: (id: string) => GameStatus | undefined }) {
  const t = useT();
  const add = (id: string) => updateSettings({ games: gamesSetting([...visible, id]) }).catch(notifyError);
  return (
    <section className="flex flex-col rounded-2xl border border-dashed border-line-strong p-4">
      <h3 className="title text-[14px] text-fg">{t.home.moreGames}</h3>
      <p className="mt-0.5 text-[12px] leading-relaxed text-fg-2">{t.home.moreGamesHint}</p>
      <ul className="mt-3 flex flex-col gap-1.5">
        {games.map((g) => {
          const here = statusOf(g.id)?.installed;
          return (
            <li key={g.id} data-game={g.id} className="flex items-center gap-3 py-1">
              <GameIcon game={g} size={32} dim={!here} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-semibold text-fg">{g.name}</div>
                <div className={clsx("truncate text-[11.5px]", here ? "text-ok" : "text-muted")}>{here ? t.home.foundHere : t.home.notInstalledShort}</div>
              </div>
              <Button size="sm" variant={here ? "subtle" : "ghost"} icon={<Plus className="size-3.5" />} onClick={() => void add(g.id)}>
                {t.home.addGame}
              </Button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ───────────── Son etkinlik ─────────────

function ActivityRow({ job }: { job: JobSnapshot }) {
  const t = useT();
  const game = gameModule(job.game);
  const setReview = useUi((s) => s.setReview);
  const tone = job.stage === "done" ? "ok" : job.stage === "failed" ? "danger" : job.stage === "review" ? "warn" : "neutral";
  return (
    <li data-game={job.game} className="flex items-center gap-3.5 px-5 py-3">
      {game ? (
        <GameIcon game={game} size={34} />
      ) : (
        <div className="flex size-[34px] shrink-0 items-center justify-center rounded-[10px] bg-surface-2 text-fg-2">
          <FileArchive className="size-4" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13.5px] font-semibold text-fg">{job.title}</div>
        <div className="truncate text-[12px] text-muted">{[game?.short, ago(job.updated)].filter(Boolean).join(" · ")}</div>
      </div>
      {job.stage === "review" ? (
        <Button size="sm" variant="primary" onClick={() => setReview(job.id)}>
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

/** Boş durum: bir arşivin kurulmadan önce geçtiği dört adım (ilk kurulumdaki boru hattıyla aynı dil). */
function ActivityEmpty({ discover }: { discover?: () => void }) {
  const t = useT();
  const steps = [
    { icon: <BadgeCheck className="size-4" />, title: t.onboarding.pipeline.verify, hint: t.onboarding.pipeline.verifyHint },
    { icon: <ScanSearch className="size-4" />, title: t.onboarding.pipeline.scan, hint: t.onboarding.pipeline.scanHint },
    { icon: <ClipboardCheck className="size-4" />, title: t.onboarding.pipeline.review, hint: t.onboarding.pipeline.reviewHint },
    { icon: <PackageCheck className="size-4" />, title: t.onboarding.pipeline.install, hint: t.onboarding.pipeline.installHint },
  ];
  return (
    <div className="px-5 pb-5 pt-4">
      <div className="flex items-start gap-4 rounded-xl border border-dashed border-line-strong px-4 py-4">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-2 text-fg-2">
          <FileArchive className="size-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="title text-[15px] text-fg">{t.home.emptyTitle}</div>
          <p className="mt-1 text-pretty text-[12.5px] leading-relaxed text-fg-2">{t.home.emptyBody}</p>
        </div>
        {discover && (
          <Button size="sm" variant="secondary" className="mt-0.5 shrink-0" trailing={<ArrowRight className="size-3.5" />} onClick={discover}>
            {t.home.browse}
          </Button>
        )}
      </div>
      <ol className="mt-4 grid grid-cols-4 gap-px overflow-hidden rounded-xl border border-line bg-[var(--line)]">
        {steps.map((s, i) => (
          <li key={s.title} className="flex flex-col bg-surface px-3.5 pb-3.5 pt-3">
            <div className="flex items-center justify-between text-muted">
              <span className="eyebrow">{String(i + 1).padStart(2, "0")}</span>
              {s.icon}
            </div>
            <div className="title mt-3 text-[13.5px] text-fg">{s.title}</div>
            <div className="mt-0.5 text-[11.5px] leading-snug text-muted">{s.hint}</div>
          </li>
        ))}
      </ol>
    </div>
  );
}

// ───────────── Güvenlik ve hesaplar ─────────────

function TrustRow({ icon, label, value, tone, onClick }: { icon: ReactNode; label: string; value: ReactNode; tone: "ok" | "warn" | "neutral"; onClick: () => void }) {
  return (
    <li>
      <button type="button" onClick={onClick} className="group flex w-full items-center gap-3.5 px-5 py-3 text-left transition-colors hover:bg-surface-2/60">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-fg-2">{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold text-fg">{label}</span>
          <span className={clsx("flex items-center gap-1.5 truncate text-[12px]", tone === "ok" ? "text-ok" : tone === "warn" ? "text-warn" : "text-muted")}>
            <span className={clsx("size-1.5 shrink-0 rounded-full", tone === "neutral" ? "border border-current" : "bg-current")} />
            {value}
          </span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-muted opacity-0 transition-opacity group-hover:opacity-100" />
      </button>
    </li>
  );
}

function PanelHead({ title, aside }: { title: string; aside?: ReactNode }) {
  return (
    <header className="flex h-[52px] items-center justify-between gap-3 border-b border-line px-5">
      <h2 className="title text-[15px] text-fg">{title}</h2>
      {aside}
    </header>
  );
}

// ───────────── Sayfa ─────────────

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
  // Vitrinde: en son açılan oyun; yoksa ilk kurulu, o da yoksa ilk oyun.
  const featured = games.find((g) => g.id === settings?.lastGame) ?? games.find((g) => statusOf(g.id)?.installed) ?? games[0];
  const others = games.filter((g) => g !== featured);
  // Arayüzde gizli oyunların işleri gösterilmez (bkz. games/registry.ts → HIDDEN).
  const recent = (jobs ?? []).filter((j) => gameModule(j.game)).sort((a, b) => b.updated - a.updated).slice(0, 6);
  const Panel = featured?.home?.Panel;
  const discover = featured?.routes.some((r) => r.id === "discover") ? () => go({ kind: "game", game: featured.id, page: "discover" }) : undefined;
  const settingsView = () => go({ kind: "settings" });

  return (
    <div className="pb-14">
      {featured && <Showcase game={featured} status={statusOf(featured.id)} />}

      <div className="mx-auto flex max-w-[1520px] flex-col gap-7 px-10 pt-7">
        {Panel && (
          <div data-game={featured.id}>
            <Panel />
          </div>
        )}

        {(others.length > 0 || hidden.length > 0) && (
          <section>
            <h2 className="eyebrow mb-3 text-muted">{t.home.otherGames}</h2>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4">
              {others.map((g) => (
                <GameCard key={g.id} game={g} status={statusOf(g.id)} />
              ))}
              {hidden.length > 0 && <MoreGames games={hidden} visible={games.map((g) => g.id)} statusOf={statusOf} />}
            </div>
          </section>
        )}

        <div className="grid grid-cols-[minmax(0,1.7fr)_minmax(320px,1fr)] items-start gap-6">
          <section className="card overflow-hidden">
            <PanelHead title={t.home.activity} aside={recent.length > 0 ? <span className="eyebrow text-muted">{t.home.activityCount(recent.length)}</span> : undefined} />
            {jobs === undefined ? (
              <div className="space-y-3 p-5">
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-9 w-2/3" />
              </div>
            ) : recent.length === 0 ? (
              <ActivityEmpty discover={discover} />
            ) : (
              <ul className="divide-y divide-[var(--line)]">
                {recent.map((j) => (
                  <ActivityRow key={j.id} job={j} />
                ))}
              </ul>
            )}
          </section>

          <section className="card overflow-hidden">
            <PanelHead
              title={t.home.trust}
              aside={
                <Button size="sm" variant="ghost" onClick={settingsView}>
                  {t.home.manage}
                </Button>
              }
            />
            <ul className="divide-y divide-[var(--line)]">
              <TrustRow
                icon={<Bug className="size-4" />}
                label={t.home.defender}
                value={info?.defenderAvailable === false ? t.home.defenderMissing : t.home.defenderOn}
                tone={info?.defenderAvailable === false ? "warn" : "ok"}
                onClick={settingsView}
              />
              <TrustRow
                icon={<KeyRound className="size-4" />}
                label={t.home.nexus}
                value={nexus?.user ? t.home.nexusConnected(nexus.user.name) : nexus?.hasKey ? t.settings.stored : t.home.nexusMissing}
                tone={nexus?.user || nexus?.hasKey ? "ok" : "neutral"}
                onClick={settingsView}
              />
              <TrustRow
                icon={<Link2 className="size-4" />}
                label={t.home.nxm}
                value={nxm?.registered ? t.home.nxmOurs : nxm?.otherHandler ? t.home.nxmOther : t.home.nxmNone}
                tone={nxm?.registered ? "ok" : "neutral"}
                onClick={settingsView}
              />
              <TrustRow icon={<ShieldCheck className="size-4" />} label={t.home.virustotal} value={secrets?.virustotal ? t.home.vtOn : t.home.vtOff} tone={secrets?.virustotal ? "ok" : "neutral"} onClick={settingsView} />
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
