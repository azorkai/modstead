// Önizleme kipi: Tauri dışında (tarayıcıda) komutlar bu örnek verilerle yanıtlanır.
// Böylece arayüz `npm run dev` ile http://127.0.0.1:1420 adresinde dosyalara dokunmadan
// tasarlanıp ekran görüntüsüyle denetlenebilir. Oyunlar kendi örneklerini `mocks` ile ekler.

import type { AppInfo, GameStatusEntry, JobSnapshot, SecurityReport, Settings } from "./types";

type Handler = (args?: Record<string, unknown>) => unknown;

const handlers = new Map<string, Handler>();

export function registerMocks(map: Record<string, Handler> | undefined) {
  if (!map) return;
  for (const [k, v] of Object.entries(map)) handlers.set(k, v);
}

export async function mockInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  await new Promise((r) => setTimeout(r, 120 + Math.random() * 180));
  const h = handlers.get(cmd);
  if (!h) throw { code: "message", message: `Önizleme kipinde "${cmd}" komutu yok.` };
  return h(args) as T;
}

export function mockListen(_event: string, _handler: (payload: unknown) => void): () => void {
  return () => {};
}

const now = Math.floor(Date.now() / 1000);

const params = typeof location !== "undefined" ? new URLSearchParams(location.search) : new URLSearchParams();

let settings: Settings = {
  theme: (params.get("theme") as Settings["theme"]) ?? "system",
  language: "auto",
  reduceMotion: false,
  requireScan: true,
  requireVerified: true,
  blockDangerous: true,
  virustotal: true,
  showAdult: false,
  nxmRegistered: false,
  nxmPreviousCommand: null,
  onboarded: params.get("onboarding") !== "1",
  games: [],
  lastGame: null,
  resolvedLanguage: params.get("lang") === "en" ? "en" : "tr",
};

const appInfo: AppInfo = {
  version: "0.1.0",
  dataDir: "C:\\Users\\oyuncu\\AppData\\Roaming\\app.modstead",
  localDir: "C:\\Users\\oyuncu\\AppData\\Local\\app.modstead",
  language: "tr",
  defenderAvailable: true,
  games: [
    { id: "msfs", name: "Microsoft Flight Simulator", short: "MSFS", nexus: [{ domain: "microsoftflightsimulator", id: 3407 }], steamAppIds: [1250410, 2537590] },
    { id: "bannerlord", name: "Mount & Blade II: Bannerlord", short: "Bannerlord", nexus: [{ domain: "mountandblade2bannerlord", id: 3174 }], steamAppIds: [261550] },
    { id: "stardew", name: "Stardew Valley", short: "Stardew", nexus: [{ domain: "stardewvalley", id: 1303 }], steamAppIds: [413150] },
    { id: "cities2", name: "Cities: Skylines II", short: "Cities II", nexus: [{ domain: "citiesskylines2", id: 5833 }], steamAppIds: [949230] },
  ],
};

const games: GameStatusEntry[] = [
  {
    id: "msfs",
    status: {
      installed: true,
      installs: [
        { label: "MSFS 2024 · Microsoft Store", path: "E:\\MSFS 2024\\Community", version: null, store: "store", running: false },
        { label: "MSFS 2020 · Steam", path: "D:\\MSFS\\Community", version: null, store: "steam", running: false },
      ],
      running: false,
      mods: 64,
      enabled: 64,
      issues: null,
      updates: null,
      notes: [],
      checkedAt: now - 40,
    },
  },
  {
    id: "bannerlord",
    status: {
      installed: true,
      installs: [{ label: "Steam", path: "D:\\SteamLibrary\\steamapps\\common\\Mount & Blade II Bannerlord", version: "v1.2.12.66233", store: "steam", running: false }],
      running: false,
      mods: 27,
      enabled: 19,
      issues: null,
      updates: null,
      notes: [{ tone: "info", text: "Steam Workshop modülleri de okunuyor." }],
      checkedAt: now - 40,
    },
  },
  {
    id: "stardew",
    status: {
      installed: true,
      installs: [{ label: "Steam", path: "D:\\SteamLibrary\\steamapps\\common\\Stardew Valley", version: "1.6.15", store: "steam", running: false }],
      running: false,
      mods: 48,
      enabled: 44,
      issues: null,
      updates: null,
      notes: [{ tone: "ok", text: "SMAPI 4.5.2" }],
      checkedAt: now - 40,
    },
  },
  {
    id: "cities2",
    status: {
      installed: true,
      installs: [{ label: "Xbox", path: "C:\Program Files\WindowsApps\ParadoxInteractive.CitiesSkylinesII-PCEdition_1.6.2.0_x64__zfnrdv2de78ny", version: "1.6.2f1", store: "xbox", running: false }],
      running: false,
      mods: 23,
      enabled: 21,
      issues: 3,
      updates: null,
      notes: [{ tone: "ok", text: "Paradox Mods · 18" }],
      checkedAt: now - 40,
    },
  },
];

const report: SecurityReport = {
  verdict: "safe",
  score: 5,
  source: { url: "https://www.nexusmods.com/stardewvalley/mods/1915", domain: "nexusmods.com", trust: "trusted", label: "Nexus Mods" },
  verification: { status: "verified", method: "Nexus MD5", detail: "Dosyanın MD5 özeti Nexus'taki #1915/94120 kaydıyla birebir aynı." },
  archive: { name: "ContentPatcher-1915-2-6-0.zip", kind: "ZIP", size: 1_284_402, sha256: "3f1c2b7a9d4e5f60718293a4b5c6d7e8f9a0b1c2d3e4f5061728394a5b6c7d8e" },
  defender: { status: "clean", engine: "Microsoft Defender", detail: "Tehdit bulunamadı.", malicious: 0, suspicious: 0, link: null },
  virustotal: null,
  nexusScan: "VERIFIED",
  findings: [{ severity: "info", code: "expected-code", title: "1 kod kitaplığı", detail: "Bu oyunun modları kod kitaplığı içerir; özetleri aşağıda.", path: null }],
  codeFiles: [{ path: "ContentPatcher/ContentPatcher.dll", size: 742_400, sha256: "9b8c7d6e5f4a3b2c1d0e9f8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0a9b8c", kind: "library", expected: true }],
  scannedFiles: 38,
  totalSize: 2_602_112,
  needsOverride: null,
  blocked: null,
  scannedAt: now - 30,
};

let jobs: JobSnapshot[] = [
  {
    id: "j-review",
    game: "stardew",
    kind: "install",
    title: "Content Patcher · 2.6.0",
    source: "nexus",
    stage: "review",
    progress: null,
    bytes: 1_284_402,
    total: 1_284_402,
    message: "1 mod incelemeye hazır",
    error: null,
    security: report,
    plan: null,
    result: null,
    created: now - 90,
    updated: now - 30,
  },
  {
    id: "j-dl",
    game: "bannerlord",
    kind: "install",
    title: "ButterLib · v2.9.18",
    source: "github",
    stage: "downloading",
    progress: 0.62,
    bytes: 3_100_000,
    total: 5_000_000,
    message: "İndiriliyor",
    error: null,
    security: null,
    plan: null,
    result: null,
    created: now - 20,
    updated: now - 2,
  },
  {
    id: "j-done",
    game: "msfs",
    kind: "install",
    title: "FlyByWire A32NX · v0.12.4",
    source: "github",
    stage: "done",
    progress: 1,
    bytes: 512_000_000,
    total: 512_000_000,
    message: "Kuruldu",
    error: null,
    security: null,
    plan: null,
    result: null,
    created: now - 3600,
    updated: now - 3400,
  },
];

registerMocks({
  app_info: () => appInfo,
  settings_get: () => settings,
  settings_update: (a) => {
    settings = { ...settings, ...((a?.patch as Partial<Settings>) ?? {}) };
    return settings;
  },
  games_status: () => games,
  game_status: (a) => games.find((g) => g.id === a?.id)?.status,
  game_detect: (a) => {
    const g = games.find((x) => x.id === a?.id);
    return (g?.status.installs ?? []).map((i) => ({ path: i.path, store: i.store, version: i.version, label: i.label }));
  },
  game_set_path: (a) => games.find((g) => g.id === a?.id)?.status,
  game_launch: () => null,
  game_install_files: () => [],
  nexus_status: () => ({ hasKey: false, user: null, rateLimit: null, error: null }),
  nexus_set_key: () => ({ hasKey: true, user: { name: "oyuncu", isPremium: false, isSupporter: false, profileUrl: null }, rateLimit: null, error: null }),
  nexus_clear_key: () => null,
  secrets_status: () => ({ virustotal: false, github: false }),
  secret_set: () => ({ virustotal: true, github: false }),
  secret_clear: () => ({ virustotal: false, github: false }),
  nxm_status: () => ({ registered: false, otherHandler: null }),
  nxm_register: () => ({ registered: true, otherHandler: null }),
  nxm_unregister: () => ({ registered: false, otherHandler: null }),
  nxm_open: () => jobs[0],
  pending_take: () => ({ nxm: [], files: [] }),
  jobs_list: () => jobs,
  job_cancel: () => null,
  job_dismiss: (a) => {
    jobs = jobs.filter((j) => j.id !== a?.id);
    return null;
  },
  jobs_clear: () => {
    jobs = jobs.filter((j) => !["done", "failed", "cancelled"].includes(j.stage));
    return jobs;
  },
  open_url: () => null,
  open_app_folder: () => null,
});
