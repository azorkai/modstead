// Kariyer biçimleyicileri: para, süre, sınıf adları, iniş renkleri.

import { currentLang } from "@/lib/i18n";
import { locale } from "@/lib/format";
import type { AircraftClass, ClassInfo, Landing } from "./types";

export function money(n: number | null | undefined, signed = false): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  const s = new Intl.NumberFormat(locale(), { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(Math.abs(n));
  if (n < 0) return `−${s}`;
  return signed && n > 0 ? `+${s}` : s;
}

/** Büyük tutarlar kısaltılır: 1,2 Mn $ */
export function moneyShort(n: number): string {
  if (Math.abs(n) < 100_000) return money(n);
  return new Intl.NumberFormat(locale(), { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 }).format(n);
}

export function num(n: number, digits = 0): string {
  return n.toLocaleString(locale(), { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

/** Dakika → "1 sa 25 dk" */
export function duration(min: number): string {
  const en = currentLang() === "en";
  const m = Math.max(0, Math.round(min));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return en ? `${r} min` : `${r} dk`;
  return en ? `${h} h ${r.toString().padStart(2, "0")} min` : `${h} sa ${r.toString().padStart(2, "0")} dk`;
}

export function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}:${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
}

export function hours(h: number): string {
  return num(h, h < 10 ? 1 : 0);
}

export function className(cls: AircraftClass | null | undefined, classes: ClassInfo[]): string {
  if (!cls) return "—";
  const c = classes.find((x) => x.id === cls);
  if (!c) return cls;
  return currentLang() === "en" ? c.nameEn : c.nameTr;
}

/** İniş etiketinin tonu. */
export function landingTone(l: Landing["label"] | undefined): "ok" | "accent" | "warn" | "danger" | "neutral" {
  switch (l) {
    case "butter":
    case "smooth":
      return "ok";
    case "good":
      return "accent";
    case "firm":
      return "warn";
    case "hard":
    case "very_hard":
      return "danger";
    default:
      return "neutral";
  }
}

export function gradeTone(g: string): "ok" | "accent" | "warn" | "danger" {
  if (g.startsWith("A")) return "ok";
  if (g === "B") return "accent";
  if (g === "C" || g === "D") return "warn";
  return "danger";
}

export function dateTime(ts: number): string {
  return new Date(ts * 1000).toLocaleString(locale(), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function kg(n: number): string {
  return n.toLocaleString(locale(), { maximumFractionDigits: 0 });
}

/** Tailwind sınıfları derlemede görünmeli: tona göre sabit eşlemeler. */
export const TONE_TEXT = { ok: "text-ok", accent: "text-accent", warn: "text-warn", danger: "text-danger", neutral: "text-fg-2" } as const;
export const TONE_BG = { ok: "bg-ok/10", accent: "bg-accent/10", warn: "bg-warn/10", danger: "bg-danger/10", neutral: "bg-surface-3" } as const;
