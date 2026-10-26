// Hava ve zaman senaryoları: iş kartlarındaki rozetler, ayrıntıdaki "Koşullar" kutusu ve panonun koşul süzgeci.
// Kurallar arka uçta (`career::conditions`); burada yalnızca gösterilir. Koşulu olmayan (eski) iş canlı sayılır.

import clsx from "clsx";
import { Clock, Cloud, CloudLightning, CloudRain, CloudSnow, CloudSun, Cloudy, Moon, Radio, Sun, Sunrise, Sunset, TriangleAlert, type LucideIcon } from "lucide-react";
import { locale } from "@/lib/format";
import { Badge, type Tone } from "@/ui";
import { Hint } from "./parts";
import { useRealT } from "./real-i18n";
import type { FlightCategory, Job, JobConditions, ScenarioWx, TimeOfDay, WeatherPreset } from "./types";

export const LIVE: JobConditions = {
  time: "now",
  weather: "live",
  utc: 0,
  utcOffsetMin: 0,
  sunDeg: 0,
  fallback: false,
  nightArrival: false,
  season: "",
  wx: null,
  payBonus: 0,
  xpBonus: 0,
  needsIr: false,
};

export function condOf(job: Job): JobConditions {
  return job.conditions ?? LIVE;
}

export const TIME_ICON: Record<TimeOfDay, LucideIcon> = { now: Clock, day: Sun, dawn: Sunrise, dusk: Sunset, night: Moon };
export const WEATHER_ICON: Record<WeatherPreset, LucideIcon> = {
  live: Radio,
  clear: Sun,
  few: CloudSun,
  scattered: Cloud,
  broken: Cloudy,
  overcast: Cloudy,
  rain: CloudRain,
  snow: CloudSnow,
  storm: CloudLightning,
};

const TIME_TONE: Record<TimeOfDay, Tone> = { now: "neutral", day: "neutral", dawn: "warn", dusk: "warn", night: "info" };
const WEATHER_TONE: Record<WeatherPreset, Tone> = {
  live: "neutral",
  clear: "neutral",
  few: "neutral",
  scattered: "neutral",
  broken: "neutral",
  overcast: "neutral",
  rain: "info",
  snow: "info",
  storm: "danger",
};

/** "21:40" (UTC ya da yaklaşık yerel). */
function hhmm(unix: number, offsetMin = 0): string {
  return new Date((unix + offsetMin * 60) * 1000).toISOString().slice(11, 16);
}

export function localTime(c: JobConditions): string {
  return hhmm(c.utc, c.utcOffsetMin);
}

/** Bu iş yolcu taşıyor mu (arka uçtaki `carries_passengers` ile aynı)? */
export function carriesPassengers(job: Job): boolean {
  return job.pax > 0 && !["training", "checkride", "skydive", "survey", "sar"].includes(job.kind);
}

/** Saat ve hava rozetleri (ilan kartı, aktif iş). */
export function CondChips({ job, className }: { job: Job; className?: string }) {
  const r = useRealT();
  const c = condOf(job);
  const TI = TIME_ICON[c.time];
  const WI = WEATHER_ICON[c.weather];
  const scenarioTime = c.time !== "now" && c.utc > 0;
  return (
    <span className={clsx("inline-flex items-center gap-1.5", className)}>
      <span title={scenarioTime ? `${r.cond.utc(hhmm(c.utc))} · ${r.cond.sun(c.sunDeg)}` : r.cond.timeAbout.now}>
        <Badge tone={TIME_TONE[c.time]} icon={<TI className="size-3" />}>
          {r.cond.time[c.time]}
          {scenarioTime && <span className="tabular opacity-80">{localTime(c)}</span>}
        </Badge>
      </span>
      <span title={c.wx ? `${r.cond.scenario}: ${r.cond.sky(c.wx.sky)}` : r.cond.liveAbout}>
        <Badge tone={WEATHER_TONE[c.weather]} icon={<WI className="size-3" />}>
          {r.cond.weather[c.weather]}
        </Badge>
      </span>
    </span>
  );
}

/** Ücret eklerinin toplamı (%): canlı havadaki kötü hava primi ve senaryo eki çarpılarak uygulanır. */
export function totalBonus(job: Job): number {
  const a = job.weatherBonus ?? 0;
  const b = condOf(job).payBonus;
  return Math.round(((1 + a / 100) * (1 + b / 100) - 1) * 100);
}

function WxLine({ wx }: { wx: ScenarioWx }) {
  const r = useRealT();
  return (
    <>
      <div className="tabular mt-1 text-[12px] text-fg-2">
        {r.wx.wind(wx.windDir, wx.windKt, null)} · {r.wx.vis(wx.visibilitySm)} · {r.wx.ceiling(wx.ceilingFt)} · {r.wx.temp(wx.tempC)}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] text-muted">
        <span className="font-mono">{r.cond.sky(wx.sky)}</span>
        <span>· {r.cond.preset(wx.file)}</span>
        {wx.snowCoverM > 0 && <span>· {r.cond.snowCover(Math.round(wx.snowCoverM * 100))}</span>}
      </div>
    </>
  );
}

const TIME_FG: Record<TimeOfDay, string> = { now: "text-fg-2", day: "text-fg-2", dawn: "text-warn", dusk: "text-warn", night: "text-info" };
const WEATHER_FG: Record<WeatherPreset, string> = {
  live: "text-fg-2",
  clear: "text-fg-2",
  few: "text-fg-2",
  scattered: "text-fg-2",
  broken: "text-fg-2",
  overcast: "text-fg-2",
  rain: "text-info",
  snow: "text-info",
  storm: "text-danger",
};

/** İlan satırındaki koşullar: iki satır, simgeli düz yazı (rozet kalabalığı yerine) + uçuş kategorisi. */
export function CondStack({ job, className }: { job: Job; className?: string }) {
  const r = useRealT();
  const c = condOf(job);
  const TI = TIME_ICON[c.time];
  const WI = WEATHER_ICON[c.weather];
  const scenarioTime = c.time !== "now" && c.utc > 0;
  const cat = c.wx?.category ?? job.weather;
  return (
    <span className={clsx("flex min-w-0 flex-col gap-1 text-[11.5px]", className)}>
      <span className={clsx("flex min-w-0 items-center gap-1.5", TIME_FG[c.time])} title={scenarioTime ? `${r.cond.utc(hhmm(c.utc))} · ${r.cond.sun(c.sunDeg)}` : r.cond.timeAbout.now}>
        <TI className="size-3.5 shrink-0" />
        <span className="truncate font-medium">{r.cond.time[c.time]}</span>
        {scenarioTime && <span className="tabular font-mono text-[11px] opacity-80">{localTime(c)}</span>}
      </span>
      <span className={clsx("flex min-w-0 items-center gap-1.5", WEATHER_FG[c.weather])} title={c.wx ? `${r.cond.scenario}: ${r.cond.sky(c.wx.sky)}` : r.cond.liveAbout}>
        <WI className="size-3.5 shrink-0" />
        <span className="truncate font-medium">{r.cond.weather[c.weather]}</span>
        {cat && <CatTag category={cat} />}
      </span>
    </span>
  );
}

/** Tek satır koşul: saat (ve yerel saat) · hava; düz yazı, tek simge. Paneldeki önerilerde. */
export function CondInline({ job, className }: { job: Job; className?: string }) {
  const r = useRealT();
  const c = condOf(job);
  const TI = TIME_ICON[c.time];
  const scenarioTime = c.time !== "now" && c.utc > 0;
  return (
    <span className={clsx("inline-flex min-w-0 items-center gap-1.5", className)}>
      <TI className={clsx("size-3.5 shrink-0", TIME_FG[c.time])} />
      <span className="truncate">
        {r.cond.time[c.time]}
        {scenarioTime && <span className="tabular"> {localTime(c)}</span>}
        <span className="mx-1 text-muted">·</span>
        <span className={c.weather === "storm" ? "text-danger" : undefined}>{r.cond.weather[c.weather]}</span>
      </span>
    </span>
  );
}

const CAT_CLS: Record<FlightCategory, string> ={ VFR: "text-ok", MVFR: "text-info", IFR: "text-warn", LIFR: "text-danger" };

/** Uçuş kategorisi: eş aralıklı küçük etiket (VFR yeşil, MVFR mavi, IFR turuncu, LIFR kırmızı). */
export function CatTag({ category }: { category: FlightCategory }) {
  const r = useRealT();
  return (
    <span
      title={r.wx.about[category]}
      className={clsx("shrink-0 rounded-[4px] border border-current px-1 font-mono text-[9.5px] font-bold leading-[14px] tracking-[0.06em] opacity-90", CAT_CLS[category] ?? "text-muted")}
    >
      {category}
    </span>
  );
}

/** Ayrıntılı "Koşullar" kutusu: solda kalkış saati (büyük, yerel), sağda hava; altta gerekenler, ek ve uyarılar. */
export function ConditionsBlock({ job, sim, className }: { job: Job; sim?: string | null; className?: string }) {
  const r = useRealT();
  const c = condOf(job);
  const scenarioTime = c.time !== "now" && c.utc > 0;
  const night = c.time === "night" || c.nightArrival;
  const needs: string[] = [];
  if (c.needsIr) needs.push(r.cond.needIr);
  if (night && scenarioTime) needs.push(r.cond.needNight);
  if (c.nightArrival && carriesPassengers(job)) needs.push(r.cond.needNightPax);
  const date = scenarioTime ? new Date(c.utc * 1000).toLocaleDateString(locale(), { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "";
  const fallbackKey = c.time === "day" ? "day" : c.time === "night" ? "night" : "twilight";
  const TI = TIME_ICON[c.time];
  const WI = WEATHER_ICON[c.weather];
  const live = c.time === "now" && c.weather === "live";
  const foot = needs.length > 0 || c.payBonus > 0 || c.fallback || (!!c.wx && sim === "msfs2020");
  return (
    <div className={clsx("overflow-hidden rounded-[14px] border border-line", className)}>
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-surface-2/40 px-3.5 py-2">
        <span className="mr-auto flex items-center gap-1.5 text-[12px] font-semibold text-fg-2">
          {r.cond.title}
          <Hint text={`${r.cond.blockHint} ${c.wx ? r.wx.about[c.wx.category] : ""}`.trim()} />
        </span>
        {c.nightArrival && c.time !== "night" && <Badge tone="info">{r.cond.nightArrival}</Badge>}
        {c.wx && <CatTag category={c.wx.category} />}
      </div>
      {live ? (
        <div className="flex items-center gap-3 px-3.5 py-3">
          <WI className="size-5 shrink-0 text-fg-2" />
          <p className="text-[12px] text-fg-2">{r.cond.liveNote}</p>
        </div>
      ) : (
        <div className="grid grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] divide-x divide-line">
          <div className="min-w-0 px-3.5 py-3">
            <div className={clsx("flex items-center gap-1.5 text-[12px] font-semibold", TIME_FG[c.time])}>
              <TI className="size-4" />
              {r.cond.time[c.time]}
            </div>
            {scenarioTime ? (
              <>
                <div className="mt-1.5 flex items-baseline gap-2">
                  <span className="num text-[24px] text-fg">{localTime(c)}</span>
                  <span className="truncate text-[11px] text-muted">{r.cond.localShort}</span>
                </div>
                <div className="tabular mt-1 text-[11px] text-muted">
                  {r.cond.utc(hhmm(c.utc))} · {date} · {r.cond.sun(c.sunDeg)}
                </div>
              </>
            ) : (
              <div className="mt-1.5 text-[11.5px] leading-relaxed text-fg-2">{r.cond.timeAbout.now}</div>
            )}
          </div>
          <div className="min-w-0 px-3.5 py-3">
            <div className={clsx("flex items-center gap-1.5 text-[12px] font-semibold", WEATHER_FG[c.weather])}>
              <WI className="size-4" />
              {r.cond.weather[c.weather]}
            </div>
            {c.wx ? <WxLine wx={c.wx} /> : <div className="mt-1.5 text-[11.5px] leading-relaxed text-fg-2">{r.cond.liveAbout}</div>}
          </div>
        </div>
      )}
      {foot && (
        <div className="flex flex-col gap-1.5 border-t border-line px-3.5 py-2.5">
          {needs.length > 0 && (
            <div className="text-[11.5px] leading-relaxed">
              <span className="font-semibold text-fg">{r.cond.needs}: </span>
              <span className="text-fg-2">{needs.join(" · ")}</span>
            </div>
          )}
          {c.payBonus > 0 && <div className="text-[11.5px] font-semibold text-accent">{r.cond.bonus(c.payBonus, c.xpBonus)}</div>}
          {c.fallback && (
            <p className="flex items-start gap-1.5 text-[11.5px] text-warn">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
              {r.cond.fallback[fallbackKey]}
            </p>
          )}
          {c.wx && sim === "msfs2020" && <p className="text-[11px] text-muted">{r.cond.sim2020}</p>}
        </div>
      )}
    </div>
  );
}

/** Uçuş kâğıdındaki senaryo havası: ön ayar kalkışta da varışta da aynıdır. */
export function ScenarioWeather({ job }: { job: Job }) {
  const r = useRealT();
  const c = condOf(job);
  if (!c.wx) return null;
  const WI = WEATHER_ICON[c.weather];
  return (
    <div className="well min-w-0 px-3.5 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[12.5px] font-semibold text-fg">
          {job.from} · {job.to}
        </span>
        <span className={clsx("inline-flex items-center gap-1.5 text-[12px] font-semibold", WEATHER_FG[c.weather])}>
          <WI className="size-3.5" />
          {r.cond.weather[c.weather]}
        </span>
        <CatTag category={c.wx.category} />
        {c.wx.precip && <Badge tone="info">{r.wx.wet}</Badge>}
      </div>
      <WxLine wx={c.wx} />
    </div>
  );
}

// ----- Pano süzgeci -----

export type TimeFilter = "all" | "day" | "twilight" | "night" | "now";
export type WxFilter = "all" | "fair" | "cloudy" | "rain" | "snow" | "storm" | "live";

export function timeGroup(c: JobConditions): Exclude<TimeFilter, "all"> {
  return c.time === "dawn" || c.time === "dusk" ? "twilight" : c.time;
}

export function wxGroup(c: JobConditions): Exclude<WxFilter, "all"> {
  switch (c.weather) {
    case "clear":
    case "few":
    case "scattered":
      return "fair";
    case "broken":
    case "overcast":
      return "cloudy";
    case "rain":
    case "snow":
    case "storm":
    case "live":
      return c.weather;
  }
}

export const TIME_FILTERS: TimeFilter[] = ["all", "day", "twilight", "night", "now"];
export const WX_FILTERS: WxFilter[] = ["all", "fair", "cloudy", "rain", "snow", "storm", "live"];

export function matchesCond(job: Job, time: TimeFilter, wx: WxFilter): boolean {
  const c = condOf(job);
  return (time === "all" || timeGroup(c) === time) && (wx === "all" || wxGroup(c) === wx);
}
