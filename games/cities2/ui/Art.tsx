// Cities: Skylines II kahraman görseli: gökdelenler, asma köprü ve rüzgâr türbinleri olan bir kıyı
// silueti. Renk `currentColor` (oyunun vurgu rengi); oyunun kendi görselleri kullanılmaz.

const TOWERS: [number, number, number][] = [
  // x, genişlik, yükseklik
  [214, 18, 92], [234, 26, 128], [262, 16, 104], [280, 30, 150], [312, 20, 118], [334, 24, 168], [360, 18, 126], [380, 28, 142],
  [410, 16, 98], [428, 22, 116], [452, 20, 84],
];

export function CitiesArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 480 200" className={className} fill="currentColor" preserveAspectRatio="xMaxYMax meet" aria-hidden>
      {/* uzak tepeler */}
      <path opacity="0.1" d="M0 150 C60 128 110 136 160 124 S260 112 320 120 S420 108 480 116 V200 H0 Z" />
      {/* gökdelenler */}
      <g opacity="0.22">
        {TOWERS.map(([x, w, h]) => (
          <rect key={x} x={x} y={182 - h} width={w} height={h} rx="1.5" />
        ))}
        <rect x="346" y="6" width="2" height="12" />
      </g>
      {/* pencere ışıkları */}
      <g opacity="0.55">
        {TOWERS.flatMap(([x, w, h], i) =>
          Array.from({ length: Math.floor(h / 22) }, (_, j) => (j + i) % 3 !== 0 && <rect key={`${x}-${j}`} x={x + 4 + ((j * 7) % Math.max(4, w - 10))} y={190 - h + j * 20} width="3" height="5" rx="0.5" />),
        )}
      </g>
      {/* asma köprü */}
      <g opacity="0.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
        <path d="M0 160 L210 160" strokeWidth="2.4" />
        <path d="M40 160 V108 M150 160 V108" strokeWidth="2.4" />
        <path d="M0 132 Q40 106 40 108 Q95 150 150 108 Q180 128 210 150" />
        {[55, 70, 85, 100, 115, 130].map((x) => (
          <path key={x} d={`M${x} 160 V${x < 95 ? 120 + (x - 55) * 0.55 : 142 - (x - 95) * 0.6}`} strokeWidth="0.9" />
        ))}
      </g>
      {/* rüzgâr türbinleri */}
      <g opacity="0.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
        <path d="M466 182 V140 M466 140 L456 128 M466 140 L480 138 M466 140 L462 156" />
        <path d="M444 182 V150 M444 150 L437 141 M444 150 L454 149 M444 150 L441 162" />
      </g>
      {/* su ve kıyı */}
      <path opacity="0.3" d="M0 182 H480 V200 H0 Z" />
      <path opacity="0.18" d="M20 190 H90 M140 194 H230 M280 190 H360 M400 195 H470" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}
