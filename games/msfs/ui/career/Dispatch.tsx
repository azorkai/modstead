// Uçuş kâğıdı: yakıt planı (blok yakıtın bileşenleri tek şeritte), ağırlık ve denge, pistler, yedek meydan, gerçek
// hava ve (hava işinde) görev hedefleri. Hesap arka uçta (`career::dispatch`); burada yalnızca gösterilir.

import { useState } from "react";
import clsx from "clsx";
import { ChevronDown, CircleAlert, CloudSun, Crosshair, Fuel, Gauge, Scale, ShieldCheck, Waypoints } from "lucide-react";
import { Badge, type Tone } from "@/ui";
import { duration, num } from "./format";
import { CatTag, ScenarioWeather } from "./Conditions";
import { useCareerT } from "./i18n";
import { Hint, StatusTag } from "./parts";
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
    <span title={r.wx.about[category]} className={clsx("inline-flex", className)}>
      <CatTag category={category} />
    </span>
  );
}

/** Yükün özel durumu rozeti. */
export function CareChip({ care }: { care: Job["care"] }) {
  const r = useRealT();
  if (!care) return null;
  const tone = care === "dangerous" ? "danger" : care === "perishable" ? "warn" : "info";
  return (
    <span title={r.careHint[care]}>
      <StatusTag tone={tone}>{r.care[care]}</StatusTag>
    </span>
  );
}

export function DispatchCard({ active }: { active: ActiveView }) {
  const r = useRealT();
  const d = active.dispatch;
  const { data: metars } = useWeather();
  // Engel varsa açık başlar; yoksa tek satır özet (blok yakıt, kalkış ağırlığı, durum).
  const [open, setOpen] = useState(() => !!d?.issues.some((i) => i.blocking));
  if (!d) return null;
  const wx = (icao: string | undefined) => (icao ? metars?.find((m) => m.icao === icao) ?? null : null);
  const blocking = d.issues.filter((i) => i.blocking);
  const advice = d.issues.filter((i) => !i.blocking);
  return (
    <section className="card overflow-hidden">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className={clsx("flex w-full items-center gap-3 px-6 py-4 text-left transition-colors hover:bg-surface-2/40", open && "border-b border-line")}>
        <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-fg-2">
          <Scale className="size-[15px]" />
        </span>
        <span className="title shrink-0 text-[15px] text-fg">{r.dispatch.title}</span>
        <Hint text={r.dispatch.about} />
        <span className="tabular min-w-0 flex-1 truncate text-[12.5px] text-fg-2">
          {d.ifr ? "IFR" : "VFR"} · {r.dispatch.block} {kg(d.fuel.blockKg)} · {r.dispatch.tow} {kg(d.weights.towKg)} / {kg(d.weights.mtowKg)}
        </span>
        <span className={clsx("shrink-0 text-[12.5px] font-semibold", blocking.length ? "text-danger" : advice.length ? "text-warn" : "text-ok")}>{d.issues.length ? r.dispatch.issuesN(d.issues.length) : r.dispatch.clean}</span>
        <ChevronDown className={clsx("size-4 shrink-0 text-muted transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <>
          <div className="flex flex-col gap-1.5 px-6 pt-4">
            {[...blocking, ...advice].map((i) => (
              <p key={i.code} className={clsx("flex items-start gap-2 rounded-xl px-3 py-2 text-[12px]", i.blocking ? "bg-danger/10 text-danger" : "bg-warn/10 text-warn")}>
                <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
                <span>
                  <b className="font-semibold">{i.blocking ? r.dispatch.blocking : r.dispatch.advice}:</b> {(r.dispatch.issues[i.code] ?? (() => i.code))(kg(i.value))}
                </span>
              </p>
            ))}
            {d.issues.length === 0 && (
              <p className="flex items-center gap-2 rounded-xl bg-ok/10 px-3 py-2 text-[12px] text-ok">
                <ShieldCheck className="size-3.5 shrink-0" />
                {r.dispatch.allGood}
              </p>
            )}
          </div>

          <FuelPlan d={d} />

          <div className="grid grid-cols-2 divide-x divide-line border-t border-line">
            <Weights d={d} />
            <Runways d={d} />
          </div>

          {active.job.conditions?.wx ? (
            // Senaryo havası: hesap ön ayarın değerleriyle yapıldı (METAR değil).
            <div className="border-t border-line px-6 py-4">
              <Title icon={<CloudSun className="size-3.5" />}>{r.cond.scenario}</Title>
              <ScenarioWeather job={active.job} />
              <p className="mt-2 text-[11px] text-muted">{r.cond.scenarioAbout}</p>
            </div>
          ) : (
            <Weather from={wx(d.departure.icao)} to={wx(d.arrival.icao)} alt={wx(d.alternate?.icao)} fromIcao={d.departure.icao} toIcao={d.arrival.icao} altIcao={d.alternate?.icao} />
          )}
          {active.job.objectives.length > 0 && <Objectives job={active.job} />}
        </>
      )}
    </section>
  );
}

function Title({ icon, children, aside }: { icon: React.ReactNode; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="mb-2.5 flex items-center gap-1.5 text-muted">
      {icon}
      <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-fg-2">{children}</span>
      {aside}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 py-[3px] text-[12.5px]">
      <span className="min-w-0 truncate text-fg-2">{label}</span>
      <span className="tabular shrink-0 text-fg">{value}</span>
    </div>
  );
}

/** Yakıt planı: blok yakıtın bileşenleri tek şeritte (oranlarıyla); yasal en az bir çentikle; altında açıklamalı liste. */
function FuelPlan({ d }: { d: Dispatch }) {
  const r = useRealT();
  const f = d.fuel;
  const parts = [
    { label: r.dispatch.taxi, v: f.taxiKg, cls: "bg-fg-2/45" },
    { label: r.dispatch.trip, v: f.tripKg, cls: "bg-accent" },
    { label: r.dispatch.contingency, v: f.contingencyKg, cls: "bg-accent/55" },
    { label: r.dispatch.alternate, v: f.alternateKg, cls: "bg-info" },
    { label: r.dispatch.finalReserve(f.reserveMin), v: f.finalReserveKg, cls: "bg-info/55" },
    { label: r.dispatch.extra, v: f.extraKg, cls: "bg-ok/70" },
  ].filter((p) => p.v > 0);
  const total = Math.max(1, f.blockKg);
  const minAt = Math.min(1, f.minimumKg / total);
  return (
    <div className="px-6 py-4">
      <Title icon={<Fuel className="size-3.5" />} aside={<span className="tabular text-[11px] text-muted">{r.dispatch.endurance(duration(f.enduranceMin))}</span>}>
        {r.dispatch.fuel}
      </Title>
      <div className="flex items-end gap-6">
        <div className="min-w-0 flex-1">
          <div className="relative">
            <div className="flex h-3 overflow-hidden rounded-full bg-surface-3">
              {parts.map((p) => (
                <span key={p.label} className={clsx("h-full border-r-2 border-[var(--surface)] last:border-r-0", p.cls)} style={{ width: `${(p.v / total) * 100}%` }} title={`${p.label} ${kg(p.v)}`} />
              ))}
            </div>
            <span className="absolute -bottom-1 -top-1 w-[2px] rounded-full bg-fg" style={{ left: `calc(${minAt * 100}% - 1px)` }} title={`${r.dispatch.minimum} ${kg(f.minimumKg)}`} />
          </div>
          <div className="mt-3.5 grid grid-cols-3 gap-x-5 gap-y-1.5">
            {parts.map((p) => (
              <div key={p.label} className="flex min-w-0 items-center gap-2 text-[12px]">
                <span className={clsx("size-2 shrink-0 rounded-[2px]", p.cls)} />
                <span className="min-w-0 flex-1 truncate text-fg-2" title={p.label}>
                  {p.label}
                </span>
                <span className="tabular shrink-0 text-fg">{kg(p.v)}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="shrink-0 border-l border-line pl-6 text-right">
          <div className="text-[11.5px] text-muted">{r.dispatch.block}</div>
          <div className="num mt-1.5 text-[26px] text-fg">{kg(f.blockKg)}</div>
          <div className="tabular mt-1 flex items-center justify-end gap-1.5 text-[11px] text-muted">
            <span className="h-2.5 w-[2px] rounded-full bg-fg" />
            {r.dispatch.minimum} {kg(f.minimumKg)}
          </div>
        </div>
      </div>
      <div className="mt-2.5 text-[11px] text-muted">{r.dispatch.rule[f.rule]}</div>
    </div>
  );
}

function Bar({ value, max, label }: { value: number; max: number; label: string }) {
  const p = max > 0 ? Math.min(1.1, value / max) : 0;
  const over = value > max * 1.001;
  return (
    <div className="mt-2.5">
      <div className="flex justify-between text-[11.5px]">
        <span className="text-fg-2">{label}</span>
        <span className={clsx("tabular", over ? "font-semibold text-danger" : "text-fg")}>
          {kg(value)} <span className="font-normal text-muted">/ {kg(max)}</span>
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
    <div className="min-w-0 px-6 py-4">
      <Title icon={<Scale className="size-3.5" />}>{r.dispatch.weights}</Title>
      <Row label={r.dispatch.empty} value={kg(w.emptyKg)} />
      <Row label={r.dispatch.payload} value={kg(w.payloadKg)} />
      <Row label={r.dispatch.zfw} value={kg(w.zfwKg)} />
      <Bar value={w.towKg} max={w.mtowKg} label={r.dispatch.tow} />
      <Bar value={w.lwKg} max={w.mlwKg} label={r.dispatch.lw} />
      <div className="mt-2.5 text-[11px] text-muted">{r.dispatch.capacity(kg(w.fuelCapacityKg))}</div>
    </div>
  );
}

function Runways({ d }: { d: Dispatch }) {
  const r = useRealT();
  const rw = (label: string, x: Dispatch["departure"]) => {
    const short = x.requiredFt > x.availableFt;
    return (
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[11.5px] text-fg-2">{label}</span>
          <span className="font-mono text-[12px] font-semibold text-fg">{x.icao}</span>
          {!x.lighted && <StatusTag tone="warn">{r.dispatch.unlit}</StatusTag>}
          <span className="flex-1" />
          <span className={clsx("tabular text-[11.5px]", short ? "font-semibold text-danger" : "text-fg")}>
            {num(x.requiredFt)} <span className="font-normal text-muted">/ {num(x.availableFt)} ft</span>
          </span>
        </div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-3">
          <div className={clsx("h-full rounded-full", short ? "bg-danger" : "bg-ok")} style={{ width: `${Math.min(100, (x.requiredFt / Math.max(1, x.availableFt)) * 100)}%` }} />
        </div>
        <div className="tabular mt-1 truncate text-[11px] text-muted">
          {r.dispatch.da} {num(x.densityAltFt)} ft · {r.dispatch.fuelAt[x.fuel]}
        </div>
      </div>
    );
  };
  return (
    <div className="flex min-w-0 flex-col gap-3 px-6 py-4">
      <Title icon={<Gauge className="size-3.5" />}>{r.dispatch.runways}</Title>
      {rw(r.dispatch.departure, d.departure)}
      {rw(r.dispatch.arrival, d.arrival)}
      <div className="border-t border-line pt-2.5">
        <div className="text-[11.5px] text-fg-2">{r.dispatch.altTitle}</div>
        {d.alternate ? (
          <div className="mt-0.5 truncate text-[12px] text-fg-2">
            <span className="font-mono font-semibold text-fg">{d.alternate.icao}</span> · {d.alternate.name} · <span className="tabular">{num(d.alternate.distanceNm)} nm</span>
          </div>
        ) : (
          <div className="mt-0.5 text-[12px] text-muted">{r.dispatch.noAlternate}</div>
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
    <div className="border-t border-line px-6 py-4">
      <Title icon={<CloudSun className="size-3.5" />}>{r.wx.title}</Title>
      <div className={clsx("grid gap-2", items.length === 3 ? "grid-cols-3" : "grid-cols-2")}>
        {items.map(([icao, m]) => (
          <div key={icao} className="min-w-0 rounded-xl border border-line px-3 py-2.5">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[12.5px] font-semibold text-fg">{icao}</span>
              {m && <CatTag category={m.category} />}
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
    <div className="border-t border-line px-6 py-4">
      <Title icon={<Waypoints className="size-3.5" />}>{r.flight.objectives}</Title>
      <p className="mb-2 text-[12px] text-fg-2">{r.missionHint[job.kind] ?? t.kinds[job.kind]}</p>
      <ol className="flex flex-col divide-y divide-line overflow-hidden rounded-xl border border-line">
        {job.objectives.map((o, i) => (
          <li key={i} className="flex items-center gap-2.5 px-3 py-2 text-[12.5px]">
            <span className="tabular flex size-5 shrink-0 items-center justify-center rounded-full bg-surface-3 font-mono text-[10.5px] font-semibold text-fg-2">{i + 1}</span>
            <Crosshair className="size-3.5 shrink-0 text-accent" />
            <span className="min-w-0 flex-1 truncate text-fg">{objectiveLabel(r, o)}</span>
            <span className="tabular shrink-0 font-mono text-[11px] text-muted">
              {o.lat.toFixed(3)}, {o.lon.toFixed(3)} · {num(o.radiusNm, 1)} nm
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
