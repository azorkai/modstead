// Haritanın havacılık simgeleri: havalimanı işaretleri (kuleli/büyük mavi, küçük eflatun; en uzun pistin yönünde çubuk),
// yakında gerçek ölçekli pist çizimi (OurAirports uçları), rota uçları (etiket çipiyle), uçak. Boyutlar ekran pikseli;
// `u` bir pikselin izdüşüm birimi karşılığıdır. "Uçuş yönü yukarı"da yazılar `up` ile dik tutulur.

import { memo } from "react";
import type { MapAirport } from "../types";
import type { Runway } from "./geo";
import { mercY, nmUnits } from "./merc";

export type UpAttrs = { transform?: string; "data-up"?: string };
export type Up = (x: number, y: number) => UpAttrs;

/** Yazı genişliği tahmini (px): eşaralıklı yazıda karakter başına ~0.62 em, orantılıda ~0.56 em. */
export const textWidth = (text: string, font: number, mono: boolean) => text.length * font * (mono ? 0.62 : 0.56);

/** Büyük ve orta meydanlar kuleli sayılır (mavi); küçükler ve deniz uçağı üsleri eflatun. */
export const towered = (s: MapAirport["size"]) => s === "large" || s === "medium";

/** Havalimanı simgesi. `bare`: yakında pist çizimi zaten görünüyor; yalnızca etiket. */
export function AirportMark({
  ap,
  x,
  y,
  u,
  label,
  up,
  bare,
}: {
  ap: MapAirport;
  x: number;
  y: number;
  u: number;
  label?: { x: number; anchor: "start" | "end" };
  up: Up;
  bare?: boolean;
}) {
  const color = towered(ap.size) ? "var(--rm-twr)" : "var(--rm-ntwr)";
  const hdg = parseInt(ap.runway, 10) * 10;
  const bar = Number.isFinite(hdg) && ap.size !== "seaplane";
  const [r, len, w] = ap.size === "large" ? [6.2, 11, 2.6] : ap.size === "medium" ? [4.8, 8, 2.2] : [3.6, 5.6, 1.6];
  return (
    <g>
      <title>{`${ap.icao} · ${ap.name}`}</title>
      {!bare && (
        <g transform={`translate(${x} ${y}) scale(${u})`}>
          {ap.size === "large" && (
            <path d="M0 -6.2V-9.4M6.2 0H9.4M0 6.2V9.4M-6.2 0H-9.4" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
          )}
          <circle r={r} fill="var(--rm-halo)" stroke={color} strokeWidth={ap.size === "large" ? 1.8 : 1.5} />
          {bar && <line x1={0} y1={len / 2} x2={0} y2={-len / 2} transform={`rotate(${hdg})`} stroke={color} strokeWidth={w} strokeLinecap="butt" />}
          {ap.size === "seaplane" && <path d="M0 -2.2V2.3M-1.4 -1.1H1.4M-2.1 0.9Q0 3.4 2.1 0.9" fill="none" stroke={color} strokeWidth={1.1} strokeLinecap="round" />}
          {!bar && ap.size !== "seaplane" && <circle r={1.3} fill={color} />}
        </g>
      )}
      {label && (
        <text
          x={label.x}
          y={y}
          dy="0.35em"
          textAnchor={label.anchor}
          fontSize={u * (ap.size === "large" ? 10.5 : 10)}
          fontWeight={700}
          fill={color}
          stroke="var(--rm-halo)"
          strokeWidth={u * 3}
          paintOrder="stroke"
          strokeLinejoin="round"
          style={{ fontFamily: "var(--font-mono)" }}
          {...up(x, y)}
        >
          {ap.icao}
        </text>
      )}
    </g>
  );
}

/** Pistin izdüşümdeki uçları ve genişliği (birim). */
export function runwayGeom(rw: Runway, fix: (lon: number) => number) {
  const [x1, y1, x2, y2] = [fix(rw.lon1) + 180, mercY(rw.lat1), fix(rw.lon2) + 180, mercY(rw.lat2)];
  const width = (rw.widthM / 1852) * nmUnits((rw.lat1 + rw.lat2) / 2);
  return { x1, y1, x2, y2, width };
}

/** Gerçek ölçekli pistler. Çok uzaktan ince çizgi (en az ~3 px), yakında orta çizgi ve uç numaraları. Uydu
 *  görüntüsünde pistin kendisi göründüğünden yalnızca numaralar ve ince bir çerçeve çizilir. */
export const RunwayLayer = memo(function RunwayLayer({
  items,
  u,
  zoom,
  sat,
  up,
}: {
  items: { key: string; x1: number; y1: number; x2: number; y2: number; width: number; rw: Runway }[];
  u: number;
  zoom: number;
  sat: boolean;
  up: Up;
}) {
  const marks = zoom >= 12.6;
  const numbers = zoom >= 12;
  const placed: [number, number, number][] = [];
  return (
    <g pointerEvents="none">
      {!sat &&
        items.map(({ key, x1, y1, x2, y2, width, rw }) => {
          // Gerçek genişlik biraz abartılır (havacılık haritalarındaki gibi okunaklı), uzaktan en az ~4 px.
          const w = Math.max(width * 1.25, u * (rw.surface === "paved" ? 4 : 3));
          if (rw.surface === "water")
            return <line key={key} x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--rm-river)" strokeWidth={1.2} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />;
          return (
            <g key={key}>
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--rm-halo)" strokeWidth={w + u * 2.4} strokeLinecap="butt" />
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={rw.surface === "paved" ? "var(--rm-rwy)" : "var(--rm-rwy-soft)"} strokeWidth={w} strokeLinecap="butt" />
              {marks && rw.surface === "paved" && width > u * 7 && (
                <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--rm-rwy-mark)" strokeWidth={1} strokeDasharray="7 6" vectorEffect="non-scaling-stroke" />
              )}
            </g>
          );
        })}
      {sat &&
        zoom >= 11.5 &&
        items.map(({ key, x1, y1, x2, y2, width }) => (
          <line key={key} x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgb(255 255 255 / 0.5)" strokeWidth={Math.max(width, u * 2) + u * 2} strokeOpacity={0.35} />
        ))}
      {numbers &&
        items.flatMap(({ key, x1, y1, x2, y2, rw }) => {
          const len = Math.hypot(x2 - x1, y2 - y1);
          if (len < u * 40) return [];
          const [dx, dy] = [(x2 - x1) / len, (y2 - y1) / len];
          const gap = u * 11;
          return [
            [rw.ends[0], x1 - dx * gap, y1 - dy * gap],
            [rw.ends[1], x2 + dx * gap, y2 + dy * gap],
          ]
            .filter(([t, x, y]) => {
              // Paralel pistlerin uç numaraları çakışmasın: yer kalmayanı atlanır.
              if (!t) return false;
              const half = (textWidth(t as string, 9.5, true) / 2 + 3) * u;
              if (placed.some(([px, py, ph]) => Math.abs(px - (x as number)) < half + ph && Math.abs(py - (y as number)) < u * 12)) return false;
              placed.push([x as number, y as number, half]);
              return true;
            })
            .map(([t, x, y]) => (
              <text
                key={`${key}${t}`}
                x={x as number}
                y={y as number}
                dy="0.35em"
                textAnchor="middle"
                fontSize={u * 9.5}
                fontWeight={700}
                fill={sat ? "#ffffff" : "var(--rm-label)"}
                stroke="var(--rm-halo)"
                strokeWidth={u * 2.6}
                paintOrder="stroke"
                style={{ fontFamily: "var(--font-mono)" }}
                {...up(x as number, y as number)}
              >
                {t}
              </text>
            ));
        })}
    </g>
  );
});

/** Rota ucu çipinin boyu (px). */
export const chipSize = (label: string, kind: "from" | "to" | "alt") => {
  const font = kind === "alt" ? 11 : 12.5;
  return { w: textWidth(label, font, true) + 12, h: font + 8, font };
};

/** Rota ucu: kalkış (dolu), varış (hedef halkası), yedek (kesik halka); ICAO çipi `chip` kadar ötede (px, çipin
 *  ortası; verilmezse çip yok). */
export function EndMarker({ x, y, u, label, chip, kind, up }: { x: number; y: number; u: number; label?: string; chip?: { dx: number; dy: number }; kind: "from" | "to" | "alt"; up: Up }) {
  const { w, h, font } = chipSize(label ?? "", kind);
  return (
    <g>
      <g transform={`translate(${x} ${y}) scale(${u})`}>
        {kind === "from" && (
          <>
            <circle r={6.4} fill="var(--rm-casing)" />
            <circle r={4.6} fill="var(--rm-route)" />
          </>
        )}
        {kind === "to" && (
          <>
            <circle r={8} fill="var(--rm-casing)" />
            <circle r={6.2} fill="none" stroke="var(--rm-route)" strokeWidth={2.4} />
            <circle r={2.6} fill="var(--rm-route)" />
          </>
        )}
        {kind === "alt" && <circle r={6} fill="none" stroke="var(--rm-label-2)" strokeWidth={1.8} strokeDasharray="3 2.2" />}
      </g>
      {label && chip && (
        <g {...up(x, y)}>
          <rect x={x + (chip.dx - w / 2) * u} y={y + (chip.dy - h / 2) * u} width={w * u} height={h * u} rx={u * 6} fill="var(--rm-chip)" stroke="var(--rm-chip-line)" strokeWidth={u} />
          <text
            x={x + chip.dx * u}
            y={y + chip.dy * u}
            dy="0.36em"
            textAnchor="middle"
            fontSize={u * font}
            fontWeight={700}
            fill={kind === "alt" ? "var(--rm-label-2)" : "var(--rm-chip-fg)"}
            style={{ fontFamily: "var(--font-mono)" }}
          >
            {label}
          </text>
        </g>
      )}
    </g>
  );
}

/** Rota üzerinde yön okları (ekranda ~140 px arayla, yalnızca görünen kısımda). */
export function chevrons(pts: readonly (readonly [number, number])[], u: number, inView: (x: number, y: number) => boolean, spacingPx = 140): string {
  const step = spacingPx * u;
  let d = "";
  let carry = step / 2;
  let count = 0;
  for (let i = 1; i < pts.length && count < 200; i++) {
    const [ax, ay] = pts[i - 1];
    const [bx, by] = pts[i];
    const len = Math.hypot(bx - ax, by - ay);
    if (len === 0) continue;
    // Görünmeyen parçada yalnızca aralık ilerler.
    const visible = inView(ax, ay) || inView(bx, by) || inView((ax + bx) / 2, (ay + by) / 2);
    if (!visible) {
      carry = (((carry - len) % step) + step) % step;
      continue;
    }
    const [dx, dy] = [(bx - ax) / len, (by - ay) / len];
    let s = carry;
    while (s < len && count < 200) {
      const [x, y] = [ax + dx * s, ay + dy * s];
      if (inView(x, y)) {
        // Ok başı: ekranda 4.5 px kanat.
        const [px, py] = [-dy, dx];
        const k = 4.5 * u;
        d += `M${x - dx * k + px * k} ${y - dy * k + py * k}L${x + dx * k * 0.4} ${y + dy * k * 0.4}L${x - dx * k - px * k} ${y - dy * k - py * k}`;
        count++;
      }
      s += step;
    }
    carry = s - len;
  }
  return d;
}

/** Uçak (burun yukarı, ekranda ~18 px). */
export const PLANE = "M0 -9 L2 -2 L9 2 L9 4 L2 2 L1.5 7 L4 9 L4 10.5 L0 9.5 L-4 10.5 L-4 9 L-1.5 7 L-2 2 L-9 4 L-9 2 L-2 -2 Z";

export const planeAt = (x: number, y: number, hdg: number, u: number, scale: number) => `translate(${x} ${y}) rotate(${hdg}) scale(${u * scale})`;
