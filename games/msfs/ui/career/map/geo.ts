// Harita verisinin çözümü: "encoded polyline" parçaları → Web Mercator SVG yolları (bkz. tools/map.py, map/merc.ts).
// Veri dosyalarında düzlem eşdikdörtgendir (x = boylam + 180, y = 90 − enlem); y burada Mercator'a çevrilir, x aynı
// kalır. Kara ve göl halkaları dolgu olarak çizilir; kıyı çizgisi aynı halkalardan, kırpmanın karo kenarına eklediği
// kenarlar atlanarak türetilir. Deniz, karo dikdörtgeni ile kara halkalarının "evenodd" farkıdır (kabartma karolarının
// üstüne keskin su çizebilmek için). Her katman ayrı parça olarak ilk gerektiğinde yüklenir; karolar bir kez çözülür,
// önbellekte kalır.

import { mercY } from "./merc";

export interface Layer {
  land: string;
  lakes: string;
  coast: string;
  borders: string;
  /** Karonun denizi (karo dikdörtgeni + kara halkaları, `fill-rule="evenodd"`). */
  sea: string;
}

type Bounds = readonly [number, number, number, number];

/** Boşlukla ayrılmış parçaları tamsayı nokta dizilerine çözer ([x0, y0, x1, y1, …], birim 1/Q derece). `chain`:
 *  parçanın ilk noktası da bir önceki parçanın son noktasına göre farktır (yeni katmanların kodlaması). */
export function decode(s: string, chain = false): Int32Array[] {
  const out: Int32Array[] = [];
  const n = s.length;
  let i = 0;
  let x = 0;
  let y = 0;
  while (i < n) {
    const buf: number[] = [];
    if (!chain) x = y = 0;
    while (i < n && s.charCodeAt(i) !== 32) {
      let shift = 0;
      let v = 0;
      let b: number;
      do {
        b = s.charCodeAt(i++) - 63;
        v |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      x += v & 1 ? ~(v >> 1) : v >> 1;
      shift = 0;
      v = 0;
      do {
        b = s.charCodeAt(i++) - 63;
        v |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      y += v & 1 ? ~(v >> 1) : v >> 1;
      buf.push(x, y);
    }
    i++;
    if (buf.length) out.push(Int32Array.from(buf));
  }
  return out;
}

/** Tek bir kodlanmış sayı dizisi (fark yok). */
function numbers(s: string): number[] {
  const out: number[] = [];
  let i = 0;
  while (i < s.length) {
    let shift = 0;
    let v = 0;
    let b: number;
    do {
      b = s.charCodeAt(i++) - 63;
      v |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    out.push(v & 1 ? ~(v >> 1) : v >> 1);
  }
  return out;
}

/** Tamsayı → izdüşüm birimi (yuvarlanmış: yol metni kısa kalsın). */
class Proj {
  private readonly ys = new Map<number, number>();
  constructor(
    readonly q: number,
    readonly prec: number,
  ) {}
  x(v: number): number {
    return Math.round((v / this.q) * this.prec) / this.prec;
  }
  y(v: number): number {
    let y = this.ys.get(v);
    if (y === undefined) {
      y = Math.round(mercY(90 - v / this.q) * this.prec) / this.prec;
      this.ys.set(v, y);
    }
    return y;
  }
}

function fill(rings: Int32Array[], p: Proj): string {
  let d = "";
  for (const r of rings) {
    d += `M${p.x(r[0])} ${p.y(r[1])}`;
    for (let k = 2; k < r.length; k += 2) d += `L${p.x(r[k])} ${p.y(r[k + 1])}`;
    d += "Z";
  }
  return d;
}

function lines(parts: Int32Array[], p: Proj): string {
  let d = "";
  for (const r of parts) {
    d += `M${p.x(r[0])} ${p.y(r[1])}`;
    for (let k = 2; k < r.length; k += 2) d += `L${p.x(r[k])} ${p.y(r[k + 1])}`;
  }
  return d;
}

/** Halkaların kıyı kenarları: karo kenarı üzerinde uzanan (kırpmanın eklediği) kenarlar çizilmez. */
function coast(rings: Int32Array[], p: Proj, [x0, y0, x1, y1]: Bounds): string {
  let d = "";
  for (const r of rings) {
    const n = r.length / 2;
    let pen = false;
    for (let k = 0; k < n; k++) {
      const j = (k + 1) % n;
      const [ax, ay, bx, by] = [r[2 * k], r[2 * k + 1], r[2 * j], r[2 * j + 1]];
      const seam = (ax === bx && (ax === x0 || ax === x1)) || (ay === by && (ay === y0 || ay === y1));
      if (seam) {
        pen = false;
        continue;
      }
      if (!pen) {
        d += `M${p.x(ax)} ${p.y(ay)}`;
        pen = true;
      }
      d += `L${p.x(bx)} ${p.y(by)}`;
    }
  }
  return d;
}

function rect(p: Proj, [x0, y0, x1, y1]: Bounds): string {
  return `M${p.x(x0)} ${p.y(y0)}H${p.x(x1)}V${p.y(y1)}H${p.x(x0)}Z`;
}

function layer(land: string, lakes: string, borders: string, p: Proj, b: Bounds): Layer {
  const l = decode(land);
  const w = decode(lakes);
  const landPath = fill(l, p);
  return { land: landPath, lakes: fill(w, p), coast: coast(l, p, b) + coast(w, p, b), borders: lines(decode(borders), p), sea: rect(p, b) + landPath };
}

// --- Dünya görünümü (1:50m, ilk açılışta yüklenir) ---

let world: Layer | null = null;
let worldPromise: Promise<Layer> | null = null;

export function loadWorld(): Promise<Layer> {
  worldPromise ??= import("./coarse").then((m) => (world = layer(m.LAND, m.LAKES, m.BORDERS, new Proj(m.Q, 1e3), [0, 0, 360 * m.Q, 180 * m.Q])));
  return worldPromise;
}

export const worldNow = () => world;

// --- Karolu katmanlar (10°'lik karolar; her katman ilk gerektiğinde bir kez yüklenir) ---

export const TILE = 10;

/** Karo sınırları (tamsayı birimde). */
const tileBounds = (tx: number, ty: number, q: number): Bounds => [tx * TILE * q, ty * TILE * q, (tx + 1) * TILE * q, (ty + 1) * TILE * q];

interface Source<R> {
  q: number;
  tiles: Record<string, R>;
}

/** Ayrı parçada duran karolu bir katman: yükleyici, hazır mı, karo (tx: 0–35, ty: 0–17). */
export interface Tiled<T> {
  load: () => Promise<unknown>;
  ready: () => boolean;
  get: (tx: number, ty: number) => T | null;
}

function tiled<R, T>(importer: () => Promise<{ Q: number; TILES: Record<string, R> }>, build: (raw: R, tx: number, ty: number, q: number) => T, empty?: (tx: number, ty: number, q: number) => T): Tiled<T> {
  let src: Source<R> | null = null;
  let promise: Promise<unknown> | null = null;
  const cache = new Map<number, T | null>();
  return {
    load: () => (promise ??= importer().then((m) => (src = { q: m.Q, tiles: m.TILES }))),
    ready: () => src !== null,
    get: (tx, ty) => {
      if (!src) return null;
      const key = ty * 64 + tx;
      let hit = cache.get(key);
      if (hit === undefined) {
        const raw = src.tiles[`${tx}_${ty}`];
        hit = raw !== undefined ? build(raw, tx, ty, src.q) : empty ? empty(tx, ty, src.q) : null;
        cache.set(key, hit);
      }
      return hit;
    },
  };
}

/** Kara, göl, kıyı ve sınırlar (1:10m). Denizdeki karolar yalnızca deniz dikdörtgeni taşır. */
export const detail = tiled<[string, string, string], Layer>(
  () => import("./detail"),
  (raw, tx, ty, q) => layer(raw[0], raw[1], raw[2], new Proj(q, 1e4), tileBounds(tx, ty, q)),
  (tx, ty, q) => ({ land: "", lakes: "", coast: "", borders: "", sea: rect(new Proj(q, 1e4), tileBounds(tx, ty, q)) }),
);

export interface Rivers {
  /** Natural Earth önem derecesi 0–3, 4–6, 7–8. */
  major: string;
  medium: string;
  minor: string;
}

export const rivers = tiled<[string, string, string], Rivers>(
  () => import("./rivers"),
  (raw, _tx, _ty, q) => {
    const p = new Proj(q, 1e4);
    return { major: lines(decode(raw[0], true), p), medium: lines(decode(raw[1], true), p), minor: lines(decode(raw[2], true), p) };
  },
);

export const urban = tiled<string, string>(
  () => import("./urban"),
  (raw, _tx, _ty, q) => fill(decode(raw, true), new Proj(q, 1e4)),
);

export interface Roads {
  major: string;
  minor: string;
}

export const roads = tiled<[string, string], Roads>(
  () => import("./roads"),
  (raw, _tx, _ty, q) => {
    const p = new Proj(q, 1e4);
    return { major: lines(decode(raw[0], true), p), minor: lines(decode(raw[1], true), p) };
  },
);

export interface Runway {
  lat1: number;
  lon1: number;
  lat2: number;
  lon2: number;
  widthM: number;
  surface: "paved" | "unpaved" | "water";
  /** Uç adları ("05L", "23R"); bilinmiyorsa boş. */
  ends: [string, string];
}

/** Pistin karşı ucunun olağan adı ("05L" → "23R"); tools/map.py `_opposite` ile aynı. */
function opposite(ident: string): string {
  const m = /^(\d{1,2})([LRC]?)$/.exec(ident);
  if (!m) return "";
  const n = ((+m[1] + 18 - 1) % 36) + 1;
  return `${String(n).padStart(2, "0")}${m[2] === "L" ? "R" : m[2] === "R" ? "L" : m[2]}`;
}

const SURFACES = ["paved", "unpaved", "water"] as const;

/** Uçları bilinen pistler (OurAirports). */
export const runways = tiled<string, Runway[]>(
  () => import("./runways"),
  (raw, tx, ty, q) => {
    const [ox, oy] = [tx * TILE * q, ty * TILE * q];
    let [a, b] = [0, 0];
    const out: Runway[] = [];
    for (const part of raw.split(" ")) {
      const [enc, le = "", he] = part.split(":");
      const [da, db, c, d, w, s] = numbers(enc);
      a += da;
      b += db;
      out.push({
        lon1: (ox + a) / q - 180,
        lat1: 90 - (oy + b) / q,
        lon2: (ox + a + c) / q - 180,
        lat2: 90 - (oy + b + d) / q,
        widthM: w * 5,
        surface: SURFACES[s] ?? "paved",
        ends: [le, he ?? opposite(le)],
      });
    }
    return out;
  },
);

// --- Şehirler ---

export interface Place {
  lat: number;
  lon: number;
  /** Natural Earth'ün önerdiği en küçük web yakınlığı (0–8.5). */
  minZoom: number;
  capital: boolean;
  tr: string;
  en: string;
}

let places: Place[] | null = null;
let placesPromise: Promise<Place[]> | null = null;

export function loadPlaces(): Promise<Place[]> {
  placesPromise ??= import("./places").then(
    (m) =>
      (places = m.PLACES.split("\n").map((row) => {
        const [lat, lon, mz, cap, tr, en] = row.split("|");
        return { lat: +lat, lon: +lon, minZoom: +mz, capital: cap === "1", tr, en: en || tr };
      })),
  );
  return placesPromise;
}

export const placesNow = () => places;
