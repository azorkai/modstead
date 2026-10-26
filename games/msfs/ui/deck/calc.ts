// Uçuş ekranının hesapları: büyük çember mesafe ve yön, rüzgâr bileşenleri, pist seçimi, alçalma noktası.

export const LB_PER_KG = 2.20462;
const R_NM = 3440.065;

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;
export const norm360 = (a: number) => ((a % 360) + 360) % 360;
/** -180…180 arası açı farkı (b − a). */
export const angleDiff = (a: number, b: number) => ((((b - a) % 360) + 540) % 360) - 180;

export interface LatLon {
  lat: number;
  lon: number;
}

export function distanceNm(a: LatLon, b: LatLon): number {
  const [p1, p2] = [rad(a.lat), rad(b.lat)];
  const dp = p2 - p1;
  const dl = rad(b.lon - a.lon);
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R_NM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** a'dan b'ye ilk yön (gerçek, derece). */
export function bearing(a: LatLon, b: LatLon): number {
  const [p1, p2] = [rad(a.lat), rad(b.lat)];
  const dl = rad(b.lon - a.lon);
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return norm360(deg(Math.atan2(y, x)));
}

/** Bir noktadan verilen yönde `nm` ilerleyen nokta (kısa mesafede düzlem yaklaşımı yeterli). */
export function advance(p: LatLon, course: number, nm: number): LatLon {
  const c = rad(course);
  const lat = p.lat + (nm * Math.cos(c)) / 60;
  const lon = p.lon + (nm * Math.sin(c)) / (60 * Math.max(0.05, Math.cos(rad(p.lat))));
  return { lat, lon };
}

/** Rüzgârın bir yöne göre bileşenleri: `head` artı karşıdan, eksi arkadan; `cross` artı sağdan. */
export function windComponents(windDir: number, windKt: number, course: number): { head: number; cross: number } {
  const d = rad(angleDiff(course, windDir));
  return { head: windKt * Math.cos(d), cross: windKt * Math.sin(d) };
}

/** "05/23", "17L/35R" → [{ end: "05", hdg: 50 }, …] */
export function runwayEnds(runway: string | null | undefined): { end: string; hdg: number }[] {
  if (!runway) return [];
  return runway
    .split("/")
    .map((e) => e.trim())
    .filter(Boolean)
    .map((end) => ({ end, hdg: (parseInt(end, 10) || 36) * 10 }))
    .filter((e) => Number.isFinite(e.hdg));
}

/** Rüzgâra en uygun pist ucu ve bileşenleri (değişken ya da sakin rüzgârda ilk uç). */
export function bestRunway(runway: string | null | undefined, windDir: number | null, windKt: number) {
  const ends = runwayEnds(runway);
  if (ends.length === 0) return null;
  if (windDir === null || windKt < 1) return { ...ends[0], head: 0, cross: 0 };
  return ends.map((e) => ({ ...e, ...windComponents(windDir, windKt, e.hdg) })).sort((a, b) => b.head - a.head)[0];
}

/** 3° süzülüşle alçalma mesafesi (nm): kaybedilecek irtifa / 318 ft·nm⁻¹. */
export function descentNm(altFt: number, fieldFt: number): number {
  return Math.max(0, (altFt - fieldFt) / 318);
}

/** 3° süzülüş için dikey hız (fpm, eksi): yer hızı × 5,3. */
export function vs3(gsKt: number): number {
  return -Math.round((gsKt * 5.3) / 10) * 10;
}

export const pad3 = (n: number) => String(Math.round(norm360(n)) || 360).padStart(3, "0");

/** "14:05Z" */
export function utcClock(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}Z`;
}

/** Yerel "17:05" */
export function localClock(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
