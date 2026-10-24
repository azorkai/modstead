// Sayfaların ortak küçük parçaları: sayfa iskeleti (Paradox çekmecesiyle), kart, etiketler, mod kapağı.

import type { ReactNode } from "react";
import { AlertOctagon, AlertTriangle, Info } from "lucide-react";
import clsx from "clsx";
import { Badge, ModCover } from "@/ui";
import { useS } from "./i18n";
import { PdxSheet } from "./PdxSheet";
import type { ModEntry, Severity } from "./types";

/** Sayfa içeriğinin standart genişliği. Paradox mod sayfası çekmecesi her sayfada açılabilir. */
export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={clsx("mx-auto max-w-[1180px]", className)}>
      {children}
      <PdxSheet />
    </div>
  );
}

export function Card({ title, aside, children, className }: { title: ReactNode; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={clsx("card overflow-hidden", className)}>
      <header className="flex min-h-[48px] items-center justify-between gap-3 border-b border-line px-5 py-2.5">
        <h3 className="text-[13.5px] font-semibold text-fg">{title}</h3>
        {aside}
      </header>
      {children}
    </section>
  );
}

/** Küçük bölüm etiketi (çekmece ve kartlarda). */
export function Label({ children, className }: { children: ReactNode; className?: string }) {
  return <h4 className={clsx("mb-2 text-[11.5px] font-medium uppercase tracking-[0.08em] text-muted", className)}>{children}</h4>;
}

export function IssueIcon({ severity, className }: { severity: Severity; className?: string }) {
  if (severity === "danger") return <AlertOctagon className={clsx("size-4 shrink-0 text-danger", className)} />;
  if (severity === "warn") return <AlertTriangle className={clsx("size-4 shrink-0 text-warn", className)} />;
  return <Info className={clsx("size-4 shrink-0 text-info", className)} />;
}

/** Görselin üstündeki etiket: iki temada da koyu perde + beyaz yazı. */
export function ImageTag({ icon, mono, children, className }: { icon?: ReactNode; mono?: boolean; children: ReactNode; className?: string }) {
  return (
    <span className={clsx("inline-flex h-5 items-center gap-1 rounded-md border border-white/15 bg-black/65 px-1.5 text-[11px] font-medium text-white backdrop-blur-md", mono && "font-mono", className)}>
      {icon}
      {children}
    </span>
  );
}

/** Modun kapağı: Paradox görseli varsa o, yoksa addan türeyen kapak. */
export function ModThumb({ mod, size = 44, className }: { mod: Pick<ModEntry, "name" | "key" | "meta">; size?: number; className?: string }) {
  const src = mod.meta?.thumbnail;
  if (src) {
    return (
      <div className={clsx("shrink-0 overflow-hidden rounded-[10px] bg-surface-3", className)} style={{ width: size * 1.6, height: size }}>
        <img src={src} alt="" loading="lazy" draggable={false} className="size-full object-cover" />
      </div>
    );
  }
  return <ModCover name={mod.name} seed={mod.key} size={size} className={className} />;
}

/** Uyumluluk rozeti (yalnızca bilinen ve sorunlu durumda ya da `showOk` ile). */
export function CompatBadge({ state, showOk, title }: { state: "ok" | "outdated" | "newer" | "unknown"; showOk?: boolean; title?: string }) {
  const t = useS();
  if (state === "unknown" || (state === "ok" && !showOk)) return null;
  return (
    <span title={title}>
      <Badge tone={state === "ok" ? "ok" : "warn"}>{t.compat[state]}</Badge>
    </span>
  );
}

/** 0–5 puanı (Paradox Mods) yıldız yerine sade bir sayı + çubuk. */
export function Rating({ value, total }: { value: number | null; total: number }) {
  if (value === null || total === 0) return null;
  return (
    <span className="tabular inline-flex items-center gap-1" title={`${value.toFixed(1)} / 5 · ${total}`}>
      <span className="relative inline-block h-1.5 w-10 overflow-hidden rounded-full bg-[color-mix(in_oklab,var(--fg)_14%,transparent)]">
        <span className="absolute inset-y-0 left-0 rounded-full bg-accent" style={{ width: `${(value / 5) * 100}%` }} />
      </span>
      {value.toFixed(1)}
    </span>
  );
}
