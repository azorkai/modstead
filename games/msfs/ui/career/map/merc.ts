// Web Mercator (EPSG:3857) izdüşümü, raster karolarla aynı. Birim: dünya 360 × 360'lık bir kare; x = boylam + 180
// (boylam derecesiyle aynı), y kuzeyde 0 (85,0511° K), ekvatorda 180, güneyde 360. z düzeyindeki bir karo 360 / 2^z
// birimdir; harita yakınlığı Z'de bir karo tam 256 px'tir.

export const WORLD = 360;
export const MAX_LAT = 85.0511287798;

const R2D = 180 / Math.PI;
const D2R = Math.PI / 180;

/** Enlem → y (kutuplara doğru sınırda kırpılır). */
export function mercY(lat: number): number {
  const l = Math.max(-MAX_LAT, Math.min(MAX_LAT, lat));
  return 180 - R2D * Math.log(Math.tan(Math.PI / 4 + (l * D2R) / 2));
}

/** y → enlem. */
export function latOf(y: number): number {
  return R2D * (2 * Math.atan(Math.exp((180 - y) * D2R)) - Math.PI / 2);
}

/** Enlemdeki ölçek: 1 nm'nin izdüşüm birimi karşılığı (Mercator yönden bağımsız, enlemle büyür). */
export function nmUnits(lat: number): number {
  return 1 / (60 * Math.max(0.05, Math.cos(Math.max(-MAX_LAT, Math.min(MAX_LAT, lat)) * D2R)));
}

/** Ekrandaki bir pikselin izdüşüm birimi karşılığından harita yakınlığı (Z düzeyinde karo 256 px). */
export function zoomOf(unitsPerPx: number): number {
  return Math.log2(WORLD / (256 * unitsPerPx));
}

/** z düzeyindeki karonun boyu (birim). */
export const tileUnits = (z: number) => WORLD / 2 ** z;
