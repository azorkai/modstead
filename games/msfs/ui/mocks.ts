// Önizleme kipi örnek verileri (Tauri dışında, dosyalara dokunmadan tasarım denetimi için).
// Adres: ?view=game:msfs:<sayfa>  ·  inceleme penceresi: &review=msfs-review

import type { JobSnapshot, SecurityReport } from "@/lib/types";
import type {
  CatalogItem,
  Conflict,
  ExeEntry,
  InstallPlan,
  ModEntry,
  MsfsSettings,
  PackageInfo,
  Profile,
  ReadinessCheck,
  ScanResult,
  SimId,
  SimInstall,
  SimStateKind,
} from "./types";

const STORE24 = "C:\\Users\\oyuncu\\AppData\\Local\\Packages\\Microsoft.Limitless_8wekyb3d8bbwe\\LocalCache\\Packages";
const STEAM20 = "D:\\MSFS\\Packages";
const LIB = "E:\\MSFS Mods";

export const sims: SimInstall[] = [
  {
    id: "msfs2020",
    name: "Microsoft Flight Simulator 2020",
    short: "2020",
    edition: "steam",
    detected: true,
    configDir: "C:\\Users\\oyuncu\\AppData\\Roaming\\Microsoft Flight Simulator",
    userCfg: null,
    packagesPath: STEAM20,
    communityPath: `${STEAM20}\\Community`,
    community2024Path: null,
    exeXml: null,
    contentXml: null,
    running: false,
    sharesPackages: false,
    overridden: false,
  },
  {
    id: "msfs2024",
    name: "Microsoft Flight Simulator 2024",
    short: "2024",
    edition: "store",
    detected: true,
    configDir: "C:\\Users\\oyuncu\\AppData\\Local\\Packages\\Microsoft.Limitless_8wekyb3d8bbwe\\LocalCache",
    userCfg: null,
    packagesPath: STORE24,
    communityPath: `${STORE24}\\Community`,
    community2024Path: `${STORE24}\\Community2024`,
    exeXml: null,
    contentXml: null,
    running: false,
    sharesPackages: false,
    overridden: false,
  },
];

function pkg(folder: string, title: string, p: Partial<PackageInfo>): PackageInfo {
  return {
    folder,
    path: `${LIB}\\${folder}`,
    title,
    creator: "",
    manufacturer: "",
    contentType: "",
    category: "other",
    version: "1.0.0",
    minGameVersion: "1.37.19",
    builder: "",
    builtFor: "2020",
    size: 0,
    fileCount: 0,
    dependencies: [],
    thumbnail: null,
    icaos: [],
    hasLayout: true,
    wasmModules: 0,
    manifestOk: true,
    ...p,
  };
}

function check(id: string, code: string, status: ReadinessCheck["status"], group: ReadinessCheck["group"], sim: SimId | null, title: string, detail: string, extra: Partial<ReadinessCheck> = {}): ReadinessCheck {
  return { id, code, status, group, sim, title, detail, optional: false, hint: null, fix: null, source: null, count: null, ...extra };
}

function mod(
  id: string,
  info: PackageInfo,
  states: Partial<Record<SimId, SimStateKind>>,
  extra: Partial<ModEntry> = {},
): ModEntry {
  const source = extra.source ?? "library";
  return {
    id,
    info,
    source,
    libraryPath: source === "library" ? info.path : null,
    sims: Object.fromEntries(
      (["msfs2020", "msfs2024"] as SimId[]).map((s) => [s, { state: states[s] ?? (source === "library" ? "disabled" : "absent"), container: states[s] && states[s] !== "disabled" ? "Community" : null, linkPath: null }]),
    ),
    issues: [],
    readiness: [],
    ...extra,
    meta: { sourceUrl: null, sourceLabel: null, catalogId: null, releaseTag: null, installedAt: null, archiveSha256: null, report: null, stripped: [], favorite: false, tags: [], notes: "", ...(extra.meta ?? {}) },
  } as ModEntry;
}

const pathLong = check(
  "path:msfs2024",
  "path-too-long",
  "error",
  "path",
  "msfs2024",
  "Yol Windows sınırını aşıyor (269/259) — bu dosyalar MSFS 2024'te sessizce yüklenmeyebilir",
  `34 dosya sınırı aşıyor. En uzun yol: ${STORE24}\\Community\\fnx-aircraft-320\\SimObjects\\Airplanes\\FNX_320_IAE\\model\\…`,
  { hint: "Simin paket klasörünü (InstalledPackagesPath) daha kısa bir yola taşıyın, ör. D:\\MSFS\\Packages.", count: 34 },
);

const fenix = mod(
  "fnx-aircraft-320",
  pkg("fnx-aircraft-320", "Fenix Airbus A320", { creator: "Fenix Simulations", category: "aircraft", version: "2.4.0.4720", builtFor: "2024", builder: "Microsoft Flight Simulator 2024", size: 4_051_000_000, fileCount: 2412, wasmModules: 3 }),
  { msfs2024: "enabled" },
  {
    meta: { sourceLabel: "Community'den içe aktarıldı", favorite: true, installedAt: "2026-10-12T10:00:00Z" } as ModEntry["meta"],
    readiness: [
      check("manifest", "manifest-ok", "ok", "package", null, "manifest.json geçerli", "Temel alanlar tam."),
      check("content:msfs2024", "sim-active", "ok", "sim", "msfs2024", "MSFS 2024 paketi tanıyor ve etkin", "Content.xml: communityfs24-fnx-aircraft-320 = Activated."),
      pathLong,
      check("req:fenix-system:msfs2024", "companion-ok", "ok", "companion", "msfs2024", "Fenix System (FenixBootstrapper) MSFS 2024 açılışında başlatılıyor", "exe.xml: FenixA320 → C:\\Program Files\\FenixSim A320\\deps\\FenixBootstrapper.exe."),
      check("req:fenix-default-path:msfs2024", "companion-installed", "ok", "companion", "msfs2024", "Fenix varsayılan kurulum yolu kurulu", "C:\\Program Files\\FenixSim A320\\Fenix.exe.", { optional: true }),
    ],
    issues: [{ level: "error", code: "path-too-long", title: pathLong.title, detail: pathLong.detail, sim: "msfs2024", path: null, modId: "fnx-aircraft-320" }],
  },
);

const mods: ModEntry[] = [
  fenix,
  mod("fnx-aircraft-320-liveries", pkg("fnx-aircraft-320-liveries", "Fenix A320 Liveries", { creator: "Fenix Simulations", category: "livery", version: "3.0", builtFor: "2024", size: 2_504_000_000, fileCount: 860 }), { msfs2024: "enabled" }, {
    readiness: [check("content:msfs2024", "sim-active", "ok", "sim", "msfs2024", "MSFS 2024 paketi tanıyor ve etkin", "Content.xml: communityfs24-fnx-aircraft-320-liveries = Activated.")],
  }),
  mod("flybywire-aircraft-a320-neo", pkg("flybywire-aircraft-a320-neo", "FlyByWire A32NX", { creator: "FlyByWire Simulations", category: "aircraft", version: "0.12.4", size: 1_220_000_000, fileCount: 3120, wasmModules: 4 }), { msfs2020: "enabled" }, {
    meta: { sourceLabel: "GitHub · flybywiresim/aircraft", catalogId: "fbw-a32nx", releaseTag: "v2020.12.4", installedAt: "2026-10-20T10:00:00Z", report: null } as unknown as ModEntry["meta"],
    readiness: [
      check("content:msfs2020", "sim-not-disabled", "ok", "sim", "msfs2020", "MSFS 2020 paketi devre dışı bırakmamış", "Content.xml'de bu paket için kapatma kaydı yok."),
      check("req:fbw-simbridge-a32nx:msfs2020", "companion-not-installed", "warn", "companion", "msfs2020", "FlyByWire SimBridge (isteğe bağlı) kurulu görünmüyor", "Beklenen yerlerde yok.", { optional: true, hint: "FlyByWire Installer'dan SimBridge'i kurun ve otomatik başlatmayı açın." }),
    ],
  }),
  mod("flytampa-ltfm-istanbul", pkg("flytampa-ltfm-istanbul", "Istanbul Airport (LTFM)", { creator: "FlyTampa", category: "airport", version: "1.1.2", size: 3_400_000_000, icaos: ["LTFM"] }), { msfs2020: "enabled", msfs2024: "enabled" }),
  mod("iniBuilds-egll-heathrow", pkg("inibuilds-egll-heathrow", "London Heathrow (EGLL)", { creator: "iniBuilds", category: "airport", version: "1.0.6", size: 5_100_000_000, icaos: ["EGLL"] }), {}),
  mod("orbx-global-trees", pkg("orbx-global-trees", "Orbx Global Trees", { creator: "Orbx", category: "scenery", version: "2.0.1", size: 820_000_000 }), { msfs2020: "enabled" }),
  mod("sim-rate-selector", pkg("sim-rate-selector", "Sim Rate Selector", { creator: "Mamba", category: "tool", version: "1.2.3", size: 2_100_000 }), { msfs2020: "enabled" }),
  mod("pms50-gns530", pkg("pms50-gns530", "PMS50 GNS530", { creator: "PMS50", category: "avionics", version: "1.0.71", size: 46_000_000, hasLayout: false }), {}, {
    issues: [{ level: "warning", code: "no-layout", title: "layout.json yok", detail: "Sim paketi eksik yükleyebilir.", sim: null, path: null, modId: "pms50-gns530" }],
  }),
  mod("fsdreamteam-gsx-efb", pkg("fsdreamteam-gsx-efb", "GSX EFB", { creator: "FSDreamTeam", category: "tool", version: "4.0.6", builtFor: "2024", size: 12_000_000 }), { msfs2024: "foreign" }, { source: "external" }),
  mod("fsdreamteam-gsx-world-of-jetways", pkg("fsdreamteam-gsx-world-of-jetways", "GSX World", { creator: "FSDreamTeam", category: "scenery", version: "4.0.23", size: 5_377_000_000 }), { msfs2024: "foreign" }, {
    source: "external",
    readiness: [{ ...pathLong, count: 20 }],
    issues: [{ level: "error", code: "path-too-long", title: pathLong.title, detail: pathLong.detail, sim: "msfs2024", path: null, modId: "fsdreamteam-gsx-world-of-jetways" }],
  }),
  mod("a32nx-thy-livery", pkg("a32nx-thy-livery", "Turkish Airlines A320neo TC-NBA", { creator: "Liverypainter", category: "livery", version: "1.0", size: 96_000_000 }), { msfs2020: "physical" }, { source: "community" }),
];

const scan: ScanResult = {
  mods,
  sims,
  issues: [],
  stats: {
    total: mods.length,
    library: mods.filter((m) => m.source === "library").length,
    unmanaged: 1,
    external: 2,
    enabled: { msfs2020: 6, msfs2024: 5 },
    totalSize: mods.reduce((a, m) => a + m.info.size, 0),
    byCategory: mods.reduce<Record<string, number>>((acc, m) => ((acc[m.info.category] = (acc[m.info.category] ?? 0) + 1), acc), {}),
  },
  libraryPath: LIB,
  libraryFree: 70_700_000_000,
  scannedAt: new Date().toISOString(),
};

const settings: MsfsSettings = { libraryPath: LIB, simOverrides: {}, stripExecutables: true, onboarded: true };

const conflicts: Conflict[] = [
  {
    sim: "msfs2020",
    kind: "files",
    aId: "flytampa-ltfm-istanbul",
    aTitle: "Istanbul Airport (LTFM)",
    bId: "orbx-global-trees",
    bTitle: "Orbx Global Trees",
    shared: 3,
    samples: ["scenery/world/xml/trees_ltfm.xml", "scenery/world/scenery/ltfm_veg.bgl", "texture/tree_pine_01.dds"],
    icao: null,
  },
];

const startup: ExeEntry[] = [
  { sim: "msfs2020", name: "FenixA320", path: "C:\\Program Files\\FenixSim A320\\deps\\FenixBootstrapper.exe", commandLine: "", disabled: false, exists: true, signedHint: "installed" },
  { sim: "msfs2024", name: "FenixA320", path: "C:\\Program Files\\FenixSim A320\\deps\\FenixBootstrapper.exe", commandLine: "", disabled: false, exists: true, signedHint: "installed" },
  { sim: "msfs2024", name: "Couatl", path: "C:\\Program Files (x86)\\Addon Manager\\couatl64\\couatl64_boot.exe", commandLine: "", disabled: false, exists: true, signedHint: "installed" },
];

const profiles: Profile[] = [
  { id: "p1", name: "Airliner", description: "Fenix ve hub havalimanları", sims: { msfs2024: ["fnx-aircraft-320", "fnx-aircraft-320-liveries"] }, createdAt: "2026-10-20T10:00:00Z", updatedAt: "2026-10-22T10:00:00Z" },
];

const catalog: CatalogItem[] = [
  {
    id: "fbw-a32nx",
    name: "FlyByWire A32NX",
    nameEn: null,
    author: "FlyByWire Simulations",
    category: "aircraft",
    description: "Topluluğun geliştirdiği açık kaynak Airbus A320neo.",
    descriptionEn: "Community-built open source Airbus A320neo.",
    homepage: "https://flybywiresim.com",
    repo: "flybywiresim/aircraft",
    folders: ["flybywire-aircraft-a320-neo"],
    variantsStatus: [
      { sim: "msfs2024", label: "MSFS 2024 sürümü", labelEn: "MSFS 2024 build", latest: { releaseId: 3, assetId: 30, tag: "v2024.1.2", publishedAt: "2026-10-01", name: "A32NX-stable.7z", size: 890_000_000, url: "", sha256: "ab", notes: "" } },
      { sim: "msfs2020", label: "MSFS 2020 sürümü", labelEn: "MSFS 2020 build", latest: { releaseId: 2, assetId: 20, tag: "v2020.12.5", publishedAt: "2026-09-20", name: "A32NX-stable.7z", size: 860_000_000, url: "", sha256: "cd", notes: "" } },
    ],
    error: null,
  },
];

const report: SecurityReport = {
  verdict: "safe",
  score: 5,
  source: { url: "https://flightsim.to/file/1234", domain: "flightsim.to", trust: "trusted", label: "Flightsim.to" },
  verification: { status: "unverified", method: "Kaynak özeti yok", detail: "Dosya mod tarayıcısından indirildi; site dosya özeti yayımlamıyor." },
  archive: { name: "thy-a320neo-livery.zip", kind: "ZIP", size: 96_000_000, sha256: "9f2c6d0e1b7a4c3f8e5d2a1b0c9f8e7d6c5b4a39281706f5e4d3c2b1a0f9e8d7" },
  defender: { status: "clean", engine: "Microsoft Defender", detail: "Tehdit bulunmadı", malicious: 0, suspicious: 0, link: null },
  virustotal: null,
  nexusScan: null,
  findings: [],
  codeFiles: [],
  scannedFiles: 214,
  totalSize: 101_000_000,
  needsOverride: null,
  blocked: null,
  scannedAt: Math.floor(Date.now() / 1000),
};

// FlyByWire katalogdan kuruldu: güvenlik raporu var (Güvenlik sayfası önizlemesi için).
mods[2].meta.report = { ...report, source: { url: "https://github.com/flybywiresim/aircraft", domain: "github.com", trust: "trusted", label: "GitHub" }, verification: { status: "verified", method: "GitHub SHA-256", detail: "" } };

const plan: InstallPlan = {
  packages: [
    { rel: "thy-a320neo/a32nx-thy-livery", folder: "a32nx-thy-livery", title: "Turkish Airlines A320neo TC-NBA", creator: "Liverypainter", version: "1.1", category: "livery", builtFor: "2020", size: 96_000_000, fileCount: 214, executables: 0, existingId: "a32nx-thy-livery", existingVersion: "1.0", existingBuiltFor: "2020", action: "update" },
  ],
  suggestedSims: ["msfs2020", "msfs2024"],
  sims: [
    { id: "msfs2020", short: "2020", usable: true, running: false },
    { id: "msfs2024", short: "2024", usable: true, running: false },
  ],
  stripExecutables: true,
  strip: [],
  library: LIB,
  catalogId: null,
  releaseTag: null,
};

export const reviewJob: JobSnapshot = {
  id: "msfs-review",
  game: "msfs",
  kind: "install",
  title: "thy-a320neo-livery.zip",
  source: "browser",
  stage: "review",
  progress: null,
  bytes: 96_000_000,
  total: 96_000_000,
  message: "Tarama temiz — kuruluma hazır",
  error: null,
  security: report,
  plan,
  result: null,
  created: Math.floor(Date.now() / 1000),
  updated: Math.floor(Date.now() / 1000),
};

export const mocks: Record<string, (args?: Record<string, unknown>) => unknown> = {
  msfs_settings_get: () => settings,
  msfs_settings_save: (a) => Object.assign(settings, (a?.patch as Partial<MsfsSettings>) ?? {}),
  msfs_sims: () => sims,
  msfs_suggest_library: () => ({ path: LIB, free: 70_700_000_000, reason: "En çok boş alan E: diskinde (66 GB).", sameDriveAsCommunity: false }),
  msfs_snapshot: () => scan,
  msfs_scan: () => scan,
  msfs_conflicts: () => conflicts,
  msfs_startup_programs: () => startup,
  msfs_set_enabled: (a) => ({ ok: (a?.ids as string[]) ?? [], failed: [] }),
  msfs_import: (a) => ({ ok: (a?.ids as string[]) ?? [], failed: [] }),
  msfs_uninstall: (a) => ({ ok: (a?.ids as string[]) ?? [], failed: [] }),
  msfs_update_meta: () => null,
  msfs_verify: (a) => ({ id: a?.id, title: "", checks: fenix.readiness, status: "error", filesChecked: 2412, durationMs: 380, verifiedAt: new Date().toISOString() }),
  msfs_profiles: () => profiles,
  msfs_profile_save: (a) => ({ ...profiles[0], id: "p2", name: String(a?.name ?? ""), description: String(a?.description ?? "") }),
  msfs_profile_delete: () => null,
  msfs_profile_apply: () => ({ ok: ["msfs2024:fnx-aircraft-320"], failed: [] }),
  msfs_rescan_security: () => report,
  msfs_catalog: () => catalog,
  msfs_install_catalog: () => ({ ...reviewJob, id: "msfs-dl", stage: "downloading", title: "FlyByWire A32NX v2020.12.5", security: null, plan: null }),
  msfs_install_url: (a) => ({ ...reviewJob, id: "msfs-url", stage: "downloading", title: String(a?.url ?? "").split("/").pop(), security: null, plan: null }),
  msfs_open_browser: () => null,
  msfs_reveal: () => null,
  msfs_launch: () => null,
  msfs_thumbnail: () => {
    throw { code: "not_found", message: "önizleme" };
  },
};
