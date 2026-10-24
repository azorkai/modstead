// MSFS'e özel biçimlendirme: kategori adları ve kodları, sim renkleri, mod durumu.

import { currentLang, type Lang } from "@/lib/i18n";
import type { Category, ModEntry, SimId, SimStateKind } from "./types";

export const SIMS: SimId[] = ["msfs2020", "msfs2024"];

/** MSFS 2020 ve 2024'ün veri renkleri (Hangar'dan; tema dışı, oyuna özel veri rengi). */
export const SIM_COLOR: Record<SimId, string> = { msfs2020: "#4ea8ff", msfs2024: "#b08cff" };
export const SIM_SHORT: Record<SimId, string> = { msfs2020: "2020", msfs2024: "2024" };

export const CATEGORIES: Category[] = ["aircraft", "livery", "airport", "scenery", "avionics", "tool", "mission", "core", "other"];

const CAT_LABEL: Record<Lang, Record<Category, string>> = {
  tr: {
    aircraft: "Uçak",
    livery: "Boya",
    airport: "Havalimanı",
    scenery: "Sahne",
    avionics: "Aviyonik",
    tool: "Araç",
    mission: "Görev",
    core: "Çekirdek",
    other: "Diğer",
  },
  en: {
    aircraft: "Aircraft",
    livery: "Livery",
    airport: "Airport",
    scenery: "Scenery",
    avionics: "Avionics",
    tool: "Tool",
    mission: "Mission",
    core: "Core",
    other: "Other",
  },
};

export function catLabel(c: Category, lang: Lang = currentLang()): string {
  return CAT_LABEL[lang][c] ?? c;
}

/** ICAO tip kodları gibi 4 harfli tür kodları; dilden bağımsız. */
export const CAT_CODE: Record<Category, string> = {
  aircraft: "ACFT",
  livery: "LVRY",
  airport: "ARPT",
  scenery: "SCNY",
  avionics: "AVNC",
  tool: "TOOL",
  mission: "MISN",
  core: "CORE",
  other: "MISC",
};

export function isActive(state: SimStateKind | undefined): boolean {
  return state === "enabled" || state === "physical" || state === "foreign";
}

/** Modun herhangi bir simde etkin olup olmadığı. */
export function activeAnywhere(m: ModEntry): boolean {
  return SIMS.some((s) => isActive(m.sims[s]?.state));
}

export function errorCount(m: ModEntry): number {
  return m.issues.filter((i) => i.level === "error").length;
}

export function warnCount(m: ModEntry): number {
  return m.issues.filter((i) => i.level === "warning").length;
}

/** Poster kodu: uçak/havalimanı için başlıktaki ICAO ya da tip kodu, yoksa tür kodu. */
export function posterCode(m: ModEntry): string {
  if (m.info.icaos.length) return m.info.icaos[0];
  const t = `${m.info.title} ${m.info.folder}`.toUpperCase();
  const type = t.match(/\b(A3[0-9]{2}[A-Z]?|B7[0-9]{2}|B7[0-9]X|CRJ[0-9]*|E1[0-9]{2}|ATR|DC-?[0-9]+|MD-?[0-9]+|C1[0-9]{2}|BE[0-9]{2})\b/);
  if (type) return type[1].replace("-", "").slice(0, 4);
  return acronym(m.info.title) || CAT_CODE[m.info.category] || "MISC";
}

/** "GSX World" → "GSX", "Sim Rate Selector" → "SRS", "PMS50 GNS530" → "PMS50". */
export function acronym(title: string): string {
  const words = title.replace(/\(.*?\)/g, " ").split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  if (words.length === 0) return "";
  const first = words[0];
  if (first.length <= 5 && first === first.toUpperCase() && /\p{L}/u.test(first)) return first;
  return words
    .slice(0, 4)
    .map((w) => w[0])
    .join("")
    .toLocaleUpperCase("en");
}

/** Görüntülenecek sürüm: "v" önekiyle, boşsa hiç. */
export function version(v: string | null | undefined): string | null {
  if (!v) return null;
  return /^v/i.test(v) ? v : `v${v}`;
}

export function foldText(s: string): string {
  return s
    .toLocaleLowerCase("tr")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ı/g, "i");
}
