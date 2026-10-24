import { currentLang } from "@/lib/i18n";
import { currentLocale } from "./i18n";

// Biçimlendiriciler dil başına bir kez kurulur; her çağrıda güncel dil seçilir.
interface Formatters {
  nf: Intl.NumberFormat;
  compact: Intl.NumberFormat;
  bytes0: Intl.NumberFormat;
  bytes1: Intl.NumberFormat;
  rtf: Intl.RelativeTimeFormat;
  df: Intl.DateTimeFormat;
  dtf: Intl.DateTimeFormat;
  tf: Intl.DateTimeFormat;
}

const cache = new Map<string, Formatters>();

function fmt(): Formatters {
  const locale = currentLocale();
  let f = cache.get(locale);
  if (!f) {
    f = {
      nf: new Intl.NumberFormat(locale),
      compact: new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }),
      bytes0: new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }),
      bytes1: new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }),
      rtf: new Intl.RelativeTimeFormat(locale, { numeric: "auto" }),
      df: new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }),
      dtf: new Intl.DateTimeFormat(locale, {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      }),
      tf: new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }),
    };
    cache.set(locale, f);
  }
  return f;
}

export const fmtNumber = (n: number) => fmt().nf.format(n);
export const fmtCompact = (n: number) => fmt().compact.format(n);

export function fmtBytes(bytes: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  const f = fmt();
  return `${(i === 0 ? f.bytes0 : f.bytes1).format(v)} ${units[i]}`;
}

/** Unix saniye ya da ISO metin → "3 gün önce" / "3 days ago" */
export function fmtRelative(input: number | string): string {
  const ms = typeof input === "number" ? input * 1000 : Date.parse(input);
  if (!Number.isFinite(ms) || ms <= 0) return "—";
  const diff = (ms - Date.now()) / 1000;
  const abs = Math.abs(diff);
  const table: [number, Intl.RelativeTimeFormatUnit][] = [
    [60, "second"],
    [3600, "minute"],
    [86400, "hour"],
    [604800, "day"],
    [2629800, "week"],
    [31557600, "month"],
    [Infinity, "year"],
  ];
  const divisors: Record<string, number> = {
    second: 1,
    minute: 60,
    hour: 3600,
    day: 86400,
    week: 604800,
    month: 2629800,
    year: 31557600,
  };
  for (const [limit, unit] of table) {
    if (abs < limit) return fmt().rtf.format(Math.round(diff / divisors[unit]), unit);
  }
  return "—";
}

export function fmtDate(input: number | string): string {
  const ms = typeof input === "number" ? input * 1000 : Date.parse(input);
  return Number.isFinite(ms) ? fmt().df.format(ms) : "—";
}

export function fmtDateTime(input: number): string {
  return fmt().dtf.format(input * 1000);
}

/** Saat:dakika (ör. son denetim zamanı). */
export function fmtTime(input: Date): string {
  return fmt().tf.format(input);
}

/** Modül adından kararlı bir renk tonu (avatar için). */
export function hueOf(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) % 360;
  return h;
}

export function initials(name: string): string {
  const parts = name
    .replace(/^Bannerlord\./i, "")
    .split(/[\s._-]+/)
    .filter(Boolean);
  if (parts.length === 0) return "?";
  const lang = currentLang();
  if (parts.length === 1) return parts[0].slice(0, 2).toLocaleUpperCase(lang);
  return (parts[0][0] + parts[1][0]).toLocaleUpperCase(lang);
}

export function plural(n: number, word: string): string {
  return `${fmtNumber(n)} ${word}`;
}
