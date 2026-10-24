// Önizleme kipi (tarayıcı) örnek verileri: `stardew_` komutlarının sahte yanıtları. Tauri penceresinde kullanılmaz.

import type {
  Environment,
  HealthReport,
  Issue,
  JournalEntry,
  LogReport,
  ModInfo,
  ModsPlan,
  ModsSnapshot,
  NexusMod,
  NexusModPage,
  Profile,
  SaveInfo,
  SmapiPlan,
  StardewSettings,
  TrashMeta,
  UpdateCache,
} from "./types";

const now = Date.now();
const H = 3600_000;
const D = 24 * H;
const GAME = "D:\\SteamLibrary\\steamapps\\common\\Stardew Valley";
const params = typeof location !== "undefined" ? new URLSearchParams(location.search) : new URLSearchParams();
/** `?sdv=empty`, `nogame`, `nosmapi`, `premium`, `free` (virgülle birleştirilebilir): boş kurulum, oyun yok, SMAPI yok, Nexus hesabı. */
const scenario = (params.get("sdv") ?? "").split(",");

function mod(p: Partial<ModInfo> & { name: string; uniqueId: string; version: string }): ModInfo {
  const folder = p.folder ?? p.name.replace(/[^\w\s[\]-]/g, "");
  return {
    folder,
    folderName: folder.split("\\").pop()!.replace(/^\./, ""),
    group: null,
    enabled: !folder.split("\\").pop()!.startsWith("."),
    disabledByParent: false,
    manifestError: null,
    problems: [],
    author: "Pathoschild",
    description: null,
    kind: "smapi",
    entryDll: `${p.name.replace(/\s/g, "")}.dll`,
    contentPackFor: null,
    minimumApiVersion: "4.0.0",
    minimumGameVersion: null,
    dependencies: [],
    updateKeys: p.nexusId ? [`Nexus:${p.nexusId}`] : [],
    nexusId: null,
    size: 400_000,
    fileCount: 12,
    modified: now - 5 * D,
    hasConfig: true,
    executables: [],
    dlls: [`${p.name.replace(/\s/g, "")}.dll`],
    isCore: false,
    ...p,
  };
}

let mods: ModInfo[] =
  scenario.includes("empty") || scenario.includes("nogame")
    ? []
    : [
        mod({ name: "Content Patcher", uniqueId: "Pathoschild.ContentPatcher", version: "2.9.1", nexusId: 1915, description: "Diğer modların kod yazmadan oyunun görsellerini ve verilerini değiştirmesini sağlar.", size: 1_820_000, fileCount: 31 }),
        mod({ name: "Console Commands", uniqueId: "SMAPI.ConsoleCommands", version: "4.5.2", author: "SMAPI", isCore: true, description: "SMAPI konsoluna hata ayıklama komutları ekler.", hasConfig: false }),
        mod({ name: "Save Backup", uniqueId: "SMAPI.SaveBackup", version: "4.5.2", author: "SMAPI", isCore: true, description: "Her açılışta kayıtlarınızın yedeğini alır.", hasConfig: false }),
        mod({ name: "Lookup Anything", uniqueId: "Pathoschild.LookupAnything", version: "1.46.0", nexusId: 541, description: "Fareyle üzerine gelip F1'e basarak her şey hakkında bilgi görün.", size: 2_400_000, modified: now - 40 * D }),
        mod({ name: "Automate", uniqueId: "Pathoschild.Automate", version: "2.3.0", nexusId: 1063, description: "Sandığın yanına koyduğunuz makineler kendi kendine çalışır.", modified: now - 12 * D }),
        mod({ name: "Generic Mod Config Menu", uniqueId: "spacechase0.GenericModConfigMenu", version: "1.14.1", author: "spacechase0", nexusId: 5098, description: "Modların ayarlarını oyun içinden düzenleyin." }),
        mod({ name: "NPC Map Locations", uniqueId: "Bouhm.NPCMapLocations", version: "3.3.1", author: "Bouhm", nexusId: 239, description: "Köylülerin haritadaki yerlerini gösterir." }),
        mod({ name: "CJB Cheats Menu", folder: ".CJB Cheats Menu", uniqueId: "CJBok.CheatsMenu", version: "1.38.0", author: "CJBok", nexusId: 4, description: "Hile menüsü: zaman, para, enerji ve daha fazlası." }),
        mod({
          name: "Ridgeside Village",
          uniqueId: "Rafseazz.RidgesideVillage",
          version: "2.5.17",
          author: "Rafseazz",
          nexusId: 7286,
          description: "Pelican Town'un kuzeyinde yeni bir köy, yeni karakterler ve görevler.",
          size: 182_000_000,
          fileCount: 2140,
          dependencies: [
            { uniqueId: "Pathoschild.ContentPatcher", minimumVersion: "2.0.0", isRequired: true },
            { uniqueId: "spacechase0.SpaceCore", minimumVersion: "1.20.0", isRequired: true },
          ],
          modified: now - 2 * H,
        }),
        mod({ name: "[CP] Seasonal Outfits", folder: "Seasonal Outfits\\[CP] Seasonal Outfits", group: "Seasonal Outfits", uniqueId: "Poltergeister.SeasonalOutfits", version: "1.8.2", author: "Poltergeister", kind: "content", entryDll: null, contentPackFor: { uniqueId: "Pathoschild.ContentPatcher", minimumVersion: null }, nexusId: 5450, description: "Köylülere mevsime göre kıyafetler.", dlls: [], size: 34_000_000 }),
        mod({ name: "[JA] Fruit Trees", uniqueId: "someone.FruitTrees", version: "1.0.3", author: "someone", kind: "content", entryDll: null, contentPackFor: { uniqueId: "spacechase0.JsonAssets", minimumVersion: null }, description: "Yeni meyve ağaçları ekler.", dlls: [], updateKeys: [] }),
        mod({ name: "Chests Anywhere", folder: "Chests Anywhere", uniqueId: "Pathoschild.ChestsAnywhere", version: "1.25.0", nexusId: 518 }),
        mod({ name: "Chests Anywhere", folder: "Chests Anywhere (eski)", uniqueId: "Pathoschild.ChestsAnywhere", version: "1.24.1", nexusId: 518, modified: now - 300 * D }),
        mod({ name: "Speedy Updater Tool", uniqueId: "unknown.Speedy", version: "0.1.0", author: "unknown", executables: ["updater.exe"], description: "Kaynağı belirsiz bir mod.", updateKeys: [] }),
        mod({ name: "BrokenThing", uniqueId: "", version: "", author: null, manifestError: "Geçersiz JSON: expected `,` or `}` at line 4 column 3", kind: "unknown", entryDll: null, dlls: [] }),
      ];

const updates: UpdateCache = {
  checkedAt: now - 3 * H,
  smapi: { uniqueId: "Pathoschild.SMAPI", name: "SMAPI", installed: "4.5.2", latest: "4.5.2", url: null, hasUpdate: false, compatStatus: null, compatSummary: null, brokeIn: null, nexusId: null, errors: [] },
  entries: [
    { uniqueId: "Pathoschild.LookupAnything", name: "Lookup Anything", installed: "1.46.0", latest: "1.47.2", url: "https://www.nexusmods.com/stardewvalley/mods/541", hasUpdate: true, compatStatus: "Ok", compatSummary: "use latest version.", brokeIn: null, nexusId: 541, errors: [] },
    { uniqueId: "Pathoschild.Automate", name: "Automate", installed: "2.3.0", latest: "2.4.1", url: "https://www.nexusmods.com/stardewvalley/mods/1063", hasUpdate: true, compatStatus: "Ok", compatSummary: "use latest version.", brokeIn: null, nexusId: 1063, errors: [] },
    { uniqueId: "Rafseazz.RidgesideVillage", name: "Ridgeside Village", installed: "2.5.17", latest: "2.5.18", url: "https://www.nexusmods.com/stardewvalley/mods/7286", hasUpdate: true, compatStatus: "Ok", compatSummary: null, brokeIn: null, nexusId: 7286, errors: [] },
    { uniqueId: "Pathoschild.ContentPatcher", name: "Content Patcher", installed: "2.9.1", latest: "2.9.1", url: "https://www.nexusmods.com/stardewvalley/mods/1915", hasUpdate: false, compatStatus: "Ok", compatSummary: "use latest version.", brokeIn: null, nexusId: 1915, errors: [] },
    { uniqueId: "Bouhm.NPCMapLocations", name: "NPC Map Locations", installed: "3.3.1", latest: "3.3.1", url: null, hasUpdate: false, compatStatus: "Obsolete", compatSummary: "Oyunun 1.6 sürümündeki harita bu özelliği büyük ölçüde içeriyor.", brokeIn: null, nexusId: 239, errors: [] },
  ],
};

function health(): HealthReport {
  const issues: Issue[] = [];
  if (scenario.includes("nosmapi"))
    issues.push({ id: "s", severity: "error", kind: "smapi-missing", title: "SMAPI kurulu değil", detail: "Modların çalışması için SMAPI gerekir. Modstead en son sürümü indirip doğrulayarak kurabilir.", mods: [], fix: { kind: "install-smapi", label: "SMAPI'yi kur", folders: [], target: null } });
  const has = (id: string) => mods.find((m) => m.uniqueId === id);
  const rv = has("Rafseazz.RidgesideVillage");
  if (rv?.enabled)
    issues.push({ id: "a", severity: "error", kind: "missing-dependency", title: "Ridgeside Village eksik bir modu gerektiriyor", detail: "'spacechase0.SpaceCore' bağımlılığını gerektiriyor ama kurulu değil. En az 1.20.0 sürümü gerekli.", mods: [rv.folder], fix: { kind: "find-dependency", label: "Modu bul", folders: [], target: "spacechase0.SpaceCore" } });
  const ja = has("someone.FruitTrees");
  if (ja?.enabled)
    issues.push({ id: "b", severity: "error", kind: "missing-dependency", title: "[JA] Fruit Trees eksik bir modu gerektiriyor", detail: "'spacechase0.JsonAssets' çerçeve modunu gerektiriyor ama kurulu değil.", mods: [ja.folder], fix: { kind: "find-dependency", label: "Modu bul", folders: [], target: "spacechase0.JsonAssets" } });
  const ca = mods.filter((m) => m.uniqueId === "Pathoschild.ChestsAnywhere" && m.enabled);
  if (ca.length > 1)
    issues.push({ id: "c", severity: "error", kind: "duplicate-id", title: "Chests Anywhere birden fazla kez kurulu", detail: "Aynı kimliğe (Pathoschild.ChestsAnywhere) sahip 2 etkin kopya var: Chests Anywhere 1.25.0, Chests Anywhere 1.24.1. SMAPI hiçbirini yüklemez.", mods: ca.map((m) => m.folder), fix: { kind: "disable", label: "Eski kopyaları kapat", folders: ["Chests Anywhere (eski)"], target: null } });
  if (has("")) issues.push({ id: "d", severity: "error", kind: "manifest-error", title: "BrokenThing okunamıyor", detail: "manifest.json bozuk: Geçersiz JSON: expected `,` or `}` at line 4 column 3", mods: ["BrokenThing"], fix: { kind: "open-folder", label: "Klasörü aç", folders: ["BrokenThing"], target: null } });
  const sp = has("unknown.Speedy");
  if (sp?.enabled)
    issues.push({ id: "e", severity: "warning", kind: "executable", title: "Speedy Updater Tool çalıştırılabilir dosya içeriyor", detail: "Mod klasöründe beklenmeyen dosyalar var: updater.exe. SMAPI modları bunlara ihtiyaç duymaz; kaynağından emin değilseniz kaldırın.", mods: [sp.folder], fix: { kind: "open-folder", label: "Klasörü incele", folders: [sp.folder], target: null } });
  if (mods.length)
    issues.push({ id: "f", severity: "warning", kind: "stray-archive", title: "Mods klasöründe açılmamış arşiv: Better Ranching-1234.zip", detail: "SMAPI arşivlerin içini okuyamaz. Modstead bunu güvenlik denetiminden geçirip kurabilir.", mods: [], fix: { kind: "install-archive", label: "Arşivi kur", folders: [], target: "Better Ranching-1234.zip" } });
  const npc = has("Bouhm.NPCMapLocations");
  if (npc?.enabled)
    issues.push({ id: "g", severity: "warning", kind: "obsolete", title: "NPC Map Locations artık gereksiz", detail: "Özellikleri oyuna ya da başka bir moda taşınmış. Oyunun 1.6 sürümündeki harita bu özelliği büyük ölçüde içeriyor.", mods: [npc.folder], fix: { kind: "disable", label: "Modu kapat", folders: [npc.folder], target: null } });
  if (mods.length)
    issues.push({ id: "h", severity: "info", kind: "updates", title: "3 mod güncellenebilir", detail: "Yeni sürümleri indirip Modstead'e bırakın; ayarlarınız korunarak güncellenir.", mods: ["Lookup Anything", "Automate", "Ridgeside Village"], fix: { kind: "view-updates", label: "Güncellemeleri gör", folders: [], target: null } });
  const errors = issues.filter((i) => i.severity === "error").length;
  const warnings = issues.filter((i) => i.severity === "warning").length;
  let score = Math.max(errors ? 0 : 40, 100 - errors * 12 - warnings * 4);
  if (errors) score = Math.min(score, 79);
  if (scenario.includes("nosmapi")) score = Math.min(score, 40);
  return { score, errors, warnings, infos: issues.length - errors - warnings, issues };
}

let settings: StardewSettings = {
  gamePath: scenario.includes("nogame") ? null : GAME,
  dataDir: null,
  season: "spring",
  autoCheckUpdates: true,
  backupSavesOnLaunch: true,
  trashRetentionDays: 30,
  saveBackupsKeep: 10,
  activeProfile: "p1",
};

let journal: JournalEntry[] = [
  { id: "j1", time: now - 2 * H, kind: "install", title: "Ridgeside Village kuruldu", details: ["Ridgeside Village 2.5.17"], actions: [{ type: "added", path: "x" }], undone: false, legacy: false },
  { id: "j2", time: now - 26 * H, kind: "toggle", title: "CJB Cheats Menu devre dışı bırakıldı", details: ["CJB Cheats Menu"], actions: [{ type: "rename", from: "a", to: "b" }], undone: false, legacy: false },
  { id: "j3", time: now - 3 * D, kind: "smapi", title: "SMAPI 4.5.2 kuruldu", details: [], actions: [], undone: false, legacy: false },
  { id: "j4", time: now - 9 * D, kind: "update", title: "Automate güncellendi (2.3.0)", details: ["Automate: 2.2.1 → 2.3.0"], actions: [{ type: "added", path: "x" }], undone: false, legacy: true },
];

let trash: TrashMeta[] = [{ id: "t1", original: "", rel: "Better Fishing", name: "Better Fishing", uniqueId: "x.BetterFishing", version: "1.2.0", reason: "Kaldırıldı", time: now - 4 * D, size: 2_300_000 }];

let profiles: Profile[] = [
  { id: "p1", name: "Ana çiftlik", description: "Günlük oynadığım düzen", mods: mods.filter((m) => m.enabled && m.uniqueId).map((m) => m.uniqueId!.toLowerCase()), createdAt: now - 20 * D, updatedAt: now - 2 * D },
  { id: "p2", name: "Çok oyunculu", description: "Arkadaşlarla uyumlu, hilesiz", mods: ["pathoschild.contentpatcher", "pathoschild.lookupanything", "smapi.consolecommands", "smapi.savebackup"], createdAt: now - 9 * D, updatedAt: now - 9 * D },
];

const saves: SaveInfo[] = [
  {
    folder: "LOVELYGOOD_395709243",
    farmer: "Deniz",
    farm: "Lovely",
    money: 234262,
    day: 15,
    season: 2,
    year: 3,
    playedMs: 258304432,
    modified: now - 6 * H,
    size: 13_600_000,
    backups: [
      { file: "20261024-101500__oyun-oncesi.zip", created: now - 6 * H, size: 2_100_000, reason: "oyun-oncesi" },
      { file: "20261020-201000__elle.zip", created: now - 4 * D, size: 2_050_000, reason: "elle" },
    ],
  },
  { folder: "BETTERLOVELY_395710112", farmer: "Deniz", farm: "Better Lovely", money: 48210, day: 3, season: 0, year: 2, playedMs: 98_000_000, modified: now - 40 * D, size: 9_100_000, backups: [] },
  { folder: "Love_395708045", farmer: "Ece", farm: "Love", money: 1250, day: 28, season: 3, year: 1, playedMs: 21_000_000, modified: now - 120 * D, size: 4_200_000, backups: [] },
];

const log: LogReport = {
  exists: true,
  path: "C:\\Users\\oyuncu\\AppData\\Roaming\\StardewValley\\ErrorLogs\\SMAPI-latest.txt",
  modified: now - 5 * H,
  smapiVersion: "4.5.2",
  gameVersion: "1.6.15",
  os: "Microsoft Windows 11 Pro",
  modsLoaded: 11,
  contentPacksLoaded: 1,
  skipped: [
    { name: "Ridgeside Village 2.5.17", reason: "it requires mods which aren't installed (spacechase0.SpaceCore)" },
    { name: "[JA] Fruit Trees 1.0.3", reason: "it needs the 'spacechase0.JsonAssets' mod, which isn't installed" },
  ],
  errors: [{ time: "21:14:03", level: "ERROR", source: "Automate", message: "Failed to automate machine at Farm (64, 15).\nSystem.NullReferenceException: Object reference not set to an instance of an object.\n   at Pathoschild.Stardew.Automate.Framework.MachineGroup.Automate()" }],
  warnings: [{ time: "21:02:11", level: "WARN", source: "SMAPI", message: "Changed save serializer: Speedy Updater Tool" }],
  bySource: { Automate: { errors: 1, warnings: 0 }, SMAPI: { errors: 0, warnings: 1 } },
  crashed: false,
  totalLines: 812,
};

const dataDir = () => settings.dataDir ?? "C:\\Users\\oyuncu\\AppData\\Local\\app.modstead\\games\\stardew";

const env = (): Environment => ({
  gamePath: settings.gamePath,
  store: settings.gamePath ? "steam" : null,
  version: settings.gamePath ? "1.6.15" : null,
  smapi: { installed: !!settings.gamePath && !scenario.includes("nosmapi"), version: settings.gamePath && !scenario.includes("nosmapi") ? "4.5.2" : null },
  modsPath: settings.gamePath ? `${settings.gamePath}\\Mods` : null,
  modsExists: !!settings.gamePath,
  mods: mods.length,
  enabled: mods.filter((m) => m.enabled).length,
  appdata: "C:\\Users\\oyuncu\\AppData\\Roaming\\StardewValley",
  savesDir: "C:\\Users\\oyuncu\\AppData\\Roaming\\StardewValley\\Saves",
  logsDir: "C:\\Users\\oyuncu\\AppData\\Roaming\\StardewValley\\ErrorLogs",
  dataDir: dataDir(),
  defaultDataDir: "C:\\Users\\oyuncu\\AppData\\Local\\app.modstead\\games\\stardew",
  disks: [
    ...(settings.gamePath ? [{ label: "Oyun klasörü", path: settings.gamePath, free: 80 * 1024 ** 3, low: false }] : []),
    { label: "Yedek ve çöp klasörü", path: dataDir(), free: 42 * 1024 ** 3, low: false },
  ],
  running: false,
});

const snapshot = (): ModsSnapshot => ({
  scan: { modsPath: settings.gamePath ? `${settings.gamePath}\\Mods` : null, exists: !!settings.gamePath, mods: [...mods].sort((a, b) => a.name.localeCompare(b.name)), strays: mods.length ? [{ path: "Better Ranching-1234.zip", kind: "archive", size: 1_200_000 }] : [], scannedAt: Date.now() },
  health: health(),
  updates: mods.length ? updates : null,
});

function entry(kind: string, title: string, details: string[] = []): JournalEntry {
  const e: JournalEntry = { id: crypto.randomUUID(), time: Date.now(), kind, title, details, actions: [{ type: "added", path: "" }], undone: false, legacy: false };
  journal = [e, ...journal];
  return e;
}

const stripDot = (f: string) => f.replace(/(^|\\)\./, "$1");

// ───────────── Nexus (Keşfet) ─────────────
// Nexus'un açık API'sinden alınmış gerçek kayıtlar (24.10.2026); görseller Nexus'tan yüklenir.

function nx(modId: number, name: string, summary: string, version: string, author: string, category: string, downloads: number, endorsements: number, updatedAt: string, thumbnailUrl: string | null, pictureUrl: string | null): NexusMod {
  return { modId, name, summary, version, author, category, downloads, endorsements, updatedAt, thumbnailUrl, pictureUrl, adult: false, status: "published", url: `https://www.nexusmods.com/stardewvalley/mods/${modId}` };
}

const NEXUS_MODS: NexusMod[] = [
  nx(2400, "SMAPI - Stardew Modding API", "The mod loader for Stardew Valley.", "4.5.2", "Pathoschild", "Modding Tools", 30297953, 387326, "2026-03-14T19:07:23Z", "https://staticdelivery.nexusmods.com/mods/1303/images/thumbnails/2400/2400-1739896414-1995424095.png", "https://staticdelivery.nexusmods.com/mods/1303/images/2400/2400-1739896414-1995424095.png"),
  nx(1915, "Content Patcher", "Loads content packs that change the game's data, images, and maps without replacing XNB files.", "2.9.1", "Pathoschild", "Modding Tools", 24868404, 493280, "2026-04-16T11:18:42Z", "https://staticdelivery.nexusmods.com/mods/1303/images/thumbnails/1915/1915-1519967846-411398257.png", "https://staticdelivery.nexusmods.com/mods/1303/images/1915/1915-1519967846-411398257.png"),
  nx(3753, "Stardew Valley Expanded", "Stardew Valley Expanded is a fanmade expansion for ConcernedApe's Stardew Valley. This mod adds 28 new NPCs,  58 locations, 278 character events, 43 fish, reima", "1.15.11", "FlashShifter", "Expansions", 22279815, 227245, "2025-06-30T23:19:24Z", "https://staticdelivery.nexusmods.com/mods/1303/images/thumbnails/3753/3753-1790012349-428345650.png", "https://staticdelivery.nexusmods.com/mods/1303/images/3753/3753-1790012349-428345650.png"),
  nx(239, "NPC Map Locations", "See NPC and players on the map, with an optional minimap.", "3.5.2", "Bouhm and Pathoschild", "User Interface", 14549841, 343704, "2026-04-25T18:03:45Z", "https://staticdelivery.nexusmods.com/mods/1303/images/thumbnails/239/239-1522469229-1390441983.png", "https://staticdelivery.nexusmods.com/mods/1303/images/239/239-1522469229-1390441983.png"),
  nx(5098, "Generic Mod Config Menu (GMCM)", "Adds an in-game UI to edit other mods' config options.", "1.16.0", "spacechase0", "Modding Tools", 13821757, 285626, "2025-10-18T19:48:57Z", "https://staticdelivery.nexusmods.com/mods/1303/images/thumbnails/5098/5098-1578097159-913064158.png", "https://staticdelivery.nexusmods.com/mods/1303/images/5098/5098-1578097159-913064158.png"),
  nx(1348, "SpaceCore", "A framework mod used by some of my other mods.", "1.28.4", "spacechase0", "Modding Tools", 12421398, 235276, "2025-10-19T14:27:21Z", "https://staticdelivery.nexusmods.com/mods/1303/images/thumbnails/1348/1348-1757873504-1684389719.png", "https://staticdelivery.nexusmods.com/mods/1303/images/1348/1348-1757873504-1684389719.png"),
  nx(3231, "Farm Type Manager (FTM)", "Farm Type Manager (FTM) is a framework that lets other mods spawn objects and monsters anywhere in the game, with various controls and customization options.", "1.26.1", "Esca-MMC", "Modding Tools", 11210925, 213066, "2025-11-14T17:55:30Z", "https://staticdelivery.nexusmods.com/mods/1303/images/thumbnails/3231/3231-1549594226-514724928.png", "https://staticdelivery.nexusmods.com/mods/1303/images/3231/3231-1549594226-514724928.png"),
  nx(4, "CJB Cheats Menu", "A simple in-game cheats menu with lots of cheats.", "1.42.0", "CJBok and Pathoschild", "Cheats", 10393151, 234712, "2026-04-20T01:07:25Z", "https://staticdelivery.nexusmods.com/mods/1303/images/thumbnails/4-0-1457716661.gif", "https://staticdelivery.nexusmods.com/mods/1303/images/4-0-1457716661.gif"),
  nx(541, "Lookup Anything", "See live info about whatever's under your cursor when you press F1. Learn a villager's favourite gifts, when a crop will be ready to harvest, how long a fence w", "1.55.0", "Pathoschild", "User Interface", 10007820, 203456, "2026-03-15T02:54:41Z", "https://staticdelivery.nexusmods.com/mods/1303/images/thumbnails/541-0-1482010183.png", "https://staticdelivery.nexusmods.com/mods/1303/images/541-0-1482010183.png"),
  nx(93, "CJB Item Spawner", "An easy-to-use in-game item spawner menu.", "2.5.6", "CJBok and Pathoschild", "Cheats", 7887088, 187961, "2026-03-15T16:49:27Z", "https://staticdelivery.nexusmods.com/mods/1303/images/thumbnails/93/93-1604102595-721584267.png", "https://staticdelivery.nexusmods.com/mods/1303/images/93/93-1604102595-721584267.png"),
  nx(1720, "Json Assets", "Lets content packs add custom content to the game.", "1.11.11", "spacechase0", "Modding Tools", 7746050, 168082, "2025-10-18T19:47:54Z", null, null),
  nx(1063, "Automate", "Place a chest next to a machine (like a furnace or crystalarium), and the machine will automatically pull raw items from the chest and push processed items into", "2.6.1", "Pathoschild", "Gameplay Mechanics", 7417554, 140194, "2026-03-15T16:16:41Z", "https://staticdelivery.nexusmods.com/mods/1303/images/thumbnails/1063-0-1491361908.png", "https://staticdelivery.nexusmods.com/mods/1303/images/1063-0-1491361908.png"),
  nx(1839, "stardewvalley anime mods", "I create mods for love interests and villagers Portrait", "1.6.7", "OhoDavi", "Characters", 7071460, 97187, "2026-09-11T07:14:21Z", "https://staticdelivery.nexusmods.com/mods/1303/images/thumbnails/1839/1839-1781627148-492089847.png", "https://staticdelivery.nexusmods.com/mods/1303/images/1839/1839-1781627148-492089847.png"),
  nx(1401, "Tractor Mod", "Buy a tractor to more efficiently work with crops, clear twigs and rocks, etc.", "4.24.4", "Pathoschild", "Gameplay Mechanics", 6781883, 148378, "2026-03-15T03:00:39Z", "https://staticdelivery.nexusmods.com/mods/1303/images/thumbnails/1401/1401-1609273527-2126312248.png", "https://staticdelivery.nexusmods.com/mods/1303/images/1401/1401-1609273527-2126312248.png"),
];

const NEXUS_CATEGORIES = [
  ["Gameplay Mechanics", 4235], ["Characters", 3895], ["Portraits", 2382], ["Visuals and Graphics", 2251], ["Items", 2194], ["Livestock and Animals", 1729],
  ["Dialogue", 1702], ["Furniture", 1605], ["User Interface", 1537], ["Maps", 1355], ["New Characters", 1331], ["Clothing", 1263], ["Buildings", 1229],
  ["Crafting", 864], ["Crops", 862], ["Pets / Horses", 832], ["Expansions", 773], ["Events", 724], ["Modding Tools", 593], ["Cheats", 437],
].map(([name, count]) => ({ name: name as string, count: count as number }));

function nexusPage(modId: number): NexusModPage {
  const base = NEXUS_MODS.find((m) => m.modId === modId) ?? nx(modId, `Mod #${modId}`, "Örnek mod.", "1.0.0", "someone", "Miscellaneous", 1200, 40, new Date(now - 30 * D).toISOString(), null, null);
  const reqs: Record<number, NexusModPage["requirements"]> = {
    3753: [
      { modId: 1915, name: "Content Patcher", external: false, url: null },
      { modId: 3231, name: "Farm Type Manager (FTM)", external: false, url: null },
      { modId: 1348, name: "SpaceCore", external: false, url: null },
      { modId: 2400, name: "SMAPI - Stardew Modding API", external: false, url: null },
    ],
  };
  const sec = Math.floor(now / 1000);
  const many = modId === 1839;
  const files: NexusModPage["files"] = many
    ? [
        { fileId: 91, name: "Anime Portraits - Bachelors", version: base.version, category: "MAIN", size: 48_000_000, fileName: "a.zip", date: sec - 3 * 86400, primary: false, scan: "VERIFIED", description: "Bekâr erkek karakterler." },
        { fileId: 92, name: "Anime Portraits - Bachelorettes", version: base.version, category: "MAIN", size: 52_000_000, fileName: "b.zip", date: sec - 3 * 86400, primary: false, scan: "VERIFIED", description: "Bekâr kadın karakterler." },
      ]
    : [
        { fileId: modId * 10 + 1, name: base.name, version: base.version, category: "MAIN", size: 2_400_000 + modId * 300, fileName: "main.zip", date: Math.floor(Date.parse(base.updatedAt) / 1000), primary: true, scan: "VERIFIED", description: "Ana dosya. Arşivi Mods klasörüne açın ya da bir mod yöneticisiyle kurun." },
        { fileId: modId * 10 + 2, name: `${base.name} — Türkçe çeviri`, version: base.version, category: "OPTIONAL", size: 180_000, fileName: "tr.zip", date: sec - 20 * 86400, primary: false, scan: "VERIFIED", description: "" },
        { fileId: modId * 10 + 3, name: base.name, version: "0.9.0", category: "OLD_VERSION", size: 2_100_000, fileName: "old.zip", date: sec - 400 * 86400, primary: false, scan: "UNSCANNED", description: "" },
      ];
  return { ...base, requirements: reqs[modId] ?? [{ modId: 2400, name: "SMAPI - Stardew Modding API", external: false, url: null }], files, mainFileId: many ? null : modId * 10 + 1 };
}

function nexusSearch(a?: Record<string, unknown>) {
  const q = String(a?.query ?? "").toLowerCase();
  const cat = (a?.category as string | null) ?? null;
  const sort = String(a?.sort ?? "downloads");
  let list = NEXUS_MODS.filter((m) => (!q || m.name.toLowerCase().includes(q)) && (!cat || m.category === cat));
  if (sort === "updated") list = [...list].sort((x, y) => Date.parse(y.updatedAt) - Date.parse(x.updatedAt));
  if (sort === "endorsements") list = [...list].sort((x, y) => y.endorsements - x.endorsements);
  const offset = Number(a?.offset ?? 0);
  return { total: q || cat ? list.length : 31793, mods: list.slice(offset, offset + 24) };
}

/** Nexus hesabı senaryosu (yalnızca önizleme): `?sdv=premium` ya da `?sdv=free`. */
const nexusAccount: Record<string, () => unknown> = scenario.includes("premium") || scenario.includes("free")
  ? {
      nexus_status: () => ({ hasKey: true, user: { name: "oyuncu", isPremium: scenario.includes("premium"), isSupporter: false, profileUrl: null }, rateLimit: null, error: null }),
      nxm_status: () => ({ registered: scenario.includes("premium"), otherHandler: null }),
    }
  : {};

/** İnceleme penceresi önizlemesi için örnek planlar (görevin planı yoksa). */
export const SAMPLE_PLANS: { mods: ModsPlan; smapi: SmapiPlan } = {
  mods: {
    kind: "mods",
    sourceName: "SpaceCore-1348-1-27-0.zip",
    totalSize: 2_600_000,
    fileCount: 18,
    sourceInMods: false,
    warnings: [],
    mods: [
      { key: "0", folderName: "SpaceCore", name: "SpaceCore", uniqueId: "spacechase0.SpaceCore", version: "1.27.0", author: "spacechase0", description: "Diğer modlar için ortak çerçeve.", kind: "smapi", action: "install", existingFolder: null, existingVersion: null, existingEnabled: null, size: 1_400_000, fileCount: 9, warnings: [], missingDeps: ["spacechase0.JsonAssets"], manifestError: null, keepsConfig: false },
      { key: "1", folderName: "Lookup Anything", name: "Lookup Anything", uniqueId: "Pathoschild.LookupAnything", version: "1.47.2", author: "Pathoschild", description: null, kind: "smapi", action: "update", existingFolder: "Lookup Anything", existingVersion: "1.46.0", existingEnabled: true, size: 1_200_000, fileCount: 9, warnings: [], missingDeps: [], manifestError: null, keepsConfig: true },
    ],
  },
  smapi: { kind: "smapi", version: "4.5.2", installedVersion: "4.5.1", gameDir: GAME, files: 214, bundledMods: ["Console Commands", "Save Backup"], keepsUserConfig: true, releaseUrl: "https://github.com/Pathoschild/SMAPI/releases/tag/4.5.2" },
};

export const mocks: Record<string, (a?: Record<string, unknown>) => unknown> = {
  stardew_environment: env,
  stardew_settings_get: () => settings,
  stardew_settings_update: (a) => {
    settings = a?.settings as StardewSettings;
    return settings;
  },
  stardew_get_snapshot: snapshot,
  stardew_set_mods_enabled: (a) => {
    const folders = a?.folders as string[];
    const enabled = a?.enabled as boolean;
    const names: string[] = [];
    mods = mods.map((m) => {
      if (!folders.includes(m.folder)) return m;
      names.push(m.name);
      const parts = stripDot(m.folder).split("\\");
      if (!enabled) parts[parts.length - 1] = "." + parts[parts.length - 1];
      return { ...m, enabled, folder: parts.join("\\") };
    });
    return entry("toggle", names.length === 1 ? `${names[0]} ${enabled ? "etkinleştirildi" : "devre dışı bırakıldı"}` : `${names.length} mod ${enabled ? "etkinleştirildi" : "devre dışı bırakıldı"}`, names);
  },
  stardew_uninstall_mods: (a) => {
    const folders = a?.folders as string[];
    const removed = mods.filter((m) => folders.includes(m.folder));
    mods = mods.filter((m) => !folders.includes(m.folder));
    trash = [...removed.map((m) => ({ id: crypto.randomUUID(), original: "", rel: m.folder, name: m.name, uniqueId: m.uniqueId, version: m.version, reason: "Kaldırıldı", time: Date.now(), size: m.size })), ...trash];
    return entry("uninstall", removed.length === 1 ? `${removed[0].name} kaldırıldı` : `${removed.length} mod kaldırıldı`);
  },
  stardew_hash_mod_files: () => [{ path: "ContentPatcher.dll", size: 412_160, sha256: "9f2c4e1b7a2d33e0c8a9b1f5d6e7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5" }],
  stardew_read_mod_config: () => JSON.stringify({ EnableDebugFeatures: false, Controls: { ToggleLookup: "F1", ScrollUp: "Up" }, ShowDataMiningFields: false }, null, 2),
  stardew_write_mod_config: () => null,
  stardew_install_archive: () => ({ id: "j-sdv-archive", game: "stardew", kind: "install", title: "Better Ranching-1234.zip", source: "local", stage: "scanning", progress: null, bytes: 0, total: null, message: "İçerik denetleniyor", error: null, security: null, plan: null, result: null, created: now, updated: now }),
  stardew_confirm_job: () => ({ installed: ["SpaceCore"], journal: entry("install", "SpaceCore kuruldu") }),
  stardew_install_smapi: () => ({ id: "j-sdv-smapi", game: "stardew", kind: "smapi", title: "SMAPI 4.5.2", source: "github", stage: "downloading", progress: 0.3, bytes: 3_000_000, total: 10_000_000, message: "İndiriliyor", error: null, security: null, plan: null, result: null, created: now, updated: now }),
  stardew_check_updates: async () => {
    await new Promise((r) => setTimeout(r, 900));
    updates.checkedAt = Date.now();
    return updates;
  },
  stardew_lookup_mods: (a) => (a?.ids as string[]).map((id) => ({ uniqueId: id, name: id === "spacechase0.JsonAssets" ? "Json Assets" : id.split(".").pop(), url: "https://www.nexusmods.com/stardewvalley/mods/1720", found: true, nexusId: id === "spacechase0.SpaceCore" ? 1348 : 1720 })),
  stardew_nexus_search: nexusSearch,
  stardew_nexus_categories: () => NEXUS_CATEGORIES,
  stardew_nexus_mod: (a) => nexusPage(Number(a?.modId)),
  stardew_install_nexus: (a) => ({ id: `j-sdv-nexus-${a?.modId}`, game: "stardew", kind: "install", title: String(a?.name ?? `Nexus #${a?.modId}`), source: "nexus", stage: "downloading", progress: 0.35, bytes: 900_000, total: 2_600_000, message: "İndiriliyor", error: null, security: null, plan: null, result: null, created: now, updated: now }),
  ...nexusAccount,
  stardew_list_journal: () => journal,
  stardew_undo_journal: (a) => {
    journal = journal.map((j) => (j.id === a?.id ? { ...j, undone: true } : j));
    return journal.find((j) => j.id === a?.id);
  },
  stardew_list_trash: () => trash,
  stardew_restore_trash: (a) => {
    trash = trash.filter((x) => x.id !== a?.id);
    return entry("restore", "Geri yüklendi");
  },
  stardew_delete_trash: (a) => {
    const n = a?.id ? 1 : trash.length;
    trash = a?.id ? trash.filter((x) => x.id !== a.id) : [];
    return n;
  },
  stardew_list_profiles: () => profiles,
  stardew_save_profile: (a) => {
    const input = a?.input as { id: string | null; name: string; description: string | null; capture: boolean };
    const keys = mods.filter((m) => m.enabled && m.uniqueId).map((m) => m.uniqueId!.toLowerCase());
    if (input.id) {
      profiles = profiles.map((p) => (p.id === input.id ? { ...p, name: input.name, description: input.description, mods: input.capture ? keys : p.mods, updatedAt: Date.now() } : p));
      return profiles.find((p) => p.id === input.id);
    }
    const p: Profile = { id: crypto.randomUUID(), name: input.name, description: input.description, mods: keys, createdAt: Date.now(), updatedAt: Date.now() };
    profiles = [...profiles, p];
    return p;
  },
  stardew_delete_profile: (a) => {
    profiles = profiles.filter((p) => p.id !== a?.id);
    return null;
  },
  stardew_preview_profile: (a) => {
    const p = profiles.find((x) => x.id === a?.id)!;
    return {
      profileId: p.id,
      enable: mods.filter((m) => !m.enabled && m.uniqueId && p.mods.includes(m.uniqueId.toLowerCase())).map((m) => ({ folder: m.folder, name: m.name })),
      disable: mods.filter((m) => m.enabled && m.uniqueId && !p.mods.includes(m.uniqueId.toLowerCase())).map((m) => ({ folder: m.folder, name: m.name })),
      missing: p.id === "p2" ? [] : ["spacechase0.spacecore"],
      unchanged: 5,
    };
  },
  stardew_apply_profile: (a) => {
    settings = { ...settings, activeProfile: String(a?.id) };
    return entry("profile", "Profil uygulandı");
  },
  stardew_import_profile: () => profiles[0],
  stardew_list_saves: () => saves,
  stardew_backup_save: () => ({ file: "yeni.zip", created: Date.now(), size: 2_000_000, reason: "elle" }),
  stardew_restore_save: () => null,
  stardew_delete_save_backup: () => null,
  stardew_read_smapi_log: () => log,
  stardew_launch: () => ({ backedUp: 3, backupError: null, vanilla: false }),
  stardew_is_running: () => false,
  stardew_open_path: () => null,
};
