// Kariyer sayfası: pilot vitrini + sekmeler (Panel, İş ilanları, Seyir defteri, Lisanslar, Hangar ve finans).
// Pilot yoksa ilk kayıt ekranı açılır.

import clsx from "clsx";
import { motion } from "motion/react";
import { Award, BookOpen, Briefcase, Gauge, LayoutDashboard, MapPin, Star, Timer, Wallet, Warehouse } from "lucide-react";
import { useArt } from "@/lib/art";
import { Progress, Skeleton } from "@/ui";
import { MsfsArt } from "../Art";
import { Dashboard } from "./Dashboard";
import { FlightDialog } from "./FlightDialog";
import { hours, money, num } from "./format";
import { Hangar } from "./Hangar";
import { useCareerT } from "./i18n";
import { Jobs } from "./Jobs";
import { Licenses } from "./Licenses";
import { Logbook } from "./Logbook";
import { Onboarding } from "./Onboarding";
import { LinkPill, TabBar } from "./parts";
import { useCareer, useCareerEvents, useWeather } from "./queries";
import { type CareerTab, useCareerUi } from "./store";
import type { CareerView } from "./types";

export default function Career() {
  useCareerEvents();
  const t = useCareerT();
  const { data: view, isLoading } = useCareer();
  // Gerçek hava: pilot varsa panodaki varışlar ve aktif iş için (arka uç önbellekler, 30 dakikada bir sorar).
  useWeather(!!view?.pilot);
  const tab = useCareerUi((s) => s.tab);
  const setTab = useCareerUi((s) => s.setTab);

  if (isLoading || !view) {
    return (
      <div className="mx-auto flex max-w-[1180px] flex-col gap-5">
        <Skeleton className="h-[250px] rounded-3xl" />
        <Skeleton className="h-11" />
        <div className="grid grid-cols-[1.5fr_1fr] gap-5">
          <Skeleton className="h-[420px]" />
          <Skeleton className="h-[420px]" />
        </div>
      </div>
    );
  }
  if (!view.pilot) return <Onboarding view={view} />;

  const ready = view.licenses.filter((l) => l.ready).length;
  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-5 pb-16">
      <Hero view={view} />
      <TabBar<CareerTab>
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "panel", label: t.tabs.panel, icon: LayoutDashboard },
          { id: "jobs", label: t.tabs.jobs, icon: Briefcase },
          { id: "logbook", label: t.tabs.logbook, icon: BookOpen },
          { id: "licenses", label: t.tabs.licenses, icon: Award, badge: ready || null },
          { id: "hangar", label: t.tabs.hangar, icon: Warehouse },
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

/** Pilot vitrini: oyunun büyük görseli üstünde ad, unvan, seviye, sayılar ve bulunduğu yer. */
function Hero({ view }: { view: CareerView }) {
  const t = useCareerT();
  const art = useArt("msfs", "hero");
  const p = view.pilot!;
  const progress = p.nextLevelXp > p.levelXp ? (p.xp - p.levelXp) / (p.nextLevelXp - p.levelXp) : 1;
  const loc = view.location;
  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={clsx("relative overflow-hidden rounded-3xl border border-line", !art && "hero-surface")}
    >
      {art ? (
        <img src={art} alt="" draggable={false} className="absolute inset-0 size-full object-cover" style={{ objectPosition: "70% 40%" }} />
      ) : (
        <MsfsArt className="pointer-events-none absolute -right-6 bottom-0 h-full w-[62%] text-accent opacity-90" />
      )}
      {art && (
        <div
          className="absolute inset-0"
          style={{ background: "linear-gradient(90deg, rgb(8 9 12 / 0.92) 0%, rgb(8 9 12 / 0.7) 45%, rgb(8 9 12 / 0.25) 80%), linear-gradient(0deg, rgb(8 9 12 / 0.75) 0%, transparent 55%)" }}
        />
      )}
      <div className={clsx("relative grid grid-cols-[1fr_auto] items-end gap-8 px-8 pb-7 pt-7", art ? "text-white" : "text-fg")}>
        <div className="min-w-0">
          <div className={clsx("mb-2 text-[11px] font-semibold uppercase tracking-[0.12em]", art ? "text-white/60" : "text-muted")}>{t.title}</div>
          <h1 className="text-display truncate text-[34px] font-semibold leading-[1.05] tracking-tight">{p.name}</h1>
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <span className={clsx("inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-semibold", art ? "msfs-on-image" : "accent-soft")}>
              <Award className="size-3.5" />
              {p.title}
            </span>
            <span className={clsx("inline-flex h-6 items-center rounded-full px-2.5 text-[12px] font-semibold", art ? "msfs-on-image" : "border border-line bg-surface-2")}>{t.hero.level(p.level)}</span>
            {p.callsign && <span className={clsx("inline-flex h-6 items-center rounded-full px-2.5 font-mono text-[11.5px]", art ? "msfs-on-image text-white/85" : "border border-line bg-surface-2 text-fg-2")}>{p.callsign}</span>}
            {p.licenses
              .filter((l) => l !== "spl")
              .map((l) => (
                <span key={l} className={clsx("inline-flex h-6 items-center rounded-md px-1.5 font-mono text-[10.5px] font-semibold uppercase", art ? "bg-white/12 text-white/85" : "bg-surface-3 text-fg-2")}>
                  {l}
                </span>
              ))}
          </div>
          <div className="mt-4 max-w-[420px]">
            <div className={clsx("mb-1.5 flex justify-between text-[11.5px]", art ? "text-white/70" : "text-muted")}>
              <span>{t.hero.level(p.level)}</span>
              <span className="tabular">{t.hero.xp(p.xp - p.levelXp, p.nextLevelXp - p.levelXp)}</span>
            </div>
            <Progress value={progress} className={art ? "bg-white/15" : undefined} />
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <HeroStat onImage={!!art} icon={<Wallet className="size-3.5" />} label={t.hero.money} value={money(p.money)} hint={p.loan > 0 ? t.hero.loan(money(p.loan)) : undefined} />
            <HeroStat onImage={!!art} icon={<Timer className="size-3.5" />} label={t.hero.hours} value={hours(p.stats.hours)} />
            <HeroStat onImage={!!art} icon={<Star className="size-3.5" />} label={t.hero.reputation} value={num(p.reputation, 0)} />
            <HeroStat onImage={!!art} icon={<Gauge className="size-3.5" />} label={t.hero.rating} value={p.rating === null ? "—" : num(p.rating, 1)} />
          </div>
        </div>
        <div className="flex w-[300px] flex-col items-end gap-3">
          <LinkPill link={view.link} onImage={!!art} />
          {loc && (
            <div className={clsx("w-full rounded-2xl px-4 py-3.5", art ? "msfs-on-image" : "card")}>
              <div className={clsx("flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.08em]", art ? "text-white/60" : "text-muted")}>
                <MapPin className="size-3.5" />
                {t.hero.location}
              </div>
              <div className="mt-1.5 font-mono text-[24px] font-semibold leading-none">{loc.icao}</div>
              <div className={clsx("mt-1 truncate text-[12.5px]", art ? "text-white/80" : "text-fg-2")}>{loc.name}</div>
              <div className={clsx("truncate text-[11.5px]", art ? "text-white/55" : "text-muted")}>{[loc.city, loc.country].filter(Boolean).join(", ")}</div>
            </div>
          )}
        </div>
      </div>
    </motion.section>
  );
}

function HeroStat({ icon, label, value, hint, onImage }: { icon: React.ReactNode; label: string; value: string; hint?: string; onImage: boolean }) {
  return (
    <div className={clsx("min-w-[118px] rounded-xl px-3 py-2", onImage ? "msfs-on-image" : "well")}>
      <div className={clsx("flex items-center gap-1.5 text-[11px] font-medium", onImage ? "text-white/65" : "text-muted")}>
        {icon}
        {label}
      </div>
      <div className="tabular mt-0.5 text-[17px] font-semibold leading-tight">{value}</div>
      {hint && <div className={clsx("text-[10.5px]", onImage ? "text-white/55" : "text-muted")}>{hint}</div>}
    </div>
  );
}
