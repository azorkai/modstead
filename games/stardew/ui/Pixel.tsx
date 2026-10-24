// Stardew'e özel piksel sanatı (Vadi'den): el yapımı küçük sprite'lar ve her mod için kimliğinden
// türetilen, kendine özgü piksel kapaklar. Hepsi SVG; her boyutta keskin görünür. Renkler oyun
// görseli sayılır (bkz. docs/TASARIM.md); Stardew'in kendi görselleri kopyalanmaz.
import { memo, useMemo, type ReactNode } from "react";
import { hueOf } from "@/lib/format";

type Palette = Record<string, string>;

function Sprite({ map, palette, size, className, title }: { map: string[]; palette: Palette; size: number; className?: string; title?: string }) {
  const w = map[0].length;
  const h = map.length;
  const rects = useMemo(() => {
    const out: { x: number; y: number; w: number; c: string }[] = [];
    map.forEach((row, y) => {
      let x = 0;
      while (x < row.length) {
        const ch = row[x];
        if (ch === "." || !palette[ch]) {
          x++;
          continue;
        }
        let run = 1;
        while (x + run < row.length && row[x + run] === ch) run++;
        out.push({ x, y, w: run, c: palette[ch] });
        x += run;
      }
    });
    return out;
  }, [map, palette]);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={size} height={(size * h) / w} className={className} shapeRendering="crispEdges" role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      {rects.map((r, i) => (
        <rect key={i} x={r.x} y={r.y} width={r.w} height={1} fill={r.c} />
      ))}
    </svg>
  );
}

/** Maskot "Filiz": başında iki yaprak olan sevimli bir bahçe yaratığı. */
const FILIZ = [
  "....GG....GG....",
  "...GLLG..GLLG...",
  "...GLLLGGLLLG...",
  "....GLLLLLLG....",
  ".....GGSSGG.....",
  ".......SS.......",
  ".....oooooo.....",
  "...ooBBBBBBoo...",
  "..oBBWWBBBBBBo..",
  ".oBBWBBBBBBBBBo.",
  ".oBBBEBBBBEBBBo.",
  ".oBBBEBBBBEBBBo.",
  ".oBPPBBMMBBPPBo.",
  ".oBBBBBBBBBBBBo.",
  "..obbbbbbbbbbo..",
  "...oooooooooo...",
];
const FILIZ_PAL: Palette = { G: "#2c7a3f", L: "#86e07a", S: "#3fae5a", o: "#1c3527", B: "#a6efbe", b: "#68c98d", W: "#ffffff", E: "#16241c", P: "#ff9fb4", M: "#16241c" };

export function Filiz({ size = 64, className }: { size?: number; className?: string }) {
  return <Sprite map={FILIZ} palette={FILIZ_PAL} size={size} className={className} title="Filiz" />;
}

const HEART = [".RR.RR.", "RHRRRRR", "RRRRRRR", ".RRRRR.", "..RRR..", "...R..."];
export const PixelHeart = ({ size = 14, className }: { size?: number; className?: string }) => <Sprite map={HEART} palette={{ R: "#f2615a", H: "#ffb3ad" }} size={size} className={className} />;

const COIN = [".oooo.", "oYYYYo", "oYWYYo", "oYWYYo", "oYYYDo", ".oooo."];
export const PixelCoin = ({ size = 14, className }: { size?: number; className?: string }) => <Sprite map={COIN} palette={{ o: "#9a6a06", Y: "#f5c542", W: "#fff3b0", D: "#d79e14" }} size={size} className={className} />;

const STAR = ["..Y..", ".YYY.", "YYWYY", ".YYY.", "Y...Y"];
export const PixelStar = ({ size = 12, className }: { size?: number; className?: string }) => <Sprite map={STAR} palette={{ Y: "#f5c542", W: "#fff6c8" }} size={size} className={className} />;

const SPARK = ["..W..", "..W..", "WWYWW", "..W..", "..W.."];
export const PixelSpark = ({ size = 10, className }: { size?: number; className?: string }) => <Sprite map={SPARK} palette={{ W: "#fffbe0", Y: "#f5c542" }} size={size} className={className} />;

/** Gece gökyüzü, ay ve kademeli tepelerle piksel manzara (ana sayfa afişi için). */
export const PixelLandscape = memo(function PixelLandscape({ className }: { className?: string }) {
  const W = 320;
  const H = 60;
  const rects: ReactNode[] = [];
  const hill = (base: number, amp: number, freq: number, phase: number, color: string, key: string) => {
    for (let x = 0; x < W; x++) {
      const y = Math.round(base + Math.sin(x * freq + phase) * amp + Math.sin(x * freq * 2.7 + phase * 1.3) * amp * 0.35);
      rects.push(<rect key={`${key}${x}`} x={x} y={y} width={1} height={H - y} fill={color} />);
    }
  };
  hill(38, 4, 0.035, 1.2, "#1d3a33", "a");
  hill(45, 3, 0.06, 0.2, "#21503a", "b");
  hill(51, 2, 0.1, 2.4, "#2a6b43", "c");
  // Çimen tutamları, çit ve ağaçlar
  for (let x = 4; x < W; x += 7) rects.push(<rect key={`g${x}`} x={x} y={54 + ((x * 7) % 3)} width={1} height={1} fill="#4fa65d" />);
  for (let x = 196; x < 262; x += 4) rects.push(<rect key={`f${x}`} x={x} y={49} width={1} height={4} fill="#8a5a33" />);
  rects.push(<rect key="rail" x={196} y={50} width={65} height={1} fill="#a87444" />);
  for (const tx of [150, 166, 290, 304]) {
    rects.push(<rect key={`t${tx}`} x={tx} y={42} width={1} height={6} fill="#5b3b22" />);
    rects.push(<rect key={`l${tx}`} x={tx - 2} y={37} width={5} height={5} fill="#2f7d45" />);
    rects.push(<rect key={`m${tx}`} x={tx - 1} y={36} width={3} height={1} fill="#3f9a56" />);
  }
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMax slice" className={className} shapeRendering="crispEdges" aria-hidden>
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1b2340" />
          <stop offset="0.7" stopColor="#2b2a4f" />
          <stop offset="1" stopColor="#4a3355" />
        </linearGradient>
      </defs>
      <rect width={W} height={H} fill="url(#sky)" />
      {[
        [12, 6], [40, 3], [58, 11], [77, 5], [101, 9], [118, 4], [139, 12], [150, 6], [24, 16], [88, 15],
        [170, 8], [186, 3], [214, 14], [236, 6], [258, 11], [272, 4], [296, 16], [312, 7], [128, 20], [204, 22],
      ].map(([x, y], i) => (
        <rect key={`s${i}`} x={x} y={y} width={1} height={1} fill="#fff6d0" opacity={i % 3 === 0 ? 1 : 0.6} />
      ))}
      <rect x={282} y={8} width={6} height={6} fill="#f7e7a8" />
      <rect x={281} y={9} width={8} height={4} fill="#f7e7a8" />
      <rect x={285} y={9} width={2} height={2} fill="#e3cf86" />
      {rects}
    </svg>
  );
});

function rng(seed: number) {
  let s = seed || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const GEAR = [".o.oo.o.", "oooooooo", ".oo..oo.", "oo....oo", "oo....oo", ".oo..oo.", "oooooooo", ".o.oo.o."];
const LEAF = ["....oooo", "..oooooo", ".ooo.ooo", "ooo..oo.", "oo..ooo.", "o..ooo..", ".ooo....", "oo......"];
const WARN = ["...oo...", "..oooo..", "..o..o..", ".oo..oo.", ".oooooo.", "oo.oo.oo", "oooooooo", "........"];

/** Mod kimliğinden türetilen benzersiz piksel kapak. */
export const PixelCover = memo(function PixelCover({ seed, kind, className, dim }: { seed: string; kind: "smapi" | "content" | "unknown"; className?: string; dim?: boolean }) {
  const h = hueOf(seed);
  const rand = rng(h * 7919 + seed.length);
  const W = 48;
  const H = 27;
  const sky1 = `oklch(0.42 0.09 ${h})`;
  const sky2 = `oklch(0.28 0.07 ${(h + 40) % 360})`;
  const hillA = `oklch(0.46 0.1 ${(h + 120) % 360})`;
  const hillB = `oklch(0.36 0.09 ${(h + 140) % 360})`;
  const rects: ReactNode[] = [];
  const phase = rand() * 6;
  const freq = 0.12 + rand() * 0.12;
  for (let x = 0; x < W; x++) {
    const y1 = Math.round(18 + Math.sin(x * freq + phase) * 3);
    const y2 = Math.round(22 + Math.sin(x * freq * 1.7 + phase * 2) * 2);
    rects.push(<rect key={`a${x}`} x={x} y={y1} width={1} height={H - y1} fill={hillA} />);
    rects.push(<rect key={`b${x}`} x={x} y={y2} width={1} height={H - y2} fill={hillB} />);
  }
  for (let i = 0; i < 7; i++) rects.push(<rect key={`s${i}`} x={Math.floor(rand() * W)} y={Math.floor(rand() * 12)} width={1} height={1} fill="#fff8dc" opacity={0.5 + rand() * 0.5} />);
  const sunX = 4 + Math.floor(rand() * 8);
  const glyph = kind === "smapi" ? GEAR : kind === "content" ? LEAF : WARN;
  const gx = 34 + Math.floor(rand() * 6);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" className={className} shapeRendering="crispEdges" aria-hidden style={dim ? { filter: "grayscale(0.85) brightness(0.8)" } : undefined}>
      <defs>
        <linearGradient id={`g${h}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={sky2} />
          <stop offset="1" stopColor={sky1} />
        </linearGradient>
      </defs>
      <rect width={W} height={H} fill={`url(#g${h})`} />
      <rect x={sunX} y={4} width={4} height={4} fill={`oklch(0.88 0.12 ${(h + 60) % 360})`} />
      <rect x={sunX - 1} y={5} width={6} height={2} fill={`oklch(0.88 0.12 ${(h + 60) % 360})`} />
      {rects}
      {glyph.map((row, y) =>
        [...row].map((c, x) => (c === "o" ? <rect key={`k${x}-${y}`} x={gx + x} y={3 + y} width={1} height={1} fill="#ffffff" opacity={0.22} /> : null)),
      )}
    </svg>
  );
});
