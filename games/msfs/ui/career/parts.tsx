// Kariyer sayfalarının ortak parçaları: rota, bağlantı rozeti, sekme çubuğu, panel başlığı, göstergeler,
// durum etiketleri, lisans damgaları ve çizimleri, havalimanı arama.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";
import { motion } from "motion/react";
import { Ambulance, ArrowRight, Briefcase, Camera, ChevronDown, ClipboardCheck, GraduationCap, Info, LifeBuoy, MapPin, Mountain, Package, Plane, Search, Umbrella, Send, Telescope, Users } from "lucide-react";
import { locale } from "@/lib/format";
import { notifyError } from "@/shell/actions";
import { Input, Spinner } from "@/ui";
import { careerApi } from "./api";
import { money, num } from "./format";
import { type CareerDict, useCareerT } from "./i18n";
import type { AirportHit, Job, JobKind, LicenseView, LinkView } from "./types";
import artAtpl from "./art/atpl.svg";
import artCpl from "./art/cpl.svg";
import artHeli from "./art/heli.svg";
import artIr from "./art/ir.svg";
import artJet from "./art/jet.svg";
import artMe from "./art/me.svg";
import artNarrow from "./art/narrow.svg";
import artPpl from "./art/ppl.svg";
import artSpl from "./art/spl.svg";
import artWide from "./art/wide.svg";

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

/** Türkçe harf içeren metin (ad, havalimanı) büyük harfe çevrilirken Türkçe kuralı uygulansın (i → İ). */
export function trLang(s: string | null | undefined): "tr" | undefined {
  return s && /[çğıöşüÇĞİÖŞÜ]/.test(s) ? "tr" : undefined;
}

/** "LTBA → LTFE" (iki uç ICAO, ortada ince ok). */
export function Route({ from, to, className, size = "md" }: { from: string; to: string; className?: string; size?: "sm" | "md" | "lg" | "xl" }) {
  const cls = size === "xl" ? "text-[34px] gap-3" : size === "lg" ? "text-[26px] gap-2.5" : size === "md" ? "text-[17px] gap-2" : "text-[13px] gap-2";
  return (
    <span className={clsx("inline-flex items-center font-mono font-semibold tracking-tight", cls, className)}>
      <span>{from}</span>
      <svg viewBox="0 0 40 10" className={clsx("shrink-0 text-accent", size === "xl" ? "h-3.5 w-14" : size === "lg" ? "h-3 w-10" : "h-2.5 w-7")} aria-hidden>
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
        "inline-flex h-7 items-center gap-2 rounded-full px-3 text-[12px] font-semibold",
        onImage ? "msfs-on-image text-white" : "border border-line bg-surface-2 text-fg-2",
      )}
    >
      <span className={clsx("relative flex size-2")}>
        {connected && <span className="absolute inline-flex size-full animate-ping rounded-full bg-ok opacity-60" />}
        <span className={clsx("relative inline-flex size-2 rounded-full", connected ? "bg-ok" : link.state === "connecting" ? "bg-warn" : onImage ? "bg-white/45" : "bg-muted")} />
      </span>
      {label}
    </span>
  );
}

export interface NavTab<T extends string> {
  id: T;
  label: string;
  icon: typeof Plane;
  /** Sekmenin içeriğini özetleyen küçük sayı (ilan, uçuş, uçak sayısı). */
  count?: number | null;
  /** Dikkat isteyen sayı (sınava hazır lisans): vurgu renginde. */
  alert?: number | null;
}

/** Kariyer sekmeleri: hap biçimli bölümlü çubuk; seçili sekme ters renkte (mürekkep üstünde kâğıt). */
export function CareerNav<T extends string>({ value, onChange, tabs, aside }: { value: T; onChange: (v: T) => void; tabs: NavTab<T>[]; aside?: ReactNode }) {
  return (
    <nav className="flex items-center gap-3">
      <div className="flex min-w-0 items-center gap-1 rounded-full border border-line bg-surface p-1 shadow-[var(--highlight)]">
        {tabs.map((tab) => {
          const I = tab.icon;
          const on = tab.id === value;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onChange(tab.id)}
              aria-current={on ? "page" : undefined}
              className={clsx(
                "relative flex h-9 shrink-0 items-center gap-2 rounded-full px-4 text-[13px] font-semibold transition-colors",
                on ? "text-bg" : "text-fg-2 hover:bg-surface-2 hover:text-fg",
              )}
            >
              {on && <motion.span layoutId="career-nav" className="absolute inset-0 rounded-full bg-fg" transition={{ type: "spring", stiffness: 520, damping: 42 }} />}
              <I className={clsx("relative size-4", !on && "text-muted")} />
              <span className="relative whitespace-nowrap">{tab.label}</span>
              {!!tab.alert && <span className="tabular relative flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent px-1 text-[10.5px] font-bold text-accent-ink">{tab.alert}</span>}
              {!tab.alert && tab.count !== undefined && tab.count !== null && (
                <span className={clsx("tabular relative font-mono text-[11px] font-semibold", on ? "text-bg/60" : "text-muted")}>{tab.count}</span>
              )}
            </button>
          );
        })}
      </div>
      <span className="flex-1" />
      {aside}
    </nav>
  );
}

/** Sekme sayfasının başlığı: eş aralıklı üst etiket, büyük geniş başlık, tek satır açıklama, sağda eylemler. */
export function PageTitle({ eyebrow, title, subtitle, aside }: { eyebrow?: ReactNode; title: ReactNode; subtitle?: ReactNode; aside?: ReactNode }) {
  return (
    <header className="flex items-end gap-5">
      <div className="min-w-0 flex-1">
        {eyebrow && (
          <div className="eyebrow mb-2 flex items-center gap-2 text-muted">
            <span className="size-1.5 rounded-full bg-accent" />
            {eyebrow}
          </div>
        )}
        <h2 className="headline text-[30px] text-fg">{title}</h2>
        {subtitle && <p className="mt-2 max-w-[72ch] text-pretty text-[13px] text-fg-2">{subtitle}</p>}
      </div>
      {aside && <div className="flex shrink-0 items-center gap-2">{aside}</div>}
    </header>
  );
}

/** Kart: başlık (isteğe bağlı üst etiket ve sağ eylem) + içerik. */
export function Panel({
  title,
  eyebrow,
  subtitle,
  icon,
  aside,
  children,
  className,
  divided = true,
}: {
  title: ReactNode;
  eyebrow?: ReactNode;
  /** Başlığın altında tek satır açıklama (düz yazı). */
  subtitle?: ReactNode;
  icon?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Başlığın altında ince çizgi. */
  divided?: boolean;
}) {
  return (
    <section className={clsx("card flex min-w-0 flex-col overflow-hidden", className)}>
      <header className={clsx("flex min-h-[56px] items-center gap-3 px-6 py-3", divided && "border-b border-line")}>
        {icon && <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-fg-2 [&_svg]:size-[15px]">{icon}</span>}
        <div className="min-w-0 flex-1">
          {eyebrow && <div className="mb-0.5 truncate text-[11.5px] text-muted">{eyebrow}</div>}
          <h3 className="title truncate text-[15px] text-fg">{title}</h3>
          {subtitle && <p className="mt-0.5 text-pretty text-[12px] leading-relaxed text-muted">{subtitle}</p>}
        </div>
        {aside}
      </header>
      {children}
    </section>
  );
}

/** Başlıktaki "Tümü →" bağlantısı. */
export function MoreLink({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[12px] font-semibold text-accent transition-colors hover:bg-[color-mix(in_oklab,var(--accent)_10%,transparent)]">
      {children}
      <ArrowRight className="size-3.5" />
    </button>
  );
}

export type GaugeTone = "accent" | "ok" | "warn" | "danger" | "info" | "muted";

const FILL: Record<GaugeTone, string> = { accent: "bg-accent", ok: "bg-ok", warn: "bg-warn", danger: "bg-danger", info: "bg-info", muted: "bg-muted" };
export const TONE_FG: Record<GaugeTone, string> = { accent: "text-accent", ok: "text-ok", warn: "text-warn", danger: "text-danger", info: "text-info", muted: "text-muted" };

/** İnce gösterge çubuğu; `ticks` verilirse eşit aralıklı çentikler (gösterge kadranı gibi). */
export function Bar({ value, tone = "accent", ticks, className, track = "bg-surface-3" }: { value: number; tone?: GaugeTone; ticks?: number; className?: string; track?: string }) {
  const v = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  return (
    <div className={clsx("relative h-1.5 w-full overflow-hidden rounded-full", track, className)}>
      <motion.div className={clsx("absolute inset-y-0 left-0 rounded-full", FILL[tone])} initial={false} animate={{ width: `${v > 0 ? Math.max(1.5, v * 100) : 0}%` }} transition={{ ease: "easeOut", duration: 0.3 }} />
      {!!ticks &&
        Array.from({ length: ticks - 1 }).map((_, i) => <span key={i} className="absolute inset-y-0 w-[2px] -translate-x-1/2 bg-surface" style={{ left: `${((i + 1) / ticks) * 100}%` }} />)}
    </div>
  );
}

/** Bölmeli sayaç: `need` kutu, `have` kadarı dolu (yeterlilik: 3 iniş, 6 yaklaşma…). */
export function Segments({ have, need, tone = "ok" }: { have: number; need: number; tone?: GaugeTone }) {
  return (
    <span className="inline-flex shrink-0 gap-[3px]" aria-hidden>
      {Array.from({ length: need }).map((_, i) => (
        <span key={i} className={clsx("h-3 w-[7px] rounded-[2px]", i < have ? FILL[tone] : "bg-surface-3")} />
      ))}
    </span>
  );
}

const TAG: Record<GaugeTone | "neutral", string> = {
  accent: "accent-soft",
  ok: "bg-ok/12 text-ok",
  warn: "bg-warn/12 text-warn",
  danger: "bg-danger/12 text-danger",
  info: "bg-info/12 text-info",
  muted: "bg-surface-3 text-muted",
  neutral: "bg-surface-3 text-fg-2",
};

/** Eş aralıklı, büyük harfli durum etiketi (GEÇERLİ, SÜRESİ DOLDU…). Metin de anlam taşır, renk tek başına değil. */
export function StatusTag({ tone = "neutral", children, className, icon }: { tone?: GaugeTone | "neutral"; children: ReactNode; className?: string; icon?: ReactNode }) {
  return (
    <span className={clsx("inline-flex h-5 shrink-0 items-center gap-1 whitespace-nowrap rounded-[5px] px-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.08em]", TAG[tone], className)}>
      {icon}
      {children}
    </span>
  );
}

/** Lisans damgası: kısaltma kutu içinde. Sahip olunan dolu, sınava hazır olan kesik çizgili vurgu. */
export function Stamp({ code, state = "held", onImage, size = "md", title }: { code: string; state?: "held" | "ready" | "locked"; onImage?: boolean; size?: "sm" | "md"; title?: string }) {
  return (
    <span
      title={title}
      className={clsx(
        "inline-flex shrink-0 items-center justify-center rounded-[6px] border font-mono font-bold tracking-[0.08em]",
        size === "md" ? "h-7 min-w-[42px] px-2 text-[11.5px]" : "h-5 min-w-[30px] px-1.5 text-[10px]",
        state === "ready"
          ? "border-dashed border-accent text-accent"
          : state === "locked"
            ? onImage
              ? "border-white/20 text-white/45"
              : "border-line-strong text-muted"
            : onImage
              ? "border-white/45 bg-white/[0.08] text-white"
              : "border-line-strong bg-surface-2 text-fg",
      )}
    >
      {code}
    </span>
  );
}

/** Lisans kapak çizimleri (kimlikler `progression.rs` → `LICENSES` ile aynı). Tanınmayan kimlik görselsiz kalır. */
export const LICENSE_ART: Record<string, string> = {
  spl: artSpl,
  ppl: artPpl,
  cpl: artCpl,
  me: artMe,
  ir: artIr,
  heli: artHeli,
  jet: artJet,
  atpl: artAtpl,
  narrow: artNarrow,
  wide: artWide,
};

/** Yetki değil lisans basamakları (kahraman görseli bunlardan en yükseğini kullanır). */
const LADDER = ["wide", "narrow", "atpl", "jet", "cpl", "ppl", "spl"];

/** Pilotun en yüksek lisansının çizimi (kahraman görseli). */
export function topLicenseArt(held: string[]): string | null {
  const id = LADDER.find((l) => held.includes(l)) ?? held[held.length - 1];
  return (id && LICENSE_ART[id]) || null;
}

/** Görsel üstündeki perde: iki temada da sabit koyu (yazı beyaz kalsın). */
export const INK = "rgb(7 9 20)";

/** Açılır kapanır bölüm (teşhis gibi ikincil içerik). */
export function Disclosure({ title, eyebrow, icon, aside, open, onToggle, children }: { title: ReactNode; eyebrow?: ReactNode; icon?: ReactNode; aside?: ReactNode; open: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <section className="card overflow-hidden">
      <div className="flex min-h-[64px] items-center gap-3 py-3 pl-6 pr-4">
        <button type="button" onClick={onToggle} aria-expanded={open} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          {icon && <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-fg-2 [&_svg]:size-[15px]">{icon}</span>}
          <span className="min-w-0 flex-1">
            <span className="title block truncate text-[15px] text-fg">{title}</span>
            {eyebrow && <span className="mt-0.5 block truncate text-[12px] text-muted">{eyebrow}</span>}
          </span>
        </button>
        {aside && <div className="flex shrink-0 items-center gap-2">{aside}</div>}
        <button type="button" onClick={onToggle} aria-expanded={open} aria-label={typeof title === "string" ? title : undefined} className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-fg">
          <ChevronDown className={clsx("size-4 transition-transform", open && "rotate-180")} />
        </button>
      </div>
      {open && <div className="border-t border-line">{children}</div>}
    </section>
  );
}

/** Küçük bilgi kutusu: etiket + değer (+ alt not). */
export function Fact({ label, value, hint, icon, className }: { label: string; value: ReactNode; hint?: ReactNode; icon?: ReactNode; className?: string }) {
  return (
    <div className={clsx("well min-w-0 px-3 py-2.5", className)}>
      <div className="flex items-center gap-1.5 truncate text-[11.5px] text-muted [&_svg]:size-3 [&_svg]:shrink-0">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <div className="tabular mt-1.5 truncate text-[14.5px] font-semibold text-fg">{value}</div>
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

/** Sayı hücresi: eş aralıklı etiket, büyük geniş sayı (+ birim), alt satır. Şeritlerde ve kahramanda. */
export function StatCell({ label, value, unit, sub, tone, title, hint, className }: { label: string; value: ReactNode; unit?: string; sub?: ReactNode; tone?: GaugeTone; title?: string; hint?: ReactNode; className?: string }) {
  return (
    <div className={clsx("min-w-0 px-6 py-4", className)} title={title}>
      <div className="flex min-w-0 items-center gap-1.5 text-[11.5px] text-muted">
        <span className="truncate">{label}</span>
        {hint && <Hint text={hint} />}
      </div>
      <div className="mt-1.5 flex items-baseline gap-1">
        <span className={clsx("num truncate text-[26px]", tone ? TONE_FG[tone] : "text-fg")}>{value}</span>
        {unit && <span className="text-[12.5px] font-semibold text-muted">{unit}</span>}
      </div>
      {sub && <div className="mt-1 truncate text-[11.5px] text-muted">{sub}</div>}
    </div>
  );
}

/** Sayı şeridi: hücreler ince çizgilerle ayrılır. */
export function StatStrip({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx("card grid auto-cols-fr grid-flow-col divide-x divide-line overflow-hidden", className)}>{children}</div>;
}

/** Son uçuşların puanları: küçük sütun grafiği (en yenisi sağda, vurgu renginde). */
export function ScoreSpark({ scores, className }: { scores: number[]; className?: string }) {
  const last = scores.slice(-10);
  return (
    <span className={clsx("flex h-[18px] items-end gap-[3px]", className)} aria-hidden>
      {last.map((s, i) => (
        <span
          key={i}
          className={clsx("w-[6px] rounded-[1.5px]", i === last.length - 1 ? "bg-accent" : s >= 85 ? "bg-fg-2/70" : "bg-fg-2/35")}
          style={{ height: `${Math.max(12, Math.min(100, ((s - 40) / 60) * 100))}%` }}
        />
      ))}
    </span>
  );
}

/** İşte ne taşındığı, birimiyle: "6 yolcu · Çekim ekibi", "180 kg · Yedek parça", "Uçağı teslim et". */
export function carryText(job: Job, t: CareerDict): string {
  const what = t.cargo[job.cargo] ?? job.cargo;
  const parts: string[] = [];
  if (job.pax > 0) parts.push(t.jobs.pax(job.pax));
  if (job.cargoKg > 0) parts.push(t.jobs.kg(num(job.cargoKg)));
  parts.push(what);
  return parts.join(" · ");
}

/** (i) ipucu: üzerine gelince ya da odaklanınca kısa açıklama (kavramı yerinde anlatır). Kartların taşma kırpmasına
 *  takılmasın diye belge gövdesine çizilir. */
export function Hint({ text, className, children }: { text: ReactNode; className?: string; children?: ReactNode }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number; below: boolean } | null>(null);
  const show = () => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const below = r.top < 140;
    const x = Math.min(window.innerWidth - 168, Math.max(168, r.left + r.width / 2));
    setPos({ x, y: below ? r.bottom + 8 : r.top - 8, below });
  };
  return (
    <span
      ref={ref}
      tabIndex={0}
      onMouseEnter={show}
      onMouseLeave={() => setPos(null)}
      onFocus={show}
      onBlur={() => setPos(null)}
      aria-label={typeof text === "string" ? text : undefined}
      className={clsx("inline-flex shrink-0 cursor-help items-center rounded-full text-muted outline-none transition-colors hover:text-fg-2 focus-visible:text-accent", className)}
    >
      {children ?? <Info className="size-3.5" />}
      {pos &&
        createPortal(
          <span
            role="tooltip"
            className="pointer-events-none fixed z-[80] block w-max max-w-[320px] rounded-xl border border-line-strong bg-surface px-3 py-2 text-left text-[12px] font-normal normal-case leading-relaxed tracking-normal text-fg-2"
            style={{ left: pos.x, top: pos.y, transform: `translate(-50%, ${pos.below ? "0" : "-100%"})`, boxShadow: "var(--shadow-lg)" }}
          >
            {text}
          </span>,
          document.body,
        )}
    </span>
  );
}

/** Son teslim insan diliyle: "bugün 18:16", "yarın 14:00", "Salı 26 Eki 09:00". */
export function dueText(unix: number, t: CareerDict): string {
  const d = new Date(unix * 1000);
  const now = new Date();
  const hm = d.toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" });
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(d) - day(now)) / 86_400_000);
  if (diff === 0) return t.guide.dueToday(hm);
  if (diff === 1) return t.guide.dueTomorrow(hm);
  return t.guide.dueOn(d.toLocaleDateString(locale(), { weekday: "long", day: "numeric", month: "short" }), hm);
}

/** Bölüm başlığı (sayfa içi): başlık + tek cümlelik açıklama + sağda eylem. */
export function SectionHead({ title, body, aside }: { title: ReactNode; body?: ReactNode; aside?: ReactNode }) {
  return (
    <header className="flex items-end gap-4">
      <div className="min-w-0 flex-1">
        <h3 className="title text-[17px] text-fg">{title}</h3>
        {body && <p className="mt-1 max-w-[86ch] text-pretty text-[12.5px] leading-relaxed text-fg-2">{body}</p>}
      </div>
      {aside && <div className="flex shrink-0 items-center gap-2">{aside}</div>}
    </header>
  );
}

/** Sınava hazır ya da hedeflenen lisans (panel ve lisanslar sayfası). Sıradaki: şartlara en çok yaklaşılan. */
export function pickGoal(list: LicenseView[], hoursHave: number, level: number): LicenseView | null {
  const open = list.filter((l) => !l.held && l.missingLicenses.length === 0);
  if (open.length === 0) return null;
  const score = (l: LicenseView) => Math.min(1, hoursHave / Math.max(0.1, l.hoursNeeded)) + Math.min(1, level / Math.max(1, l.levelNeeded)) + (l.ready ? 10 : 0);
  return [...open].sort((a, b) => score(b) - score(a))[0];
}
