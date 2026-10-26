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
      <div className="flex flex-col gap-6">
        <Skeleton className="h-[clamp(360px,44vh,460px)] rounded-none" />
        <div className="mx-auto grid w-full max-w-[1320px] grid-cols-5 gap-3 px-10">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-[92px] rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  const problems = scan.mods.flatMap((m) => m.issues.filter((i) => i.level === "error").map((i) => ({ ...i, mod: m })));
  const librarySize = scan.mods.filter((m) => m.source === "library").reduce((a, m) => a + m.info.size, 0);

  return (
    <div className="pb-14">
      <Hero scan={scan} />

      <div className="mx-auto flex max-w-[1320px] flex-col gap-6 px-10 pt-7">
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

      <div className="grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] gap-6">
        <div className="flex min-w-0 flex-col gap-6">
          <Recent scan={scan} />
          <Attention problems={problems} />
        </div>
        <div className="flex min-w-0 flex-col gap-6">
          <Sims scan={scan} />
          <Collection scan={scan} />
        </div>
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
    <section data-theme="dark" data-game="msfs" className="relative isolate h-[clamp(360px,44vh,460px)] overflow-hidden bg-ink text-fg">
      {current ? (
        <AnimatePresence initial={false}>
          <motion.div key={current.id} className="absolute inset-0 -z-10" initial={{ opacity: 0, scale: 1.03 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.9 }}>
            <Thumb mod={current} className="absolute inset-0" bare />
          </motion.div>
        </AnimatePresence>
      ) : steamHero ? (
        <img src={steamHero} alt="" draggable={false} className="absolute inset-0 -z-10 size-full object-cover" style={{ objectPosition: "60% 30%" }} />
      ) : steamHero === null ? (
        <div className="hero-surface absolute inset-0 -z-10">
          <MsfsArt className="pointer-events-none absolute -right-6 bottom-0 h-[86%] w-[62%] text-accent opacity-90" />
        </div>
      ) : null}
      {/* Perde sabit koyu: görsel üstündeki yazı ve logo her temada açık renk; üstte üst çubuk okunur. */}
      {hasImage && (
        <div
          className="pointer-events-none absolute inset-0 -z-10"
          style={{
            background:
              "linear-gradient(180deg, rgb(7 9 20 / 0.7) 0px, rgb(7 9 20 / 0) 140px), linear-gradient(90deg, rgb(7 9 20 / 0.92) 0%, rgb(7 9 20 / 0.66) 34%, rgb(7 9 20 / 0) 70%), linear-gradient(0deg, rgb(7 9 20 / 0.85) 0%, rgb(7 9 20 / 0) 50%)",
          }}
        />
      )}

      <div className="mx-auto flex h-full max-w-[1320px] items-end gap-8 px-10 pb-8 pt-[72px]">
        <div className="min-w-0 max-w-xl flex-1">
          <div className="eyebrow flex items-center gap-2 text-white/75">
            <span className={clsx("size-2 rounded-full", detected.some((s) => s.running) ? "pulse-dot bg-ok" : "bg-accent")} />
            {detected.map((s) => `MSFS ${s.short}`).join(" · ") || t.overview.sims}
          </div>
          {logo ? (
            <>
              <h1 className="sr-only">{game.name}</h1>
              <img src={logo} alt="" draggable={false} className="-ml-2.5 mt-1 max-h-[120px] max-w-[380px] object-contain object-left drop-shadow-[0_6px_24px_rgb(0_0_0/0.55)]" />
            </>
          ) : (
            <h1 lang="en" className="headline mt-4 max-w-[13ch] text-[48px] text-white">{game.name}</h1>
          )}
          <p className="mt-1 text-[14.5px] text-white/80">{game.tagline[lang]}</p>
          <div className="mt-5 flex flex-wrap items-center gap-2.5">
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
            className="on-image ml-auto flex max-w-[340px] shrink-0 items-center gap-3 rounded-2xl px-4 py-3 text-left transition-colors hover:bg-white/10"
          >
            <span className="min-w-0">
              <span className="eyebrow block text-white/60">{t.overview.featured}</span>
              <span className="mt-1 block truncate text-[13.5px] font-semibold">{current.info.title}</span>
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
    </section>
  );
}

function SetupCard() {
  const t = useMsfsT();
  return (
    <section className="card flex items-center gap-5 px-6 py-5">
      <div className="accent-soft flex size-12 shrink-0 items-center justify-center rounded-full">
        <FolderOpen className="size-5" />
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="title text-[16px] text-fg">{t.overview.setupTitle}</h3>
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
    <header className="flex min-h-[52px] items-center gap-3 border-b border-line px-5 py-3">
      <div className="min-w-0 flex-1">
        <h3 className="title text-[15px] text-fg">{title}</h3>
        {sub && <p className="mt-0.5 text-[12px] text-fg-2">{sub}</p>}
      </div>
      {action && (
        <button type="button" onClick={action.onClick} className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12.5px] font-semibold text-accent hover:bg-surface-2">
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
            <button key={m.id} type="button" onClick={() => open(m.id)} className="group overflow-hidden rounded-xl border border-line bg-surface-2/40 text-left transition-colors hover:border-[color-mix(in_oklab,var(--accent)_45%,var(--line-strong))]">
              <div className="relative aspect-[16/9]">
                <Thumb mod={m} className="absolute inset-0" imgClassName="transition-transform duration-500 group-hover:scale-[1.04]" />
                <div className="absolute bottom-1.5 left-1.5 flex gap-1">
                  {SIMS.filter((s) => isActive(m.sims[s]?.state)).map((s) => (
                    <span key={s} className="on-image inline-flex h-5 items-center gap-1 rounded-full px-1.5 text-[10px] font-semibold">
                      <span className="size-1.5 rounded-full" style={{ background: SIM_COLOR[s] }} />
                      {SIM_SHORT[s]}
                    </span>
                  ))}
                </div>
              </div>
              <div className="px-2.5 py-2">
                <div className="truncate text-[13px] font-semibold text-fg">{m.info.title}</div>
                <div className="truncate text-[11.5px] text-muted">{m.info.creator || catLabel(m.info.category)}</div>
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
                <Thumb mod={p.mod} className="h-[36px] w-[58px] shrink-0 rounded-lg" />
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
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full" style={{ background: `color-mix(in oklab, ${SIM_COLOR[sim.id]} 16%, transparent)` }}>
        <Plane className="size-4" style={{ color: SIM_COLOR[sim.id] }} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 whitespace-nowrap">
          <span className="title text-[15px] text-fg">MSFS {sim.short}</span>
          {sim.running && <span className="rounded-full bg-ok/12 px-2 text-[11px] font-semibold text-ok">{t.common.running}</span>}
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
              className="group grid w-full grid-cols-[100px_1fr_32px] items-center gap-3 rounded-lg text-left"
              onClick={() => {
                useMsfsUi.getState().set({ category: c });
                go("library");
              }}
            >
              <span className="truncate text-[12.5px] text-fg-2 group-hover:text-fg">{catLabel(c, lang)}</span>
              <span className="h-1.5 overflow-hidden rounded-full bg-surface-3">
                <span className="block h-full rounded-full bg-accent transition-[width]" style={{ width: `${(n / max) * 100}%` }} />
              </span>
              <span className="num text-right text-[13px] text-fg-2">{n}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
