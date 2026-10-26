// Uçuş kâğıdı: yakıt planı, ağırlık ve denge, pistler, yedek meydan, gerçek hava ve (hava işinde) görev hedefleri.
// Hesap arka uçta (`career::dispatch`); burada yalnızca gösterilir.

import clsx from "clsx";
import { CircleAlert, CloudSun, Crosshair, Fuel, Gauge, Scale, ShieldCheck, Waypoints } from "lucide-react";
import { Badge, type Tone } from "@/ui";
import { duration, num } from "./format";
import { useCareerT } from "./i18n";
import { useWeather } from "./queries";
import { useRealT } from "./real-i18n";
import type { ActiveView, Dispatch, FlightCategory, Job, Metar, Objective } from "./types";

const kg = (v: number) => `${num(Math.round(v))} kg`;

export function wxTone(c: FlightCategory | null | undefined): Tone {
  switch (c) {
    case "VFR":
      return "ok";
    case "MVFR":
      return "info";
    case "IFR":
      return "warn";
    case "LIFR":
      return "danger";
    default:
      return "neutral";
  }
}

/** Uçuş kategorisi rozeti (VFR/MVFR/IFR/LIFR). */
export function WxChip({ category, className }: { category: FlightCategory | null | undefined; className?: string }) {
  const r = useRealT();
  if (!category) return null;
  return (
    <span title={r.wx.about[category]} className={className}>
      <Badge tone={wxTone(category)} icon={<CloudSun className="size-3" />}>
        {r.wx.category[category]}
      </Badge>
    </span>
  );
}

/** Yükün özel durumu rozeti. */
export function CareChip({ care }: { care: Job["care"] }) {
  const r = useRealT();
  if (!care) return null;
  const tone: Tone = care === "dangerous" ? "danger" : care === "perishable" ? "warn" : "info";
  return (
    <span title={r.careHint[care]}>
      <Badge tone={tone}>{r.care[care]}</Badge>
    </span>
  );
}

export function DispatchCard({ active }: { active: ActiveView }) {
  const r = useRealT();
  const d = active.dispatch;
  const { data: metars } = useWeather();
  if (!d) return null;
  const wx = (icao: string | undefined) => (icao ? metars?.find((m) => m.icao === icao) ?? null : null);
  const blocking = d.issues.filter((i) => i.blocking);
  const advice = d.issues.filter((i) => !i.blocking);
  return (
    <section className="card overflow-hidden">
      <header className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3.5">
        <Scale className="size-4 text-accent" />
        <h3 className="text-[14px] font-semibold text-fg">{r.dispatch.title}</h3>
        <Badge tone={d.ifr ? "info" : "neutral"}>{d.ifr ? "IFR" : "VFR"}</Badge>
        <span className="min-w-0 flex-1 truncate text-right text-[11.5px] text-muted">{d.weights.fromSim ? r.dispatch.exact : r.dispatch.estimated}</span>
      </header>

      {(blocking.length > 0 || advice.length > 0) && (
        <div className="flex flex-col gap-1.5 px-5 pt-4">
          {[...blocking, ...advice].map((i) => (
            <p
              key={i.code}
              className={clsx("flex items-start gap-2 rounded-xl px-3 py-2 text-[12px]", i.blocking ? "bg-danger/10 text-danger" : "bg-warn/10 text-warn")}
            >
              <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
              <span>
                <b className="font-semibold">{i.blocking ? r.dispatch.blocking : r.dispatch.advice}:</b> {(r.dispatch.issues[i.code] ?? (() => i.code))(kg(i.value))}
              </span>
            </p>
          ))}
        </div>
      )}
      {d.issues.length === 0 && (
        <p className="mx-5 mt-4 flex items-center gap-2 rounded-xl bg-ok/10 px-3 py-2 text-[12px] text-ok">
          <ShieldCheck className="size-3.5 shrink-0" />
          {r.dispatch.allGood}
        </p>
      )}

      <div className="grid grid-cols-3 gap-4 px-5 py-4">
        <FuelPlan d={d} />
        <Weights d={d} />
        <Runways d={d} />
      </div>

      <Weather from={wx(d.departure.icao)} to={wx(d.arrival.icao)} alt={wx(d.alternate?.icao)} fromIcao={d.departure.icao} toIcao={d.arrival.icao} altIcao={d.alternate?.icao} />
      {active.job.objectives.length > 0 && <Objectives job={active.job} />}
    </section>
  );
}

function Title({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mb-2 flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-[0.07em] text-muted">
      {icon}
      {children}
    </div>
  );
}

function Row({ label, value, strong, muted }: { label: string; value: string; strong?: boolean; muted?: boolean }) {
  return (
    <div className={clsx("flex items-baseline justify-between gap-2 py-[3px] text-[12.5px]", strong && "mt-1 border-t border-line pt-1.5", muted && "text-muted")}>
      <span className={clsx("min-w-0 truncate", strong ? "font-semibold text-fg" : "text-fg-2")}>{label}</span>
      <span className={clsx("tabular shrink-0", strong ? "font-semibold text-fg" : "text-fg")}>{value}</span>
    </div>
  );
}

function FuelPlan({ d }: { d: Dispatch }) {
  const r = useRealT();
  const f = d.fuel;
  return (
    <div className="min-w-0">
      <Title icon={<Fuel className="size-3.5" />}>{r.dispatch.fuel}</Title>
      <Row label={r.dispatch.taxi} value={kg(f.taxiKg)} />
      <Row label={r.dispatch.trip} value={kg(f.tripKg)} />
      {f.contingencyKg > 0 && <Row label={r.dispatch.contingency} value={kg(f.contingencyKg)} />}
      {f.alternateKg > 0 && <Row label={r.dispatch.alternate} value={kg(f.alternateKg)} />}
      <Row label={r.dispatch.finalReserve(f.reserveMin)} value={kg(f.finalReserveKg)} />
      {f.extraKg > 0 && <Row label={r.dispatch.extra} value={kg(f.extraKg)} />}
      <Row label={r.dispatch.minimum} value={kg(f.minimumKg)} muted />
      <Row label={r.dispatch.block} value={kg(f.blockKg)} strong />
      <div className="mt-1.5 text-[11px] text-muted">
        {r.dispatch.endurance(duration(f.enduranceMin))} · {r.dispatch.rule[f.rule]}
      </div>
    </div>
  );
}

function Bar({ value, max, label }: { value: number; max: number; label: string }) {
  const p = max > 0 ? Math.min(1.1, value / max) : 0;
  const over = value > max * 1.001;
  return (
    <div className="mt-1.5">
      <div className="flex justify-between text-[11px]">
        <span className="text-muted">{label}</span>
        <span className={clsx("tabular", over ? "font-semibold text-danger" : "text-fg-2")}>
          {kg(value)} / {kg(max)}
        </span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-3">
        <div className={clsx("h-full rounded-full", over ? "bg-danger" : p > 0.95 ? "bg-warn" : "bg-accent")} style={{ width: `${Math.min(100, p * 100)}%` }} />
      </div>
    </div>
  );
}

function Weights({ d }: { d: Dispatch }) {
  const r = useRealT();
  const w = d.weights;
  return (
    <div className="min-w-0">
      <Title icon={<Scale className="size-3.5" />}>{r.dispatch.weights}</Title>
      <Row label={r.dispatch.empty} value={kg(w.emptyKg)} />
      <Row label={r.dispatch.payload} value={kg(w.payloadKg)} />
      <Row label={r.dispatch.zfw} value={kg(w.zfwKg)} />
      <Bar value={w.towKg} max={w.mtowKg} label={r.dispatch.tow} />
      <Bar value={w.lwKg} max={w.mlwKg} label={r.dispatch.lw} />
      <div className="mt-1.5 text-[11px] text-muted">{r.dispatch.capacity(kg(w.fuelCapacityKg))}</div>
    </div>
  );
}

function Runways({ d }: { d: Dispatch }) {
  const r = useRealT();
  const rw = (label: string, x: Dispatch["departure"]) => (
    <div className="well px-3 py-2">
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-medium text-muted">{label}</span>
        <span className="font-mono text-[12px] font-semibold text-fg">{x.icao}</span>
        {!x.lighted && <Badge tone="warn">{r.dispatch.unlit}</Badge>}
      </div>
      <div className="tabular mt-1 text-[12px] text-fg-2">
        <span className={clsx(x.requiredFt > x.availableFt && "font-semibold text-danger")}>
          {num(x.requiredFt)} / {num(x.availableFt)} ft
        </span>
        <span className="text-muted"> · {r.dispatch.da} {num(x.densityAltFt)} ft</span>
      </div>
      <div className="text-[11px] text-muted">{r.dispatch.fuelAt[x.fuel]}</div>
    </div>
  );
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <Title icon={<Gauge className="size-3.5" />}>{r.dispatch.runways}</Title>
      {rw(r.dispatch.departure, d.departure)}
      {rw(r.dispatch.arrival, d.arrival)}
      <div className="well px-3 py-2">
        <div className="text-[11px] font-medium text-muted">{r.dispatch.altTitle}</div>
        {d.alternate ? (
          <div className="mt-0.5 truncate text-[12px] text-fg-2">
            <span className="font-mono font-semibold text-fg">{d.alternate.icao}</span> · {d.alternate.name} · {num(d.alternate.distanceNm)} nm
          </div>
        ) : (
          <div className="mt-0.5 text-[12px] text-fg-2">{r.dispatch.noAlternate}</div>
        )}
      </div>
    </div>
  );
}

function Weather({ from, to, alt, fromIcao, toIcao, altIcao }: { from: Metar | null; to: Metar | null; alt: Metar | null; fromIcao: string; toIcao: string; altIcao?: string }) {
  const r = useRealT();
  const items: [string, Metar | null][] = [
    [fromIcao, from],
    [toIcao, to],
  ];
  if (altIcao) items.push([altIcao, alt]);
  return (
    <div className="border-t border-line px-5 py-4">
      <Title icon={<CloudSun className="size-3.5" />}>{r.wx.title}</Title>
      <div className={clsx("grid gap-2", items.length === 3 ? "grid-cols-3" : "grid-cols-2")}>
        {items.map(([icao, m]) => (
          <div key={icao} className="well min-w-0 px-3 py-2">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[12.5px] font-semibold text-fg">{icao}</span>
              {m && <WxChip category={m.category} />}
              {m?.wet && <Badge tone="info">{r.wx.wet}</Badge>}
              {m?.thunderstorm && <Badge tone="danger">{r.wx.storm}</Badge>}
            </div>
            {m ? (
              <>
                <div className="tabular mt-1 text-[12px] text-fg-2">
                  {r.wx.wind(m.windDir, m.windKt, m.gustKt)} · {m.visibilitySm !== null ? r.wx.vis(m.visibilitySm) : "—"}
                </div>
                <div className="tabular text-[11.5px] text-muted">
                  {r.wx.ceiling(m.ceilingFt)}
                  {m.tempC !== null && ` · ${r.wx.temp(m.tempC)}`}
                  {m.qnhHpa !== null && ` · Q${Math.round(m.qnhHpa)}`}
                </div>
                <div className="mt-1 truncate font-mono text-[10.5px] text-muted" title={m.raw}>
                  {m.raw}
                </div>
              </>
            ) : (
              <div className="mt-1 text-[11.5px] text-muted">{r.wx.none}</div>
            )}
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-muted">{r.wx.source}</p>
    </div>
  );
}

export function objectiveLabel(r: ReturnType<typeof useRealT>, o: Objective): string {
  const f = r.objectives.kinds[o.kind];
  return f ? f(o.name) : o.name;
}

function Objectives({ job }: { job: Job }) {
  const r = useRealT();
  const t = useCareerT();
  return (
    <div className="border-t border-line px-5 py-4">
      <Title icon={<Waypoints className="size-3.5" />}>{r.flight.objectives}</Title>
      <p className="mb-2 text-[12px] text-fg-2">{r.missionHint[job.kind] ?? t.kinds[job.kind]}</p>
      <ol className="flex flex-col gap-1.5">
        {job.objectives.map((o, i) => (
          <li key={i} className="well flex items-center gap-2.5 px-3 py-2 text-[12.5px]">
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-surface-3 text-[11px] font-semibold text-fg-2">{i + 1}</span>
            <Crosshair className="size-3.5 shrink-0 text-accent" />
            <span className="min-w-0 flex-1 truncate text-fg">{objectiveLabel(r, o)}</span>
            <span className="tabular shrink-0 text-[11px] text-muted">
              {o.lat.toFixed(3)}, {o.lon.toFixed(3)} · {num(o.radiusNm, 1)} nm
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
