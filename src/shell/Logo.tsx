/** Modstead işareti: bir çatının altında üst üste binmiş katmanlar (modların yurdu). Sitedeki gibi turuncu. */
export function LogoMark({ size = 22, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} aria-hidden>
      <path d="M9 29 L32 11 L55 29" fill="none" stroke="var(--mark)" strokeWidth="6.5" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="16" y="33" width="32" height="5.6" rx="2.8" fill="var(--mark)" />
      <rect x="16" y="41.6" width="32" height="5.6" rx="2.8" fill="var(--mark)" opacity="0.72" />
      <rect x="16" y="50.2" width="32" height="5.6" rx="2.8" fill="var(--mark)" opacity="0.45" />
    </svg>
  );
}

/** Uygulama simgesi gibi koyu karo üstünde işaret; iki temada da aynı görünür. */
export function LogoTile({ size = 44 }: { size?: number }) {
  return (
    <div
      className="flex items-center justify-center"
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.3),
        background: "linear-gradient(180deg, color-mix(in oklab, var(--ink), white 8%), var(--ink))",
        boxShadow: "inset 0 1px 0 rgb(255 255 255 / 0.08), inset 0 0 0 1px rgb(170 190 255 / 0.12)",
      }}
    >
      <LogoMark size={size * 0.6} />
    </div>
  );
}
