// Uçuş ekranının yan kartları: varış (METAR, pist ve rüzgâr), yakıt, puan ve olaylar, iş.

import type { ReactNode } from "react";
import clsx from "clsx";
import { CircleAlert, Flag, Fuel, MapPin, RefreshCw, Target, TriangleAlert, Trophy } from "lucide-react";
import { ago } from "@/lib/format";
import { useLang } from "@/lib/i18n";
import { Badge, ScoreRing } from "@/ui";
import { clock, landingTone, money, num } from "../career/format";
import { useCareerT } from "../career/i18n";
import { useRealT } from "../career/real-i18n";
import type { FlightCategory, FlightEvent } from "../career/types";
import { LB_PER_KG, bestRunway, distanceNm, pad3 } from "./calc";
import { useDeckT } from "./i18n";
import { span, type DeckModel } from "./model";
import { KindIcon } from "./parts";

export function Card({ icon, title, aside, children, className }: { icon: ReactNode; title: ReactNode; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={clsx("card shrink-0 overflow-hidden", className)}>
      <header className="flex min-h-11 items-center gap-2 border-b border-line px-4 py-2">
        <span className="shrink-0 text-accent">{icon}</span>
        <h2 className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-fg">{title}</h2>
        {aside}
      </header>
      <div className="px-4 py-3">{children}</div>
    </section>
  );
}

function Kv({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "warn" | "danger" | "ok" }) {
  return (
    <div className="min-w-0">
      <div className="truncate text-[10.5px] font-semibold uppercase tracking-[0.07em] text-muted">{label}</div>
      <div className={clsx("tabular truncate text-[15px] font-semibold leading-tight", tone === "danger" ? "text-danger" : tone === "warn" ? "text-warn" : tone === "ok" ? "text-ok" : "text-fg")}>{value}</div>
      {sub !== undefined && <div className="truncate text-[11px] text-fg-2">{sub}</div>}
    </div>
  );
}

const CATEGORY_TONE: Record<FlightCategory, "ok" | "info" | "warn" | "danger"> = { VFR: "ok", MVFR: "info", IFR: "warn", LIFR: "danger" };

/** Görüş: statü mili → km (10 km üstü "10+ km", 1 km altı metre). */
function vis(sm: number | null): string {
  if (sm === null) return "—";
  const km = sm * 1.609;
  if (km >= 9.9) return "10+ km";
  if (km < 1) return `${Math.round((km * 1000) / 100) * 100} m`;
  return `${km.toFixed(km < 3 ? 1 : 0)} km`;
}

// ───────────── Varış ─────────────

/** Pist ve rüzgâr: kuzey yukarı küçük pusula; pist kendi yönünde, rüzgâr okunu geldiği yönden merkeze. */
function RunwayWind({ hdg, end, windDir, windKt, north }: { hdg: number; end: string; windDir: number | null; windKt: number; north: string }) {
  const r = 34;
  return (
    <svg viewBox="-40 -40 80 80" className="size-[84px] shrink-0" aria-hidden>
      <circle r={r} fill="none" stroke="var(--line-strong)" strokeWidth={1} />
      <text y={-r + 9} textAnchor="middle" fontSize={8} fontWeight={700} fill="var(--muted)" style={{ fontFamily: "var(--font-mono)" }}>
        {north}
      </text>
      <g transform={`rotate(${hdg})`}>
        <rect x={-4.5} y={-24} width={9} height={48} rx={1.5} fill="var(--surface-3)" stroke="var(--fg-2)" strokeWidth={0.8} />
        <line y1={-19} y2={19} stroke="var(--fg-2)" strokeWidth={0.8} strokeDasharray="3 3" />
        {/* İniş eşiği pistin başında (yaklaşma yönünün tersi). */}
        <text y={31} transform={`rotate(${-hdg} 0 31)`} dy="0.35em" textAnchor="middle" fontSize={8.5} fontWeight={700} fill="var(--fg)" style={{ fontFamily: "var(--font-mono)" }}>
          {end}
        </text>
      </g>
      {windDir !== null && windKt >= 1 && (
        <g transform={`rotate(${windDir})`}>
          <line y1={-r - 2} y2={-r + 15} stroke="var(--info)" strokeWidth={2.4} strokeLinecap="round" />
          <path d={`M-4.5 ${-r + 10} L0 ${-r + 17} L4.5 ${-r + 10}`} fill="none" stroke="var(--info)" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
        </g>
      )}
    </svg>
  );
}

export function DestinationCard({ m }: { m: DeckModel }) {
  const t = useDeckT();
  const ct = useCareerT();
  const r = useRealT();
  const a = m.active;
  if (!a || !a.to) return null;
  const to = a.to;
  const mt = m.metar;
  const best = bestRunway(to.runway, mt?.windDir ?? null, mt?.windKt ?? 0);
  const arr = a.dispatch?.arrival ?? null;
  const altn = a.dispatch?.alternate ?? null;
  return (
    <Card
      icon={<MapPin className="size-4" />}
      title={
        <span className="flex min-w-0 items-baseline gap-2">
          <span>{t.dest.title}</span>
          <span className="font-mono text-[14px] font-bold">{to.icao}</span>
          <span className="truncate text-[12px] font-normal text-fg-2">{to.name}</span>
        </span>
      }
      aside={mt && <Badge tone={CATEGORY_TONE[mt.category]}>{r.wx.category[mt.category] ?? mt.category}</Badge>}
    >
      {mt ? (
        <div className="grid grid-cols-3 gap-x-3 gap-y-2.5">
          <Kv label={t.dest.wind} value={mt.windKt < 1 ? t.wind.calm : `${mt.windDir === null ? "VRB" : `${pad3(mt.windDir)}°`} ${Math.round(mt.windKt)} kt`} sub={mt.gustKt ? `G ${Math.round(mt.gustKt)} kt` : undefined} />
          <Kv label={t.dest.vis} value={vis(mt.visibilitySm)} />
          <Kv label={t.dest.ceiling} value={mt.ceilingFt === null ? t.dest.noCeiling : `${num(mt.ceilingFt)} ft`} tone={mt.ceilingFt !== null && mt.ceilingFt < 1000 ? "warn" : undefined} />
          <Kv label={t.dest.temp} value={mt.tempC === null ? "—" : `${Math.round(mt.tempC)}° / ${mt.dewpointC === null ? "—" : `${Math.round(mt.dewpointC)}°`}`} />
          <Kv label="QNH" value={mt.qnhHpa === null ? "—" : `${Math.round(mt.qnhHpa)}`} sub={mt.qnhHpa === null ? undefined : `${(mt.qnhHpa * 0.02953).toFixed(2)} inHg`} />
          <Kv label={t.dest.elevation} value={`${num(to.elevationFt)} ft`} />
        </div>
      ) : (
        <p className="text-[12px] text-fg-2">{t.dest.noMetar}</p>
      )}
      {(mt?.wet || mt?.thunderstorm) && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {mt.wet && <Badge tone="info">{r.wx.wet}</Badge>}
          {mt.thunderstorm && <Badge tone="danger">{r.wx.storm}</Badge>}
        </div>
      )}

      {best && (
        <div className="mt-3 flex items-center gap-3 rounded-[14px] border border-line bg-surface-2/50 p-2.5">
          <RunwayWind hdg={best.hdg} end={best.end} windDir={mt?.windDir ?? null} windKt={mt?.windKt ?? 0} north={ct.map.compass[0]} />
          <div className="min-w-0 flex-1">
            <div className="text-[12px] font-semibold text-fg">{t.dest.windOn(best.end)}</div>
            <div className="tabular text-[13px] text-fg-2">
              {mt && mt.windKt >= 1
                ? `${best.head >= 0 ? t.wind.head(String(Math.round(best.head))) : t.wind.tail(String(Math.round(-best.head)))} · ${
                    best.cross >= 0 ? t.wind.right(String(Math.round(best.cross))) : t.wind.left(String(Math.round(-best.cross)))
                  } kt`
                : t.wind.calm}
            </div>
            {arr && (
              <div className="mt-1.5 grid grid-cols-2 gap-x-3 text-[11.5px]">
                <span className="text-muted">{r.dispatch.available}</span>
                <span className={clsx("tabular text-right", arr.availableFt < arr.requiredFt ? "font-semibold text-danger" : "text-fg")}>{num(arr.availableFt)} ft</span>
                <span className="text-muted">{r.dispatch.required}</span>
                <span className="tabular text-right text-fg">{num(arr.requiredFt)} ft</span>
                <span className="text-muted">{r.dispatch.da}</span>
                <span className="tabular text-right text-fg">{num(arr.densityAltFt)} ft</span>
              </div>
            )}
          </div>
        </div>
      )}
      {arr && (!arr.lighted || arr.fuel !== "both") && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {!arr.lighted && <Badge tone="warn">{r.dispatch.unlit}</Badge>}
          {arr.fuel !== "both" && <Badge tone={arr.fuel === "none" ? "warn" : "neutral"}>{r.dispatch.fuelAt[arr.fuel]}</Badge>}
        </div>
      )}
      {mt && (
        <p className="mt-2.5 break-words font-mono text-[11px] leading-relaxed text-fg-2" data-selectable>
          {mt.raw}
          <span className="ml-1.5 font-sans text-muted">· {ago(mt.observed)}</span>
        </p>
      )}
      {altn && (
        <div className="mt-2 flex items-baseline gap-2 border-t border-line pt-2 text-[12px]">
          <span className="text-muted">{t.dest.alternate}</span>
          <span className="font-mono font-semibold text-fg">{altn.icao}</span>
          <span className="min-w-0 flex-1 truncate text-fg-2">{altn.name}</span>
          <span className="tabular text-fg-2">{num(altn.distanceNm)} nm</span>
        </div>
      )}
    </Card>
  );
}

// ───────────── Yakıt ─────────────

export function FuelCard({ m }: { m: DeckModel }) {
  const t = useDeckT();
  const lang = useLang((s) => s.lang);
  const f = m.fuel;
  const plan = m.active?.dispatch?.fuel ?? null;
  const reserve = plan?.finalReserveKg ?? null;
  const altKg = plan?.alternateKg ?? 0;
  const status =
    f?.atDestKg === null || f?.atDestKg === undefined || reserve === null ? null : f.atDestKg < reserve ? "low" : f.atDestKg < reserve + altKg ? "tight" : "ok";
  // Çubuk: uçuş başındaki yakıt (ya da blok) ölçeğinde; varışa kadar yanacak kısım soluk, yedekler çizgi.
  const startKg = f ? f.onBoardKg + (f.usedKg ?? 0) : 0;
  const max = Math.max(startKg, plan?.blockKg ?? 0, 1) * 1.04;
  const pct = (kg: number) => `${Math.min(100, Math.max(0, (kg / max) * 100))}%`;
  const progress = m.flownNm !== null && m.totalNm ? Math.min(1, m.flownNm / m.totalNm) : null;
  const planNow = plan && progress !== null ? plan.blockKg - plan.taxiKg - plan.tripKg * progress : null;
  return (
    <Card
      icon={<Fuel className="size-4" />}
      title={t.fuel.title}
      aside={status && <Badge tone={status === "ok" ? "ok" : status === "tight" ? "warn" : "danger"}>{t.fuel[status]}</Badge>}
    >
      {!f ? (
        <p className="text-[12px] text-fg-2">{t.fuel.noData}</p>
      ) : (
        <>
          <div className="grid grid-cols-4 gap-x-3">
            <Kv label={t.fuel.onBoard} value={`${num(f.onBoardKg)} kg`} sub={`${num(f.onBoardKg * LB_PER_KG)} lb`} />
            <Kv label={t.fuel.used} value={f.usedKg === null ? "—" : `${num(f.usedKg, 1)} kg`} sub={f.usedKg === null ? "\u00a0" : `${num(f.usedKg * LB_PER_KG)} lb`} />
            <Kv label={t.fuel.burn} value={f.burnKgH === null ? "—" : `${num(f.burnKgH, f.burnKgH < 100 ? 1 : 0)}`} sub={f.burnKgH === null ? t.fuel.measuring : `kg/${lang === "en" ? "h" : "sa"} · ${f.burnPlanned ? t.fuel.planned : t.fuel.measuring}`} />
            <Kv label={t.fuel.endurance} value={f.enduranceMin === null ? "—" : span(f.enduranceMin * 60_000, lang === "en")} />
          </div>
          <div className="mt-3">
            <div className="relative h-3 overflow-hidden rounded-full bg-surface-3">
              <div className="absolute inset-y-0 left-0 bg-accent/35" style={{ width: pct(f.onBoardKg) }} />
              <div
                className={clsx("absolute inset-y-0 left-0", status === "low" ? "bg-danger" : status === "tight" ? "bg-warn" : "bg-accent")}
                style={{ width: pct(f.atDestKg ?? f.onBoardKg) }}
              />
              {reserve !== null && <span className="absolute inset-y-0 w-0.5 bg-danger" style={{ left: pct(reserve) }} title={t.fuel.reserve} />}
              {reserve !== null && altKg > 0 && <span className="absolute inset-y-0 w-0.5 bg-warn" style={{ left: pct(reserve + altKg) }} title={t.fuel.alternate} />}
              {planNow !== null && <span className="absolute -top-0.5 bottom-[-2px] w-0.5 bg-fg" style={{ left: pct(planNow) }} title={t.fuel.planNow} />}
            </div>
            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-fg-2">
              <span>
                <span className="mr-1 inline-block size-2 rounded-sm bg-accent align-middle" />
                {t.fuel.atDest} <b className="tabular font-semibold text-fg">{f.atDestKg === null ? "—" : `${num(Math.max(0, f.atDestKg))} kg`}</b>
              </span>
              {reserve !== null && (
                <span>
                  <span className="mr-1 inline-block h-2.5 w-0.5 bg-danger align-middle" />
                  {t.fuel.reserve} {num(reserve)}
                </span>
              )}
              {altKg > 0 && (
                <span>
                  <span className="mr-1 inline-block h-2.5 w-0.5 bg-warn align-middle" />
                  {t.fuel.alternate} +{num(altKg)}
                </span>
              )}
              {planNow !== null && (
                <span>
                  <span className="mr-1 inline-block h-2.5 w-0.5 bg-fg align-middle" />
                  {t.fuel.planNow} {num(planNow)}
                </span>
              )}
            </div>
          </div>
          {plan && (
            <div className="mt-2.5 flex flex-wrap gap-x-3 border-t border-line pt-2 text-[11.5px] text-muted">
              <span>{t.fuel.plan}:</span>
              <span>
                {t.fuel.block} <b className="tabular font-semibold text-fg-2">{num(plan.blockKg)} kg</b>
              </span>
              <span>
                {t.fuel.trip} <b className="tabular font-semibold text-fg-2">{num(plan.tripKg)}</b>
              </span>
              <span>
                {t.fuel.reserve} <b className="tabular font-semibold text-fg-2">{num(plan.finalReserveKg)}</b>
              </span>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

// ───────────── Puan ─────────────

function EventRow({ e }: { e: FlightEvent }) {
  const ct = useCareerT();
  return (
    <li className="flex items-center gap-2 py-1 text-[12px]">
      <span className="tabular w-[50px] shrink-0 text-[11px] text-muted">{clock(e.t)}</span>
      {e.severity === "fatal" ? (
        <TriangleAlert className="size-3.5 shrink-0 text-danger" />
      ) : e.penalty > 0 ? (
        <CircleAlert className="size-3.5 shrink-0 text-warn" />
      ) : (
        <RefreshCw className="size-3.5 shrink-0 text-muted" />
      )}
      <span className={clsx("min-w-0 flex-1 truncate", e.severity === "fatal" ? "font-semibold text-danger" : "text-fg-2")}>
        {ct.events[e.code] ?? e.code}
        {e.value ? <span className="tabular text-muted"> · {num(e.value, 1)}</span> : null}
      </span>
      {e.penalty > 0 && <span className="tabular shrink-0 font-semibold text-warn">−{e.penalty}</span>}
    </li>
  );
}

export function ScoreCard({ m }: { m: DeckModel }) {
  const t = useDeckT();
  const ct = useCareerT();
  const r = useRealT();
  const f = m.flight;
  const l = f?.landing ?? null;
  return (
    <Card icon={<Trophy className="size-4" />} title={t.score.title} aside={m.live?.paused ? <Badge tone="warn">{ct.live.paused}</Badge> : undefined}>
      {!f ? (
        <p className="text-[12px] text-fg-2">{t.score.noFlight}</p>
      ) : (
        <div className="flex gap-4">
          <div className="flex shrink-0 flex-col items-center gap-1">
            <ScoreRing score={f.scoreNow} size={78} stroke={7} />
          </div>
          <div className="min-w-0 flex-1">
            {f.invalid && (
              <div className="mb-2 flex items-center gap-2 rounded-lg bg-danger/10 px-2.5 py-1.5 text-[12px] font-semibold text-danger">
                <TriangleAlert className="size-3.5 shrink-0" />
                <span className="truncate">{ct.events[f.invalid] ?? f.invalid}</span>
              </div>
            )}
            <div className="text-[10.5px] font-semibold uppercase tracking-[0.07em] text-muted">{t.score.events}</div>
            {f.events.length === 0 ? (
              <p className="mt-1 text-[12px] text-muted">{t.score.noEvents}</p>
            ) : (
              <ul className="max-h-[132px] overflow-y-auto">
                {f.events.map((e, i) => (
                  <EventRow key={`${e.t}-${e.code}-${i}`} e={e} />
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
      {l && (
        <div className="mt-3 rounded-[14px] border border-line bg-surface-2/50 p-3">
          <div className="flex items-center gap-2">
            <span className="text-[12.5px] font-semibold text-fg">{t.score.landing}</span>
            <Badge tone={landingTone(l.label)}>{ct.landing[l.label]}</Badge>
            {l.bounces > 0 && <Badge tone="warn">{t.score.bounces(l.bounces)}</Badge>}
          </div>
          <div className="mt-2 grid grid-cols-3 gap-x-3 gap-y-2">
            <Kv label="V/S" value={`${num(l.fpm)} fpm`} />
            <Kv label="G" value={num(l.g, 2)} />
            <Kv label={r.flight.wind} value={l.windKt ? `${Math.round(l.crosswindKt ?? 0)} / ${Math.round(l.headwindKt ?? 0)} kt` : "—"} sub={l.windKt ? t.score.crossHead : undefined} />
            {l.runway && (
              <>
                <Kv label={t.score.touchdown} value={`${num(l.runway.distanceM)} m`} tone={l.runway.distanceM < 0 || l.runway.distanceM > l.runway.tdzM + 150 ? "warn" : "ok"} sub={r.flight.runway(l.runway.runway)} />
                <Kv label={t.score.centerline} value={`${num(Math.abs(l.runway.centerlineM), 1)} m`} tone={Math.abs(l.runway.centerlineM) > l.runway.widthM / 2 - 4 ? "warn" : undefined} />
                <Kv label="IAS" value={`${num(l.iasKt)} kt`} />
              </>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

// ───────────── İş ─────────────

export function JobCard({ m }: { m: DeckModel }) {
  const t = useDeckT();
  const ct = useCareerT();
  const r = useRealT();
  const lang = useLang((s) => s.lang);
  const a = m.active;
  if (!a) {
    return (
      <Card icon={<Flag className="size-4" />} title={t.job.noJob}>
        <p className="text-[12.5px] leading-relaxed text-fg-2">{t.job.noJobBody}</p>
      </Card>
    );
  }
  const j = a.job;
  const left = a.deadlineAt * 1000 - m.now;
  const tel = m.airborneView ? m.tel : null;
  const reg = m.live?.aircraft?.atcId || (a.aircraft?.fleetId ? m.view?.fleet.find((x) => x.id === a.aircraft?.fleetId)?.registration : null) || null;
  const payload = j.pax ? ct.jobs.pax(j.pax) : j.cargoKg ? ct.jobs.kg(num(j.cargoKg)) : "—";
  return (
    <Card
      icon={<KindIcon kind={j.kind} className="size-4" />}
      title={
        <span className="flex min-w-0 items-baseline gap-2">
          <span>{ct.kinds[j.kind]}</span>
          <span className="truncate text-[12px] font-normal text-fg-2">{j.client}</span>
        </span>
      }
      aside={<span className="tabular text-[15px] font-semibold text-accent">{j.kind === "checkride" ? "—" : money(j.pay)}</span>}
    >
      <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
        <Kv label={t.job.payload} value={payload} sub={ct.cargo[j.cargo] ?? j.cargo} />
        <Kv
          label={t.job.deadline}
          value={left <= 0 ? ct.active.overdue : span(left, lang === "en")}
          sub={new Date(a.deadlineAt * 1000).toLocaleString(lang === "en" ? "en-US" : "tr-TR", { weekday: "short", hour: "2-digit", minute: "2-digit" })}
          tone={left <= 0 ? "danger" : left < 3600_000 ? "warn" : undefined}
        />
        <div className="col-span-2">
          <Kv label={t.job.aircraft} value={<span className="text-[13.5px]">{a.aircraft?.title ?? m.live?.aircraft?.title ?? "—"}</span>} sub={reg ?? undefined} />
        </div>
      </div>
      {j.care && <Badge tone="warn" className="mt-2.5">{r.care[j.care] ?? j.care}</Badge>}
      {j.objectives.length > 0 && (
        <div className="mt-3 border-t border-line pt-2.5">
          <div className="mb-1.5 flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.07em] text-muted">
            <Target className="size-3.5" />
            {t.job.objectives}
          </div>
          <ol className="flex flex-col gap-1.5">
            {j.objectives.map((o, i) => (
              <li key={`${o.name}${i}`} className="flex items-center gap-2.5 text-[12.5px]">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-info/15 text-[11px] font-bold text-info">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate text-fg">{(r.objectives.kinds[o.kind] ?? ((x: string) => x))(o.name)}</span>
                {tel && <span className="tabular shrink-0 text-fg-2">{t.job.away(num(distanceNm(tel, o), 1))}</span>}
              </li>
            ))}
          </ol>
        </div>
      )}
    </Card>
  );
}
