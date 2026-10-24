// Stardew kahraman görseli: piksel gece gökyüzü, basamaklı tepeler, çit ve filiz.
// Renk `currentColor` (oyunun vurgu rengi); Stardew'in kendi görselleri kullanılmaz.

const STARS: [number, number, number][] = [
  [40, 22, 0.8], [92, 48, 0.5], [148, 18, 0.7], [210, 40, 0.45], [262, 14, 0.9], [318, 34, 0.55],
  [366, 20, 0.75], [412, 40, 0.5], [430, 16, 0.65], [176, 64, 0.35], [300, 70, 0.3], [396, 76, 0.35],
];

export function StardewArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 480 200" className={className} fill="currentColor" shapeRendering="crispEdges" preserveAspectRatio="xMaxYMax meet" aria-hidden>
      {STARS.map(([x, y, o]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width="4" height="4" opacity={o} />
      ))}
      <rect x="338" y="30" width="8" height="8" opacity="0.9" />
      {/* ay */}
      <g opacity="0.85">
        <rect x="372" y="44" width="24" height="8" />
        <rect x="364" y="52" width="40" height="24" />
        <rect x="372" y="76" width="24" height="8" />
      </g>
      {/* arka tepe */}
      <path opacity="0.14" d="M0 150 h40 v-8 h40 v-8 h48 v-8 h56 v8 h40 v8 h32 v-8 h48 v-16 h56 v8 h40 v8 h40 v8 h40 v66 H0 Z" />
      {/* ön tepe */}
      <path opacity="0.26" d="M0 176 h56 v-8 h64 v-8 h72 v8 h48 v8 h40 v-8 h56 v-8 h64 v8 h40 v8 h40 v24 H0 Z" />
      {/* çit */}
      <g opacity="0.45">
        <rect x="110" y="148" width="6" height="22" />
        <rect x="150" y="148" width="6" height="22" />
        <rect x="190" y="148" width="6" height="22" />
        <rect x="104" y="154" width="98" height="4" />
        <rect x="104" y="162" width="98" height="4" />
      </g>
      {/* filiz */}
      <g opacity="0.95">
        <rect x="318" y="128" width="8" height="40" />
        <rect x="294" y="112" width="24" height="8" />
        <rect x="286" y="104" width="16" height="8" />
        <rect x="302" y="120" width="16" height="8" />
        <rect x="326" y="104" width="24" height="8" />
        <rect x="342" y="96" width="16" height="8" />
        <rect x="326" y="112" width="16" height="8" />
      </g>
    </svg>
  );
}
