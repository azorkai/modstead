// Kariyer yollarının ortak yardımcıları: sıra, simge, vitrin fotoğrafı, pilotun yolu, ilanın yola uyumu.
// Kurallar arka uçta (`games/msfs/src/career/paths.rs`); burada yalnızca gösterim.

import { Ambulance, Briefcase, Camera, Compass, Mountain, Package, Plane } from "lucide-react";
import { currentLang } from "@/lib/i18n";
import { aircraftVisual } from "./aircraft/families";
import type { AircraftClass, CareerPath, CareerView, Job, LicenseView, PathInfo, PilotView, RankStep } from "./types";

export const PATH_ORDER: CareerPath[] = ["airline", "cargo", "bush", "medical", "charter", "aerial", "general"];

export const PATH_ICON: Record<CareerPath, typeof Plane> = {
  airline: Plane,
  cargo: Package,
  bush: Mountain,
  medical: Ambulance,
  charter: Briefcase,
  aerial: Camera,
  general: Compass,
};

/** Yolun vitrin fotoğrafı: gömülü uçak fotoğraflarından (lisansları `aircraft/CREDITS.md`). */
const PHOTO: Record<CareerPath, [string, AircraftClass]> = {
  airline: ["Boeing 787-10", "widebody"],
  cargo: ["Boeing 747-8F", "widebody"],
  bush: ["DHC-2 Beaver", "light_piston"],
  medical: ["EC135", "helicopter"],
  charter: ["Citation Longitude", "bizjet"],
  aerial: ["Pilatus PC-6 Porter", "turboprop_single"],
  general: ["Cessna 172 Skyhawk", "light_piston"],
};

/** Geniş kırpmada uçağın kadrajda kalacağı odak noktası. */
export const PATH_FOCUS: Record<CareerPath, string> = {
  airline: "50% 45%",
  cargo: "55% 46%",
  bush: "40% 55%",
  medical: "45% 50%",
  charter: "50% 62%",
  aerial: "55% 45%",
  general: "45% 50%",
};

export function pathPhoto(path: CareerPath): { src: string | undefined; credit: string | undefined } {
  const [title, cls] = PHOTO[path];
  const v = aircraftVisual(title, cls);
  return { src: v.src, credit: v.credit ? `${v.family?.name ?? ""} · ${v.credit.author} · ${v.credit.license}` : undefined };
}

/** Pilotun yolu (eski uygulamada alan yoksa serbest pilot). */
export function pathOf(p: PilotView | null | undefined): CareerPath {
  return p?.path ?? "general";
}

/** Pilot bir yolda mı (serbest değil) ve arka uç yol durumunu veriyor mu? */
export function hasPath(p: PilotView | null | undefined): boolean {
  return !!p?.pathStatus && pathOf(p) !== "general";
}

/** İlan yolun içinde mi (yol primi ya da XP primi var)? */
export function onPath(job: Job): boolean {
  return !job.offPath && (job.pathXpBonus ?? 0) > 0;
}

/** Yolun ya da basamağın görünen adı (arka uçtan gelen iki dilli ad). */
export function nameOf(x: { nameTr: string; nameEn: string } | null | undefined): string {
  if (!x) return "";
  return currentLang() === "en" ? x.nameEn : x.nameTr;
}

/** Katalogdan yolun bilgisi. */
export function infoOf(catalog: PathInfo[] | undefined, path: CareerPath): PathInfo | undefined {
  return catalog?.find((p) => p.id === path);
}

/** Basamağın bilgisi (rütbe kimliğinden). */
export function rankName(catalog: PathInfo[] | undefined, path: CareerPath, id: string | null | undefined): string {
  if (!id) return "";
  const r = infoOf(catalog, path)?.ranks.find((x) => x.id === id);
  return r ? nameOf(r) : "";
}

/** Sıradaki basamak (ulaşılmamış ilk basamak). */
export function nextStep(ladder: RankStep[]): RankStep | null {
  return ladder.find((s) => !s.reached) ?? null;
}

const SHORT: Record<string, string> = { heli: "H", narrow: "TR-N", wide: "TR-W" };
/** Lisansın kısaltması (arka uçtaki `short` ile aynı): "H", "TR-N"… */
export const licenceShort = (id: string) => SHORT[id] ?? id.toUpperCase();

/** Lisanslar ve panel için: yolun sıradaki lisansı (önkoşulları tamamsa), yoksa genel seçim. */
export function pathLicenceGoal(view: CareerView, fallback: LicenseView | null): LicenseView | null {
  const id = view.pilot?.pathStatus?.nextLicense;
  if (!id || view.pilot?.path === "general") return fallback;
  const l = view.licenses.find((x) => x.id === id);
  if (!l || l.held) return fallback;
  if (l.missingLicenses.length) {
    // Önkoşulu eksikse önce onu hedefle (ör. ATPL için ME).
    const pre = view.licenses.find((x) => l.missingLicenses.includes(x.id) && !x.held && x.missingLicenses.length === 0);
    return pre ?? fallback;
  }
  return l;
}
