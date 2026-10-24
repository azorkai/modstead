// Bannerlord kahraman görseli: katmanlı dağlar, rüzgârda dalgalanan sancak, kor kıvılcımları.
// Renk `currentColor` (oyunun vurgu rengi).

import { useId } from "react";

const SPARKS: [number, number, number, number][] = [
  [300, 60, 1.6, 0.5],
  [330, 40, 1.2, 0.4],
  [268, 82, 1.4, 0.35],
  [420, 116, 1.3, 0.45],
  [244, 50, 1, 0.3],
];

export function BannerlordArt({ className }: { className?: string }) {
  const sun = useId();
  return (
    <svg viewBox="0 0 480 200" className={className} fill="none" preserveAspectRatio="xMaxYMax meet" aria-hidden>
      <defs>
        <linearGradient id={sun} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="currentColor" stopOpacity="0.5" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <circle cx="326" cy="104" r="64" fill={`url(#${sun})`} />
      {/* uzak dağlar */}
      <path d="M0 160 L58 118 L96 140 L150 92 L198 132 L238 108 L292 146 L340 112 L396 150 L438 124 L480 142 V200 H0 Z" fill="currentColor" opacity="0.12" />
      {/* yakın dağlar */}
      <path d="M0 184 L70 146 L118 166 L176 128 L226 162 L272 140 L330 174 L380 150 L430 172 L480 160 V200 H0 Z" fill="currentColor" opacity="0.22" />
      {/* sancak direği */}
      <path d="M352 196 V44" stroke="currentColor" strokeOpacity="0.75" strokeWidth="3" strokeLinecap="round" />
      <circle cx="352" cy="40" r="4" fill="currentColor" opacity="0.85" />
      {/* sancak */}
      <path d="M354 50 C372 46 388 56 406 52 C412 51 418 49 422 47 L416 64 L422 82 C410 86 398 80 384 84 C372 87 362 86 354 84 Z" fill="currentColor" opacity="0.55" />
      <path d="M378 58 l6 7 l-6 7 l-6 -7 Z" fill="currentColor" opacity="0.95" />
      {SPARKS.map(([x, y, r, o]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r={r} fill="currentColor" opacity={o} />
      ))}
    </svg>
  );
}
