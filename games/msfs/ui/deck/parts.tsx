// Uçuş ekranının ana parçaları: uçuş verileri şeridi, küçük pencerenin özet sütunu, hareketli harita ve rota ilerlemesi.

import type { ReactNode } from "react";
import clsx from "clsx";
import {
  Ambulance,
  Briefcase,
  Camera,
  ClipboardCheck,
  GraduationCap,
  LifeBuoy,
  Mountain,
  Package,
  Plane,
  Send,
  Telescope,
  Umbrella,
  Users,
} from "lucide-react";
import { useLang } from "@/lib/i18n";
import { num } from "../career/format";
import { useCareerT } from "../career/i18n";
import { RouteMap, type SmoothPos } from "../career/RouteMap";
import type { JobKind, Phase } from "../career/types";
import { bearing, distanceNm, localClock, pad3, utcClock, vs3 } from "./calc";
import { useDeckT } from "./i18n";
import { span, type DeckModel } from "./model";

const KIND_ICON: Record<JobKind, typeof Plane> = {
  training: GraduationCap,
  cargo: Package,
  passenger: Users,
  charter: Briefcase,
  ferry: Send,
  bush: Mountain,
  medical: Ambulance,
  airline: Plane,
  checkride: ClipboardCheck,
  tour: Telescope,
  skydive: Umbrella,
  survey: Camera,
  sar: LifeBuoy,
};

export function KindIcon({ kind, className }: { kind: JobKind | null; className?: string }) {
  const I = (kind && KIND_ICON[kind]) || Plane;
  return <I className={className ?? "size-4"} />;
}

/** Sayı yoksa uzun çizgi. */
const v = (n: number | null | undefined, digits = 0) => (n === null || n === undefined || !Number.isFinite(n) ? "—" : num(n, digits));
const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${num(Math.abs(n))}`;

// ───────────── Uçuş verileri ─────────────

function Cell({ label, value, unit, sub, span, size }: { label: string; value: ReactNode; unit?: string; sub?: ReactNode; span?: 2 | 4; size: "lg" | "md" }) {
  return (
    <div className={clsx("flex min-w-0 flex-col justify-center bg-surface", size === "lg" ? "px-2.5 py-2" : "px-2 py-1.5", span === 2 && "col-span-2", span === 4 && "col-span-4")}>
      {/* Birim etiket satırında: dar hücrede sayı kesilmesin. */}
      <span className="flex min-w-0 items-baseline gap-1 text-[10.5px] font-semibold uppercase tracking-[0.07em] text-muted">
        <span className="truncate">{label}</span>
        {unit && <span className="ml-auto shrink-0 font-medium normal-case tracking-normal">{unit}</span>}
      </span>
      <span className={clsx("tabular truncate font-semibold leading-tight text-fg", size === "lg" ? "text-[21px]" : "text-[17px]")}>{value}</span>
      {/* Alt satır her zaman yer kaplar: değer gelip gidince şerit zıplamasın. */}
      <span className="truncate text-[11px] leading-snug text-fg-2">{sub ?? "\u00a0"}</span>
    </div>
  );
}

export function windText(t: ReturnType<typeof useDeckT>, w: NonNullable<DeckModel["wind"]>) {
  if (w.kt < 1) return t.wind.calm;
  const h = Math.round(Math.abs(w.head));
  const c = Math.round(Math.abs(w.cross));
  const head = w.head >= 0 ? t.wind.head(String(h)) : t.wind.tail(String(h));
  return c >= 1 ? `${head} · ${w.cross > 0 ? t.wind.right(String(c)) : t.wind.left(String(c))}` : head;
}

/** GS, IAS, irtifa, yerden yükseklik, dikey hız, pruva, rüzgâr (ize göre bileşenleriyle), dış sıcaklık, QNH. */
export function DataStrip({ m, cols, size, stale }: { m: DeckModel; cols: 4 | 5 | 10; size: "lg" | "md"; stale?: boolean }) {
  const t = useDeckT();
  const tel = m.airborneView ? m.tel : null;
  const env = m.airborneView ? m.env : null;
  const wind = (
    <Cell
      key="wind"
      size={size}
      span={cols === 4 ? 4 : 2}
      label={t.data.wind}
      value={env ? (env.windKt < 1 ? t.wind.calm : `${pad3(env.windDir)}° / ${Math.round(env.windKt)}`) : "—"}
      unit={env && env.windKt >= 1 ? "kt" : undefined}
      sub={m.wind ? windText(t, m.wind) : undefined}
    />
  );
  const cells = [
    <Cell key="gs" size={size} label={t.data.gs} value={v(tel?.gsKt)} unit="kt" sub={tel && tel.simRate !== 1 ? `${tel.simRate}×` : undefined} />,
    <Cell key="ias" size={size} label={t.data.ias} value={v(tel?.iasKt)} unit="kt" />,
    <Cell key="alt" size={size} label={t.data.alt} value={v(tel?.altFt)} unit="ft" />,
    <Cell key="agl" size={size} label={t.data.agl} value={tel ? (tel.onGround ? "0" : v(tel.aglFt)) : "—"} unit="ft" />,
    <Cell key="vs" size={size} label={t.data.vs} value={tel ? signed(Math.round(tel.vsFpm / 10) * 10) : "—"} unit="fpm" />,
    <Cell key="hdg" size={size} label={t.data.hdg} value={tel ? `${pad3(tel.heading)}°` : "—"} sub={m.course !== null && tel ? `${t.data.trk} ${pad3(m.course)}°` : undefined} />,
    // Dar ekranda (4 sütun) rüzgâr en alta, tam genişlikte.
    ...(cols === 4 ? [] : [wind]),
    <Cell key="oat" size={size} label={t.data.oat} value={env ? `${Math.round(env.temperatureC)}` : "—"} unit="°C" />,
    <Cell key="qnh" size={size} label={t.data.qnh} value={env ? `${Math.round(env.qnhHpa)}` : "—"} unit="hPa" sub={env ? `${(env.qnhHpa * 0.02953).toFixed(2)} inHg` : undefined} />,
    ...(cols === 4 ? [wind] : []),
  ];
  return (
    <div
      className={clsx(
        "grid shrink-0 gap-px overflow-hidden rounded-2xl border border-line bg-line transition-opacity",
        cols === 10 ? "grid-cols-10" : cols === 5 ? "grid-cols-5" : "grid-cols-4",
        stale && "opacity-55",
      )}
    >
      {cells}
    </div>
  );
}

/** Küçük pencerede haritanın yanındaki özet: en sık bakılan sayılar. */
export function Vitals({ m }: { m: DeckModel }) {
  const t = useDeckT();
  const lang = useLang((s) => s.lang);
  const tel = m.airborneView ? m.tel : null;
  const env = m.airborneView ? m.env : null;
  const rows: [string, ReactNode, string?][] = [
    [t.data.gs, v(tel?.gsKt), "kt"],
    [t.data.alt, v(tel?.altFt), "ft"],
    [t.data.vs, tel ? signed(Math.round(tel.vsFpm / 10) * 10) : "—", "fpm"],
    [t.data.hdg, tel ? `${pad3(tel.heading)}°` : "—"],
    [t.progress.remaining, v(m.remainingNm, 1), "nm"],
    [t.progress.eta, m.etaMs ? utcClock(m.etaMs) : "—"],
    [t.fuel.atDest, v(m.fuel?.atDestKg), "kg"],
    [t.fuel.endurance, m.fuel?.enduranceMin ? span(m.fuel.enduranceMin * 60_000, lang === "en") : "—"],
  ];
  return (
    <div className="flex min-h-0 flex-col gap-px overflow-hidden rounded-2xl border border-line bg-line">
      <div className="grid grid-cols-2 gap-px">
        {rows.map(([label, value, unit]) => (
          <div key={label} className="min-w-0 bg-surface px-2.5 py-1.5">
            <div className="truncate text-[10px] font-semibold uppercase tracking-[0.07em] text-muted">{label}</div>
            <div className="flex items-baseline gap-1">
              <span className="tabular truncate text-[16px] font-semibold leading-tight text-fg">{value}</span>
              {unit && <span className="text-[10.5px] text-muted">{unit}</span>}
            </div>
          </div>
        ))}
      </div>
      <div className="bg-surface px-2.5 py-1.5">
        <div className="text-[10px] font-semibold uppercase tracking-[0.07em] text-muted">{t.data.wind}</div>
        <div className="tabular text-[14px] font-semibold text-fg">{env ? (env.windKt < 1 ? t.wind.calm : `${pad3(env.windDir)}° / ${Math.round(env.windKt)} kt`) : "—"}</div>
        <div className="truncate text-[11px] text-fg-2">{m.wind ? windText(t, m.wind) : "\u00a0"}</div>
      </div>
    </div>
  );
}

// ───────────── Harita ─────────────

export function MapPanel({
  m,
  track,
  smooth,
  follow,
  setFollow,
  trackUp,
  setTrackUp,
  banner,
  className,
}: {
  m: DeckModel;
  track: [number, number, number, number][] | undefined;
  smooth: () => SmoothPos | null;
  follow: boolean;
  setFollow: (on: boolean) => void;
  trackUp: boolean;
  setTrackUp: (on: boolean) => void;
  banner?: ReactNode;
  className?: string;
}) {
  const t = useDeckT();
  const active = m.active;
  const tel = m.airborneView ? m.tel : null;
  // İş yoksa harita pilotun bulunduğu meydandan (o da yoksa uçaktan) açılır.
  const loc = m.view?.location ?? null;
  const from = active?.from
    ? { lat: active.from.lat, lon: active.from.lon, icao: active.job.from }
    : loc
      ? { lat: loc.lat, lon: loc.lon, icao: loc.icao }
      : tel
        ? { lat: Math.round(tel.lat * 10) / 10, lon: Math.round(tel.lon * 10) / 10 }
        : null;
  const to = active?.to ? { lat: active.to.lat, lon: active.to.lon, icao: active.job.to } : null;
  const objectives = active?.job.objectives ?? [];
  const direct = tel && to ? { nm: distanceNm(tel, to), brg: bearing(tel, to) } : null;
  return (
    <div className={clsx("relative min-h-0 overflow-hidden rounded-2xl border border-line", className)}>
      <RouteMap
        from={from}
        to={to}
        track={track}
        current={tel ? { lat: tel.lat, lon: tel.lon } : null}
        heading={tel?.heading}
        smooth={smooth}
        follow={follow && !!tel}
        onFollowChange={setFollow}
        trackUp={trackUp && !!tel}
        onTrackUpChange={setTrackUp}
        alternate={m.alternate}
        rings
        touch
        className="size-full"
        extra={
          objectives.length
            ? ({ P, nm, u, up }) => (
                <g>
                  {objectives.map((o, i) => {
                    const [x, y] = P(o.lat, o.lon);
                    return (
                      <g key={`${o.name}${i}`}>
                        <circle cx={x} cy={y} r={Math.max(o.radiusNm * nm, u * 7)} fill="var(--info)" fillOpacity={0.12} stroke="var(--info)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
                        <text x={x} y={y} dy="0.35em" textAnchor="middle" fontSize={u * 11} fontWeight={700} fill="var(--info)" stroke="var(--bg)" strokeWidth={u * 3} paintOrder="stroke" {...up(x, y)}>
                          {i + 1}
                        </text>
                      </g>
                    );
                  })}
                </g>
              )
            : undefined
        }
      />
      {direct && to && (
        <div className="msfs-on-image pointer-events-none absolute left-2.5 top-2.5 flex items-baseline gap-2 rounded-lg px-2.5 py-1.5 font-mono text-white">
          <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-white/60">{t.dest.direct}</span>
          <span className="text-[13px] font-bold">{to.icao}</span>
          <span className="tabular text-[12px] text-white/85">
            {num(direct.nm, direct.nm < 10 ? 1 : 0)} nm · {pad3(direct.brg)}°
          </span>
        </div>
      )}
      {banner && <div className="pointer-events-none absolute inset-x-16 top-3 flex justify-center">{banner}</div>}
    </div>
  );
}

// ───────────── Rota ilerlemesi ─────────────

/** Sadeleştirilmiş evre çizelgesi (kariyerin panelindekiyle aynı). */
const TIMELINE: { id: string; phases: Phase[] }[] = [
  { id: "preflight", phases: ["preflight"] },
  { id: "taxi_out", phases: ["taxi_out"] },
  { id: "takeoff", phases: ["takeoff", "climb"] },
  { id: "cruise", phases: ["cruise", "descent"] },
  { id: "approach", phases: ["approach"] },
  { id: "rollout", phases: ["rollout", "taxi_in"] },
  { id: "parked", phases: ["parked"] },
];

function Fact({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "warn" | "danger" | "ok" }) {
  return (
    <div className="min-w-0">
      <div className="truncate text-[10.5px] font-semibold uppercase tracking-[0.07em] text-muted">{label}</div>
      <div className={clsx("tabular truncate text-[16px] font-semibold leading-tight", tone === "danger" ? "text-danger" : tone === "warn" ? "text-warn" : tone === "ok" ? "text-ok" : "text-fg")}>{value}</div>
      <div className={clsx("truncate text-[11px] leading-snug", tone === "danger" ? "text-danger" : tone === "warn" ? "text-warn" : "text-fg-2")}>{sub ?? "\u00a0"}</div>
    </div>
  );
}

export function ProgressPanel({ m, cols = 5 }: { m: DeckModel; cols?: 2 | 3 | 5 }) {
  const t = useDeckT();
  const ct = useCareerT();
  const lang = useLang((s) => s.lang);
  const en = lang === "en";
  const active = m.active;
  const phase = m.flight?.phase ?? null;
  const at = phase ? TIMELINE.findIndex((s) => s.phases.includes(phase)) : -1;
  const total = m.totalNm ?? 0;
  const frac = m.flownNm !== null && total > 0 ? Math.min(1, Math.max(0, m.flownNm / total)) : 0;
  const tel = m.tel;
  // Alçalma noktası çubukta: uçulan + kalan TOD mesafesi.
  const todFrac = m.todNm !== null && m.todNm > 0 && m.flownNm !== null && total > 0 ? Math.min(1, (m.flownNm + m.todNm) / total) : null;
  const left = m.deadlineMs !== null ? m.deadlineMs - m.now : null;
  const late = m.etaMs !== null && m.deadlineMs !== null && m.etaMs > m.deadlineMs;
  const minsTo = (nm: number) => (tel && tel.gsKt > 30 ? span((nm / tel.gsKt) * 3_600_000, en) : undefined);
  const descending = phase === "descent" || phase === "approach";

  return (
    <section className="card shrink-0 px-4 py-3">
      <ol className="flex items-center gap-1" aria-label={ct.live.phase}>
        {TIMELINE.map((s, i) => (
          <li key={s.id} className="flex min-w-0 flex-1 flex-col gap-1">
            <span className={clsx("h-1.5 rounded-full", i < at ? "bg-accent/55" : i === at ? "bg-accent" : "bg-surface-3")} />
            <span className={clsx("truncate text-center text-[10.5px]", i === at ? "font-semibold text-fg" : "text-muted")}>{ct.phases[s.id]}</span>
          </li>
        ))}
      </ol>

      <div className="mt-3 flex items-center gap-3">
        <span className="font-mono text-[13px] font-bold text-fg">{active?.job.from ?? "—"}</span>
        <div className="relative h-2 flex-1 rounded-full bg-surface-3">
          <div className="absolute inset-y-0 left-0 rounded-full bg-accent" style={{ width: `${frac * 100}%` }} />
          {todFrac !== null && <span className="absolute -top-1 h-4 w-0.5 -translate-x-1/2 rounded-full bg-fg-2" style={{ left: `${todFrac * 100}%` }} title={t.progress.tod} />}
          {m.flownNm !== null && (
            <span className="absolute top-1/2 flex size-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-line-strong bg-surface text-accent" style={{ left: `${frac * 100}%` }}>
              <Plane className="size-3.5 rotate-45 fill-current" />
            </span>
          )}
        </div>
        <span className="font-mono text-[13px] font-bold text-fg">{active?.job.to ?? "—"}</span>
      </div>

      <div className={clsx("mt-3 grid gap-x-3 gap-y-2", cols === 5 ? "grid-cols-5" : cols === 3 ? "grid-cols-3" : "grid-cols-2")}>
        <Fact label={t.progress.flown} value={m.flownNm !== null ? `${num(m.flownNm, 1)} nm` : "—"} sub={total > 0 ? `/ ${num(total, total < 100 ? 1 : 0)} nm` : undefined} />
        <Fact label={t.progress.remaining} value={m.remainingNm !== null ? `${num(m.remainingNm, 1)} nm` : "—"} sub={m.remainingNm !== null ? minsTo(m.remainingNm) : undefined} />
        <Fact label={t.progress.eta} value={m.etaMs ? utcClock(m.etaMs) : "—"} sub={m.etaMs ? `${localClock(m.etaMs)} ${t.progress.local}` : undefined} />
        <Fact
          label={t.progress.deadline}
          value={left === null ? "—" : left <= 0 ? t.progress.overdue : span(left, en)}
          sub={late ? t.progress.late : m.deadlineMs ? `${utcClock(m.deadlineMs)} · ${localClock(m.deadlineMs)}` : undefined}
          tone={left !== null && left <= 0 ? "danger" : late ? "warn" : undefined}
        />
        <Fact
          label={t.progress.tod}
          value={
            m.todNm === null
              ? "—"
              : descending
                ? t.progress.descending
                : m.todNm <= 0
                  ? t.progress.todNow
                  : `${num(m.todNm, m.todNm < 10 ? 1 : 0)} nm`
          }
          sub={tel && m.todNm !== null && !tel.onGround ? (m.todNm > 0 && !descending ? minsTo(m.todNm) : t.progress.vs3(num(vs3(tel.gsKt)).replace("-", "−"))) : undefined}
          tone={m.todNm !== null && m.todNm <= 0 && !descending ? "warn" : undefined}
        />
      </div>
      {!m.flight && <p className="mt-2 text-[11.5px] text-muted">{t.progress.notStarted}</p>}
    </section>
  );
}

