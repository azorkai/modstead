// Önizleme kipi örnek verileri (tarayıcıda, dosyalara dokunmadan). Bu makinedeki gerçek kuruluma
// benzer: resmî modüller, BUTR kitaplıkları, Workshop ve Modules'ta yinelenen kopya, engelli DLL.

import type { JobSnapshot } from "@/lib/types";
import type { BackupMeta, BannerlordSettings, GameDirs, InstallPlan, Issue, ModEntry, ModuleInfo, NexusMod, Overview, Profile, UpdateItem } from "./types";

const ROOT = "D:\\SteamLibrary\\steamapps\\common\\Mount & Blade II Bannerlord";
const WS = "D:\\SteamLibrary\\steamapps\\workshop\\content\\261550";
const now = Math.floor(Date.now() / 1000);

const game: GameDirs = {
  root: ROOT,
  bin: `${ROOT}\\bin\\Win64_Shipping_Client`,
  modulesDir: `${ROOT}\\Modules`,
  workshopDir: WS,
  platform: "steam",
  version: "v1.2.12",
  exe: `${ROOT}\\bin\\Win64_Shipping_Client\\Bannerlord.exe`,
  blse: null,
  configsDir: "C:\\Users\\oyuncu\\Documents\\Mount and Blade II Bannerlord\\Configs",
  launcherData: "C:\\Users\\oyuncu\\Documents\\Mount and Blade II Bannerlord\\Configs\\LauncherData.xml",
  detectedBy: "steam",
};

function mod(id: string, name: string, version: string, o: Partial<ModuleInfo> = {}): ModuleInfo {
  const ws = o.location === "workshop";
  return {
    id,
    name,
    version,
    folder: o.workshopId ?? id,
    path: ws ? `${WS}\\${o.workshopId}` : `${ROOT}\\Modules\\${id}`,
    location: "modules",
    workshopId: null,
    isOfficial: false,
    moduleType: "Community",
    category: "Singleplayer",
    deps: [],
    subModules: [],
    url: null,
    updateSources: [],
    dlls: [],
    parseError: null,
    modified: now - 86400 * 9,
    ...o,
  };
}

const official = (id: string, name: string) => mod(id, name, "v1.2.12.77991", { isOfficial: true, moduleType: "Official" });
const harmony = { id: "Bannerlord.Harmony", kind: "required" as const, order: "before" as const, version: "v2.2.2" };
const butter = { id: "Bannerlord.ButterLib", kind: "required" as const, order: "before" as const, version: "v2.8.0" };
const uiex = { id: "Bannerlord.UIExtenderEx", kind: "required" as const, order: "before" as const, version: null };

const modules: ModuleInfo[] = [
  mod("Bannerlord.Harmony", "Harmony", "v2.4.2.225", { updateSources: [{ provider: "github", value: "BUTR/Bannerlord.Harmony", url: "https://github.com/BUTR/Bannerlord.Harmony" }], dlls: [{ name: "Bannerlord.Harmony.dll", declared: true, exists: true, blocked: false }] }),
  official("Native", "Native"),
  official("SandBoxCore", "SandBox Core"),
  official("Sandbox", "SandBox"),
  official("CustomBattle", "CustomBattle"),
  official("StoryMode", "StoryMode"),
  mod("Bannerlord.ButterLib", "ButterLib", "v2.9.18", { deps: [harmony], updateSources: [{ provider: "nexus", value: "2018", url: "https://www.nexusmods.com/mountandblade2bannerlord/mods/2018" }] }),
  mod("Bannerlord.UIExtenderEx", "UIExtenderEx", "v2.12.0", { deps: [harmony] }),
  mod("Bannerlord.MBOptionScreen", "Mod Configuration Menu v5", "v5.10.2", { deps: [harmony, butter, uiex] }),
  mod("Diplomacy", "Diplomacy", "v1.2.11", { deps: [harmony, butter, uiex], location: "workshop", workshopId: "2859188632", updateSources: [{ provider: "nexus", value: "832", url: "https://www.nexusmods.com/mountandblade2bannerlord/mods/832" }] }),
  mod("ImprovedGarrisons", "Improved Garrisons", "v4.2.5", { deps: [harmony, butter] }),
  mod("BetterTime", "Better Time", "v1.3.0", { dlls: [{ name: "BetterTime.dll", declared: true, exists: true, blocked: true }] }),
  mod("HideoutPlus", "Hideout Plus", "v1.0.7", { location: "workshop", workshopId: "2878291344" }),
  mod("PlayerSettlement", "Player Settlement", "v6.1.0", { deps: [harmony, butter, uiex], location: "workshop", workshopId: "3031546316" }),
  mod("Telepathy", "Telepathy", "v1.9.1", { deps: [harmony] }),
  mod("RealmOfThrones", "Realm of Thrones", "v5.3.0", { deps: [harmony] }),
];

const shadowed: ModuleInfo[] = [mod("Bannerlord.Harmony", "Harmony", "v2.4.2.248", { location: "workshop", workshopId: "2859188632" })];

const order: ModEntry[] = modules.map((m) => ({ id: m.id, enabled: !["Telepathy", "CustomBattle"].includes(m.id) }));

const issues: Issue[] = [
  {
    id: "duplicate:bannerlord.harmony:",
    severity: "warning",
    kind: "duplicate",
    moduleId: "Bannerlord.Harmony",
    relatedId: null,
    title: "Harmony iki kez kurulu",
    detail: "Modules klasöründeki v2.4.2.225 yükleniyor; Workshop'taki v2.4.2.248 kullanılmıyor.",
    fix: { type: "retireCopy", moduleId: "Bannerlord.Harmony", path: `${ROOT}\\Modules\\Bannerlord.Harmony` },
  },
  {
    id: "blocked:bettertime:",
    severity: "error",
    kind: "blocked",
    moduleId: "BetterTime",
    relatedId: null,
    title: "Better Time: Windows DLL'yi engelliyor",
    detail: "İnternetten inen dosyalar işaretlenir; .NET bu DLL'leri yüklemez ve oyun açılışta çöker.",
    fix: { type: "unblock", moduleId: "BetterTime" },
  },
  {
    id: "version:realmofthrones:",
    severity: "info",
    kind: "gameVersion",
    moduleId: "RealmOfThrones",
    relatedId: null,
    title: "Realm of Thrones eski bir oyun sürümü için yapılmış",
    detail: "Mod v1.2.9 için derlenmiş; v1.2.12'de çoğunlukla çalışır.",
    fix: null,
  },
];

const overview: Overview = { game, gameError: null, gameRunning: false, modules, shadowed, order, issues, installs: {}, defenderAvailable: true };

const settings: BannerlordSettings = { gamePath: null, unblockAfterInstall: true, enableAfterInstall: true, autoSort: true, backupsPerModule: 3, minimizeOnLaunch: true, preferBlse: false };

const images: Record<string, string> = {
  "bannerlord.harmony": "https://images.steamusercontent.com/ugc/1825668308038086404/84F4FCF5593B412374D3B1FE3F8C1065CF1DECC2/?imw=256&imh=256&ima=fit&impolicy=Letterbox&imcolor=%23000000&letterbox=false",
  telepathy: "https://images.steamusercontent.com/ugc/1952902180632563699/9562A05952A7C893D69FA1DC5A75E439720FAFCC/?imw=256&imh=256&ima=fit&impolicy=Letterbox&imcolor=%23000000&letterbox=false",
  hideoutplus: "https://images.steamusercontent.com/ugc/1925877686193863767/4014F6F9895E3C7B64EE55B46A42C6CA0D9F3323/?imw=256&imh=256&ima=fit&impolicy=Letterbox&imcolor=%23000000&letterbox=false",
  playersettlement: "https://images.steamusercontent.com/ugc/2466375230095489389/EB9D7B772AAC2778B5EAF6C607BF10720F0A9353/?imw=256&imh=256&ima=fit&impolicy=Letterbox&imcolor=%23000000&letterbox=false",
  realmofthrones: "https://staticdelivery.nexusmods.com/mods/3174/images/thumbnails/5848/5848-1692875671-15987679.png",
};

/** `?review=bl-review` ile açılan örnek kurulum incelemesi. */
export const reviewJob: JobSnapshot = {
  id: "bl-review",
  game: "bannerlord",
  kind: "install",
  title: "Bannerlord.Harmony · v2.4.2.248",
  source: "github",
  stage: "review",
  progress: null,
  bytes: 2_310_000,
  total: 2_310_000,
  message: "1 modül incelemeye hazır",
  error: null,
  security: {
    verdict: "safe",
    score: 0,
    source: { url: "https://github.com/BUTR/Bannerlord.Harmony/releases/tag/v2.4.2.248", domain: "github.com", trust: "trusted", label: "GitHub" },
    verification: { status: "verified", method: "GitHub SHA-256", detail: "Dosyanın SHA-256 özeti GitHub'ın yayımladığı özetle birebir aynı." },
    archive: { name: "Bannerlord.Harmony.7z", kind: "7z", size: 2_310_000, sha256: "6b2f0c1e9a7d4b3c2e1f0a9b8c7d6e5f4a3b2c1d0e9f8a7b6c5d4e3f2a1b0c9d" },
    defender: { status: "clean", engine: "Microsoft Defender", detail: "Tehdit bulunamadı.", malicious: 0, suspicious: 0, link: null },
    virustotal: null,
    nexusScan: null,
    findings: [],
    codeFiles: [{ path: "Bannerlord.Harmony/bin/Win64_Shipping_Client/Bannerlord.Harmony.dll", size: 412_160, sha256: "1f2e3d4c5b6a79880716253443526170e9d8c7b6a5f4e3d2c1b0a99887766554", kind: "library", expected: true }],
    scannedFiles: 60,
    totalSize: 5_400_000,
    needsOverride: null,
    blocked: null,
    scannedAt: now - 20,
  },
  plan: {
    sourceLabel: "GitHub · BUTR/Bannerlord.Harmony",
    sourceUrl: "https://github.com/BUTR/Bannerlord.Harmony/releases/tag/v2.4.2.248",
    modules: [
      {
        id: "Bannerlord.Harmony",
        name: "Harmony",
        version: "v2.4.2.248",
        folder: "Bannerlord.Harmony",
        relRoot: "Bannerlord.Harmony",
        files: 60,
        size: 5_400_000,
        dlls: [{ path: "bin/Win64_Shipping_Client/Bannerlord.Harmony.dll", size: 412_160, sha256: "1f2e3d4c5b6a79880716253443526170e9d8c7b6a5f4e3d2c1b0a99887766554" }],
        existing: { version: "v2.4.2.225", location: "modules", path: `${ROOT}\\Modules\\Bannerlord.Harmony` },
        action: "update",
        missingDeps: [],
        blocked: null,
      },
    ],
    notes: [],
  } satisfies InstallPlan,
  result: null,
  created: now - 60,
  updated: now - 20,
};

const nexusMod = (modId: number, name: string, summary: string, downloads: number, thumb: string | null): NexusMod => ({
  modId,
  name,
  summary,
  version: "1.0.0",
  author: "BUTR",
  pictureUrl: thumb,
  thumbnailUrl: thumb,
  endorsements: Math.round(downloads / 40),
  downloads,
  updatedAt: new Date((now - 86400 * 12) * 1000).toISOString(),
  adult: false,
  status: "published",
  url: `https://www.nexusmods.com/mountandblade2bannerlord/mods/${modId}`,
});

const searchPage = {
  total: 4,
  mods: [
    nexusMod(2006, "Harmony", "Bannerlord'un modlarının yamalanmasını sağlayan ortak kitaplık.", 6_400_000, null),
    nexusMod(2018, "ButterLib", "Mod geliştiricileri için ortak yardımcılar.", 5_100_000, null),
    nexusMod(612, "Mod Configuration Menu v5", "Modların ayarlarını oyun içinden değiştirin.", 4_800_000, null),
    nexusMod(5848, "Realm of Thrones", "Westeros'u Calradia'ya taşıyan dönüşüm modu.", 1_200_000, images.realmofthrones),
  ],
};

const update = (moduleId: string, name: string, current: string, latest: string | null, provider: UpdateItem["provider"], status: UpdateItem["status"]): UpdateItem => ({
  moduleId,
  name,
  current,
  latest,
  provider,
  status,
  sourceUrl: null,
  workshopId: provider === "steam" ? "2859188632" : null,
  nexusModId: provider === "nexus" ? 2018 : null,
  nexusFileId: provider === "nexus" ? 61234 : null,
  githubRepo: provider === "github" ? "BUTR/Bannerlord.Harmony" : null,
  githubReleaseId: provider === "github" ? 1 : null,
  githubAssetId: provider === "github" ? 2 : null,
  githubAssetName: provider === "github" ? "Bannerlord.Harmony.7z" : null,
  error: null,
});

const updates: UpdateItem[] = [
  update("Bannerlord.Harmony", "Harmony", "v2.4.2.225", "v2.4.2.248", "github", "available"),
  update("Bannerlord.ButterLib", "ButterLib", "v2.9.18", "v2.10.3", "nexus", "available"),
  update("Diplomacy", "Diplomacy", "v1.2.11", null, "steam", "steamPending"),
  update("Bannerlord.UIExtenderEx", "UIExtenderEx", "v2.12.0", "v2.12.0", "nexus", "current"),
  update("Telepathy", "Telepathy", "v1.9.1", null, "none", "unknown"),
];

const profiles: Profile[] = [
  { id: "p1", name: "Realm of Thrones kampanyası", created: now - 86400 * 20, updated: now - 86400 * 2, modules: order.map((e) => ({ ...e, version: "" })) },
  { id: "p2", name: "Sade oyun", created: now - 86400 * 40, updated: now - 86400 * 40, modules: order.filter((e) => modules.find((m) => m.id === e.id)?.isOfficial).map((e) => ({ ...e, version: "" })) },
];

const backups: BackupMeta[] = [
  { id: "1700000000000-a1", moduleId: "Bannerlord.ButterLib", name: "ButterLib", version: "v2.9.16", folder: "Bannerlord.ButterLib", reason: "update", created: now - 86400 * 3, size: 1_800_000 },
  { id: "1700000000000-b2", moduleId: "Bannerlord.Harmony", name: "Harmony", version: "v2.4.2.225", folder: "Bannerlord.Harmony", reason: "duplicate", created: now - 86400 * 6, size: 5_400_000 },
];

export const mocks: Record<string, (args?: Record<string, unknown>) => unknown> = {
  bannerlord_overview: () => overview,
  bannerlord_validate_order: () => issues,
  bannerlord_sort_order: (a) => ({ order: (a?.order as ModEntry[]) ?? order, changed: false, issues }),
  bannerlord_save_order: () => overview,
  bannerlord_launch: () => null,
  bannerlord_module_images: () => images,
  bannerlord_get_settings: () => settings,
  bannerlord_update_settings: (a) => ({ ...settings, ...((a?.patch as object) ?? {}) }),
  bannerlord_module_details: () => ({ size: 5_400_000, files: 60, record: null, backups: [], dependents: ["ButterLib", "UIExtenderEx", "Diplomacy"] }),
  bannerlord_unblock_module: () => overview,
  bannerlord_unblock_all: () => overview,
  bannerlord_retire_copy: () => overview,
  bannerlord_uninstall_module: () => overview,
  bannerlord_install_local: () => [],
  bannerlord_confirm_job: () => reviewJob,
  bannerlord_nexus_search: () => searchPage,
  bannerlord_check_updates: () => updates,
  bannerlord_list_profiles: () => profiles,
  bannerlord_list_backups: () => backups,
  bannerlord_game: () => ({ root: ROOT, version: game.version, modulesDir: game.modulesDir, workshopDir: WS, launcherData: game.launcherData, modules: 11, enabled: 9, running: false }),
};
