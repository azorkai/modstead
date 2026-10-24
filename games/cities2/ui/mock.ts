// Önizleme kipi örnek verisi (tarayıcıda, dosyalara dokunmadan). Mod adları, yazarlar ve görseller
// Paradox Mods'taki gerçek kayıtlardan; kayıt önizlemeleri yerine kayıt modlarının kapakları kullanılır.

import type { JobSnapshot } from "@/lib/types";
import type {
  Cities2Settings,
  Environment,
  HealthReport,
  InstallPlan,
  ModEntry,
  NexusSearchPage,
  PdxMeta,
  PdxModDetail,
  PdxSearchPage,
  SaveBackup,
  SaveInfo,
  Snapshot,
  TrashMeta,
} from "./types";

const now = Math.floor(Date.now() / 1000);
const cover = (uuid: string) => `https://modscontent.paradox-interactive.com/cities_skylines_2/${uuid}/content/cover.jpg`;
const USER = "C:\\Users\\oyuncu\\AppData\\LocalLow\\Colossal Order\\Cities Skylines II";

type Row = [id: string, name: string, author: string, ver: string, num: number, req: string, subs: number, ratings: number, uuid: string, tags?: string[]];

const CATALOG: Row[] = [
  ["74417", "Unified Icon Library", "algernon", "1.0.14", 17, "1.*", 1385572, 5440, "de166ad1-26db-46b9-a3f0-c775293ae164"],
  ["74604", "Anarchy", "yenyang", "1.8.0", 40, "1.6.*", 1141761, 14503, "25faeda9-b17e-4525-a08f-ba219ed13524"],
  ["80095", "Traffic", "krzychu124", "0.2.13", 29, "1.6.*", 1077268, 20545, "d9bdd734-8bcc-4834-b6b0-963b017b55e0"],
  ["74324", "Move It", "yenyang", "0.5.16", 37, "1.6.*", 1050032, 18008, "a3b6b122-48f5-44e4-a15f-cc51839c3ff8"],
  ["75426", "I18n Everywhere", "Nullpinter", "1.5.2", 72, "1.6.*", 1036785, 5140, "81daf11a-6357-4c05-ab92-cea0355e72ee"],
  ["75724", "ExtraLib", "Triton Supreme", "1.4.11", 31, "1.6.*", 898492, 2922, "b6d5e23c-388f-4c5a-b493-9f7742677331"],
  ["75250", "Better Bulldozer", "yenyang", "1.3.19", 26, "1.6.*", 875041, 5164, "4bc89c5f-a15c-4b0e-b0fe-48094763c875"],
  ["79634", "Asset Icon Library", "TDW", "4.1.1", 23, "1.6.*", 797561, 8213, "6dadd334-90bf-4627-9f4f-7f08e594aa23"],
  ["77240", "Find It", "TDW", "2.0", 59, "1.6.*", 773642, 5776, "d043c58f-ceb1-48c4-9b81-3720a276aafa"],
  ["87190", "Road Builder [BETA]", "TDW", "0.8.0", 43, "1.6.*", 633195, 10393, "3b4f4a76-024d-42f6-9b68-5b20ba57b04d"],
  ["75816", "Advanced Line Tool", "algernon", "1.2.3", 41, "1.6.*", 540399, 5152, "df5c086a-81be-49cc-865c-cebcfe1c5da0"],
  ["75613", "Water Features", "yenyang", "1.4.5", 21, "1.6*", 467716, 4484, "92ab8127-69cf-46c6-b68f-9f2536e5f041"],
  ["161156", "Parking Lot Tool", "Torbi", "1.1.0", 14, "1.6.*", 55514, 906, "ef1b8d5e-92c1-45db-8c85-51f778a95f12"],
  ["163638", "Placemaker", "ockidj", "0.2.0", 3, "1.6.*", 37229, 977, "e2e8c331-daeb-4fe8-9c32-ae9647c8c8fd"],
  ["160999", "Presidente - Politics, Economy, Stocks & Elections", "JAXSIC", "1.6.0", 7, "1.6.*", 7577, 725, "cf66bc13-d0a3-414a-83e0-ce1be59b1115"],
  ["162194", "Realistic Road Works", "TheGameBreaker._", "3.4.0", 5, "1.6.*", 5212, 526, "a86ab335-9450-449c-9588-8ba0e358e225"],
  ["161531", "Auto Bus Lines", "kl09joker", "2.0.6", 13, "1.6.*", 15592, 219, "b2d81b85-fab1-42e8-abae-6581d087500a"],
  ["162700", "Snowy Roads [BETA]", "Felipeljj", "1.2.2", 5, "1.6.2f1*", 6263, 216, "fc141c0e-05d0-4466-a09b-41fc5e65f58a"],
  ["75783", "Fort Johnson", "Cities: Skylines Official", "1.0", 1, "1*", 64394, 995, "0dfc83d1-4aa9-4da6-b1a3-228c6c6c95b6", ["Savegame", "North American"]],
  ["99894", "Intersection Pack 1", "Pro Best Cities", "1.0", 1, "1.5.*", 70537, 484, "cc0032df-173b-4405-a512-3af01c2d884c", ["Savegame", "North American"]],
  ["113794", "Parking Lot Roads", "Sully_Skylines", "1.1", 2, "*", 66728, 503, "a483954c-7458-4cec-8d8b-c6e0c739ed08", ["Savegame", "European"]],
];

const SUMMARY: Record<string, string> = {
  "74417": "Icons for modders that match the game's UI style.",
  "74604": "Disables error checks for tools so you can place props, trees and buildings anywhere.",
  "80095": "Lane connector, priorities and traffic rules: the successor to TM:PE for Cities: Skylines II.",
  "74324": "Move, rotate and align trees, props, decals, buildings, nodes and segments.",
  "161156": "Draw a shape and get a finished parking lot inside it, add vegetation or zoning and custom surfaces.",
  "163638": "Draw any area and turn it into a park, parking lot, plaza or beach. Preview it, tweak it, build it.",
};

function meta(r: Row): PdxMeta {
  const [modId, name, author, userVersion, latestVersion, requiredVersion, subscriptions, ratingsTotal, uuid, tags] = r;
  return {
    modId,
    name,
    author,
    summary: SUMMARY[modId] ?? `${name} for Cities: Skylines II.`,
    thumbnail: cover(uuid),
    userVersion,
    latestVersion,
    requiredVersion,
    tags: tags ?? ["Code Mod"],
    requirements: modId === "161156" ? [{ modId: "74417", name: "Unified Icon Library" }, { modId: "79634", name: "Asset Icon Library" }, { modId: "77240", name: "Find It" }] : [],
    rating: 5,
    ratingsTotal,
    subscriptions,
    size: 1_356_618 + Number(modId) * 3,
    updated: new Date((now - Number(modId.slice(-3)) * 3600) * 1000).toISOString(),
    url: `https://mods.paradoxplaza.com/mods/${modId}/Windows`,
    fetchedAt: now - 600,
  };
}

const byId = new Map(CATALOG.map((r) => [r[0], meta(r)]));

function pdxMod(id: string, ver: number, extra: Partial<ModEntry> = {}): ModEntry {
  const m = byId.get(id)!;
  return {
    key: `pdx:${id}`,
    source: "paradox",
    name: m.name,
    folder: `${id}_${ver}`,
    path: `${USER}\\.cache\\Mods\\pdx_mods\\${id}_${ver}`,
    enabled: true,
    modId: id,
    version: String(ver),
    kind: "code",
    dlls: [`${m.name.replace(/[^A-Za-z0-9]/g, "")}.dll`],
    hasUi: true,
    size: 2_400_000 + Number(id) * 7,
    fileCount: 14,
    modified: now - Number(id.slice(-2)) * 3600,
    stale: [],
    bepinex: false,
    knownBad: null,
    meta: m,
    ...extra,
  };
}

function localMod(folder: string, extra: Partial<ModEntry> = {}): ModEntry {
  const name = folder.replace(/^\./, "");
  return {
    key: `local:${name}`,
    source: "local",
    name,
    folder,
    path: `${USER}\\Mods\\${folder}`,
    enabled: !folder.startsWith("."),
    modId: null,
    version: "1.2.0",
    kind: "code",
    dlls: [`${name}.dll`],
    hasUi: false,
    size: 380_000,
    fileCount: 4,
    modified: now - 86400 * 3,
    stale: [],
    bepinex: false,
    knownBad: null,
    meta: null,
    ...extra,
  };
}

const mods: ModEntry[] = [
  pdxMod("74417", 17),
  pdxMod("74604", 40),
  pdxMod("80095", 28, { stale: [{ folder: "80095_27", version: 27, size: 9_800_000 }] }),
  pdxMod("74324", 37),
  pdxMod("79634", 23),
  pdxMod("77240", 59),
  pdxMod("87190", 43),
  pdxMod("161156", 14),
  pdxMod("75816", 41),
  pdxMod("75613", 21),
  pdxMod("99894", 1, { kind: "save", dlls: [], hasUi: false }),
  localMod("CityMonitor", { version: "0.4.1", hasUi: true }),
  localMod(".OldTrafficLights", { bepinex: true, version: "0.2.8" }),
  localMod("PhotoModePlus", { version: "2.0.3" }),
];
// Bir modu eski oyun sürümü için gösterelim (uyumluluk rozeti).
const outdated = mods.find((m) => m.modId === "75613")!;
outdated.meta = { ...outdated.meta!, requiredVersion: "1.5.*" };

const snapshot: Snapshot = {
  mods,
  localDir: `${USER}\\Mods`,
  localExists: true,
  pdxRoots: [`${USER}\\.cache\\Mods\\pdx_mods`],
  partial: [],
  gameVersion: "1.6.2f1",
  counts: { paradox: 11, local: 3, localEnabled: 2, code: 13, pendingUpdates: 1, staleBytes: 9_800_000, size: 412_000_000 },
  metaFetchedAt: now - 600,
};

const env: Environment = {
  gamePath: "D:\\Games\\Cities- Skylines II - PC Edition\\Content",
  store: "xbox",
  version: "1.6.2f1",
  userDir: USER,
  userDirExists: true,
  defaultUserDir: USER,
  localModsDir: `${USER}\\Mods`,
  savesDir: `${USER}\\Saves`,
  mapsDir: `${USER}\\Maps`,
  logsDir: `${USER}\\Logs`,
  dataDir: "C:\\Users\\oyuncu\\AppData\\Local\\app.modstead\\games\\cities2",
  defaultDataDir: "C:\\Users\\oyuncu\\AppData\\Local\\app.modstead\\games\\cities2",
  running: false,
  account: { loggedIn: false, platform: "xbox", userFolder: "2533274879948927" },
  launch: { kind: "xbox", supportsOptions: false },
  disks: [
    { label: "Oyun verisi (kayıtlar ve modlar)", path: USER, free: 5_100_000_000, low: false },
    { label: "Yedek ve çöp klasörü", path: "D:\\ModsteadData", free: 12_400_000_000, low: false },
  ],
  bepinex: [],
  protected: true,
};

let settings: Cities2Settings = {
  gamePath: null,
  userDir: null,
  dataDir: null,
  backupBeforeChanges: true,
  saveBackupsKeep: 5,
  trashRetentionDays: 30,
  developerMode: false,
  uiDeveloperMode: false,
};

const health: HealthReport = {
  score: 64,
  checkedAt: now - 120,
  gameVersion: "1.6.2f1",
  issues: [
    {
      id: "pdx-login",
      severity: "warn",
      title: "Oyunda Paradox hesabına giriş yapılmamış",
      detail: "Paradox Mods abonelikleri yalnızca oyunda Paradox hesabıyla giriş yapıldığında indirilir, güncellenir ve yüklenir. Ana menüden Paradox hesabınızla giriş yapın.",
      mods: [],
      fix: null,
      link: null,
    },
    {
      id: "outdated",
      severity: "warn",
      title: "1 kod modu bu oyun sürümü için güncellenmemiş",
      detail: "Water Features. Oyun güncellemesinden sonra güncellenmemiş kod modları çökmeye ya da kayıtların bozulmasına yol açabilir.",
      mods: ["pdx:75613"],
      fix: null,
      link: null,
    },
    {
      id: "bepinex-mod",
      severity: "warn",
      title: "BepInEx için yazılmış yerel mod",
      detail: "OldTrafficLights: oyunun yerleşik mod sistemi BepInEx eklentilerini yüklemez; günlüğe hata yazar ve çökmeye yol açabilir.",
      mods: ["local:OldTrafficLights"],
      fix: { action: "disable-local", label: "Kapat", folders: ["OldTrafficLights"] },
      link: null,
    },
    {
      id: "stale",
      severity: "info",
      title: "1 eski mod sürümü yer kaplıyor (9 MB)",
      detail: "Oyun bir modu güncelleyince eski sürüm klasörünü her zaman silmiyor. Bunlar kullanılmıyor; silmek güvenli (etkin sürümler kalır).",
      mods: ["pdx:80095"],
      fix: { action: "clean-stale", label: "Temizle", folders: [] },
      link: null,
    },
  ],
  logs: {
    dir: `${USER}\\Logs`,
    files: [
      { name: "Player.log", size: 38_692, modified: now - 900, errors: 2, warnings: 1 },
      { name: "Logs/Modding.log", size: 4_120, modified: now - 900, errors: 1, warnings: 3 },
      { name: "Logs/PdxSdk.log", size: 130, modified: now - 3600, errors: 0, warnings: 0 },
      { name: "Logs/UI.log", size: 1_332, modified: now - 3600, errors: 0, warnings: 2 },
    ],
    lines: [
      { file: "Logs/Modding.log", level: "error", text: "[ERROR] Error loading mod OldTrafficLights: missing dependency BepInEx", modKey: "local:OldTrafficLights", count: 1 },
      { file: "Player.log", level: "error", text: "NullReferenceException: Object reference not set to an instance of an object", modKey: "pdx:75613", count: 4 },
      { file: "Logs/Modding.log", level: "warn", text: "[WARN]  Mod WaterFeatures targets game version 1.5.*", modKey: "pdx:75613", count: 1 },
    ],
    gameVersion: "1.6.2f1",
    moddingRuntime: "Builtin",
    gpu: "NVIDIA GeForce RTX 3060 Ti",
    crashes: 1,
    lastCrash: now - 86400,
  },
};

const CITY_COVERS = ["0dfc83d1-4aa9-4da6-b1a3-228c6c6c95b6", "cc0032df-173b-4405-a512-3af01c2d884c", "a483954c-7458-4cec-8d8b-c6e0c739ed08", "53929687-cbb5-439b-9f15-d0bdb90b5e3c", "a4f4596c-aa9d-44ab-843a-3df11717409d"];

function save(i: number, name: string, city: string, pop: number, moneyAmount: number, extra: Partial<SaveInfo> = {}): SaveInfo {
  return {
    id: `2533274879948927/${name}.cok`,
    file: `${name}.cok`,
    name,
    cityName: city,
    population: pop,
    money: moneyAmount,
    xp: pop * 3,
    mapName: "Barrier Island",
    theme: "North American",
    simDate: { year: 2027, month: i % 12, hour: 4, minute: 31 },
    autoSave: false,
    gameMode: "NormalMode",
    modsEnabled: i < 2 ? ["Traffic", "Move It", "Anarchy", "Unified Icon Library", "Find It"] : [],
    options: i === 1 ? ["leftHandTraffic"] : [],
    size: 63_000_000 - i * 2_000_000,
    modified: now - i * 86400 - 600,
    hasPreview: true,
    backups: i === 0 ? 2 : 0,
    error: null,
    ...extra,
  };
}

const saves: SaveInfo[] = [
  save(0, "Babaeski 4", "Babaeski", 19983, 412_870),
  save(1, "24-October-21-32-00", "Babaeski", 19886, 405_120, { autoSave: true }),
  save(2, "Babaeski 3", "Babaeski", 18944, 370_555),
  save(3, "Düzce", "Düzce", 2380, 308_989),
  save(4, "Darley", "Darley", 624, 1_250_000),
];

let backups: SaveBackup[] = [
  { id: "2533274879948927/Babaeski 4.cok/20261024-213300__mod-change.cok", saveId: saves[0].id, name: "Babaeski 4", created: now - 7200, size: 63_000_000, reason: "mod-change" },
  { id: "2533274879948927/Babaeski 4.cok/20261023-190000__manual.cok", saveId: saves[0].id, name: "Babaeski 4", created: now - 93_600, size: 62_100_000, reason: "manual" },
];

let trash: TrashMeta[] = [{ id: "20261022-101500-ab12cd34ef", name: "RealisticDensity", original: `${USER}\\Mods\\RealisticDensity`, kind: "local-mod", time: now - 2 * 86400, size: 210_000 }];

function search(args?: Record<string, unknown>): PdxSearchPage {
  const query = String(args?.query ?? "").toLowerCase();
  const tag = (args?.tag as string | null) ?? null;
  const sort = String(args?.sort ?? "best");
  let list = CATALOG.map(meta).filter((m) => (!query || m.name.toLowerCase().includes(query) || m.author.toLowerCase().includes(query)) && (!tag || m.tags.includes(tag)));
  if (sort === "popularity") list = [...list].sort((a, b) => b.subscriptions - a.subscriptions);
  if (sort === "best") list = [...list].reverse();
  return { total: query || tag ? list.length : 27247, page: Number(args?.page ?? 0), mods: Number(args?.page ?? 0) > 0 ? [] : list };
}

function detail(id: string): PdxModDetail {
  const m = byId.get(id) ?? meta(CATALOG[0]);
  return {
    ...m,
    description:
      "# How to use it\n\n1. **Click** the icon in the mod bar at the top left, or press **Ctrl+Shift+P**.\n2. **Left click** sets the corners of your area, **right click** takes the last one back.\n3. Press **Enter**, or the Build button.\n\n# Before you start\n\nThis is an early version. **Back up your city before you build your first lot.**\n\nSource on [GitHub](https://github.com/KruemelGames/ParkingLotTool).",
    screenshots: [
      { image: m.thumbnail!, thumbnail: m.thumbnail! },
      { image: cover(CITY_COVERS[0]), thumbnail: cover(CITY_COVERS[0]) },
      { image: cover(CITY_COVERS[2]), thumbnail: cover(CITY_COVERS[2]) },
    ],
    changelog: [
      { version: m.userVersion ?? "1.0", released: "2026-10-21 20:04:41", details: "**Fixed:** EV charging stations could end up scattered across the lot.\n**Changed:** The version shown in game now matches the mod page." },
      { version: "1.0.12", released: "2026-10-17 11:37:21", details: "- New zoning tab\n- Performance improvements when editing large lots" },
    ],
    links: [
      { url: "https://github.com/KruemelGames/ParkingLotTool", kind: "github" },
      { url: "https://forum.paradoxplaza.com/forum/threads/mod-parking-lot-tool-discussion-feedback.1943010/", kind: "forum" },
    ],
    created: "2026-09-28T15:11:11.000Z",
  };
}

const nexus: NexusSearchPage = {
  total: 121,
  mods: [
    ["Unified Icon Library", 110, "algernon", "1.0.13", 13107, "Utilities"],
    ["Road Builder", 146, "TDW", "0.5.3", 13024, "Utilities"],
    ["Move it - stable beta", 109, "yenyang", "0.5.6", 12627, "Utilities"],
    ["Anarchy", 112, "yenyang", "1.7.18", 10599, "Utilities"],
    ["99 980 Population Save Game", 47, "CityBuilder", "1.0", 5695, "Maps"],
    ["Traffic Lights Enhancement", 58, "slyh", "0.2.8", 5367, "Utilities"],
  ].map(([name, modId, author, version, downloads, category]) => ({
    modId: modId as number,
    name: name as string,
    summary: "A Cities: Skylines II mod packaged for local installation.",
    version: version as string,
    author: author as string,
    pictureUrl: null,
    thumbnailUrl: null,
    endorsements: Math.round((downloads as number) / 12),
    downloads: downloads as number,
    updatedAt: "2025-04-12T09:52:38Z",
    adult: false,
    status: "published",
    url: `https://www.nexusmods.com/citiesskylines2/mods/${modId}`,
    category: category as string,
  })),
};

/** İnceleme penceresinin önizlemesi için örnek plan. */
export const SAMPLE_PLAN: InstallPlan = {
  kind: "cities2",
  sourceName: "RoadBuilder-146-0-5-3-1712345678.zip",
  items: [
    {
      key: "code:0",
      kind: "code",
      name: "RoadBuilder",
      targetName: "RoadBuilder",
      action: "update",
      version: "0.5.3",
      existingVersion: "0.5.1",
      existingEnabled: true,
      dlls: ["RoadBuilder.dll", "RoadBuilder_win_x86_64.dll"],
      hasUi: true,
      size: 3_400_000,
      fileCount: 18,
      bepinex: false,
      duplicateOf: "Road Builder [BETA]",
      detail: "Mods/RoadBuilder",
      warnings: ["Paradox Mods aboneliklerinizde de var (Road Builder [BETA]); ikisi birlikte yüklenirse çakışır."],
    },
    {
      key: "code:1",
      kind: "code",
      name: "OldTrafficLights",
      targetName: "OldTrafficLights",
      action: "install",
      version: "0.2.8",
      existingVersion: null,
      existingEnabled: null,
      dlls: ["OldTrafficLights.dll"],
      hasUi: false,
      size: 210_000,
      fileCount: 2,
      bepinex: true,
      duplicateOf: null,
      detail: "BepInEx/plugins/OldTrafficLights",
      warnings: ["BepInEx için yazılmış: oyunun 1.1'den beri kullandığı yerleşik mod sistemi bunu yüklemez."],
    },
    {
      key: "save:2",
      kind: "save",
      name: "Fort Johnson",
      targetName: "Fort Johnson.cok",
      action: "install",
      version: null,
      existingVersion: null,
      existingEnabled: null,
      dlls: [],
      hasUi: false,
      size: 48_000_000,
      fileCount: 2,
      bepinex: false,
      duplicateOf: null,
      detail: "Fort Johnson · 54210 nüfus · Barrier Island",
      warnings: [],
    },
  ],
  warnings: ["Arşivde mod yükleyicisi dosyaları var (winhttp.dll). Bunlar oyun klasörüne kopyalanmak içindir; Modstead kurmaz."],
  totalSize: 51_610_000,
  fileCount: 22,
  gameVersion: "1.6.2f1",
  savesFolder: "2533274879948927",
  backupFirst: true,
};

const reviewJob: JobSnapshot = {
  id: "cs2-review",
  game: "cities2",
  kind: "install",
  title: "RoadBuilder · 0.5.3",
  source: "nexus",
  stage: "review",
  progress: null,
  bytes: 3_400_000,
  total: 3_400_000,
  message: "3 öğe incelemeye hazır",
  error: null,
  security: null,
  plan: SAMPLE_PLAN,
  result: null,
  created: now - 60,
  updated: now - 20,
};

export const mocks: Record<string, (args?: Record<string, unknown>) => unknown> = {
  cities2_environment: () => env,
  cities2_settings_get: () => settings,
  cities2_settings_update: (a) => {
    settings = { ...settings, ...(a?.settings as Cities2Settings) };
    return settings;
  },
  cities2_snapshot: () => snapshot,
  cities2_set_enabled: (a) => (a?.folders as string[]).length,
  cities2_uninstall: () => [],
  cities2_list_trash: () => trash,
  cities2_restore_trash: (a) => {
    trash = trash.filter((x) => x.id !== a?.id);
    return "RealisticDensity";
  },
  cities2_delete_trash: () => {
    const n = trash.length;
    trash = [];
    return n;
  },
  cities2_health: () => health,
  cities2_fix: () => "Tamam",
  cities2_security_scan: () => ({ roots: [], dlls: 42, knownBad: [], defender: [{ status: "clean", engine: "Microsoft Defender", detail: "Tehdit bulunamadı.", malicious: 0, suspicious: 0, link: null }], threat: false, scannedAt: now }),
  cities2_list_saves: () => saves,
  cities2_save_preview: (a) => cover(CITY_COVERS[saves.findIndex((x) => x.id === a?.id) % CITY_COVERS.length] ?? CITY_COVERS[0]),
  cities2_list_save_backups: () => backups,
  cities2_backup_save: (a) => {
    const b: SaveBackup = { id: `${a?.id}/new__manual.cok`, saveId: String(a?.id), name: "Yeni", created: now, size: 60_000_000, reason: "manual" };
    backups = [b, ...backups];
    return b;
  },
  cities2_restore_save: () => null,
  cities2_delete_save_backup: (a) => {
    backups = backups.filter((b) => b.id !== a?.backup);
    return null;
  },
  cities2_logs: () => health.logs,
  cities2_read_log: () =>
    "Mono path[0] = 'C:/Program Files/WindowsApps/ParadoxInteractive.CitiesSkylinesII-PCEdition/Cities2_Data/Managed'\nGame version: 1.6.2f1 (768.21d1) [6300.27778]\nModding runtime: Builtin\n[2026-10-24 21:13:56,073] [ERROR] Error loading mod OldTrafficLights: missing dependency BepInEx\n[2026-10-24 21:13:57,120] [WARN]  Mod WaterFeatures targets game version 1.5.*\nNullReferenceException: Object reference not set to an instance of an object\n  at WaterFeatures.Systems.SeasonalStreamsSystem.OnUpdate () [0x00000]",
  cities2_launch: () => null,
  cities2_open_path: () => null,
  cities2_confirm_job: () => ({ installed: ["RoadBuilder"], replaced: [], backedUp: null }),
  cities2_pdx_search: search,
  cities2_pdx_mod: (a) => detail(String(a?.modId)),
  cities2_pdx_refresh: () => 0,
  cities2_nexus_search: () => nexus,
  cities2_nexus_mod: (a) => ({ ...nexus.mods.find((m) => m.modId === a?.modId)!, requirements: [], files: [], mainFileId: 1 }),
  cities2_install_nexus: () => reviewJob,
  // İnceleme penceresinin önizlemesi: `?review=cs2-review` verilince görev listesine örnek görev girer.
  ...(typeof location !== "undefined" && new URLSearchParams(location.search).get("review") === "cs2-review" ? { jobs_list: () => [reviewJob] } : {}),
};
