// Uçak seçimi ve Hangar'daki uçak listesinin sözlüğü (sim ve mod uçakları, sınıfın kaynağı, kendi EFB'si).
// Türkçe asıl kaynaktır; İngilizce aynı tipe bağlıdır.

import { useDict } from "@/lib/i18n";

type Sim = "msfs2020" | "msfs2024";

const SIM_SHORT: Record<Sim, string> = { msfs2020: "2020", msfs2024: "2024" };
/** Bulunma eki okunuşa göre: 2020'de, 2024'te. */
const IN_SIM_TR: Record<Sim, string> = { msfs2020: "2020'de", msfs2024: "2024'te" };
const IN_SIM_EN: Record<Sim, string> = { msfs2020: "in 2020", msfs2024: "in 2024" };

const tr = {
  filter: { all: "Hepsi", sim: "Sim", mod: "Mod" },
  allClasses: "Tüm sınıflar",
  search: "Uçak, tip ya da paket ara…",
  refresh: "Listeyi yenile",
  mod: "Mod",
  efb: "Kendi EFB'si",
  /** Kartta kısa: hangi simlerde etkin. */
  simShort: SIM_SHORT,
  notInSim: (sim: Sim) => `${IN_SIM_TR[sim]} etkin değil`,
  notInSimHint: (sim: Sim) =>
    `Bu mod paketi ${IN_SIM_TR[sim]} etkin değil; sim uçağı bulamaz. Kütüphane'den paketi bu simde etkinleştir ya da diğer simle uç.`,
  activeIn: (sims: Sim[]) =>
    sims.length ? `${sims.slice(0, -1).map((s) => `${SIM_SHORT[s]} ve `).join("")}${IN_SIM_TR[sims[sims.length - 1]]} etkin` : "Hiçbir simde etkin değil",
  count: (n: number, mods: number) => (mods ? `${n} uçak · ${mods} mod` : `${n} uçak`),
  package: "Paket",
  by: (creator: string) => `yapımcı ${creator}`,
  classAuto: "otomatik",
  classManual: "elle",
  /** Sınıfın dayanağı (otomatikse). */
  basis: {
    icao: "ICAO tip kodundan",
    sim: "simin değerlerinden",
    cfg: "paketin dosyalarından",
    name: "adından tahmin",
    unknown: "bilinmiyor",
  } as Record<string, string>,
  /** Dar yerler için (Hangar listesindeki üst etiket). */
  basisShort: { icao: "ICAO", sim: "simden", cfg: "paketten", name: "addan", unknown: "" } as Record<string, string>,
  confidence: { high: "kesin", medium: "büyük olasılıkla", low: "tahmin" } as Record<string, string>,
  auto: (cls: string) => `Otomatik · ${cls}`,
  autoUnknown: "Otomatik · bilinmiyor",
  loading: {
    label: "Yük ve yakıt",
    auto: (own: boolean): string => (own ? "Otomatik · kendi EFB'si" : "Otomatik · Modstead yükler"),
    own: "Kendi EFB'si",
    modstead: "Modstead yükler",
  },
  loadingSource: { user: "elle seçildi", package: "paketin geliştiricisinden", title: "adından" } as Record<string, string>,
  efbNote: "Bu uçak yükü ve yakıtı kendi EFB'sinden (tabletinden) yönetir. Modstead yük yazmaz; değerleri uçağın EFB'sine sen girersin.",
  efbPlan: "EFB'ye gir",
  specsFrom: { sim: "Simin değerleri", cfg: "Paketin değerleri" } as Record<string, string>,
  specs: (mtow: string, fuel: string, cruise: string) => [mtow && `MTOW ${mtow}`, fuel && `yakıt ${fuel}`, cruise && `seyir ${cruise}`].filter(Boolean).join(" · "),
  noMods: "Etkin mod uçağı yok. Kütüphane'de bir uçak paketini bir simde etkinleştir; Modstead onu burada gösterir.",
  noMatch: "Bu süzgeçle uçak yok.",
  hangarHint:
    "Simin kendi uçakları SimConnect'ten, mod uçakları kütüphanendeki ve Community klasörlerindeki paketlerin dosyalarından okunur. Sınıf ve yük yöntemi otomatik bulunur; gerekirse buradan değiştir.",
  setClass: "Sınıf",
  setLoading: "Yük ve yakıt yöntemi",
  thumbFromPackage: "Görsel: paketin kendi küçük resmi",
};

export type AircraftDict = typeof tr;

const en: AircraftDict = {
  filter: { all: "All", sim: "Sim", mod: "Mod" },
  allClasses: "All classes",
  search: "Search aircraft, type or package…",
  refresh: "Refresh list",
  mod: "Mod",
  efb: "Own EFB",
  simShort: SIM_SHORT,
  notInSim: (sim: Sim) => `Not enabled ${IN_SIM_EN[sim]}`,
  notInSimHint: (sim: Sim) =>
    `This mod package is not enabled ${IN_SIM_EN[sim]}, so the sim cannot find the aircraft. Enable the package for this sim in the Library, or fly it in the other sim.`,
  activeIn: (sims: Sim[]) => (sims.length ? `Enabled in ${sims.map((s) => SIM_SHORT[s]).join(" and ")}` : "Not enabled in any sim"),
  count: (n: number, mods: number) => (mods ? `${n} aircraft · ${mods} ${mods === 1 ? "mod" : "mods"}` : `${n} aircraft`),
  package: "Package",
  by: (creator: string) => `by ${creator}`,
  classAuto: "automatic",
  classManual: "manual",
  basis: {
    icao: "from the ICAO type code",
    sim: "from the sim's values",
    cfg: "from the package files",
    name: "guessed from the name",
    unknown: "unknown",
  },
  basisShort: { icao: "ICAO", sim: "sim", cfg: "package", name: "name", unknown: "" },
  confidence: { high: "certain", medium: "likely", low: "a guess" },
  auto: (cls: string) => `Automatic · ${cls}`,
  autoUnknown: "Automatic · unknown",
  loading: {
    label: "Payload and fuel",
    auto: (own: boolean) => (own ? "Automatic · own EFB" : "Automatic · Modstead loads"),
    own: "Own EFB",
    modstead: "Modstead loads",
  },
  loadingSource: { user: "set manually", package: "from the package developer", title: "from the name" },
  efbNote: "This aircraft manages payload and fuel in its own EFB (tablet). Modstead does not write the payload; enter the values in the aircraft's EFB.",
  efbPlan: "Enter in the EFB",
  specsFrom: { sim: "Sim values", cfg: "Package values" },
  specs: (mtow: string, fuel: string, cruise: string) => [mtow && `MTOW ${mtow}`, fuel && `fuel ${fuel}`, cruise && `cruise ${cruise}`].filter(Boolean).join(" · "),
  noMods: "No enabled mod aircraft. Enable an aircraft package for a sim in the Library and Modstead lists it here.",
  noMatch: "No aircraft match this filter.",
  hangarHint:
    "The sim's own aircraft come from SimConnect; mod aircraft are read from the package files in your library and Community folders. Class and loading method are detected automatically; change them here if needed.",
  setClass: "Class",
  setLoading: "Payload and fuel method",
  thumbFromPackage: "Image: the package's own thumbnail",
};

export function useAircraftT(): AircraftDict {
  return useDict({ tr, en });
}
