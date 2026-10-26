// Kariyer sayfası: pilot lisansı (kahraman) + sekmeler (Panel, İş ilanları, Seyir defteri, Lisanslar, Hangar ve finans).
// Pilot yoksa ilk kayıt ekranı açılır.

import { motion } from "motion/react";
import { Award, BookOpen, Briefcase, LayoutDashboard, MapPin, Warehouse } from "lucide-react";
import { Skeleton } from "@/ui";
import { Dashboard } from "./Dashboard";
import { FlightDialog } from "./FlightDialog";
import { hours, money, num } from "./format";
import { Hangar } from "./Hangar";
import { useCareerT } from "./i18n";
import { Jobs } from "./Jobs";
import { Licenses } from "./Licenses";
import { Logbook } from "./Logbook";
import { Onboarding } from "./Onboarding";
import { Bar, CareerNav, Hint, INK, LinkPill, topLicenseArt, trLang } from "./parts";
import { PATH_FOCUS, hasPath, pathPhoto } from "./paths";
import { PathChip } from "./CareerPaths";
import { useBoard, useCareer, useCareerEvents, useWeather } from "./queries";
import { type CareerTab, useCareerUi } from "./store";
import type { CareerView } from "./types";

export default function Career() {
  useCareerEvents();
  const t = useCareerT();
  const { data: view, isLoading } = useCareer();
  // Gerçek hava: pilot varsa panodaki varışlar ve aktif iş için (arka uç önbellekler, 30 dakikada bir sorar).
  useWeather(!!view?.pilot);
  // Pano: sekmedeki ilan sayısı ve paneldeki öneriler için (yerel komut, 60 sn önbellek).
  const { data: board } = useBoard(!!view?.pilot);
  const tab = useCareerUi((s) => s.tab);
  const setTab = useCareerUi((s) => s.setTab);

  if (isLoading || !view) {
    return (
      <div className="mx-auto flex max-w-[1180px] flex-col gap-5">
        <Skeleton className="h-[156px] rounded-[20px]" />
        <Skeleton className="h-11 w-[640px] rounded-full" />
        <div className="grid grid-cols-[1fr_372px] gap-5">
          <Skeleton className="h-[420px]" />
          <Skeleton className="h-[420px]" />
        </div>
      </div>
    );
  }
  if (!view.pilot) return <Onboarding view={view} />;

  const ready = view.licenses.filter((l) => l.ready && !l.held).length;
  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-6 pb-16">
      <Hero view={view} />
      <CareerNav<CareerTab>
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "panel", label: t.tabs.panel, icon: LayoutDashboard },
          { id: "jobs", label: t.tabs.jobs, icon: Briefcase, count: board?.length ?? null },
          { id: "logbook", label: t.tabs.logbook, icon: BookOpen, count: view.pilot.stats.flights },
          { id: "licenses", label: t.tabs.licenses, icon: Award, alert: ready || null },
          { id: "hangar", label: t.tabs.hangar, icon: Warehouse, count: view.fleet.length || null },
        ]}
      />
      <motion.div key={tab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}>
        {tab === "panel" && <Dashboard view={view} />}
        {tab === "jobs" && <Jobs view={view} />}
        {tab === "logbook" && <Logbook view={view} />}
        {tab === "licenses" && <Licenses view={view} />}
        {tab === "hangar" && <Hangar view={view} />}
      </motion.div>
      <FlightDialog view={view} />
    </div>
  );
}

/** Pilot şeridi: üstte ince, sessiz bir lisans çizimi üstünde ad, unvan ve seviye; altta tek satır sayılar ve
 *  bulunduğu havalimanı. Görsel alanı iki temada da koyudur; sayı satırı temanın yüzeyini alır. */
function Hero({ view }: { view: CareerView }) {
  const t = useCareerT();
  const p = view.pilot!;
  // Yolu olan pilotta kahraman görseli yolun uçağı; serbest pilotta en yüksek lisansın çizimi.
  const pathArt = hasPath(p) && p.path ? pathPhoto(p.path) : null;
  const art = pathArt?.src ?? topLicenseArt(p.licenses);
  const progress = p.nextLevelXp > p.levelXp ? (p.xp - p.levelXp) / (p.nextLevelXp - p.levelXp) : 1;
  const loc = view.location;
  return (
    <motion.section initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="card overflow-hidden rounded-[20px]">
      <div data-theme="dark" data-game="msfs" className="relative h-[88px] overflow-hidden" style={{ background: INK }}>
        {art && (
          <img
            src={art}
            alt=""
            draggable={false}
            className="absolute inset-y-0 right-0 h-full w-[46%] object-cover"
            title={pathArt?.credit}
            style={{ objectPosition: pathArt?.src && p.path ? PATH_FOCUS[p.path] : "62% 8%", maskImage: "linear-gradient(90deg, transparent 0%, #000 40%)", WebkitMaskImage: "linear-gradient(90deg, transparent 0%, #000 40%)" }}
          />
        )}
        <div className="absolute inset-0" style={{ background: "linear-gradient(90deg, rgb(7 9 20 / 0.6) 40%, rgb(7 9 20 / 0.35) 100%)" }} />
        <div className="relative flex h-full items-center gap-10 px-6 text-white">
          <div className="min-w-0 max-w-[48%] shrink">
            <h1 lang={trLang(p.name)} className="headline truncate pb-0.5 text-[30px] text-white">
              {p.name}
            </h1>
            <div className="mt-1.5 flex items-center gap-2 text-[12.5px] text-white/70">
              {hasPath(p) && p.pathStatus && <PathChip status={p.pathStatus} />}
              <span className="font-semibold text-white/90">{p.title}</span>
              {p.callsign && (
                <>
                  <span className="text-white/30">·</span>
                  <span className="font-mono text-[12px] tracking-[0.04em]">{p.callsign}</span>
                </>
              )}
              <span className="text-white/30">·</span>
              <span>{t.hero.base(p.home)}</span>
            </div>
          </div>
          <div className="w-[240px] shrink-0">
            <div className="mb-1.5 flex items-baseline justify-between text-[12px]">
              <span className="flex items-center gap-1.5 font-semibold text-white">
                {t.hero.level(p.level)}
                <Hint text={t.guide.xp} className="text-white/50 hover:text-white" />
              </span>
              <span className="tabular text-white/60">{t.hero.xp(p.xp - p.levelXp, p.nextLevelXp - p.levelXp)}</span>
            </div>
            <Bar value={progress} track="bg-white/15" className="h-1.5" />
          </div>
          <span className="flex-1" />
          <LinkPill link={view.link} onImage />
        </div>
      </div>

      <div className="flex divide-x divide-line">
        <Cell label={t.hero.money} value={money(p.money)} hint={p.loan > 0 ? t.guide.loan : undefined} extra={p.loan > 0 ? <span className="text-warn">{t.hero.loan(money(p.loan))}</span> : undefined} />
        <Cell label={t.hero.hours} value={hours(p.stats.hours)} unit={t.units.h} extra={p.stats.flights > 0 ? t.hero.flights(p.stats.flights) : undefined} />
        <Cell label={t.hero.reputation} value={num(p.reputation, 0)} unit="/ 100" hint={t.guide.reputation} />
        {p.rating !== null && <Cell label={t.hero.rating} value={num(p.rating, 1)} unit="/ 100" hint={t.guide.rating} />}
        <div className="flex min-w-0 flex-1 items-center gap-3 px-6 py-4" title={loc ? `${t.hero.elevation} ${num(loc.elevationFt)} ft` : undefined}>
          <MapPin className="size-4 shrink-0 text-accent" />
          {loc ? (
            <div className="min-w-0 flex-1">
              <div className="text-[11.5px] text-muted">
                {t.hero.location}
                {(loc.city || loc.country) && <span> · {[loc.city, loc.country].filter(Boolean).join(", ")}</span>}
              </div>
              <div className="mt-1 flex min-w-0 items-baseline gap-2">
                <span className="num shrink-0 text-[20px] text-fg">{loc.icao}</span>
                <span className="line-clamp-1 min-w-0 text-[13px] font-medium text-fg-2" title={loc.name}>
                  {loc.name}
                </span>
              </div>
            </div>
          ) : (
            <span className="text-[12.5px] text-muted">—</span>
          )}
        </div>
      </div>
    </motion.section>
  );
}

function Cell({ label, value, unit, extra, hint }: { label: string; value: string; unit?: string; extra?: React.ReactNode; hint?: string }) {
  return (
    <div className="shrink-0 px-6 py-4">
      <div className="flex items-center gap-1.5 whitespace-nowrap text-[11.5px] text-muted">
        {label}
        {hint && <Hint text={hint} />}
      </div>
      <div className="mt-1 flex items-baseline gap-1.5 whitespace-nowrap">
        <span className="num text-[20px] text-fg">{value}</span>
        {unit && <span className="text-[12px] font-semibold text-muted">{unit}</span>}
        {extra && <span className="text-[11.5px] text-muted">· {extra}</span>}
      </div>
    </div>
  );
}
