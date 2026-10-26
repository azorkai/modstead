// Rota haritası, havacılık haritası görünümünde. Web Mercator izdüşümü (raster karolarla hizalı). Katmanlar, alttan:
// kara zemini (vektör), raster karo (varsayılan "Harita"da Natural Earth II gölgeli kabartma, yaklaştıkça hafif bir
// renge iner; "Uydu"da Sentinel-2 görüntüsü), keskin deniz ve göller, yerleşim alanları, akarsular, yollar, sınırlar,
// kıyı çizgisi, koordinat ağı, gerçek ölçekli pistler (yakında), şehir adları, havalimanı simgeleri, büyük çember
// rotası (yön okları), uçulan iz, uçak. Vektör veri Natural Earth'ten (dünya görünümünde 1:50m, yakında 10°'lik 1:10m
// karolar), pistler OurAirports'tan; her biri ayrı parça olarak ilk gerektiğinde yüklenir. Karo sunucusu yoksa ya da
// karolar gelmiyorsa harita yalnızca vektörle çizilir. Sürükleyerek (dokunmatikte iki parmakla kıstırarak da)
// kaydırılır; tıklandıktan sonra ya da Ctrl ile tekerlek yakınlaştırır (sayfa kaydırması haritaya takılmasın).
// Etiketler önem sırasıyla yerleşir, çakışan atlanır. Uçuş ekranı için isteğe bağlı: uçağı izleme, "uçuş yönü
// yukarı", 60 fps yumuşatılmış uçak (`smooth`), mesafe halkaları, yedek meydan, dokunmatik düğmeler ve ek çizim katmanı.

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Crosshair, LocateFixed, Map as MapIcon, Minus, Navigation2, Plus, Satellite, WifiOff } from "lucide-react";
import clsx from "clsx";
import { useLang } from "@/lib/i18n";
import { careerApi } from "./api";
import { useCareerT } from "./i18n";
import { TILE, detail, loadPlaces, loadWorld, placesNow, rivers, roads, runways, urban, worldNow, type Layer, type Rivers, type Roads, type Tiled } from "./map/geo";
import { latOf, mercY, nmUnits, zoomOf } from "./map/merc";
import { RasterLayer, setMapStyle, useMapStyle, useTileSource, type Area } from "./map/raster";
import { AirportMark, EndMarker, PLANE, RunwayLayer, chevrons, chipSize, planeAt, runwayGeom, textWidth, type UpAttrs } from "./map/symbols";
import "./map/map.css";
import type { MapAirport, TrackPoint } from "./types";

export interface MapPoint {
  lat: number;
  lon: number;
  icao?: string;
}

/** Uçağın yumuşatılmış anlık konumu (`smooth` her karede sorar). */
export interface SmoothPos {
  lat: number;
  lon: number;
  heading: number;
  /** Yere göre iz; yoksa burun yönü kullanılır. */
  track?: number;
}

/** `extra` çiziminin yardımcıları (izdüşüm biriminde). */
export interface MapCtx {
  /** Enlem/boylam → SVG koordinatı (boylam rotaya göre açılır). */
  P: (lat: number, lon: number) => readonly [number, number];
  /** Bir ekran pikselinin izdüşüm birimi karşılığı. */
  u: number;
  /** 1 nm'nin izdüşüm birimi karşılığı (Mercator'da enleme bağlıdır; görünümün ortasındaki değer). */
  nm: number;
  /** "Uçuş yönü yukarı"da yazıyı çapa noktasında dik tutan öznitelikler. */
  up: (x: number, y: number) => UpAttrs;
}

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;
const mod = (a: number, n: number) => ((a % n) + n) % n;

/** En yakın harita yakınlığı (Z'de bir karo 256 px). */
const MAX_ZOOM = 14.5;

/** Canlı uçakta harita SVG'sinin kenar payı (px): iki React çizimi arasındaki kayma ve küçük dönüş bu payın içinde
 *  CSS dönüşümüyle yapılır; pay tükenmeye yaklaşınca harita yeniden çizilir. */
const DRIFT_PX = 112;
/** Bu kadar dereceden fazla dönünce harita (ve dik tutulan yazılar) yeniden çizilir. */
const DRIFT_DEG = 3;

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

/** Görünüm: izdüşüm biriminde merkez ve genişlik (x = boylam + 180, y Mercator; bkz. map/merc.ts). */
interface View {
  cx: number;
  cy: number;
  w: number;
}

/** Ayrı parçadaki bir veri katmanını gerektiğinde yükler; yüklenince yeniden çizdirir. */
function useReady(load: () => Promise<unknown>, ready: () => boolean, enabled = true): boolean {
  const [, bump] = useState(0);
  useEffect(() => {
    if (!enabled || ready()) return;
    let alive = true;
    void load().then(() => alive && bump((n) => n + 1));
    return () => {
      alive = false;
    };
  }, [enabled, load, ready]);
  return ready();
}

const worldReady = () => worldNow() !== null;
const placesReady = () => placesNow() !== null;

/** Açık tema mı (uçuş ekranında tema sayfanın içinden değişebilir). */
const subscribeTheme = (f: () => void) => {
  const mo = new MutationObserver(f);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => mo.disconnect();
};
const isLight = () => document.documentElement.dataset.theme === "light";

interface TileRange {
  tx0: number;
  tx1: number;
  ty0: number;
  ty1: number;
}

/** Görünen 10°'lik karolar (dünya kopyaları açılmış boylamla). */
function collect<T>(t: Tiled<T>, r: TileRange | null, on: boolean): { key: string; v: T; dx: number }[] {
  const out: { key: string; v: T; dx: number }[] = [];
  if (!r || !on || !t.ready()) return out;
  for (let tx = r.tx0; tx <= r.tx1; tx++) {
    for (let ty = r.ty0; ty <= r.ty1; ty++) {
      const real = mod(tx, 360 / TILE);
      const v = t.get(real, ty);
      if (v) out.push({ key: `${tx}_${ty}`, v, dx: (tx - real) * TILE });
    }
  }
  return out;
}

type ButtonId = "in" | "out" | "follow" | "orient" | "fit";

export function RouteMap({
  from,
  to,
  track,
  current,
  heading,
  className,
  aspect = 2.2,
  labels = true,
  follow = false,
  onFollowChange,
  trackUp = false,
  onTrackUpChange,
  smooth,
  alternate,
  rings = false,
  touch = false,
  extra,
  topRightInset,
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
  /** Uçağı ortada tutar (yakınlık kullanıcıda kalır). Sürükleyince `onFollowChange(false)` çağrılır. */
  follow?: boolean;
  onFollowChange?: (on: boolean) => void;
  /** Harita uçağın izine göre döner: yukarısı uçuş yönüdür. */
  trackUp?: boolean;
  onTrackUpChange?: (on: boolean) => void;
  /** Her karede uçağın yumuşatılmış konumunu verir; verilirse uçak (izlemede harita da) 60 fps kayar. `current` yoksa uçak çizilmez. */
  smooth?: () => SmoothPos | null;
  /** Yedek meydan (kesik halka). */
  alternate?: MapPoint | null;
  /** Uçağın çevresinde, yakınlığa göre seçilen iki mesafe halkası. */
  rings?: boolean;
  /** Dokunmatik ve tam sayfa kullanım: 44 px düğmeler, tekerlek tıklamadan yakınlaştırır. */
  touch?: boolean;
  /** Haritanın üstüne ek çizim (görev hedefleri vb.); rotanın altında kalır. */
  extra?: (ctx: MapCtx) => ReactNode;
  /** Sayfanın sağ üst köşeye koyduğu öğenin boyu (px, [genişlik, yükseklik]); etiketler oraya yerleşmez. */
  topRightInset?: [number, number];
}) {
  const t = useCareerT();
  const lang = useLang((s) => s.lang);
  const light = useSyncExternalStore(subscribeTheme, isLight);
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 600, h: 600 / aspect });
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => e.contentRect.width > 0 && setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Rota geometrisi yalnızca uçlara bağlıdır; kaydırırken değişmez.
  const route = useMemo(() => {
    if (!from) return null;
    const pts = to ? unwrap(greatCircle(from, to)) : [from];
    const base = pts[0].lon;
    const fix = (lon: number) => base + mod(lon - base + 180, 360) - 180;
    const P = (lat: number, lon: number) => [lon + 180, mercY(lat)] as const;
    const proj = (ps: MapPoint[]) => ps.map((p) => P(p.lat, p.lon));
    const line = (ps: MapPoint[]) => proj(ps).map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(5)} ${y.toFixed(5)}`).join("");
    return { pts, xy: proj(pts), fix, P, path: line(pts), line };
  }, [from?.lat, from?.lon, to?.lat, to?.lon]); // eslint-disable-line react-hooks/exhaustive-deps

  const flown = useMemo(() => {
    if (!route || !track || track.length < 2) return null;
    return route.line(unwrap(track.map(([lat, lon]) => ({ lat, lon: route.fix(lon) }))));
  }, [route, track]);

  // Rotaya (ve uçulan ize, uçağa) sığan görünüm.
  const fit = useMemo<View | null>(() => {
    if (!route) return null;
    const all = [...route.pts, ...(track ?? []).map(([lat, lon]) => ({ lat, lon: route.fix(lon) })), ...(current ? [{ lat: current.lat, lon: route.fix(current.lon) }] : [])];
    let [minX, maxX, minY, maxY] = [1e9, -1e9, 1e9, -1e9];
    let [minLat, maxLat] = [90, -90];
    for (const p of all) {
      const [x, y] = route.P(p.lat, p.lon);
      [minX, maxX, minY, maxY] = [Math.min(minX, x), Math.max(maxX, x), Math.min(minY, y), Math.max(maxY, y)];
      [minLat, maxLat] = [Math.min(minLat, p.lat), Math.max(maxLat, p.lat)];
    }
    const ratio = size.w / size.h;
    const sec = 60 * nmUnits((minLat + maxLat) / 2);
    // Kısa uçuşlarda da çevre görünsün.
    let w = Math.max(maxX - minX, 0.6) * 1.45;
    let h = Math.max(maxY - minY, 0.3 * sec) * 1.6;
    if (w / h > ratio) h = w / ratio;
    else w = h * ratio;
    return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, w };
  }, [route, track, current, size.w, size.h]);

  // Uçağın bu çizimdeki konumu: yumuşatıcı varsa ondan (kare döngüsü de aynısını sorar), yoksa son örnekten.
  const smoothRef = useRef(smooth);
  smoothRef.current = smooth;
  const pos: SmoothPos | null = current ? (smooth?.() ?? { lat: current.lat, lon: current.lon, heading: heading ?? 0 }) : null;

  // Kullanıcı kaydırınca ya da yakınlaştırınca rotayı izlemeyi bırakır; "sığdır" ile döner.
  const [userView, setUserView] = useState<View | null>(null);
  const fitKey = from && to ? `${from.lat},${from.lon},${to.lat},${to.lon}` : from ? `${from.lat},${from.lon}` : "";
  useEffect(() => setUserView(null), [fitKey]);
  // İzleme açılınca yakınlık sabitlenir (iz uzadıkça kaymasın); uzun rotada kısa kenar ≈120 nm.
  useEffect(() => {
    if (!follow || !fit) return;
    const lat = pos?.lat ?? from?.lat ?? 0;
    setUserView((v) => v ?? { ...fit, w: Math.min(fit.w, 120 * nmUnits(lat) * Math.max(1, size.w / size.h)) });
  }, [follow, !!fit, fitKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const base = userView ?? fit;
  const followAt = follow && pos && route ? route.P(pos.lat, route.fix(pos.lon)) : null;
  let view = base && followAt ? { cx: followAt[0], cy: followAt[1], w: base.w } : base;
  // "Uçuş yönü yukarı": içerik görünüm merkezinde döner, yazılar dik kalır.
  let rot = trackUp && pos ? (pos.track ?? pos.heading) : 0;

  // Canlı uçakta harita her karede yeniden boyanmaz: harita SVG'si kenarlarda payla çizilir; uçağın son çizimden bu
  // yana kayması (izleme) ve küçük dönüşü (uçuş yönü yukarı) CSS dönüşümüyle yapılır (bileşik katman). Çizimin
  // merkezi ve dönüşü "yapışkandır": pay tükenene ya da uçak belirgin dönene kadar aynı kalır, böylece sayfanın
  // saniyelik yenilemeleri haritayı yeniden boyatmaz. Uçak, halkalar ve uçulan iz ayrı, küçük bir SVG'de her karede
  // güncellenir.
  const animated = !!smooth;
  const margin = animated && (follow || trackUp) ? DRIFT_PX : 0;
  const sticky = useRef<{ cx: number; cy: number; w: number; rot: number; key: string } | null>(null);
  if (margin && view) {
    const st = sticky.current;
    const key = `${follow}|${trackUp}|${size.w}|${size.h}`;
    const uu = view.w / size.w;
    const keep = st && st.key === key && st.w === view.w && Math.hypot(view.cx - st.cx, view.cy - st.cy) / uu < margin * 0.6 && Math.abs(mod(rot - st.rot + 180, 360) - 180) < DRIFT_DEG;
    if (keep) [view, rot] = [{ ...view, cx: st.cx, cy: st.cy }, st.rot];
    else sticky.current = { cx: view.cx, cy: view.cy, w: view.w, rot, key };
  } else sticky.current = null;
  const u = view ? view.w / size.w : 1;
  const zoom = zoomOf(u);
  const lonSpan = view ? view.w : 360;
  const vb = view ? { x: view.cx - view.w / 2, y: view.cy - (view.w * size.h) / size.w / 2, w: view.w, h: (view.w * size.h) / size.w } : null;
  const mvb = vb ? { x: vb.x - margin * u, y: vb.y - margin * u, w: vb.w + 2 * margin * u, h: vb.h + 2 * margin * u } : null;
  // Çizilen alan: x boylam + 180 (açılmış olabilir), y Mercator. Dönükken çizimi çevreleyen kare.
  const half = mvb ? Math.hypot(mvb.w, mvb.h) / 2 : 0;
  const area: Area | null =
    mvb && view
      ? rot
        ? { x0: view.cx - half, x1: view.cx + half, y0: view.cy - half, y1: view.cy + half }
        : { x0: mvb.x, x1: mvb.x + mvb.w, y0: mvb.y, y1: mvb.y + mvb.h }
      : null;

  // --- Görünüm biçimi: harita ya da uydu (uydu karoları gelmiyorsa harita) ---
  const src = useTileSource();
  const pref = useMapStyle();
  const satInfo = src?.layers.sat;
  const reliefInfo = src?.layers.relief;
  const wantSat = pref === "sat" && !!satInfo;
  const [satOk, setSatOk] = useState(true);
  const onSatHealth = useCallback((ok: boolean) => setSatOk(ok), []);
  const sat = wantSat && satOk;

  // --- Vektör veri (yakınlığa göre) ---
  const wantDetail = lonSpan <= 30;
  const world = useReady(loadWorld, worldReady);
  const detailOn = useReady(detail.load, detail.ready, wantDetail) && wantDetail;
  const riversOn = useReady(rivers.load, rivers.ready, !sat && lonSpan <= 60) && !sat && lonSpan <= 60;
  const urbanOn = useReady(urban.load, urban.ready, !sat && lonSpan <= 16) && !sat && lonSpan <= 16 && lonSpan >= 0.3;
  const roadsOn = useReady(roads.load, roads.ready, !sat && lonSpan <= 9) && !sat && lonSpan <= 9;
  const runwaysOn = useReady(runways.load, runways.ready, zoom >= 10.3) && zoom >= 10.3;
  const placesOn = useReady(loadPlaces, placesReady);

  const range: TileRange | null = area
    ? {
        tx0: Math.floor(area.x0 / TILE),
        tx1: Math.floor(area.x1 / TILE),
        ty0: Math.max(0, Math.min(17, Math.floor((90 - latOf(area.y0)) / TILE))),
        ty1: Math.max(0, Math.min(17, Math.floor((90 - latOf(area.y1)) / TILE))),
      }
    : null;
  const rangeKey = range ? `${range.tx0},${range.tx1},${range.ty0},${range.ty1}` : "";
  const worldCopies = area ? `${Math.floor(area.x0 / 360)},${Math.floor(area.x1 / 360)}` : "";

  const layers = useMemo(() => {
    if (!area) return [] as { key: string; v: Layer; dx: number }[];
    if (detailOn) return collect(detail, range, true);
    const w = worldNow();
    const out: { key: string; v: Layer; dx: number }[] = [];
    if (w) for (let s = Math.floor(area.x0 / 360); s <= Math.floor(area.x1 / 360); s++) out.push({ key: `w${s}`, v: w, dx: s * 360 });
    return out;
  }, [rangeKey, worldCopies, detailOn, world]); // eslint-disable-line react-hooks/exhaustive-deps
  const riverTiles = useMemo(() => collect<Rivers>(rivers, range, riversOn), [rangeKey, riversOn]); // eslint-disable-line react-hooks/exhaustive-deps
  const urbanTiles = useMemo(() => collect<string>(urban, range, urbanOn), [rangeKey, urbanOn]); // eslint-disable-line react-hooks/exhaustive-deps
  const roadTiles = useMemo(() => collect<Roads>(roads, range, roadsOn), [rangeKey, roadsOn]); // eslint-disable-line react-hooks/exhaustive-deps
  const runwayTiles = useMemo(() => collect(runways, range, runwaysOn), [rangeKey, runwaysOn]); // eslint-disable-line react-hooks/exhaustive-deps

  // Havalimanları: kutu kaba ızgaraya yuvarlanır, kaydırmada sorgu her an yenilenmesin.
  const airportLevel = lonSpan > 14 ? 0 : lonSpan > 3.5 ? 1 : 2;
  const qbox = useMemo(() => {
    if (!area || lonSpan > 70) return null;
    const step = niceStep(lonSpan, 3, [0.25, 0.5, 1, 2, 5, 10, 20, 45]);
    const [south, north] = [latOf(area.y1), latOf(area.y0)];
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
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const drag = useRef<{ x: number; y: number; cx: number; cy: number; moved: boolean } | null>(null);
  const pinch = useRef<{ d: number; mx: number; my: number } | null>(null);
  const [active, setActive] = useState(false);
  const [hint, setHint] = useState(false);
  // Etkileşimdeki görünüm değişiklikleri kare başına bir React çizimine toplanır (yüksek hızlı fare ve dokunmatik).
  const queued = useRef<View | null>(null);
  const queuedFrame = useRef(0);
  const viewRef = useRef(view);
  viewRef.current = queued.current ?? view;
  const sizeRef = useRef(size);
  sizeRef.current = size;
  const rotRef = useRef(rot);
  rotRef.current = rot;
  const followRef = useRef(follow);
  followRef.current = follow;
  const touchRef = useRef(touch);
  touchRef.current = touch;

  const setView = (v: View) => {
    viewRef.current = queued.current = v;
    queuedFrame.current ||= requestAnimationFrame(() => {
      queuedFrame.current = 0;
      const next = queued.current;
      queued.current = null;
      if (next) setUserView(next);
    });
  };
  useEffect(() => () => cancelAnimationFrame(queuedFrame.current), []);
  /** Ekrandaki bir kaymayı (piksel) dönmemiş harita yönüne çevirir. */
  const unrot = (dx: number, dy: number) => {
    const r = rad(rotRef.current);
    return [dx * Math.cos(r) - dy * Math.sin(r), dx * Math.sin(r) + dy * Math.cos(r)] as const;
  };
  const clampY = (cy: number) => Math.min(Math.max(cy, 0), 360);

  const zoomAt = (px: number, py: number, factor: number) => {
    const v = viewRef.current;
    if (!v) return;
    const s = sizeRef.current;
    // En yakın Z 14,5 (pistler ve uydu görüntüsü), en uzak bütün dünya.
    const w = Math.min(Math.max(v.w * factor, (360 / (256 * 2 ** MAX_ZOOM)) * s.w), 400);
    // İzlerken merkez uçakta kalır.
    if (followRef.current) return setView({ ...v, w });
    // İmlecin altındaki nokta yerinde kalır.
    const [ox, oy] = unrot(px - s.w / 2, py - s.h / 2);
    const [ou, nu] = [v.w / s.w, w / s.w];
    setView({ cx: v.cx + ox * (ou - nu), cy: clampY(v.cy + oy * (ou - nu)), w });
  };
  const zoomRef = useRef(zoomAt);
  zoomRef.current = zoomAt;
  const pan = (dx: number, dy: number) => {
    const v = viewRef.current;
    if (!v) return;
    const uu = v.w / sizeRef.current.w;
    const [mx, my] = unrot(dx, dy);
    setView({ cx: v.cx - mx * uu, cy: clampY(v.cy - my * uu), w: v.w });
  };

  const activeRef = useRef(active);
  activeRef.current = active;
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    let timer = 0;
    const onWheel = (e: WheelEvent) => {
      if (!activeRef.current && !e.ctrlKey && !touchRef.current) {
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

  const startDrag = (x: number, y: number, moved: boolean) => {
    const v = viewRef.current;
    drag.current = v ? { x, y, cx: v.cx, cy: v.cy, moved } : null;
  };
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if ((e.pointerType === "mouse" && e.button !== 0) || !viewRef.current || (e.target as HTMLElement).closest("button")) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    e.currentTarget.setPointerCapture(e.pointerId);
    setActive(true);
    setHint(false);
    if (pointers.current.size === 1) startDrag(e.clientX, e.clientY, false);
    else if (pointers.current.size === 2) {
      // İki parmak: kıstırarak yakınlaştırma (ve orta noktayla kaydırma).
      const [a, b] = [...pointers.current.values()];
      drag.current = null;
      pinch.current = { d: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
    }
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const p = pointers.current.get(e.pointerId);
    if (!p) return;
    p.x = e.clientX;
    p.y = e.clientY;
    const g = pinch.current;
    if (g && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
      const [mx, my] = [(a.x + b.x) / 2, (a.y + b.y) / 2];
      const r = e.currentTarget.getBoundingClientRect();
      if (!followRef.current) pan(mx - g.mx, my - g.my);
      zoomAt(mx - r.left, my - r.top, g.d / d);
      pinch.current = { d, mx, my };
      return;
    }
    const dr = drag.current;
    const v = viewRef.current;
    if (!dr || !v) return;
    const [dx, dy] = [e.clientX - dr.x, e.clientY - dr.y];
    if (!dr.moved && Math.hypot(dx, dy) < 3) return;
    if (!dr.moved && followRef.current) {
      // Sürükleyince izleme biter; harita bulunduğu yerden kayar.
      followRef.current = false;
      onFollowChange?.(false);
    }
    dr.moved = true;
    const uu = v.w / sizeRef.current.w;
    const [mx, my] = unrot(dx, dy);
    setView({ cx: dr.cx - mx * uu, cy: clampY(dr.cy - my * uu), w: v.w });
  };
  const endPointer = (e: ReactPointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId);
    if (pinch.current && pointers.current.size < 2) {
      pinch.current = null;
      // Kalan parmakla kaydırma sürer (izlerken kaydırma yok).
      const [rest] = [...pointers.current.values()];
      if (rest && !followRef.current) startDrag(rest.x, rest.y, true);
      else drag.current = null;
      return;
    }
    if (pointers.current.size === 0) drag.current = null;
  };

  // --- Kare döngüsü: yumuşatılmış uçak, izleme ve dönüş React çizimini beklemeden güncellenir ---
  const mapRef = useRef<SVGSVGElement>(null);
  const liveRef = useRef<SVGSVGElement>(null);
  const liveContentRef = useRef<SVGGElement>(null);
  const planeRef = useRef<SVGGElement>(null);
  const ringRef = useRef<SVGGElement>(null);
  const tailRef = useRef<SVGLineElement>(null);
  const northRef = useRef<HTMLSpanElement>(null);
  const planeScale = touch ? 1.6 : 1.15;
  type Frame = {
    P: (lat: number, lon: number) => readonly [number, number];
    fix: (lon: number) => number;
    u: number;
    w: number;
    h: number;
    cx: number;
    cy: number;
    follow: boolean;
    trackUp: boolean;
    /** Çizimdeki dönüş ve harita payı. */
    rot: number;
    margin: number;
  };
  const frame = useRef<Frame | null>(null);
  const nextFrame: Frame | null = route && vb && view && pos ? { P: route.P, fix: route.fix, u, w: vb.w, h: vb.h, cx: view.cx, cy: view.cy, follow, trackUp: !!rot, rot, margin } : null;
  // Pay tükenmeye yaklaşınca (ya da uçak çok döndüyse) harita yeniden çizilir.
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  const redrawing = useRef(false);
  /** Uçağın o anki konumunu canlı katmana ve haritanın CSS dönüşümüne uygular (her karede ve her çizimden hemen sonra:
   *  yeni çizimin değerleriyle dönüşüm boyamadan önce düzelir). */
  const apply = useRef(() => {});
  apply.current = () => {
    const f = frame.current;
    const s = f ? smoothRef.current?.() : null;
    if (!f || !s) {
      if (mapRef.current) mapRef.current.style.transform = "";
      return;
    }
    const [x, y] = f.P(s.lat, f.fix(s.lon));
    planeRef.current?.setAttribute("transform", planeAt(x, y, s.heading, f.u, planeScale));
    ringRef.current?.setAttribute("transform", `translate(${x} ${y})`);
    tailRef.current?.setAttribute("x2", String(x));
    tailRef.current?.setAttribute("y2", String(y));
    let [cx, cy] = [f.cx, f.cy];
    if (f.follow && followRef.current) {
      [cx, cy] = [x, y];
      liveRef.current?.setAttribute("viewBox", `${x - f.w / 2} ${y - f.h / 2} ${f.w} ${f.h}`);
    }
    const r = f.trackUp ? (s.track ?? s.heading) : 0;
    if (f.trackUp) {
      liveContentRef.current?.setAttribute("transform", `rotate(${-r} ${cx} ${cy})`);
      liveRef.current?.querySelectorAll<SVGElement>("[data-up]").forEach((el) => {
        const [ax, ay] = (el.dataset.up ?? "0 0").split(" ");
        el.setAttribute("transform", `rotate(${r} ${ax} ${ay})`);
      });
      if (northRef.current) northRef.current.style.transform = `rotate(${-r}deg)`;
    }
    // Harita: çizimden bu yana kayma ve dönüş farkı (ekran pikseli), bileşik katmanda.
    const map = mapRef.current;
    if (!map) return;
    if (!f.margin) {
      map.style.transform = "";
      return;
    }
    const a = rad(-f.rot);
    const [dx, dy] = [(f.cx - cx) / f.u, (f.cy - cy) / f.u];
    const [tx, ty] = [dx * Math.cos(a) - dy * Math.sin(a), dx * Math.sin(a) + dy * Math.cos(a)];
    const d = f.trackUp ? mod(r - f.rot + 180, 360) - 180 : 0;
    map.style.transform = `rotate(${-d}deg) translate(${tx}px, ${ty}px)`;
    if (!redrawing.current && (Math.hypot(tx, ty) > f.margin * 0.6 || Math.abs(d) > DRIFT_DEG)) {
      redrawing.current = true;
      redraw();
    }
  };
  useLayoutEffect(() => {
    frame.current = nextFrame;
    redrawing.current = false;
    apply.current();
  });
  useEffect(() => {
    if (!animated) return;
    let id = 0;
    const tick = () => {
      id = requestAnimationFrame(tick);
      apply.current();
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [animated]);

  // Boşken de aynı sarmalayıcı: ölçüm ve tekerlek dinleyicisi ilk çizimde bağlanır.
  if (!route || !vb || !mvb || !area || !view) return <div ref={box} className={clsx("rm relative overflow-hidden", className)} style={{ background: "var(--rm-sea)" }} />;

  const P = route.P;
  const nearView = (lon: number) => {
    const c = (area.x0 + area.x1) / 2 - 180;
    return c + mod(lon - c + 180, 360) - 180;
  };
  // İzdüşüm → ekran pikseli (dönükken görünüm merkezinde döndürülür).
  const rr = rad(-rot);
  const toPx = (x: number, y: number) => {
    const [px, py] = [(x - vb.x) / u, (y - vb.y) / u];
    if (!rot) return [px, py] as const;
    const [dx, dy] = [px - size.w / 2, py - size.h / 2];
    return [size.w / 2 + dx * Math.cos(rr) - dy * Math.sin(rr), size.h / 2 + dx * Math.sin(rr) + dy * Math.cos(rr)] as const;
  };
  const up = (x: number, y: number): UpAttrs => (rot ? { transform: `rotate(${rot} ${x} ${y})`, "data-up": `${x} ${y}` } : {});
  const inView = (x: number, y: number, pad = 0) => x >= area.x0 - pad && x <= area.x1 + pad && y >= area.y0 - pad && y <= area.y1 + pad;
  const centerLat = latOf(view.cy);

  // Düğmeler: dokunmatikte iki küme (sağ üstte görünüm, sağ altta yakınlık), değilse tek küme sağ altta.
  const bs = touch ? 44 : 28;
  // Dar haritada (küçük pencere, kart) katman seçici yalnızca simge, ölçek kısa.
  const narrow = size.w < 560;
  const viewButtons: ButtonId[] = [...(onFollowChange ? (["follow"] as const) : []), ...(onTrackUpChange ? (["orient"] as const) : []), "fit"];
  const bottomButtons: ButtonId[] = touch ? ["in", "out"] : ["in", "out", ...viewButtons];
  const showToggle = !!satInfo;

  // Raster: kabartma yaklaştıkça hafif bir renge iner (vektör ayrıntı öne çıkar); koyu temada karartılır.
  // z5'in ötesinde büyütülen kabartma bulanıklaşır: Z 6'dan sonra hafif bir renge, Z 11'de tamamen vektöre bırakır.
  const reliefAlpha = (zoom <= 6 ? 1 : zoom <= 9 ? 1 - ((zoom - 6) / 3) * 0.5 : Math.max(0, 0.5 - ((zoom - 9) / 2) * 0.5)) * (light ? 1 : 0.62);
  const showRelief = !!src && !!reliefInfo && !sat && reliefAlpha > 0.04;
  const attribution = sat ? satInfo?.attribution : showRelief ? reliefInfo?.attribution : undefined;
  const satDown = wantSat && !satOk;

  // Etiket yerleşimi (piksel uzayında, önem sırasıyla).
  const taken: [number, number, number, number][] = [];
  const free = (b: [number, number, number, number]) => b[0] >= 0 && b[2] <= size.w && b[1] >= 0 && b[3] <= size.h && !taken.some((o) => b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1]);
  const reserve = (px: number, py: number, r: number) => taken.push([px - r, py - r, px + r, py + r]);
  // Haritanın üstündekiler: sol üstte sayfanın etiketleri, sol altta katman seçici ve ölçek, sağda düğmeler.
  taken.push([0, 0, 170, 40], [0, size.h - (touch ? 60 : 40), (showToggle ? (narrow ? 2 * bs : touch ? 200 : 150) : 0) + (narrow ? 130 : 180), size.h], [size.w - bs - 16, size.h - bottomButtons.length * bs - 16, size.w, size.h]);
  if (touch) taken.push([size.w - bs - 16, 0, size.w, viewButtons.length * bs + 16]);
  if (topRightInset) taken.push([size.w - topRightInset[0], 0, size.w, topRightInset[1]]);
  if (attribution || satDown) {
    const lines = attribution ? Math.ceil((attribution.length * 5) / Math.max(120, size.w - bs - 40)) : 0;
    taken.push([0, size.h - (touch ? 60 : 40) - lines * 13 - (satDown ? 28 : 0) - 8, Math.min(size.w, (attribution?.length ?? 0) * 5 + 20, size.w - bs - 30), size.h]);
  }
  /** Etiketi sağa, olmazsa sola koymayı dener; yerleştiyse metnin çapa noktasını döndürür. */
  const place = (px: number, py: number, text: string, font: number, mono: boolean, gap: number) => {
    const tw = textWidth(text, font, mono) + 4;
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
  const alt = alternate ? P(alternate.lat, route.fix(alternate.lon)) : null;
  const cur = pos ? P(pos.lat, route.fix(pos.lon)) : null;
  // Canlı uçak her karede yer değiştirir: yeri ayrılmaz (üstteki katmanda çizilir), yoksa etiketler saniyede bir oynardı.
  for (const p of [a, b, alt, animated ? null : cur]) if (p) reserve(...toPx(p[0], p[1]), 12);
  // Rota uçlarının çipleri: önce varış, sonra kalkış, en son yedek; üstte, olmazsa altta, sağda, solda. Yer yoksa
  // (uçlar üst üste) yedeğin çipi düşer, uçlarınki yine de çizilir.
  const chips: Partial<Record<"from" | "to" | "alt", { dx: number; dy: number }>> = {};
  for (const [kind, p, label] of [
    ["to", b, to?.icao],
    ["from", a, from?.icao],
    ["alt", alt, alternate?.icao],
  ] as const) {
    if (!p || !labels || !label) continue;
    const [px, py] = toPx(p[0], p[1]);
    const { w, h } = chipSize(label, kind);
    const spots = [
      [0, -(13 + h / 2)],
      [0, 13 + h / 2],
      [13 + w / 2, 0],
      [-(13 + w / 2), 0],
    ];
    let spot = spots.find(([dx, dy]) => free([px + dx - w / 2, py + dy - h / 2, px + dx + w / 2, py + dy + h / 2]));
    if (!spot && kind !== "alt") spot = spots[0];
    if (!spot) continue;
    chips[kind] = { dx: spot[0], dy: spot[1] };
    taken.push([px + spot[0] - w / 2 - 2, py + spot[1] - h / 2 - 2, px + spot[0] + w / 2 + 2, py + spot[1] + h / 2 + 2]);
  }

  // Ölçek: görünümün ortasındaki enlemde.
  const nmPerPx = u / nmUnits(centerLat);
  const scaleNm = [5000, 2000, 1000, 500, 250, 200, 100, 50, 25, 20, 10, 5, 2, 1, 0.5, 0.25, 0.1].find((s) => s / nmPerPx <= (narrow ? 80 : 120)) ?? 0.1;
  const scalePx = scaleNm / nmPerPx;

  // Mesafe halkaları: dış halka kısa kenarın ~%38'i; etiketleri (halkanın tepesinde) yer ayırır.
  const ringNm = rings && cur ? ([1000, 500, 250, 200, 100, 50, 25, 20, 10, 5, 2, 1, 0.5].find((s) => s / nmPerPx <= 0.38 * Math.min(size.w, size.h)) ?? 0.5) : 0;
  const ringU = pos ? nmUnits(pos.lat) : 0;
  if (cur && ringNm > 0 && !animated) for (const nm of [ringNm, ringNm / 2]) reserve(...toPx(cur[0], cur[1] - nm * ringU), 16);

  // Pistler (yakında): görünen karolardaki uçları bilinen pistler.
  const runwayItems: { key: string; x1: number; y1: number; x2: number; y2: number; width: number; rw: (typeof runwayTiles)[number]["v"][number] }[] = [];
  for (const { key, v, dx } of runwayTiles) {
    v.forEach((rw, i) => {
      const g = runwayGeom(rw, (lon) => lon + dx);
      if (inView(g.x1, g.y1, u * 60) || inView(g.x2, g.y2, u * 60)) runwayItems.push({ key: `${key}:${i}`, ...g, rw });
    });
  }
  const hasRunwayNear = (x: number, y: number) => {
    const r = 2.2 * nmUnits(centerLat);
    return runwayItems.some((it) => Math.hypot((it.x1 + it.x2) / 2 - x, (it.y1 + it.y2) / 2 - y) < r);
  };

  // Havalimanları: önce simgeler (hepsi), etiket yer varsa.
  const skip = new Set([from?.icao, to?.icao, alternate?.icao].filter(Boolean));
  const ports = (airports ?? [])
    .filter((ap) => !skip.has(ap.icao))
    .map((ap) => ({ ap, p: P(ap.lat, nearView(ap.lon)) }))
    .filter(({ p }) => inView(p[0], p[1], u * 10));
  const showPortLabel = (s: MapAirport["size"]) => s === "large" || (s === "medium" && lonSpan < 7) || lonSpan < 1.4;
  const portLabels = new Map<string, { x: number; anchor: "start" | "end" }>();
  for (const { ap, p } of ports) {
    if (!showPortLabel(ap.size)) continue;
    const [px, py] = toPx(p[0], p[1]);
    const at = place(px, py, ap.icao, 10.5, true, ap.size === "large" ? 11 : 8);
    if (at) portLabels.set(ap.icao, { x: p[0] + (at.x - px) * u, anchor: at.anchor });
  }
  for (const { p } of ports) reserve(...toPx(p[0], p[1]), 5);

  // Şehirler: Natural Earth'ün yakınlık eşiğine göre (Web Mercator yakınlığı).
  const places = placesOn ? placesNow() : null;
  const cityLabels: { x: number; y: number; lx: number; anchor: "start" | "end"; name: string; capital: boolean; big: boolean }[] = [];
  if (places) {
    for (const pl of places) {
      if (pl.minZoom > zoom + 0.7) break;
      const [x, y] = P(pl.lat, nearView(pl.lon));
      if (!inView(x, y)) continue;
      const [px, py] = toPx(x, y);
      const name = lang === "tr" ? pl.tr : pl.en;
      const big = pl.minZoom <= zoom - 2.5 || pl.capital;
      const at = place(px, py, name, big ? 12 : 11, false, 6);
      if (at) cityLabels.push({ x, y, lx: x + (at.x - px) * u, anchor: at.anchor, name, capital: pl.capital, big });
      if (cityLabels.length > 40) break;
    }
  }

  // Koordinat ağı (izlerken görünüm kare kare kayar: çizgiler kenarlardan taşar).
  const gstep = niceStep(lonSpan, 6, [0.25, 0.5, 1, 2, 5, 10, 15, 30, 60]);
  const gpad = vb.w * 0.25;
  const [gx0, gx1, gy0, gy1] = [area.x0 - gpad, area.x1 + gpad, area.y0 - gpad, area.y1 + gpad];
  let grid = "";
  const gridLabels: { x: number; y: number; text: string; anchor: "start" | "middle" }[] = [];
  const [cN, cS, cE, cW] = t.map.compass;
  for (let lon = Math.ceil((area.x0 - 180) / gstep) * gstep; lon <= area.x1 - 180; lon += gstep) {
    const x = lon + 180;
    grid += `M${x} ${gy0}V${gy1}`;
    const L = mod(lon + 180, 360) - 180;
    gridLabels.push({ x, y: vb.y + u * 11, text: `${+Math.abs(L).toFixed(2)}°${L < 0 ? cW : L > 0 ? cE : ""}`, anchor: "middle" });
  }
  for (let lat = Math.ceil(latOf(area.y1) / gstep) * gstep; lat <= latOf(area.y0); lat += gstep) {
    const y = mercY(lat);
    grid += `M${gx0} ${y}H${gx1}`;
    gridLabels.push({ x: vb.x + u * 5, y: y - u * 3, text: `${+Math.abs(lat).toFixed(2)}°${lat < 0 ? cS : lat > 0 ? cN : ""}`, anchor: "start" });
  }


  const lastTrack = track && track.length > 0 ? P(track[track.length - 1][0], route.fix(track[track.length - 1][1])) : null;


  const button = (id: ButtonId, i: number) => {
    const icon = touch ? "size-5" : "size-3.5";
    const spec = {
      in: { label: t.map.zoomIn, body: <Plus className={icon} />, run: () => zoomAt(size.w / 2, size.h / 2, 0.5), on: undefined, disabled: false },
      out: { label: t.map.zoomOut, body: <Minus className={icon} />, run: () => zoomAt(size.w / 2, size.h / 2, 2), on: undefined, disabled: false },
      follow: { label: t.map.follow, body: <Crosshair className={icon} />, run: () => onFollowChange?.(!follow), on: follow, disabled: !current },
      orient: {
        label: t.map.trackUp,
        // Pusula iğnesi: uçuş yönü yukarıdayken kuzeyi gösterir.
        body: (
          <span ref={northRef} className="flex flex-col items-center leading-none" style={{ transform: rot ? `rotate(${-rot}deg)` : undefined }}>
            <Navigation2 className={clsx(touch ? "size-4" : "size-3", "fill-current")} />
            <span className={clsx("font-mono font-bold", touch ? "text-[9px]" : "text-[7px]")}>{t.map.compass[0]}</span>
          </span>
        ),
        run: () => {
          onTrackUpChange?.(!trackUp);
          if (!trackUp && !follow) onFollowChange?.(true);
        },
        on: trackUp,
        disabled: !current,
      },
      fit: {
        label: t.map.fit,
        body: <LocateFixed className={icon} />,
        run: () => {
          setUserView(null);
          if (follow) onFollowChange?.(false);
          if (trackUp) onTrackUpChange?.(false);
        },
        on: undefined,
        disabled: !userView && !follow && !trackUp,
      },
    }[id];
    return (
      <button
        key={id}
        type="button"
        title={spec.label}
        aria-label={spec.label}
        aria-pressed={spec.on}
        onClick={spec.run}
        disabled={spec.disabled}
        className={clsx(
          "flex items-center justify-center transition-colors hover:bg-white/15 disabled:opacity-40",
          touch ? "size-11" : "size-7",
          i > 0 && "border-t border-white/15",
          spec.on && "bg-white/20",
        )}
      >
        {spec.body}
      </button>
    );
  };

  const routeXY = route.xy;
  // Yön okları uçlara yapışmasın.
  const ends = [routeXY[0], routeXY[routeXY.length - 1]];
  const chev = to ? chevrons(routeXY, u, (x, y) => inView(x, y, u * 8) && ends.every(([ex, ey]) => Math.hypot(x - ex, y - ey) > u * 26)) : "";

  return (
    <div
      ref={box}
      data-style={sat ? "sat" : "chart"}
      className={clsx("rm relative touch-none select-none overflow-hidden", drag.current?.moved ? "cursor-grabbing" : "cursor-grab", className)}
      style={{ background: "var(--rm-sea)" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPointer}
      onPointerCancel={endPointer}
      onPointerLeave={() => setActive(false)}
      onDoubleClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        zoomAt(e.clientX - r.left, e.clientY - r.top, 0.5);
      }}
    >
      <svg
        ref={mapRef}
        viewBox={`${mvb.x} ${mvb.y} ${mvb.w} ${mvb.h}`}
        className="absolute block"
        style={{ left: -margin, top: -margin, width: size.w + 2 * margin, height: size.h + 2 * margin, transformOrigin: "50% 50%", willChange: margin ? "transform" : undefined }}
        role="img"
        aria-label={from && to ? `${from.icao ?? ""} → ${to.icao ?? ""}` : undefined}
      >
        <g transform={rot ? `rotate(${-rot} ${view.cx} ${view.cy})` : undefined}>
          {/* Zemin: karo yokken (ya da yüklenirken) görünen vektör kara */}
          <LandBase layers={layers} />
          {showRelief && <RasterLayer src={src} info={reliefInfo} area={area} zoom={zoom} u={u} opacity={reliefAlpha} />}
          {wantSat && satInfo && src && <RasterLayer src={src} info={satInfo} area={area} zoom={zoom} u={u} onHealth={onSatHealth} />}
          {/* Haritada su her zaman vektörden (kıyı keskin, renk temadan); kaba yerleşim alanları denize taşmasın diye
              onların da üstünde */}
          {!sat && <Urban tiles={urbanTiles} lonSpan={lonSpan} />}
          {!sat && <Water layers={layers} />}
          {!sat && <Chart rivers={riverTiles} roads={roadTiles} lonSpan={lonSpan} />}
          <Lines layers={layers} sat={sat} />
          <path d={grid} stroke="var(--rm-grid)" strokeWidth={1} vectorEffect="non-scaling-stroke" fill="none" />
          {!rot && (
            <g style={{ fontFamily: "var(--font-mono)" }} fontSize={u * 9} fill="var(--rm-grid-text)">
              {gridLabels.map((g) => (
                <text key={`${g.text}${g.x}${g.y}`} x={g.x} y={g.y} textAnchor={g.anchor}>
                  {g.text}
                </text>
              ))}
            </g>
          )}

          {runwayItems.length > 0 && <RunwayLayer items={runwayItems} u={u} zoom={zoom} sat={sat} up={up} />}

          {/* Şehirler */}
          <g style={{ fontFamily: "var(--font-sans)" }}>
            {cityLabels.map((c) => (
              <g key={`${c.name}${c.x}`}>
                {c.capital ? (
                  <g transform={`translate(${c.x} ${c.y}) scale(${u})`}>
                    <circle r={3.6} fill="var(--rm-halo)" stroke="var(--rm-label)" strokeWidth={1.2} />
                    <circle r={1.5} fill="var(--rm-label)" />
                  </g>
                ) : (
                  <circle cx={c.x} cy={c.y} r={u * (c.big ? 2.6 : 2.1)} fill="var(--rm-label)" stroke="var(--rm-halo)" strokeWidth={u * 1.2} />
                )}
                <text
                  x={c.lx}
                  y={c.y}
                  dy="0.35em"
                  textAnchor={c.anchor}
                  fontSize={u * (c.big ? 12 : 11)}
                  fill={c.big ? "var(--rm-label)" : "var(--rm-label-2)"}
                  fontWeight={c.capital ? 650 : c.big ? 560 : 500}
                  stroke="var(--rm-halo)"
                  strokeWidth={u * 3.2}
                  paintOrder="stroke"
                  strokeLinejoin="round"
                  {...up(c.x, c.y)}
                >
                  {c.name}
                </text>
              </g>
            ))}
          </g>

          {/* Havalimanları */}
          <g>
            {ports.map(({ ap, p }) => (
              <AirportMark key={ap.icao} ap={ap} x={p[0]} y={p[1]} u={u} label={portLabels.get(ap.icao)} up={up} bare={runwayItems.length > 0 && (!sat || zoom >= 12) && hasRunwayNear(p[0], p[1])} />
            ))}
          </g>

          {extra?.({ P: (lat, lon) => P(lat, route.fix(lon)), u, nm: nmUnits(centerLat), up })}

          {/* Rota: eflatun rota çizgisi (zıt renk kenarlı), yön okları, uçulan iz, uçlar, uçak */}
          <path d={route.path} fill="none" stroke="var(--rm-casing)" strokeWidth={5.2} vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" strokeOpacity={flown ? 0.55 : 0.9} />
          <path d={route.path} fill="none" stroke="var(--rm-route)" strokeWidth={2.6} vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" strokeOpacity={flown ? 0.7 : 1} />
          {chev && <path d={chev} fill="none" stroke="var(--rm-casing)" strokeWidth={4.4} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" strokeOpacity={0.9} />}
          {chev && <path d={chev} fill="none" stroke="var(--rm-route)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />}
          {alt && <EndMarker x={alt[0]} y={alt[1]} u={u} label={alternate?.icao} chip={chips.alt} kind="alt" up={up} />}
          <EndMarker x={a[0]} y={a[1]} u={u} label={from?.icao} chip={chips.from} kind="from" up={up} />
          {b && <EndMarker x={b[0]} y={b[1]} u={u} label={to?.icao} chip={chips.to} kind="to" up={up} />}
        </g>
      </svg>
      {/* Canlı katman: iz ucu, mesafe halkaları, uçak (her karede güncellenir) */}
      <svg ref={liveRef} viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} className="pointer-events-none absolute inset-0 block size-full" aria-hidden>
        <g ref={liveContentRef} transform={rot ? `rotate(${-rot} ${view.cx} ${view.cy})` : undefined}>
          {flown && (
            <>
              <path d={flown} fill="none" stroke="var(--rm-casing)" strokeWidth={5.4} vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
              <path d={flown} fill="none" stroke="var(--accent)" strokeWidth={3} vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
            </>
          )}
          {lastTrack && cur && (
            <line ref={tailRef} x1={lastTrack[0]} y1={lastTrack[1]} x2={cur[0]} y2={cur[1]} stroke="var(--accent)" strokeWidth={3} vectorEffect="non-scaling-stroke" strokeLinecap="round" />
          )}
          {cur && ringNm > 0 && (
            <g ref={ringRef} transform={`translate(${cur[0]} ${cur[1]})`} pointerEvents="none">
              {[ringNm, ringNm / 2].map((nm) => (
                <g key={nm}>
                  <circle r={nm * ringU} fill="none" stroke="var(--rm-ring)" strokeWidth={1.2} strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
                  <text
                    x={0}
                    y={-nm * ringU}
                    dy="0.35em"
                    textAnchor="middle"
                    fontSize={u * 10}
                    fontWeight={600}
                    fill="var(--rm-label-2)"
                    stroke="var(--rm-halo)"
                    strokeWidth={u * 3}
                    paintOrder="stroke"
                    style={{ fontFamily: "var(--font-mono)" }}
                    {...up(0, 0)}
                  >
                    {nm === ringNm ? `${nm} nm` : nm}
                  </text>
                </g>
              ))}
            </g>
          )}
          {cur && pos && (
            <g ref={planeRef} transform={planeAt(cur[0], cur[1], pos.heading, u, planeScale)}>
              <path d={PLANE} fill="none" stroke="rgb(0 0 0 / 0.38)" strokeWidth={3.6} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
              <path d={PLANE} fill="var(--accent)" stroke="var(--rm-plane-edge)" strokeWidth={1.2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            </g>
          )}
        </g>
      </svg>

      {/* Sol alt: atıf, uydu uyarısı, katman seçici ve ölçek */}
      <div className="pointer-events-none absolute bottom-2.5 left-2.5 flex flex-col items-start gap-1.5" style={{ maxWidth: size.w - bs - 34 }}>
        {attribution && <div className="msfs-on-image rounded-md px-1.5 py-[3px] text-[9.5px] leading-[1.3] text-white/85">{attribution}</div>}
        {satDown && (
          <div className="msfs-on-image flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-medium text-white">
            <WifiOff className="size-3.5 shrink-0 text-warn" />
            {t.map.satOffline}
          </div>
        )}
        <div className={clsx("flex items-end", touch ? "gap-2.5" : "gap-2")}>
          {showToggle && (
            <div className={clsx("msfs-on-image pointer-events-auto flex shrink-0 overflow-hidden text-white", touch ? "rounded-xl" : "rounded-lg")} role="radiogroup" aria-label={t.map.layer}>
              {(
                [
                  ["chart", t.map.chart, MapIcon],
                  ["sat", t.map.satellite, Satellite],
                ] as const
              ).map(([id, label, Icon], i) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={pref === id}
                  aria-label={label}
                  title={label}
                  onClick={() => setMapStyle(id)}
                  className={clsx(
                    "flex items-center justify-center gap-1.5 font-semibold transition-colors hover:bg-white/15",
                    touch ? "h-11 text-[13px]" : "h-7 text-[11.5px]",
                    narrow ? (touch ? "w-11" : "w-7") : touch ? "px-3.5" : "px-2.5",
                    i > 0 && "border-l border-white/15",
                    pref === id ? "bg-white/20" : "text-white/75",
                  )}
                >
                  <Icon className={touch ? "size-4" : "size-3.5"} />
                  {!narrow && label}
                </button>
              ))}
            </div>
          )}
          <div className={clsx("msfs-on-image flex shrink-0 items-center gap-2 font-mono text-[10.5px] font-semibold text-white", touch ? "h-11 rounded-xl px-3" : "h-7 rounded-lg px-2")}>
            <span className="h-[5px] border-x-[1.5px] border-b-[1.5px] border-white/85" style={{ width: scalePx }} />
            {scaleNm} nm
          </div>
        </div>
      </div>

      {/* Görünüm (dokunmatikte sağ üstte) ve yakınlık */}
      {touch && <div className="msfs-on-image absolute right-2.5 top-2.5 flex flex-col overflow-hidden rounded-xl text-white">{viewButtons.map(button)}</div>}
      <div className={clsx("msfs-on-image absolute bottom-2.5 right-2.5 flex flex-col overflow-hidden text-white", touch ? "rounded-xl" : "rounded-lg")}>{bottomButtons.map(button)}</div>

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

type Tiles<T> = { key: string; v: T; dx: number }[];
const shift = (dx: number) => (dx ? `translate(${dx} 0)` : undefined);

/** Kara zemini: raster karo yokken görünen düz kara; karolar arasında kenar yumuşatma çizgisi kalmasın diye kendi
 *  renginde ince çizilir. */
const LandBase = memo(function LandBase({ layers }: { layers: Tiles<Layer> }) {
  return (
    <g>
      {layers.map(({ key, v, dx }) => v.land && <path key={key} d={v.land} transform={shift(dx)} fill="var(--rm-land)" stroke="var(--rm-land)" strokeWidth={0.8} vectorEffect="non-scaling-stroke" />)}
    </g>
  );
});

/** Deniz ve göller (raster kabartmanın ve yerleşim alanlarının üstünde, keskin kıyıyla). */
const Water = memo(function Water({ layers }: { layers: Tiles<Layer> }) {
  // Karolar tek yolda birleşir (dünya kopyası başına): görünen karoları kaplayan tek dikdörtgen + bütün kara halkaları,
  // "evenodd". Karo başına ayrı deniz yolu kenar yumuşatmasıyla karo sınırında kılcal çizgi bırakırdı; birleşik yolda
  // karo kenarındaki ortak kenarlar birbirini tam götürür.
  const groups = new Map<number, { d: string; tx0: number; tx1: number; ty0: number; ty1: number }>();
  const whole: { key: string; d: string; dx: number }[] = [];
  for (const { key, v, dx } of layers) {
    if (key.startsWith("w")) {
      whole.push({ key, d: v.sea, dx });
      continue;
    }
    const [tx, ty] = key.split("_").map(Number);
    const real = tx - dx / TILE;
    const g = groups.get(dx) ?? { d: "", tx0: real, tx1: real, ty0: ty, ty1: ty };
    g.d += v.land;
    [g.tx0, g.tx1, g.ty0, g.ty1] = [Math.min(g.tx0, real), Math.max(g.tx1, real), Math.min(g.ty0, ty), Math.max(g.ty1, ty)];
    groups.set(dx, g);
  }
  for (const [dx, g] of groups) {
    const [x0, x1, y0, y1] = [g.tx0 * TILE, (g.tx1 + 1) * TILE, mercY(90 - g.ty0 * TILE), mercY(90 - (g.ty1 + 1) * TILE)];
    whole.push({ key: `d${dx}`, d: `M${x0} ${y0}H${x1}V${y1}H${x0}Z${g.d}`, dx });
  }
  return (
    <g>
      {whole.map(({ key, d, dx }) => (
        <path key={key} d={d} transform={shift(dx)} fillRule="evenodd" fill="var(--rm-sea)" />
      ))}
      {layers.map(({ key, v, dx }) => v.lakes && <path key={key} d={v.lakes} transform={shift(dx)} fill="var(--rm-sea)" stroke="var(--rm-sea)" strokeWidth={0.8} vectorEffect="non-scaling-stroke" />)}
    </g>
  );
});

/** Yerleşim alanları. Yakında şehir her yeri kaplar: renk geri çekilir, pistler ve yollar öne çıkar. */
const Urban = memo(function Urban({ tiles, lonSpan }: { tiles: Tiles<string>; lonSpan: number }) {
  return (
    <g opacity={lonSpan < 0.3 ? 0 : lonSpan < 0.6 ? 0.4 : lonSpan < 1.5 ? 0.7 : 1}>
      {tiles.map(({ key, v, dx }) => (
        <path key={key} d={v} transform={shift(dx)} fill="var(--rm-urban)" stroke="var(--rm-urban)" strokeWidth={0.8} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      ))}
    </g>
  );
});

/** Harita ayrıntısı: akarsular (önem sınıfına göre kalınlık) ve yollar. */
const Chart = memo(function Chart({ rivers, roads, lonSpan }: { rivers: Tiles<Rivers>; roads: Tiles<Roads>; lonSpan: number }) {
  const medium = lonSpan <= 25;
  const minor = lonSpan <= 9;
  const minorRoads = lonSpan <= 4;
  return (
    <g fill="none" strokeLinecap="round" strokeLinejoin="round">
      {rivers.map(({ key, v, dx }) => (
        <g key={key} transform={shift(dx)} stroke="var(--rm-river)">
          {minor && v.minor && <path d={v.minor} strokeWidth={0.7} strokeOpacity={0.8} vectorEffect="non-scaling-stroke" />}
          {medium && v.medium && <path d={v.medium} strokeWidth={lonSpan <= 9 ? 1.1 : 0.8} vectorEffect="non-scaling-stroke" />}
          {v.major && <path d={v.major} strokeWidth={lonSpan <= 9 ? 1.7 : lonSpan <= 25 ? 1.3 : 1} vectorEffect="non-scaling-stroke" />}
        </g>
      ))}
      {roads.map(({ key, v, dx }) => (
        <g key={key} transform={shift(dx)}>
          {minorRoads && v.minor && <path d={v.minor} stroke="var(--rm-road-minor)" strokeWidth={0.8} vectorEffect="non-scaling-stroke" />}
          {v.major && <path d={v.major} stroke="var(--rm-road)" strokeWidth={lonSpan <= 4 ? 1.4 : 1} vectorEffect="non-scaling-stroke" />}
        </g>
      ))}
    </g>
  );
});

/** Sınırlar (yalnızca haritada) ve kıyı çizgisi. */
const Lines = memo(function Lines({ layers, sat }: { layers: Tiles<Layer>; sat: boolean }) {
  return (
    <g fill="none">
      {!sat &&
        layers.map(({ key, v, dx }) => v.borders && <path key={key} d={v.borders} transform={shift(dx)} stroke="var(--rm-border)" strokeWidth={1.1} strokeDasharray="6 3 1.5 3" vectorEffect="non-scaling-stroke" />)}
      {layers.map(({ key, v, dx }) => v.coast && <path key={key} d={v.coast} transform={shift(dx)} stroke="var(--rm-coast)" strokeWidth={sat ? 0.8 : 1} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />)}
    </g>
  );
});
