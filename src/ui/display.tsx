import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { Loader2 } from "lucide-react";
import clsx from "clsx";
import { hueOf, initials } from "@/lib/format";

// ───────────── Rozet ─────────────

export type Tone = "neutral" | "accent" | "ok" | "warn" | "danger" | "info";

const tones: Record<Tone, string> = {
  neutral: "bg-surface-2 text-fg-2 border-line-strong",
  accent: "accent-soft border-[color-mix(in_oklab,var(--accent)_22%,transparent)]",
  ok: "bg-ok/10 text-ok border-ok/20",
  warn: "bg-warn/10 text-warn border-warn/20",
  danger: "bg-danger/10 text-danger border-danger/20",
  info: "bg-info/10 text-info border-info/20",
};

export function Badge({ tone = "neutral", children, className, icon, dot }: { tone?: Tone; children: ReactNode; className?: string; icon?: ReactNode; dot?: boolean }) {
  return (
    <span className={clsx("inline-flex h-5 items-center gap-1 whitespace-nowrap rounded-full border px-2 text-[11px] font-semibold", tones[tone], className)}>
      {dot && <span className="size-1.5 rounded-full bg-current" />}
      {icon}
      {children}
    </span>
  );
}

// ───────────── İlerleme ─────────────

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={clsx("animate-spin text-muted", className ?? "size-4")} />;
}

export function Progress({ value, tone = "accent", className }: { value: number | null; tone?: "accent" | "ok" | "danger"; className?: string }) {
  const color = tone === "accent" ? "bg-accent" : tone === "ok" ? "bg-ok" : "bg-danger";
  return (
    <div className={clsx("relative h-1.5 w-full overflow-hidden rounded-full bg-surface-3", className)}>
      {value === null ? (
        <div className={clsx("bar-indeterminate absolute inset-y-0 w-2/5 rounded-full", color)} />
      ) : (
        <motion.div
          className={clsx("absolute inset-y-0 left-0 rounded-full", color)}
          initial={false}
          animate={{ width: `${Math.max(2, Math.min(100, value * 100))}%` }}
          transition={{ ease: "easeOut", duration: 0.25 }}
        />
      )}
    </div>
  );
}

/** Puan halkası (0–100). Ton puana göre seçilir. */
export function ScoreRing({ score, size = 96, stroke = 8, label }: { score: number; size?: number; stroke?: number; label?: ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, score));
  const color = v >= 80 ? "var(--ok)" : v >= 50 ? "var(--warn)" : "var(--danger)";
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={stroke} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c - (c * v) / 100 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="num text-[24px] text-fg">{Math.round(v)}</span>
        {label && <span className="mt-1 text-[10.5px] text-muted">{label}</span>}
      </div>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx("skeleton", className)} />;
}

// ───────────── Yerleşim parçaları ─────────────

/** Boş durum: kesik çizgili "boş yuva" halkasında simge, başlık, tek cümle ve (varsa) tek eylem. */
export function EmptyState({ icon, title, children, action, className }: { icon: ReactNode; title: string; children?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={clsx("flex flex-col items-center justify-center px-8 py-14 text-center", className)}>
      <div className="mb-5 flex size-14 items-center justify-center rounded-full border border-dashed border-[color-mix(in_oklab,var(--accent)_45%,var(--line-strong))] text-accent">{icon}</div>
      <h3 className="title text-[17px] text-fg">{title}</h3>
      {children && <div className="mt-1.5 max-w-sm text-pretty text-[13px] leading-relaxed text-fg-2">{children}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/** Sayfa başlığı: eş aralıklı üst etiket (vurgu noktasıyla), büyük başlık, tek satır açıklama, sağda eylemler. */
export function PageHeader({ title, subtitle, actions, eyebrow }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <header className="mb-7 flex items-end gap-6">
      <div className="min-w-0 flex-1">
        {eyebrow && (
          <div className="eyebrow mb-3 flex items-center gap-2 text-muted">
            <span className="size-1.5 rounded-full bg-accent" />
            {eyebrow}
          </div>
        )}
        <h1 className="headline text-[34px] text-fg">{title}</h1>
        {subtitle && <p className="mt-2.5 max-w-[68ch] text-[13.5px] text-fg-2">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}

/** İstatistik kutusu: eş aralıklı etiket, büyük sayı (Archivo). Tıklanabiliyorsa vurgu kenarı. */
export function Stat({ label, value, icon, tone, hint, onClick }: { label: string; value: ReactNode; icon?: ReactNode; tone?: Tone; hint?: ReactNode; onClick?: () => void }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      className={clsx(
        "group flex min-w-0 flex-col items-start rounded-2xl border border-line bg-surface px-4 pb-3.5 pt-3 text-left",
        onClick && "transition-[border-color,background] hover:border-[color-mix(in_oklab,var(--accent)_45%,var(--line-strong))] hover:bg-surface-2/60",
      )}
    >
      <span className="eyebrow flex min-w-0 max-w-full items-center gap-1.5 truncate text-muted [&_svg]:shrink-0">
        {icon}
        <span className="truncate">{label}</span>
      </span>
      <span
        className={clsx(
          "num mt-2.5 text-[26px]",
          tone === "danger" ? "text-danger" : tone === "warn" ? "text-warn" : tone === "ok" ? "text-ok" : tone === "accent" ? "text-accent" : "text-fg",
        )}
      >
        {value}
      </span>
      {hint && <span className="mt-1.5 text-[11.5px] text-muted">{hint}</span>}
    </Tag>
  );
}

export function Section({ title, description, children, aside, className }: { title: ReactNode; description?: ReactNode; children: ReactNode; aside?: ReactNode; className?: string }) {
  return (
    <section className={clsx("card overflow-hidden", className)}>
      <header className="flex items-center gap-4 border-b border-line px-5 py-4">
        <div className="min-w-0 flex-1">
          <h3 className="title text-[15px] text-fg">{title}</h3>
          {description && <p className="mt-1 text-[12.5px] text-fg-2">{description}</p>}
        </div>
        {aside}
      </header>
      <div>{children}</div>
    </section>
  );
}

export function Row({ title, description, children, icon }: { title: ReactNode; description?: ReactNode; children?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex min-h-[60px] items-center gap-4 border-b border-line px-5 py-3.5 last:border-b-0">
      {icon && <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-fg-2">{icon}</div>}
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-semibold text-fg">{title}</div>
        {description && <div className="mt-0.5 text-[12.5px] leading-relaxed text-fg-2">{description}</div>}
      </div>
      {children}
    </div>
  );
}

/** Ad ya da kimlikten türeyen kapak (görsel yoksa); görsel yüklenemezse baş harflere düşer. */
export function ModCover({ name, seed, size = 36, src, className }: { name: string; seed?: string; size?: number; src?: string | null; className?: string }) {
  const h = hueOf(seed ?? name);
  const [failed, setFailed] = useState<string | null>(null);
  const showImg = !!src && failed !== src;
  return (
    <div
      className={clsx("relative flex shrink-0 items-center justify-center overflow-hidden rounded-[10px] font-semibold tracking-tight", className)}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.36,
        background: `linear-gradient(150deg, oklch(0.5 0.09 ${h}), oklch(0.3 0.06 ${(h + 40) % 360}))`,
        color: `oklch(0.94 0.04 ${h})`,
        boxShadow: "inset 0 1px 0 rgb(255 255 255 / 0.1), inset 0 0 0 1px rgb(255 255 255 / 0.06)",
      }}
    >
      {initials(name)}
      {showImg && <img src={src!} alt="" draggable={false} onError={() => setFailed(src!)} className="absolute inset-0 size-full object-cover" />}
    </div>
  );
}

/** El çizimi alt çizgi (sitedeki işaretleme). Seyrek kullan: ekranda en fazla bir tane. Renk `currentColor`. */
export function Scribble({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 300 30" preserveAspectRatio="none" className={clsx("pointer-events-none overflow-visible", className)} aria-hidden>
      <path d="M4 19C70 9 170 5 296 11M30 26c80-8 160-9 238-4" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

// ───────────── İpucu ─────────────

/** Fareyle üzerine gelince yanda beliren etiket (kenar çubuğu simgeleri için). */
export function Tooltip({ label, children, side = "right" }: { label: ReactNode; children: ReactNode; side?: "right" | "bottom" }) {
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const timer = useRef<number | undefined>(undefined);
  useLayoutEffect(() => () => window.clearTimeout(timer.current), []);
  const show = () => {
    timer.current = window.setTimeout(() => {
      const r = ref.current?.getBoundingClientRect();
      if (!r) return;
      setPos(side === "right" ? { x: r.right + 10, y: r.top + r.height / 2 } : { x: r.left + r.width / 2, y: r.bottom + 8 });
      setOpen(true);
    }, 280);
  };
  const hide = () => {
    window.clearTimeout(timer.current);
    setOpen(false);
  };
  return (
    <div ref={ref} onMouseEnter={show} onMouseLeave={hide} onMouseDown={hide} className="relative">
      {children}
      {createPortal(
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0, x: side === "right" ? -4 : 0, y: side === "bottom" ? -4 : 0 }}
              animate={{ opacity: 1, x: 0, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
              className="pointer-events-none fixed z-[70] whitespace-nowrap rounded-full border border-line-strong bg-surface px-3 py-1.5 text-[12px] font-semibold text-fg shadow-lg"
              style={side === "right" ? { left: pos.x, top: pos.y, translate: "0 -50%" } : { left: pos.x, top: pos.y, translate: "-50% 0" }}
            >
              {label}
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  );
}
