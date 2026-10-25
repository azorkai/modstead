// Harita verisinin çözümü: "encoded polyline" parçaları → SVG yolları (bkz. tools/map.py).
// Düzlem: x = boylam + 180, y = 90 − enlem (derece). Kara ve göl halkaları dolgu olarak çizilir; kıyı çizgisi aynı
// halkalardan, kırpmanın karo kenarına eklediği kenarlar atlanarak türetilir. Karolar bir kez çözülür, önbellekte kalır.

export interface Layer {
  land: string;
  lakes: string;
  coast: string;
  borders: string;
}

type Bounds = readonly [number, number, number, number];

/** Boşlukla ayrılmış parçaları tamsayı nokta dizilerine çözer ([x0, y0, x1, y1, …], birim 1/Q derece). */
export function decode(s: string): Int32Array[] {
  const out: Int32Array[] = [];
  const n = s.length;
  let i = 0;
  while (i < n) {
    const buf: number[] = [];
    let x = 0;
    let y = 0;
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

function fill(rings: Int32Array[], q: number): string {
  let d = "";
  for (const r of rings) {
    d += `M${r[0] / q} ${r[1] / q}`;
    for (let k = 2; k < r.length; k += 2) d += `L${r[k] / q} ${r[k + 1] / q}`;
    d += "Z";
  }
  return d;
}

function lines(parts: Int32Array[], q: number): string {
  let d = "";
  for (const r of parts) {
    d += `M${r[0] / q} ${r[1] / q}`;
    for (let k = 2; k < r.length; k += 2) d += `L${r[k] / q} ${r[k + 1] / q}`;
  }
  return d;
}

/** Halkaların kıyı kenarları: karo kenarı üzerinde uzanan (kırpmanın eklediği) kenarlar çizilmez. */
function coast(rings: Int32Array[], q: number, [x0, y0, x1, y1]: Bounds): string {
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
        d += `M${ax / q} ${ay / q}`;
        pen = true;
      }
      d += `L${bx / q} ${by / q}`;
    }
  }
  return d;
}

function layer(land: string, lakes: string, borders: string, q: number, b: Bounds): Layer {
  const l = decode(land);
  const w = decode(lakes);
  return { land: fill(l, q), lakes: fill(w, q), coast: coast(l, q, b) + coast(w, q, b), borders: lines(decode(borders), q) };
}

// --- Dünya görünümü (1:50m, ilk açılışta yüklenir) ---

let world: Layer | null = null;
let worldPromise: Promise<Layer> | null = null;

export function loadWorld(): Promise<Layer> {
  worldPromise ??= import("./coarse").then((m) => (world = layer(m.LAND, m.LAKES, m.BORDERS, m.Q, [0, 0, 360 * m.Q, 180 * m.Q])));
  return worldPromise;
}

export const worldNow = () => world;

// --- Yakın görünüm (1:10m, 10°'lik karolar; ilk yakınlaşmada bir kez yüklenir) ---

export const TILE = 10;

interface Detail {
  q: number;
  tiles: Record<string, [string, string, string]>;
  cache: Map<string, Layer | null>;
}

let detail: Detail | null = null;
let detailPromise: Promise<Detail> | null = null;

export function loadDetail(): Promise<Detail> {
  detailPromise ??= import("./detail").then((m) => (detail = { q: m.Q, tiles: m.TILES, cache: new Map() }));
  return detailPromise;
}

export const detailReady = () => detail !== null;

/** Karo (tx: 0–35, ty: 0–17); denizdeki karolar `null`. */
export function tile(tx: number, ty: number): Layer | null {
  if (!detail) return null;
  const key = `${tx}_${ty}`;
  let hit = detail.cache.get(key);
  if (hit === undefined) {
    const raw = detail.tiles[key];
    const q = detail.q;
    hit = raw ? layer(raw[0], raw[1], raw[2], q, [tx * TILE * q, ty * TILE * q, (tx + 1) * TILE * q, (ty + 1) * TILE * q]) : null;
    detail.cache.set(key, hit);
  }
  return hit;
}

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
