// Raster karolar: Modstead'in yerel sunucusundan gölgeli kabartma (`relief`, çevrimdışı, z0–5) ve uydu görüntüsü
// (`sat`, çevrimiçi, z0–13). SVG'nin içinde <image> olarak vektörlerin altında çizilir; böylece kaydırma, izleme ve
// "uçuş yönü yukarı" dönüşü vektörlerle aynı dönüşümden geçer. Yalnızca görünen karolar istenir; istenen düzey
// yüklenirken üç düzey aşağısı (az sayıda karo) altta zemin olur, bir alt düzeyin yüklenmiş karoları da kalır. Son
// düzeyin ötesinde karolar büyütülür. Yüklenemeyen karo çizilmez (kırık görsel yok) ve 20 sn yeniden istenmez;
// katmanın hiçbir karosu gelmiyorsa `onHealth(false)` haber verir (harita vektöre döner).

import { memo, useEffect, useMemo, useReducer, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import { careerApi } from "../api";
import { ck } from "../queries";
import type { TileLayerInfo } from "../types";
import { WORLD } from "./merc";

// ───────────── Kaynak ─────────────

/** Uzak taşıma (yerel ağdaki uçuş ekranı): karolar sayfanın kendi kökünden, anahtarla istenir. */
let remote: { base: string; key: string | null } | null = null;

export function setTileSource(src: { base: string; key: string | null } | null) {
  remote = src ? { base: src.base.replace(/\/+$/, ""), key: src.key } : null;
}

export interface TileSource {
  base: string;
  key: string | null;
  layers: Partial<Record<"relief" | "sat", TileLayerInfo>>;
}

/** Karo sunucusu ve katmanları; sunucu yoksa `null` (harita yalnızca vektörle çizilir). */
export function useTileSource(): TileSource | null {
  const { data } = useQuery({ queryKey: ck.tiles, queryFn: careerApi.tilesInfo, staleTime: 10 * 60_000, retry: 1 });
  return useMemo(() => {
    const base = remote?.base ?? data?.base ?? null;
    if (!base || !data) return null;
    const layers: TileSource["layers"] = {};
    for (const l of data.layers) if (l.id === "relief" || l.id === "sat") layers[l.id] = l;
    return { base, key: remote?.key ?? null, layers };
  }, [data]);
}

const tileUrl = (src: TileSource, layer: string, z: number, x: number, y: number) =>
  `${src.base}/api/tiles/${layer}/${z}/${x}/${y}${src.key ? `?k=${encodeURIComponent(src.key)}` : ""}`;

// ───────────── Harita / uydu tercihi (cihazda saklanır; aynı sayfadaki bütün haritalar birlikte değişir) ─────────────

export type MapStyle = "chart" | "sat";

const STYLE_KEY = "modstead.map.style";
let style: MapStyle = (() => {
  try {
    return localStorage.getItem(STYLE_KEY) === "sat" ? "sat" : "chart";
  } catch {
    return "chart";
  }
})();
const styleListeners = new Set<() => void>();

export function setMapStyle(s: MapStyle) {
  style = s;
  try {
    localStorage.setItem(STYLE_KEY, s);
  } catch {
    /* depolama kapalı olabilir */
  }
  styleListeners.forEach((f) => f());
}

export function useMapStyle(): MapStyle {
  return useSyncExternalStore(
    (f) => {
      styleListeners.add(f);
      return () => styleListeners.delete(f);
    },
    () => style,
  );
}

// ───────────── Karo durumu ─────────────

/** Adres → yüklendi mi (hata zamanıyla). Sayfa boyunca kalır: tarayıcı önbelleğindeki karo yeniden soluklaşmaz. */
const status = new Map<string, { ok: boolean; at: number }>();
const RETRY_MS = 20_000;
let pending = 0;
const statusListeners = new Set<() => void>();

function settle(url: string, ok: boolean) {
  status.set(url, { ok, at: performance.now() });
  // Saatlerce süren uçuşta kayıt şişmesin: en eskiler atılır (Map ekleme sırasını korur).
  if (status.size > 6000) for (const k of [...status.keys()].slice(0, 1500)) status.delete(k);
  // Aynı karede biten karolar tek çizime toplanır.
  if (!pending) pending = requestAnimationFrame(() => {
    pending = 0;
    statusListeners.forEach((f) => f());
  });
}

function useStatusVersion() {
  const [v, bump] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    statusListeners.add(bump);
    return () => void statusListeners.delete(bump);
  }, []);
  return v;
}

const state = (url: string): "ok" | "failed" | "new" => {
  const s = status.get(url);
  if (!s) return "new";
  if (s.ok) return "ok";
  if (performance.now() - s.at > RETRY_MS) {
    status.delete(url);
    return "new";
  }
  return "failed";
};

// ───────────── Çizim ─────────────

export interface Area {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

interface TileRef {
  url: string;
  x: number;
  y: number;
  size: number;
  key: string;
}

function tilesAt(src: TileSource, layer: string, z: number, area: Area, limit: number): TileRef[] | null {
  const n = 2 ** z;
  const ts = WORLD / n;
  const [tx0, tx1] = [Math.floor(area.x0 / ts), Math.floor(area.x1 / ts)];
  const [ty0, ty1] = [Math.max(0, Math.floor(area.y0 / ts)), Math.min(n - 1, Math.floor(area.y1 / ts))];
  if ((tx1 - tx0 + 1) * (ty1 - ty0 + 1) > limit) return null;
  const out: TileRef[] = [];
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      const real = ((tx % n) + n) % n;
      out.push({ url: tileUrl(src, layer, z, real, ty), x: tx * ts, y: ty * ts, size: ts, key: `${z}/${tx}/${ty}` });
    }
  }
  return out;
}

/** Karo düzeyi: ekranda ~256 px'e en yakın düzey; yüksek yoğunluklu ekranlarda biraz yukarı yuvarlanır. */
export function levelFor(zoom: number, info: TileLayerInfo): number {
  const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
  return Math.max(info.minZoom, Math.min(info.maxZoom, Math.round(zoom + (dpr >= 1.5 ? 0.3 : 0) - 0.05)));
}

export const RasterLayer = memo(function RasterLayer({
  src,
  info,
  area,
  zoom,
  u,
  opacity = 1,
  filter,
  onHealth,
}: {
  src: TileSource;
  info: TileLayerInfo;
  area: Area;
  /** Haritanın sürekli yakınlığı (Z'de bir karo 256 px). */
  zoom: number;
  /** Bir ekran pikselinin birim karşılığı (karolar arasında kılcal boşluk kalmasın diye taşma payı). */
  u: number;
  opacity?: number;
  /** CSS süzgeci (koyu temada kabartmayı karartmak için). */
  filter?: string;
  /** Katman hiç karo veremiyorsa `false` (çevrimdışı uydu). */
  onHealth?: (ok: boolean) => void;
}) {
  const version = useStatusVersion();
  const z = levelFor(zoom, info);
  const levels = useMemo(() => {
    const out: { z: number; tiles: TileRef[]; onlyLoaded: boolean }[] = [];
    const backdrop = Math.max(info.minZoom, z - 3);
    const add = (lz: number, onlyLoaded: boolean) => {
      const tiles = tilesAt(src, info.id, lz, area, 220);
      if (tiles) out.push({ z: lz, tiles, onlyLoaded });
    };
    if (backdrop < z) add(backdrop, false);
    if (z - 1 > backdrop) add(z - 1, true);
    add(z, false);
    return out;
  }, [src, info, z, area.x0, area.x1, area.y0, area.y1]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sağlık: istenen düzeyde en az iki karo düştüyse ve hiçbiri gelmediyse katman yok sayılır.
  const top = levels[levels.length - 1];
  let ok = 0;
  let failed = 0;
  for (const t of top?.tiles ?? []) {
    const s = state(t.url);
    if (s === "ok") ok++;
    else if (s === "failed") failed++;
  }
  const healthy = ok > 0 || failed < 2;
  useEffect(() => onHealth?.(healthy), [healthy, onHealth]);
  void version;

  const pad = u * 0.6;
  return (
    <g opacity={opacity} style={filter ? { filter } : undefined} pointerEvents="none">
      {levels.map(({ z: lz, tiles, onlyLoaded }) => (
        <g key={lz}>
          {tiles.map((t) => {
            const s = state(t.url);
            if (s === "failed" || (onlyLoaded && s !== "ok")) return null;
            return (
              <image
                key={t.key}
                href={t.url}
                x={t.x}
                y={t.y}
                width={t.size + pad}
                height={t.size + pad}
                preserveAspectRatio="none"
                style={{ opacity: s === "ok" ? 1 : 0, transition: "opacity 220ms ease-out" }}
                onLoad={() => settle(t.url, true)}
                onError={() => settle(t.url, false)}
              />
            );
          })}
        </g>
      ))}
    </g>
  );
});
