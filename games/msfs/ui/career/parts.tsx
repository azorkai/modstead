// Kariyer sayfalarının ortak küçük parçaları.

import { useEffect, useRef, useState, type ReactNode } from "react";
import clsx from "clsx";
import { motion } from "motion/react";
import { Ambulance, Briefcase, Camera, ClipboardCheck, GraduationCap, LifeBuoy, MapPin, Mountain, Package, Plane, Search, Umbrella, Send, Telescope, Users } from "lucide-react";
import { notifyError } from "@/shell/actions";
import { Input, Spinner } from "@/ui";
import { careerApi } from "./api";
import { money, num } from "./format";
import { useCareerT } from "./i18n";
import type { AirportHit, JobKind, LinkView } from "./types";

export const KIND_ICON: Record<JobKind, typeof Plane> = {
  training: GraduationCap,
  cargo: Package,
  passenger: Users,
  charter: Briefcase,
  ferry: Send,
  bush: Mountain,
  medical: Ambulance,
  airline: Plane,
  checkride: ClipboardCheck,
  tour: Telescope,
  skydive: Umbrella,
  survey: Camera,
  sar: LifeBuoy,
};

export function KindIcon({ kind, className }: { kind: JobKind; className?: string }) {
  const I = KIND_ICON[kind] ?? Plane;
  return <I className={className ?? "size-4"} />;
}

/** "LTBA → LTFE" (iki uç ICAO, ortada ince ok). */
export function Route({ from, to, className, size = "md" }: { from: string; to: string; className?: string; size?: "sm" | "md" | "lg" }) {
  const cls = size === "lg" ? "text-[26px]" : size === "md" ? "text-[17px]" : "text-[13px]";
  return (
    <span className={clsx("inline-flex items-center gap-2 font-mono font-semibold tracking-tight", cls, className)}>
      <span>{from}</span>
      <svg viewBox="0 0 40 10" className={clsx("shrink-0 text-accent", size === "lg" ? "h-3 w-10" : "h-2.5 w-7")} aria-hidden>
        <path d="M1 5h34M31 1.5 37 5l-6 3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span>{to}</span>
    </span>
  );
}

/** Bağlantı rozeti: yeşil nokta bağlıyken. */
export function LinkPill({ link, onImage }: { link: LinkView; onImage?: boolean }) {
  const t = useCareerT();
  const connected = link.state === "connected";
  const label = connected ? t.link.connected(t.sim[link.sim ?? ""] ?? link.sim ?? "") : link.state === "connecting" ? t.link.connecting : t.link.waiting;
  return (
    <span
      title={link.detail ?? t.link.about}
      className={clsx(
        "inline-flex h-7 items-center gap-2 rounded-full px-3 text-[12px] font-medium",
        onImage ? "msfs-on-image text-white" : "border border-line bg-surface-2 text-fg-2",
      )}
    >
      <span className={clsx("relative flex size-2")}>
        {connected && <span className="absolute inline-flex size-full animate-ping rounded-full bg-ok opacity-60" />}
        <span className={clsx("relative inline-flex size-2 rounded-full", connected ? "bg-ok" : link.state === "connecting" ? "bg-warn" : "bg-muted")} />
      </span>
      {label}
    </span>
  );
}

/** Sekme çubuğu: simgeli, vurgu renginde alt çizgi. */
export function TabBar<T extends string>({ value, onChange, tabs }: { value: T; onChange: (v: T) => void; tabs: { id: T; label: string; icon: typeof Plane; badge?: number | null }[] }) {
  return (
    <nav className="flex items-center gap-1 border-b border-line">
      {tabs.map((tab) => {
        const I = tab.icon;
        const on = tab.id === value;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={clsx("relative flex h-11 items-center gap-2 px-3.5 text-[13px] font-medium transition-colors", on ? "text-fg" : "text-muted hover:text-fg-2")}
          >
            <I className={clsx("size-4", on && "text-accent")} />
            {tab.label}
            {!!tab.badge && <span className="tabular rounded-md bg-accent px-1.5 text-[10.5px] font-semibold leading-[18px] text-accent-ink">{tab.badge}</span>}
            {on && <motion.span layoutId="career-tab" className="absolute inset-x-2 -bottom-px h-[2px] rounded-full bg-accent" transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
          </button>
        );
      })}
    </nav>
  );
}

/** Küçük bilgi kutusu: etiket + değer (+ alt not). */
export function Fact({ label, value, hint, icon, className }: { label: string; value: ReactNode; hint?: ReactNode; icon?: ReactNode; className?: string }) {
  return (
    <div className={clsx("well min-w-0 px-3 py-2.5", className)}>
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted">
        {icon}
        {label}
      </div>
      <div className="tabular mt-1 truncate text-[14.5px] font-semibold text-fg">{value}</div>
      {hint && <div className="mt-0.5 truncate text-[11px] text-muted">{hint}</div>}
    </div>
  );
}

/** Havalimanı arama kutusu (ICAO, ad ya da şehir); sonuçlar açılır listede. */
export function AirportSearch({ onPick, placeholder, autoFocus, showTicket }: { onPick: (a: AirportHit) => void; placeholder: string; autoFocus?: boolean; showTicket?: boolean }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<AirportHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (q.trim().length < 2) {
      setHits([]);
      return;
    }
    const id = window.setTimeout(() => {
      setLoading(true);
      careerApi
        .airports(q)
        .then((h) => {
          setHits(h);
          setOpen(true);
        })
        .catch(notifyError)
        .finally(() => setLoading(false));
    }, 160);
    return () => window.clearTimeout(id);
  }, [q]);
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, []);
  return (
    <div ref={box} className="relative">
      <Input value={q} onChange={(e) => setQ(e.target.value)} onFocus={() => hits.length && setOpen(true)} placeholder={placeholder} autoFocus={autoFocus} icon={<Search className="size-4" />} trailing={loading ? <Spinner className="size-3.5" /> : null} />
      {open && hits.length > 0 && (
        <div className="card-raised absolute inset-x-0 top-[calc(100%+6px)] z-20 max-h-[280px] overflow-y-auto p-1" style={{ boxShadow: "var(--shadow-lg)" }}>
          {hits.map((a) => (
            <button
              key={a.icao}
              type="button"
              onClick={() => {
                onPick(a);
                setOpen(false);
                setQ("");
              }}
              className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-surface-2"
            >
              <span className="w-[52px] shrink-0 font-mono text-[12.5px] font-semibold text-accent">{a.icao}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] font-medium text-fg">{a.name}</span>
                <span className="block truncate text-[11px] text-muted">{[a.city, a.country].filter(Boolean).join(", ")}</span>
              </span>
              {showTicket && a.ticket !== null && a.distanceNm !== null && (
                <span className="tabular shrink-0 text-right text-[11px] text-muted">
                  <span className="block text-fg-2">{money(a.ticket)}</span>
                  {num(a.distanceNm)} nm
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Havalimanı satırı: ICAO + ad + şehir. */
export function AirportLine({ icao, name, city, country, className }: { icao: string; name?: string; city?: string; country?: string; className?: string }) {
  return (
    <span className={clsx("flex min-w-0 items-center gap-1.5 text-[12px] text-fg-2", className)}>
      <MapPin className="size-3.5 shrink-0 text-muted" />
      <span className="font-mono font-semibold text-fg">{icao}</span>
      {name && <span className="truncate">{name}</span>}
      {(city || country) && <span className="shrink-0 text-muted">· {[city, country].filter(Boolean).join(", ")}</span>}
    </span>
  );
}
