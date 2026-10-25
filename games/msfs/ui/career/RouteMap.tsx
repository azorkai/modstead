// Rota haritası. Katmanlar: Natural Earth kara, göl ve sınırları (dünya görünümünde 1:50m, yakında 10°'lik 1:10m
// karolar; ikisi de ayrı parça olarak ilk gerektiğinde yüklenir), şehir adları, görünen alandaki havalimanları (gömülü
// veritabanından), koordinat ağı, büyük çember rotası, uçulan iz ve canlı uçak. Sürükleyerek kaydırılır; tıklandıktan
// sonra ya da Ctrl ile tekerlek yakınlaştırır (sayfa kaydırması haritaya takılmasın). Eşdikdörtgen izdüşüm, rotanın
// orta enleminin kosinüsüyle yatay düzeltilir. Etiketler önem sırasıyla yerleşir, çakışan atlanır.

import { memo, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { LocateFixed, Minus, Plus } from "lucide-react";
import clsx from "clsx";
import { useLang } from "@/lib/i18n";
import { careerApi } from "./api";
import { useCareerT } from "./i18n";
import { TILE, detailReady, loadDetail, loadPlaces, loadWorld, placesNow, tile, worldNow, type Layer } from "./map/geo";
import type { MapAirport, TrackPoint } from "./types";

export interface MapPoint {
  lat: number;
  lon: number;
  icao?: string;
}

const SEA = "color-mix(in oklab, var(--info) 11%, var(--bg))";
const LAND = "color-mix(in oklab, var(--fg) 8%, var(--surface-2))";
const COAST = "color-mix(in oklab, var(--fg) 30%, transparent)";
const BORDER = "color-mix(in oklab, var(--fg) 20%, transparent)";
const GRID = "color-mix(in oklab, var(--fg) 6%, transparent)";
const HALO = "color-mix(in oklab, var(--surface) 82%, transparent)";

/** Yakın görünüme (1:10m karolar) geçilen boylam genişliği. */
const DETAIL_SPAN = 30;

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;
const mod = (a: number, n: number) => ((a % n) + n) % n;

/** İki nokta arasındaki büyük çember (n parça). */
function greatCircle(a: MapPoint, b: MapPoint, n = 64): MapPoint[] {
  const [p1, l1, p2, l2] = [rad(a.lat), rad(a.lon), rad(b.lat), rad(b.lon)];
  const d = 2 * Math.asin(Math.sqrt(Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin((l2 - l1) / 2) ** 2));
  if (d < 1e-6) return [a, b];
  const out: MapPoint[] = [];
  for (let i = 0; i <= n; i++) {
    const f = i / n;
    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(p1) * Math.cos(l1) + B * Math.cos(p2) * Math.cos(l2);
    const y = A * Math.cos(p1) * Math.sin(l1) + B * Math.cos(p2) * Math.sin(l2);
    const z = A * Math.sin(p1) + B * Math.sin(p2);
    out.push({ lat: deg(Math.atan2(z, Math.sqrt(x * x + y * y))), lon: deg(Math.atan2(y, x)) });
  }
  return out;
}

/** Tarih değiştirme çizgisinde kopmasın: boylamlar ardışık olarak açılır. */
function unwrap(pts: MapPoint[]): MapPoint[] {
  const out: MapPoint[] = [];
  let prev: number | null = null;
  for (const p of pts) {
    let lon = p.lon;
    if (prev !== null) {
      while (lon - prev > 180) lon -= 360;
      while (lon - prev < -180) lon += 360;
    }
    out.push({ ...p, lon });
    prev = lon;
  }
  return out;
}

/** Ekranda ~`target` aralık bırakan yuvarlak adım. */
function niceStep(span: number, target: number, steps: number[]): number {
  return steps.find((s) => span / s <= target) ?? steps[steps.length - 1];
}

/** Görünüm: izdüşüm biriminde merkez ve genişlik (x = (boylam + 180)·k, y = 90 − enlem). */
interface View {
  cx: number;
  cy: number;
  w: number;
}

const detailNow = () => (detailReady() ? true : null);

function useLoaded<T>(now: () => T | null, load: () => Promise<unknown>, enabled = true): T | null {
  const [, bump] = useState(0);
  useEffect(() => {
    if (!enabled || now()) return;
    let alive = true;
    void load().then(() => alive && bump((n) => n + 1));
    return () => {
      alive = false;
    };
  }, [enabled, now, load]);
  return now();
}

export function RouteMap({
  from,
  to,
  track,
  current,
  heading,
  className,
  aspect = 2.2,
  labels = true,
}: {
  from: MapPoint | null;
  to: MapPoint | null;
  track?: TrackPoint[];
  current?: MapPoint | null;
  heading?: number;
  className?: string;
  /** genişlik / yükseklik (ölçülene kadar) */
  aspect?: number;
  labels?: boolean;
}) {
  const t = useCareerT();
  const lang = useLang((s) => s.lang);
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 600, h: 600 / aspect });
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => e.contentRect.width > 0 && setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Rota geometrisi ve izdüşüm katsayısı yalnızca uçlara bağlıdır; kaydırırken değişmez.
  const route = useMemo(() => {
    if (!from) return null;
    const pts = to ? unwrap(greatCircle(from, to)) : [from];
    const lats = pts.map((p) => p.lat);
    const k = Math.max(0.25, Math.cos(rad((Math.min(...lats) + Math.max(...lats)) / 2)));
    const base = pts[0].lon;
    const fix = (lon: number) => base + mod(lon - base + 180, 360) - 180;
    const P = (lat: number, lon: number) => [(lon + 180) * k, 90 - lat] as const;
    const line = (ps: MapPoint[]) => ps.map((p, i) => `${i ? "L" : "M"}${P(p.lat, p.lon)[0].toFixed(4)} ${P(p.lat, p.lon)[1].toFixed(4)}`).join("");
    return { pts, k, fix, P, path: line(pts), line };
  }, [from, to]);

  const flown = useMemo(() => {
    if (!route || !track || track.length < 2) return null;
    return route.line(unwrap(track.map(([lat, lon]) => ({ lat, lon: route.fix(lon) }))));
  }, [route, track]);

  // Rotaya (ve uçulan ize, uçağa) sığan görünüm.
  const fit = useMemo<View | null>(() => {
    if (!route) return null;
    const { k } = route;
    const all = [...route.pts, ...(track ?? []).map(([lat, lon]) => ({ lat, lon: route.fix(lon) })), ...(current ? [{ lat: current.lat, lon: route.fix(current.lon) }] : [])];
    let [minLat, maxLat, minLon, maxLon] = [90, -90, 1e9, -1e9];
    for (const p of all) {
      minLat = Math.min(minLat, p.lat);
      maxLat = Math.max(maxLat, p.lat);
      minLon = Math.min(minLon, p.lon);
      maxLon = Math.max(maxLon, p.lon);
    }
    const ratio = size.w / size.h;
    // Kısa uçuşlarda da çevre görünsün.
    let w = Math.max((maxLon - minLon) * k, 0.6 * k) * 1.45;
    let h = Math.max(maxLat - minLat, 0.3) * 1.6;
    if (w / h > ratio) h = w / ratio;
    else w = h * ratio;
    return { cx: ((minLon + maxLon) / 2 + 180) * k, cy: 90 - (minLat + maxLat) / 2, w };
  }, [route, track, current, size.w, size.h]);

  // Kullanıcı kaydırınca ya da yakınlaştırınca rotayı izlemeyi bırakır; "sığdır" ile döner.
  const [userView, setUserView] = useState<View | null>(null);
  const fitKey = from && to ? `${from.lat},${from.lon},${to.lat},${to.lon}` : from ? `${from.lat},${from.lon}` : "";
  useEffect(() => setUserView(null), [fitKey]);
  const view = userView ?? fit;

  const world = useLoaded(worldNow, loadWorld);
  const lonSpan = view && route ? view.w / route.k : 360;
  const wantDetail = lonSpan <= DETAIL_SPAN;
  const detail = useLoaded(detailNow, loadDetail, wantDetail);
  const places = useLoaded(placesNow, loadPlaces);

  const u = view ? view.w / size.w : 1;
  const vb = view ? { x: view.cx - view.w / 2, y: view.cy - (view.w * size.h) / size.w / 2, w: view.w, h: (view.w * size.h) / size.w } : null;
  const k = route?.k ?? 1;
  // Görünen alan: x boylam + 180 (açılmış olabilir), y 90 − enlem.
  const area = vb ? { x0: vb.x / k, x1: (vb.x + vb.w) / k, y0: vb.y, y1: vb.y + vb.h } : null;
  const zoom = Math.log2(((360 / Math.max(lonSpan, 1e-6)) * size.w) / 256);

  // Havalimanları: kutu kaba ızgaraya yuvarlanır, kaydırmada sorgu her an yenilenmesin.
  const airportLevel = lonSpan > 14 ? 0 : lonSpan > 3.5 ? 1 : 2;
  const qbox = useMemo(() => {
    if (!area || lonSpan > 70) return null;
    const step = niceStep(lonSpan, 3, [0.25, 0.5, 1, 2, 5, 10, 20, 45]);
    const [south, north] = [90 - area.y1, 90 - area.y0];
    return {
      south: Math.floor(Math.max(-90, south) / step) * step,
      north: Math.ceil(Math.min(90, north) / step) * step,
      west: Math.floor((area.x0 - 180) / step) * step,
      east: Math.ceil((area.x1 - 180) / step) * step,
    };
  }, [area?.x0, area?.x1, area?.y0, area?.y1, lonSpan]); // eslint-disable-line react-hooks/exhaustive-deps
  const { data: airports } = useQuery({
    queryKey: ["msfs", "map-airports", qbox, airportLevel],
    queryFn: () => careerApi.mapAirports(qbox!, airportLevel),
    enabled: !!qbox,
    staleTime: Infinity,
    placeholderData: keepPreviousData,
  });

  // --- Etkileşim ---
  const drag = useRef<{ x: number; y: number; cx: number; cy: number; moved: boolean } | null>(null);
  const [active, setActive] = useState(false);
  const [hint, setHint] = useState(false);
  const viewRef = useRef(view);
  viewRef.current = view;
  const sizeRef = useRef(size);
  sizeRef.current = size;
  const kRef = useRef(k);
  kRef.current = k;

  const zoomAt = (px: number, py: number, factor: number) => {
    const v = viewRef.current;
    if (!v) return;
    const s = sizeRef.current;
    const kk = kRef.current;
    // En yakın ~0,1° (1:10m kıyının köşelenmeden durduğu sınır), en uzak bütün dünya.
    const w = Math.min(Math.max(v.w * factor, 0.1 * kk), 400 * kk);
    const [ou, nu] = [v.w / s.w, w / s.w];
    const [X, Y] = [v.cx - v.w / 2 + px * ou, v.cy - (s.h * ou) / 2 + py * ou];
    setUserView({ cx: X - px * nu + w / 2, cy: Math.min(Math.max(Y - py * nu + (s.h * nu) / 2, -20), 200), w });
  };
  const zoomRef = useRef(zoomAt);
  zoomRef.current = zoomAt;

  const activeRef = useRef(active);
  activeRef.current = active;
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    let timer = 0;
    const onWheel = (e: WheelEvent) => {
      if (!activeRef.current && !e.ctrlKey) {
        setHint(true);
        clearTimeout(timer);
        timer = window.setTimeout(() => setHint(false), 1400);
        return;
      }
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomRef.current(e.clientX - r.left, e.clientY - r.top, Math.exp(e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0016)));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", onWheel);
      clearTimeout(timer);
    };
  }, []);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || !view || (e.target as HTMLElement).closest("button")) return;
    setActive(true);
    setHint(false);
    drag.current = { x: e.clientX, y: e.clientY, cx: view.cx, cy: view.cy, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || !view) return;
    const [dx, dy] = [e.clientX - d.x, e.clientY - d.y];
    if (!d.moved && Math.hypot(dx, dy) < 3) return;
    d.moved = true;
    setUserView({ cx: d.cx - dx * u, cy: Math.min(Math.max(d.cy - dy * u, -20), 200), w: view.w });
  };
  const endDrag = () => {
    drag.current = null;
  };

  // --- Katmanlar ---
  const layers = useMemo(() => {
    if (!area) return [];
    const out: { key: string; layer: Layer; dx: number }[] = [];
    if (wantDetail && detail) {
      for (let tx = Math.floor(area.x0 / TILE); tx <= Math.floor(area.x1 / TILE); tx++) {
        for (let ty = Math.max(0, Math.floor(area.y0 / TILE)); ty <= Math.min(180 / TILE - 1, Math.floor(area.y1 / TILE)); ty++) {
          const real = mod(tx, 360 / TILE);
          const l = tile(real, ty);
          if (l) out.push({ key: `${tx}_${ty}`, layer: l, dx: (tx - real) * TILE * k });
        }
      }
    } else if (world) {
      for (let s = Math.floor(area.x0 / 360); s <= Math.floor(area.x1 / 360); s++) out.push({ key: `w${s}`, layer: world, dx: s * 360 * k });
    }
    return out;
  }, [area?.x0, area?.x1, area?.y0, area?.y1, wantDetail, detail, world, k]); // eslint-disable-line react-hooks/exhaustive-deps

  // Boşken de aynı sarmalayıcı: ölçüm ve tekerlek dinleyicisi ilk çizimde bağlanır.
  if (!route || !vb || !area) return <div ref={box} className={clsx("relative overflow-hidden", className)} style={{ background: SEA }} />;

  const P = route.P;
  const nearView = (lon: number) => {
    const c = (area.x0 + area.x1) / 2 - 180;
    return c + mod(lon - c + 180, 360) - 180;
  };
  const toPx = (x: number, y: number) => [(x - vb.x) / u, (y - vb.y) / u] as const;

  // Etiket yerleşimi (piksel uzayında, önem sırasıyla).
  const taken: [number, number, number, number][] = [];
  const free = (b: [number, number, number, number]) => b[0] >= 0 && b[2] <= size.w && b[1] >= 0 && b[3] <= size.h && !taken.some((o) => b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1]);
  const reserve = (px: number, py: number, r: number) => taken.push([px - r, py - r, px + r, py + r]);
  // Haritanın üstündekiler: sol üstte sayfanın etiketleri, sol altta ölçek, sağ altta düğmeler.
  taken.push([0, 0, 170, 40], [0, size.h - 40, 150, size.h], [size.w - 44, size.h - 104, size.w, size.h]);
  /** Etiketi sağa, olmazsa sola koymayı dener; yerleştiyse metnin çapa noktasını döndürür. */
  const place = (px: number, py: number, text: string, font: number, mono: boolean, gap: number) => {
    const tw = text.length * font * (mono ? 0.62 : 0.56) + 4;
    const th = font * 1.25;
    for (const side of [1, -1]) {
      const x0 = side > 0 ? px + gap : px - gap - tw;
      const b: [number, number, number, number] = [x0, py - th / 2, x0 + tw, py + th / 2];
      if (free(b)) {
        taken.push(b);
        return { x: side > 0 ? px + gap + 2 : px - gap - 2, anchor: side > 0 ? "start" : "end" } as const;
      }
    }
    return null;
  };

  const a = P(route.pts[0].lat, route.pts[0].lon);
  const b = to ? P(route.pts[route.pts.length - 1].lat, route.pts[route.pts.length - 1].lon) : null;
  const cur = current ? P(current.lat, route.fix(current.lon)) : null;
  for (const p of [a, b, cur]) if (p) reserve(...toPx(p[0], p[1]), 12);
  for (const p of [a, b]) if (p && labels) taken.push([toPx(p[0], p[1])[0] - 24, toPx(p[0], p[1])[1] - 30, toPx(p[0], p[1])[0] + 24, toPx(p[0], p[1])[1] - 12]);

  const inView = (x: number, y: number, pad = 0) => x >= vb.x - pad && x <= vb.x + vb.w + pad && y >= vb.y - pad && y <= vb.y + vb.h + pad;
  const skip = new Set([from?.icao, to?.icao].filter(Boolean));

  // Havalimanları: önce simgeler (hepsi), etiket yer varsa.
  const ports = (airports ?? [])
    .filter((ap) => !skip.has(ap.icao))
    .map((ap) => ({ ap, p: P(ap.lat, nearView(ap.lon)) }))
    .filter(({ p }) => inView(p[0], p[1], u * 10));
  const showPortLabel = (s: MapAirport["size"]) => s === "large" || (s === "medium" && lonSpan < 7) || lonSpan < 1.4;
  const portLabels = new Map<string, { x: number; anchor: "start" | "end" }>();
  for (const { ap, p } of ports) {
    if (!showPortLabel(ap.size)) continue;
    const [px, py] = toPx(p[0], p[1]);
    const at = place(px, py, ap.icao, 10, true, 6);
    if (at) portLabels.set(ap.icao, { x: vb.x + at.x * u, anchor: at.anchor });
  }
  for (const { p } of ports) reserve(...toPx(p[0], p[1]), 3);

  // Şehirler: Natural Earth'ün yakınlık eşiğine göre.
  const cityLabels: { x: number; y: number; lx: number; anchor: "start" | "end"; name: string; capital: boolean }[] = [];
  if (places) {
    for (const pl of places) {
      if (pl.minZoom > zoom + 0.7) break;
      const [x, y] = P(pl.lat, nearView(pl.lon));
      if (!inView(x, y)) continue;
      const [px, py] = toPx(x, y);
      const name = lang === "tr" ? pl.tr : pl.en;
      const at = place(px, py, name, pl.capital ? 11.5 : 11, false, 5);
      if (at) cityLabels.push({ x, y, lx: vb.x + at.x * u, anchor: at.anchor, name, capital: pl.capital });
      if (cityLabels.length > 40) break;
    }
  }

  // Koordinat ağı.
  const gstep = niceStep(lonSpan, 6, [0.25, 0.5, 1, 2, 5, 10, 15, 30, 60]);
  let grid = "";
  const gridLabels: { x: number; y: number; text: string; anchor: "start" | "middle" }[] = [];
  const [cN, cS, cE, cW] = t.map.compass;
  for (let lon = Math.ceil((area.x0 - 180) / gstep) * gstep; lon <= area.x1 - 180; lon += gstep) {
    const x = (lon + 180) * k;
    grid += `M${x} ${vb.y}V${vb.y + vb.h}`;
    const L = mod(lon + 180, 360) - 180;
    gridLabels.push({ x, y: vb.y + u * 11, text: `${+Math.abs(L).toFixed(2)}°${L < 0 ? cW : L > 0 ? cE : ""}`, anchor: "middle" });
  }
  for (let lat = Math.ceil((90 - area.y1) / gstep) * gstep; lat <= 90 - area.y0; lat += gstep) {
    const y = 90 - lat;
    grid += `M${vb.x} ${y}H${vb.x + vb.w}`;
    gridLabels.push({ x: vb.x + u * 5, y: y - u * 3, text: `${+Math.abs(lat).toFixed(2)}°${lat < 0 ? cS : lat > 0 ? cN : ""}`, anchor: "start" });
  }

  // Ölçek: 1 izdüşüm birimi ≈ 60 nm (enlemde; boylam k ile düzeltildi).
  const nmPerPx = u * 60;
  const scaleNm = [5000, 2000, 1000, 500, 250, 200, 100, 50, 25, 20, 10, 5, 2, 1, 0.5].find((s) => s / nmPerPx <= 120) ?? 0.5;
  const scalePx = scaleNm / nmPerPx;

  return (
    <div
      ref={box}
      className={clsx("relative touch-none select-none overflow-hidden", drag.current?.moved ? "cursor-grabbing" : "cursor-grab", className)}
      style={{ background: SEA }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onPointerLeave={() => setActive(false)}
      onDoubleClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        zoomAt(e.clientX - r.left, e.clientY - r.top, 0.5);
      }}
    >
      <svg viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} className="absolute inset-0 block size-full" role="img" aria-label={from && to ? `${from.icao ?? ""} → ${to.icao ?? ""}` : undefined}>
        <path d={grid} stroke={GRID} strokeWidth={1} vectorEffect="non-scaling-stroke" fill="none" />
        <Geography layers={layers} k={k} />
        <g style={{ fontFamily: "var(--font-mono)" }} fontSize={u * 9} fill="var(--muted)">
          {gridLabels.map((g) => (
            <text key={`${g.text}${g.x}${g.y}`} x={g.x} y={g.y} textAnchor={g.anchor}>
              {g.text}
            </text>
          ))}
        </g>

        {/* Şehirler */}
        <g fontSize={u * 11} style={{ fontFamily: "var(--font-sans)" }}>
          {cityLabels.map((c) => (
            <g key={`${c.name}${c.x}`}>
              <circle cx={c.x} cy={c.y} r={u * (c.capital ? 2.4 : 1.8)} fill="var(--fg-2)" fillOpacity={0.75} />
              <text x={c.lx} y={c.y} dy="0.35em" textAnchor={c.anchor} fill="var(--fg-2)" fontWeight={c.capital ? 600 : 500} stroke={HALO} strokeWidth={u * 3} paintOrder="stroke" strokeLinejoin="round">
                {c.name}
              </text>
            </g>
          ))}
        </g>

        {/* Havalimanları */}
        <g>
          {ports.map(({ ap, p }) => (
            <AirportMark key={ap.icao} ap={ap} x={p[0]} y={p[1]} u={u} runway={lonSpan < 8} label={portLabels.get(ap.icao)} />
          ))}
        </g>

        {/* Rota, iz, uçlar, uçak */}
        <path d={route.path} fill="none" stroke="var(--accent)" strokeOpacity={flown ? 0.45 : 0.95} strokeWidth={2.2} vectorEffect="non-scaling-stroke" strokeDasharray="7 5" strokeLinecap="round" />
        {flown && <path d={flown} fill="none" stroke="var(--accent)" strokeWidth={3} vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />}
        <Marker x={a[0]} y={a[1]} u={u} label={labels ? from?.icao : undefined} kind="from" />
        {b && <Marker x={b[0]} y={b[1]} u={u} label={labels ? to?.icao : undefined} kind="to" />}
        {cur && (
          <g transform={`translate(${cur[0]} ${cur[1]}) rotate(${heading ?? 0}) scale(${u * 1.15})`}>
            <path d="M0 -9 L2 -2 L9 2 L9 4 L2 2 L1.5 7 L4 9 L4 10.5 L0 9.5 L-4 10.5 L-4 9 L-1.5 7 L-2 2 L-9 4 L-9 2 L-2 -2 Z" fill="var(--accent)" stroke="var(--bg)" strokeWidth={1} />
          </g>
        )}
      </svg>

      {/* Ölçek */}
      <div className="msfs-on-image pointer-events-none absolute bottom-2.5 left-2.5 flex items-center gap-2 rounded-md px-2 py-1 font-mono text-[10.5px] font-semibold text-white">
        <span className="h-[5px] border-x-[1.5px] border-b-[1.5px] border-white/85" style={{ width: scalePx }} />
        {scaleNm} nm
      </div>

      {/* Yakınlık */}
      <div className="absolute bottom-2.5 right-2.5 flex flex-col overflow-hidden rounded-lg msfs-on-image text-white">
        {(
          [
            [t.map.zoomIn, <Plus key="p" className="size-3.5" />, () => zoomAt(size.w / 2, size.h / 2, 0.5)],
            [t.map.zoomOut, <Minus key="m" className="size-3.5" />, () => zoomAt(size.w / 2, size.h / 2, 2)],
            [t.map.fit, <LocateFixed key="f" className="size-3.5" />, () => setUserView(null)],
          ] as const
        ).map(([label, icon, run], i) => (
          <button
            key={label}
            type="button"
            title={label}
            aria-label={label}
            onClick={run}
            disabled={i === 2 && !userView}
            className={clsx("flex size-7 items-center justify-center transition-colors hover:bg-white/15 disabled:opacity-40", i > 0 && "border-t border-white/15")}
          >
            {icon}
          </button>
        ))}
      </div>

      <div
        className={clsx(
          "msfs-on-image pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full px-3 py-1.5 text-[12px] font-medium text-white transition-opacity duration-300",
          hint ? "opacity-100" : "opacity-0",
        )}
      >
        {t.map.wheelHint}
      </div>
    </div>
  );
}

/** Kara, göl, sınır ve kıyı; her katman ayrı geçişte (karo dikişinde kıyı çizgisi örtülmesin). */
const Geography = memo(function Geography({ layers, k }: { layers: { key: string; layer: Layer; dx: number }[]; k: number }) {
  const g = (dx: number) => `translate(${dx} 0) scale(${k} 1)`;
  return (
    <g>
      {layers.map(({ key, layer, dx }) => (
        // Dolgu kendi renginde ince çizilir: karolar arasında kenar yumuşatma çizgisi kalmasın.
        <path key={key} d={layer.land} transform={g(dx)} fill={LAND} stroke={LAND} strokeWidth={0.8} vectorEffect="non-scaling-stroke" />
      ))}
      {layers.map(({ key, layer, dx }) => layer.lakes && <path key={key} d={layer.lakes} transform={g(dx)} fill={SEA} stroke={SEA} strokeWidth={0.8} vectorEffect="non-scaling-stroke" />)}
      {layers.map(({ key, layer, dx }) => layer.borders && <path key={key} d={layer.borders} transform={g(dx)} fill="none" stroke={BORDER} strokeWidth={0.9} strokeDasharray="5 3" vectorEffect="non-scaling-stroke" />)}
      {layers.map(({ key, layer, dx }) => (
        <path key={key} d={layer.coast} transform={g(dx)} fill="none" stroke={COAST} strokeWidth={0.9} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      ))}
    </g>
  );
});

/** Havalimanı simgesi: büyüklüğe göre halka/nokta; yakında en uzun pistin yönünde bir çizgi. */
function AirportMark({ ap, x, y, u, runway, label }: { ap: MapAirport; x: number; y: number; u: number; runway: boolean; label?: { x: number; anchor: "start" | "end" } }) {
  const r = ap.size === "large" ? 3.4 : ap.size === "medium" ? 2.6 : 1.7;
  const hdg = parseInt(ap.runway, 10) * 10;
  const len = ap.size === "large" ? 10 : 7;
  return (
    <g>
      <title>{`${ap.icao} · ${ap.name}`}</title>
      {runway && ap.size !== "small" && ap.size !== "seaplane" && Number.isFinite(hdg) && (
        <line
          x1={x - Math.sin(rad(hdg)) * u * len}
          y1={y + Math.cos(rad(hdg)) * u * len}
          x2={x + Math.sin(rad(hdg)) * u * len}
          y2={y - Math.cos(rad(hdg)) * u * len}
          stroke="var(--fg-2)"
          strokeOpacity={0.7}
          strokeWidth={u * 2}
          strokeLinecap="round"
        />
      )}
      <circle cx={x} cy={y} r={u * r} fill={ap.size === "large" ? "var(--surface)" : "var(--fg-2)"} fillOpacity={ap.size === "small" || ap.size === "seaplane" ? 0.55 : 0.9} stroke={ap.size === "large" ? "var(--fg-2)" : "none"} strokeWidth={u * 1.5} />
      {label && (
        <text x={label.x} y={y} dy="0.35em" textAnchor={label.anchor} fontSize={u * 10} fontWeight={600} fill="var(--fg-2)" stroke={HALO} strokeWidth={u * 3} paintOrder="stroke" style={{ fontFamily: "var(--font-mono)" }}>
          {ap.icao}
        </text>
      )}
    </g>
  );
}

function Marker({ x, y, u, label, kind }: { x: number; y: number; u: number; label?: string; kind: "from" | "to" }) {
  return (
    <g>
      <circle cx={x} cy={y} r={u * 6} fill="var(--bg)" stroke="var(--accent)" strokeWidth={u * 2.2} />
      {kind === "to" && <circle cx={x} cy={y} r={u * 2.6} fill="var(--accent)" />}
      {label && (
        <text x={x} y={y - u * 11} textAnchor="middle" fontSize={u * 13} fontWeight={700} fill="var(--fg)" stroke="var(--bg)" strokeWidth={u * 3.2} paintOrder="stroke" style={{ fontFamily: "var(--font-mono)" }}>
          {label}
        </text>
      )}
    </g>
  );
}
