import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from "react";
import { motion } from "motion/react";
import { Loader2 } from "lucide-react";
import clsx from "clsx";

// ───────────── Düğme ─────────────

export type ButtonVariant = "primary" | "brand" | "secondary" | "ghost" | "subtle" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
  trailing?: ReactNode;
}

const variants: Record<ButtonVariant, string> = {
  primary: "accent-surface font-semibold hover:brightness-[1.06] active:brightness-95",
  brand: "brand-surface font-semibold hover:brightness-[1.06] active:brightness-95",
  secondary: "bg-surface-2 text-fg border border-line-strong hover:bg-surface-3 hover:border-[color-mix(in_oklab,var(--accent)_28%,var(--line-strong))]",
  ghost: "text-fg-2 hover:text-fg hover:bg-surface-2",
  subtle: "accent-soft border border-[color-mix(in_oklab,var(--accent)_22%,transparent)] hover:bg-[color-mix(in_oklab,var(--accent)_18%,transparent)]",
  danger: "bg-danger/12 text-danger border border-danger/25 hover:bg-danger/18",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-7 px-2.5 text-[12px] gap-1.5 rounded-lg",
  md: "h-9 px-3.5 text-[13px] gap-2 rounded-[10px]",
  lg: "h-11 px-5 text-[14px] gap-2.5 rounded-xl",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", loading, icon, trailing, className, children, disabled, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={clsx(
        "inline-flex select-none items-center justify-center whitespace-nowrap font-medium transition-[background,color,border,filter,transform,box-shadow] duration-150",
        "active:scale-[0.985] disabled:pointer-events-none disabled:opacity-45",
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : icon}
      {children}
      {trailing}
    </button>
  );
});

export function IconButton({
  label,
  className,
  children,
  active,
  size = "md",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; active?: boolean; size?: "sm" | "md" | "lg" }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={clsx(
        "inline-flex shrink-0 items-center justify-center text-fg-2 transition-colors",
        "hover:bg-surface-2 hover:text-fg disabled:pointer-events-none disabled:opacity-40",
        size === "sm" ? "size-7 rounded-md" : size === "lg" ? "size-10 rounded-xl" : "size-8 rounded-lg",
        active && "bg-surface-2 text-fg",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

// ───────────── Anahtar ve onay kutusu ─────────────

export function Switch({
  checked,
  onChange,
  disabled,
  label,
  size = "md",
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  label?: string;
  size?: "sm" | "md";
}) {
  const w = size === "sm" ? "w-7 h-4" : "w-9 h-5";
  const knob = size === "sm" ? "size-3" : "size-4";
  const shift = size === "sm" ? 12 : 16;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!checked);
      }}
      className={clsx(
        "relative shrink-0 rounded-full p-0.5 transition-colors duration-200 disabled:opacity-40",
        w,
        checked ? "bg-accent" : "bg-surface-3 ring-1 ring-inset ring-line-strong",
      )}
    >
      <motion.span
        className={clsx("block rounded-full shadow-sm", knob, checked ? "bg-accent-ink" : "bg-fg-2")}
        animate={{ x: checked ? shift : 0 }}
        transition={{ type: "spring", stiffness: 700, damping: 38 }}
      />
    </button>
  );
}

export function Checkbox({
  checked,
  onChange,
  disabled,
  indeterminate,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  indeterminate?: boolean;
  label?: string;
}) {
  const on = checked || indeterminate;
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={indeterminate ? "mixed" : checked}
      aria-label={label}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!checked);
      }}
      className={clsx(
        "flex size-[18px] shrink-0 items-center justify-center rounded-[5px] border transition-colors disabled:opacity-40",
        on ? "border-accent bg-accent text-accent-ink" : "border-line-strong bg-surface-2 hover:border-muted",
      )}
    >
      {indeterminate ? (
        <span className="h-0.5 w-2 rounded bg-current" />
      ) : (
        checked && (
          <svg viewBox="0 0 16 16" className="size-3" fill="none" stroke="currentColor" strokeWidth="2.4">
            <path d="M3.5 8.5l3 3 6-7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )
      )}
    </button>
  );
}

// ───────────── Bölümlü seçici ─────────────

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  size = "md",
  id,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode; count?: number }[];
  size?: "sm" | "md";
  /** Aynı sayfada birden fazla seçici varsa animasyonlar karışmasın. */
  id?: string;
}) {
  const layoutId = `seg-${id ?? options.map((o) => o.value).join("")}`;
  return (
    <div className={clsx("inline-flex rounded-[10px] border border-line bg-surface-2/60 p-0.5", size === "sm" ? "h-7" : "h-8")}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={clsx(
            "relative flex items-center gap-1.5 rounded-lg px-2.5 text-[12px] font-medium transition-colors",
            value === o.value ? "text-fg" : "text-muted hover:text-fg-2",
          )}
        >
          {value === o.value && (
            <motion.span
              layoutId={layoutId}
              className="absolute inset-0 rounded-lg border border-line-strong bg-surface-3 shadow-sm"
              transition={{ type: "spring", stiffness: 500, damping: 40 }}
            />
          )}
          <span className="relative">{o.label}</span>
          {o.count !== undefined && <span className="tabular relative text-[11px] text-muted">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

// ───────────── Girdi ─────────────

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { icon?: ReactNode; trailing?: ReactNode; inputClassName?: string }>(
  function Input({ icon, trailing, className, inputClassName, ...rest }, ref) {
    return (
      <div
        className={clsx(
          "group flex h-9 items-center gap-2 rounded-[10px] border border-line-strong bg-surface-2/70 px-3 transition-[border,background,box-shadow]",
          "focus-within:border-[color-mix(in_oklab,var(--accent)_55%,transparent)] focus-within:bg-surface-2 focus-within:shadow-[0_0_0_4px_color-mix(in_oklab,var(--accent)_12%,transparent)]",
          className,
        )}
      >
        {icon && <span className="text-muted transition-colors group-focus-within:text-accent">{icon}</span>}
        <input
          ref={ref}
          className={clsx("h-full min-w-0 flex-1 bg-transparent text-[13px] text-fg outline-none placeholder:text-muted", inputClassName)}
          spellCheck={false}
          autoComplete="off"
          {...rest}
        />
        {trailing}
      </div>
    );
  },
);

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={clsx(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-[5px] border border-line-strong bg-surface-2 px-1 font-sans text-[10.5px] font-medium text-muted",
        className,
      )}
    >
      {children}
    </kbd>
  );
}
