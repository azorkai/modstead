import { useId } from "react";

/** Modstead işareti: bir çatının altında üst üste binmiş katmanlar (modların yurdu). */
export function LogoMark({ size = 22, className }: { size?: number; className?: string }) {
  const g = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} aria-hidden>
      <defs>
        <linearGradient id={g} x1="0.15" y1="0" x2="0.85" y2="1">
          <stop offset="0" stopColor="var(--brand-2)" />
          <stop offset="1" stopColor="var(--brand)" />
        </linearGradient>
      </defs>
      <path d="M9 29 L32 11 L55 29" fill="none" stroke={`url(#${g})`} strokeWidth="6.5" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="16" y="33" width="32" height="5.6" rx="2.8" fill={`url(#${g})`} />
      <rect x="16" y="41.6" width="32" height="5.6" rx="2.8" fill={`url(#${g})`} opacity="0.72" />
      <rect x="16" y="50.2" width="32" height="5.6" rx="2.8" fill={`url(#${g})`} opacity="0.45" />
    </svg>
  );
}

export function LogoTile({ size = 44 }: { size?: number }) {
  return (
    <div
      className="flex items-center justify-center rounded-[14px] border border-line-strong"
      style={{
        width: size,
        height: size,
        background:
          "radial-gradient(120% 90% at 50% 0%, color-mix(in oklab, var(--brand) 26%, transparent), transparent 70%), linear-gradient(160deg, var(--surface-2), var(--bg))",
        boxShadow: "var(--highlight), var(--shadow-sm)",
      }}
    >
      <LogoMark size={size * 0.56} />
    </div>
  );
}
