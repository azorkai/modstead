// MSFS kahraman görseli: ufukta gün batımı, perspektifli pist, tırmanan uçak ve iz.
// Renk `currentColor` (oyunun vurgu rengi).

import { useId } from "react";

export function MsfsArt({ className }: { className?: string }) {
  const sun = useId();
  const trail = useId();
  return (
    <svg viewBox="0 0 480 200" className={className} fill="none" preserveAspectRatio="xMaxYMax meet" aria-hidden>
      <defs>
        <radialGradient id={sun} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="currentColor" stopOpacity="0.75" />
          <stop offset="0.6" stopColor="currentColor" stopOpacity="0.22" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={trail} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="currentColor" stopOpacity="0" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0.6" />
        </linearGradient>
      </defs>
      <circle cx="330" cy="132" r="78" fill={`url(#${sun})`} />
      {/* ufuk */}
      <path d="M0 132 H480" stroke="currentColor" strokeOpacity="0.28" />
      <path d="M0 146 H480" stroke="currentColor" strokeOpacity="0.1" />
      {/* pist */}
      <path d="M220 200 L318 132 M440 200 L342 132" stroke="currentColor" strokeOpacity="0.45" strokeWidth="1.5" />
      <path d="M330 198 V136" stroke="currentColor" strokeOpacity="0.55" strokeWidth="2" strokeDasharray="7 8" />
      <path d="M262 186 h12 M386 186 h12 M282 172 h9 M369 172 h9" stroke="currentColor" strokeOpacity="0.5" strokeWidth="2" />
      {/* iz */}
      <path d="M150 118 C230 96 300 70 382 44" stroke={`url(#${trail})`} strokeWidth="2" strokeLinecap="round" />
      {/* uçak (üstten görünüm, burnu sağ yukarı) */}
      <g transform="translate(372 18) rotate(58) scale(0.52)" fill="currentColor" opacity="0.95">
        <path d="M50 5 C53 5 54 9 54 14 L54 38 L92 58 L92 64 L54 54 L54 78 L64 86 L64 91 L50 87 L36 91 L36 86 L46 78 L46 54 L8 64 L8 58 L46 38 L46 14 C46 9 47 5 50 5 Z" />
      </g>
    </svg>
  );
}
