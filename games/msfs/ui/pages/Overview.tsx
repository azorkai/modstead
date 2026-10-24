// MSFS genel bakışı (oyun başlatıcısı hissi): vitrinde modların görselleri, simi başlatma düğmeleri,
// sayılar, son eklenenler, dikkat isteyenler, simler ve koleksiyon.

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import clsx from "clsx";
import { ArrowRight, CircleAlert, FolderOpen, HardDrive, Layers, Play, Plane, TriangleAlert } from "lucide-react";
import { useArt } from "@/lib/art";
import { bytes } from "@/lib/format";
import { useLang } from "@/lib/i18n";
import { useUi } from "@/lib/store";
import { gameModule } from "@/games/registry";
import { GameIcon } from "@/shell/GameIcon";
import { notifyError } from "@/shell/actions";
import { Button, EmptyState, IconButton, Skeleton, Stat } from "@/ui";
import { api } from "../api";
import { MsfsArt } from "../Art";
import { CATEGORIES, SIMS, SIM_COLOR, SIM_SHORT, activeAnywhere, catLabel, isActive } from "../format";
import { useMsfsT } from "../i18n";
import { ModDrawer } from "../ModDrawer";
import { chooseLibrary } from "../parts";
import { invalidateAll, useMsfsSettings, useSnapshot } from "../queries";
import { useMsfsUi } from "../store";
import { Thumb } from "../Thumb";
import type { ModEntry, ScanResult, SimId, SimInstall } from "../types";

/** Vitrine en çok yakışanlar: görseli olan uçak, boya, havalimanı ve sahneler; etkinler önce. */
function photoScore(m: ModEntry): number {
  if (!m.info.thumbnail) return 0;
  const cat = { aircraft: 5, livery: 4, airport: 4, scenery: 3 }[m.info.category as string] ?? 1;
  return cat * 10 + (activeAnywhere(m) ? 5 : 0) + (m.meta.favorite ? 3 : 0);
}

const go = (page: string) => useUi.getState().openGame("msfs", page);

async function launch(sim: SimInstall, label: string) {
  try {
    await api.launch(sim.id);
    toast.success(label);
    setTimeout(invalidateAll, 5000);
  } catch (e) {
    notifyError(e);
  }
}

export default function Overview() {
  const t = useMsfsT();
  const { data: scan, isLoading } = useSnapshot();
  const { data: settings } = useMsfsSettings();
  const freeWord = useLang((s) => s.lang) === "tr" ? "boş" : "free";

  if (isLoading || !scan || !settings) {
    return (
      <div className="mx-auto flex max-w-[1180px] flex-col gap-5">
        <Skeleton className="h-[340px] rounded-3xl" />
        <div className="grid grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-[74px]" />
          ))}
        </div>
      </div>
    );
  }

  const problems = scan.mods.flatMap((m) => m.issues.filter((i) => i.level === "error").map((i) => ({ ...i, mod: m })));
  const librarySize = scan.mods.filter((m) => m.source === "library").reduce((a, m) => a + m.info.size, 0);

  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-5 pb-12">
      <Hero scan={scan} />

      {!settings.libraryPath && <SetupCard />}

      <div className="grid grid-cols-5 gap-3">
        <Stat label={t.overview.stats.mods} value={scan.stats.total} icon={<Layers className="size-3.5" />} onClick={() => go("library")} />
        {SIMS.map((s) => (
          <Stat
            key={s}
            label={t.overview.stats.enabled(SIM_SHORT[s])}
            value={scan.stats.enabled[s] ?? 0}
            icon={<span className="size-2 rounded-full" style={{ background: SIM_COLOR[s] }} />}
            onClick={() => {
              useMsfsUi.getState().set({ sim: s, status: "active" });
              go("library");
            }}
          />
        ))}
        <Stat label={t.overview.stats.problems} value={problems.length} tone={problems.length ? "danger" : "ok"} icon={<CircleAlert className="size-3.5" />} onClick={() => go("health")} />
        <Stat label={t.overview.stats.size} value={librarySize ? bytes(librarySize) : "0"} icon={<HardDrive className="size-3.5" />} hint={scan.libraryFree != null ? `${bytes(scan.libraryFree)} ${freeWord}` : undefined} />
      </div>

      <div className="grid grid-cols-[1.45fr_1fr] gap-5">
        <div className="flex min-w-0 flex-col gap-5">
          <Recent scan={scan} />
          <Attention problems={problems} />
        </div>
        <div className="flex min-w-0 flex-col gap-5">
          <Sims scan={scan} />
          <Collection scan={scan} />
        </div>
      </div>
      <ModDrawer />
    </div>
  );
}

function Hero({ scan }: { scan: ScanResult }) {
  const t = useMsfsT();
  const lang = useLang((s) => s.lang);
  const game = gameModule("msfs")!;
  const steamHero = useArt("msfs", "hero");
  const logo = useArt("msfs", "logo");
  const featured = useMemo(
    () =>
      scan.mods
        .filter((m) => photoScore(m) > 0)
        .sort((a, b) => photoScore(b) - photoScore(a))
        .slice(0, 5),
    [scan.mods],
  );
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (featured.length < 2) return;
    const id = window.setInterval(() => setIdx((i) => (i + 1) % featured.length), 7000);
    return () => window.clearInterval(id);
  }, [featured.length]);
  const current = featured[idx % Math.max(1, featured.length)];
  const detected = scan.sims.filter((s) => s.detected && (s.edition === "steam" || s.edition === "store"));
  const primary = detected.find((s) => s.id === "msfs2024") ?? detected[0];
  const hasImage = !!current || !!steamHero;

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={clsx("relative min-h-[340px] overflow-hidden rounded-3xl border border-line", !hasImage && "hero-surface")}
    >
      {current ? (
        <AnimatePresence initial={false}>
          <motion.div key={current.id} className="absolute inset-0" initial={{ opacity: 0, scale: 1.03 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.9 }}>
            <Thumb mod={current} className="absolute inset-0" bare />
          </motion.div>
        </AnimatePresence>
      ) : steamHero ? (
        <img src={steamHero} alt="" draggable={false} className="absolute inset-0 size-full object-cover" style={{ objectPosition: "65% 35%" }} />
      ) : (
        <MsfsArt className="pointer-events-none absolute -right-6 bottom-0 h-full w-[62%] text-accent opacity-90" />
      )}
      {/* Perde iki temada da koyu: görsel üstündeki yazı ve logo her zaman açık renk. */}
      {hasImage && (
        <div
          className="absolute inset-0"
          style={{ background: "linear-gradient(90deg, rgb(8 9 12 / 0.9) 0%, rgb(8 9 12 / 0.6) 40%, transparent 75%), linear-gradient(0deg, rgb(8 9 12 / 0.7) 0%, transparent 50%)" }}
        />
      )}

      <div className="relative flex h-full min-h-[340px] flex-col justify-end px-8 pb-7 pt-8">
        <div className="max-w-xl">
          {logo ? (
            <>
              <h1 className="sr-only">{game.name}</h1>
              <img src={logo} alt="" draggable={false} className="mb-2 max-h-[84px] max-w-[360px] object-contain object-left drop-shadow-[0_6px_24px_rgb(0_0_0/0.55)]" />
            </>
          ) : (
            <div className="mb-3 flex items-center gap-3">
              <GameIcon game={game} size={44} />
              <h1 className={clsx("text-display text-[32px] font-semibold leading-[1.05] tracking-tight", hasImage ? "text-white" : "text-fg")}>{game.name}</h1>
            </div>
          )}
          <p className={clsx("text-[14px]", hasImage ? "text-white/75" : "text-fg-2")}>{game.tagline[lang]}</p>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            {primary && (
              <Button
                variant="primary"
                size="lg"
                icon={<Play className="size-4 fill-current" />}
                disabled={primary.running}
                onClick={() => launch(primary, t.overview.launched(primary.short))}
              >
                {primary.running ? t.overview.running(primary.short) : t.overview.launch(primary.short)}
              </Button>
            )}
            {detected
              .filter((s) => s.id !== primary?.id)
              .map((s) => (
                <Button
                  key={s.id}
                  size="lg"
                  variant="secondary"
                  className={hasImage ? "msfs-on-image text-white hover:bg-white/15" : undefined}
                  icon={<span className="size-2 rounded-full" style={{ background: SIM_COLOR[s.id] }} />}
                  disabled={s.running}
                  onClick={() => launch(s, t.overview.launched(s.short))}
                >
                  {s.running ? t.overview.running(s.short) : t.overview.launch(s.short)}
                </Button>
              ))}
          </div>
        </div>
        {current && (
          <button
            type="button"
            onClick={() => useMsfsUi.getState().open(current.id)}
            className="msfs-on-image absolute bottom-6 right-6 flex max-w-[320px] items-center gap-3 rounded-2xl px-3.5 py-2.5 text-left text-white transition-colors hover:bg-white/10"
          >
            <span className="min-w-0">
              <span className="block text-[10.5px] font-semibold uppercase tracking-[0.1em] text-white/60">{t.overview.featured}</span>
              <span className="block truncate text-[13px] font-semibold">{current.info.title}</span>
            </span>
            {featured.length > 1 && (
              <span className="flex gap-1">
                {featured.map((m, i) => (
                  <span key={m.id} className={clsx("h-1.5 rounded-full transition-all", i === idx % featured.length ? "w-4 bg-white" : "w-1.5 bg-white/40")} />
                ))}
              </span>
            )}
          </button>
        )}
      </div>
    </motion.section>
  );
}

function SetupCard() {
  const t = useMsfsT();
  return (
    <section className="card flex items-center gap-5 px-6 py-5">
      <div className="accent-soft flex size-12 shrink-0 items-center justify-center rounded-2xl">
        <FolderOpen className="size-5" />
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="text-display text-[16px] font-semibold text-fg">{t.overview.setupTitle}</h3>
        <p className="mt-0.5 text-[12.5px] leading-relaxed text-fg-2">{t.overview.setupBody}</p>
      </div>
      <Button variant="primary" onClick={() => chooseLibrary()}>
        {t.overview.setupAction}
      </Button>
    </section>
  );
}

function SectionHead({ title, sub, action }: { title: string; sub?: string; action?: { label: string; onClick: () => void } }) {
  return (
    <header className="flex items-end gap-3 border-b border-line px-5 py-3.5">
      <div className="min-w-0 flex-1">
        <h3 className="text-[14px] font-semibold text-fg">{title}</h3>
        {sub && <p className="mt-0.5 text-[12px] text-fg-2">{sub}</p>}
      </div>
      {action && (
        <button type="button" onClick={action.onClick} className="inline-flex items-center gap-1 text-[12px] font-medium text-accent hover:underline">
          {action.label}
          <ArrowRight className="size-3.5" />
        </button>
      )}
    </header>
  );
}

function Recent({ scan }: { scan: ScanResult }) {
  const t = useMsfsT();
  const open = useMsfsUi((s) => s.open);
  const list = useMemo(
    () =>
      [...scan.mods]
        .filter((m) => m.source === "library" || activeAnywhere(m))
        .sort((a, b) => Number(b.meta.favorite) - Number(a.meta.favorite) || (b.meta.installedAt ?? "").localeCompare(a.meta.installedAt ?? "") || photoScore(b) - photoScore(a))
        .slice(0, 6),
    [scan.mods],
  );
  return (
    <section className="card overflow-hidden">
      <SectionHead title={t.overview.recent} sub={t.overview.recentSub} action={{ label: t.overview.seeAll, onClick: () => go("library") }} />
      {list.length === 0 ? (
        <EmptyState icon={<Plane className="size-6" />} title={t.library.emptyTitle} className="py-10">
          {t.overview.emptyLibrary}
        </EmptyState>
      ) : (
        <div className="grid grid-cols-3 gap-3 p-4">
          {list.map((m) => (
            <button key={m.id} type="button" onClick={() => open(m.id)} className="group overflow-hidden rounded-[14px] border border-line bg-surface-2/40 text-left transition-colors hover:border-line-strong">
              <div className="relative aspect-[16/9]">
                <Thumb mod={m} className="absolute inset-0" imgClassName="transition-transform duration-500 group-hover:scale-[1.04]" />
                <div className="absolute bottom-1.5 left-1.5 flex gap-1">
                  {SIMS.filter((s) => isActive(m.sims[s]?.state)).map((s) => (
                    <span key={s} className="msfs-on-image inline-flex h-5 items-center gap-1 rounded-full px-1.5 text-[10px] font-semibold text-white">
                      <span className="size-1.5 rounded-full" style={{ background: SIM_COLOR[s] }} />
                      {SIM_SHORT[s]}
                    </span>
                  ))}
                </div>
              </div>
              <div className="px-2.5 py-2">
                <div className="truncate text-[12.5px] font-semibold text-fg">{m.info.title}</div>
                <div className="truncate text-[11px] text-muted">{m.info.creator || catLabel(m.info.category)}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function Attention({ problems }: { problems: (ModEntry["issues"][number] & { mod: ModEntry })[] }) {
  const t = useMsfsT();
  const open = useMsfsUi((s) => s.open);
  return (
    <section className="card overflow-hidden">
      <SectionHead title={t.overview.attention} action={problems.length > 3 ? { label: t.overview.attentionAll(problems.length), onClick: () => go("health") } : undefined} />
      {problems.length === 0 ? (
        <p className="px-5 py-4 text-[12.5px] text-fg-2">{t.overview.noAttention}</p>
      ) : (
        <ul className="divide-y divide-[var(--line)]">
          {problems.slice(0, 3).map((p, i) => (
            <li key={i}>
              <button type="button" onClick={() => open(p.mod.id)} className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-surface-2/50">
                <Thumb mod={p.mod} className="h-[34px] w-[54px] shrink-0 rounded-md" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12.5px] font-medium text-fg">{p.title}</div>
                  <div className="truncate text-[11.5px] text-muted">{p.mod.info.title}</div>
                </div>
                {p.sim && <span className="size-2 shrink-0 rounded-full" style={{ background: SIM_COLOR[p.sim] }} />}
                <TriangleAlert className="size-4 shrink-0 text-danger" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Sims({ scan }: { scan: ScanResult }) {
  const t = useMsfsT();
  const detected = scan.sims.filter((s) => s.detected);
  return (
    <section className="card overflow-hidden">
      <SectionHead title={t.overview.sims} />
      {detected.length === 0 ? (
        <div className="px-5 py-4">
          <p className="text-[12.5px] text-fg-2">{t.overview.noSims}</p>
          <Button className="mt-3" size="sm" variant="secondary" onClick={() => go("settings")}>
            {t.overview.openSettings}
          </Button>
        </div>
      ) : (
        <ul className="divide-y divide-[var(--line)]">
          {detected.map((s) => (
            <SimRow key={s.id} sim={s} enabled={scan.stats.enabled[s.id as SimId] ?? 0} />
          ))}
        </ul>
      )}
    </section>
  );
}

function SimRow({ sim, enabled }: { sim: SimInstall; enabled: number }) {
  const t = useMsfsT();
  const launchable = sim.edition === "steam" || sim.edition === "store";
  return (
    <li className="flex items-center gap-3.5 px-5 py-3.5">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-line" style={{ background: `color-mix(in oklab, ${SIM_COLOR[sim.id]} 14%, transparent)` }}>
        <Plane className="size-4" style={{ color: SIM_COLOR[sim.id] }} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 whitespace-nowrap text-[13px] font-semibold text-fg">
          MSFS {sim.short}
          {sim.running && <span className="rounded-md bg-ok/12 px-1.5 text-[11px] font-medium text-ok">{t.common.running}</span>}
        </div>
        <div className="truncate text-[11.5px] text-fg-2">
          {t.common.edition[sim.edition] ?? sim.edition} · {t.overview.enabledCount(enabled)}
        </div>
        {sim.communityPath && (
          <div className="truncate font-mono text-[10.5px] text-muted" title={sim.communityPath}>
            {sim.communityPath}
          </div>
        )}
      </div>
      <div className="flex shrink-0 gap-1">
        <IconButton size="sm" label={`${t.overview.community} · ${t.common.reveal}`} onClick={() => api.reveal(`community:${sim.id}`).catch(notifyError)}>
          <FolderOpen className="size-3.5" />
        </IconButton>
        {launchable && (
          <Button size="sm" variant="secondary" icon={<Play className="size-3 fill-current" />} disabled={sim.running} onClick={() => launch(sim, t.overview.launched(sim.short))}>
            {sim.short}
          </Button>
        )}
      </div>
    </li>
  );
}

function Collection({ scan }: { scan: ScanResult }) {
  const t = useMsfsT();
  const lang = useLang((s) => s.lang);
  const cats = CATEGORIES.map((c) => ({ c, n: scan.stats.byCategory[c] ?? 0 })).filter((x) => x.n > 0);
  const max = Math.max(1, ...cats.map((x) => x.n));
  if (cats.length === 0) return null;
  return (
    <section className="card overflow-hidden">
      <SectionHead title={t.overview.collection} />
      <ul className="space-y-2.5 px-5 py-4">
        {cats.map(({ c, n }) => (
          <li key={c}>
            <button
              type="button"
              className="group grid w-full grid-cols-[96px_1fr_28px] items-center gap-3 text-left"
              onClick={() => {
                useMsfsUi.getState().set({ category: c });
                go("library");
              }}
            >
              <span className="truncate text-[12.5px] text-fg-2 group-hover:text-fg">{catLabel(c, lang)}</span>
              <span className="h-2 overflow-hidden rounded-full bg-surface-3">
                <span className="block h-full rounded-full bg-accent transition-[width]" style={{ width: `${(n / max) * 100}%` }} />
              </span>
              <span className="tabular text-right text-[12px] text-muted">{n}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
