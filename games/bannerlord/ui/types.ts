// Bannerlord komutlarının tipleri: games/bannerlord/src (serde camelCase). Görevler, güvenlik raporu ve
// Nexus hesabı kabuğun tipleridir (@/lib/types).

export type Location = "modules" | "workshop";

export interface DepRef {
  id: string;
  kind: "required" | "optional" | "incompatible";
  order: "before" | "after" | "any";
  version: string | null;
}

export interface DllRef {
  name: string;
  declared: boolean;
  exists: boolean;
  blocked: boolean;
}

export interface UpdateSource {
  provider: "nexus" | "github";
  value: string;
  url: string;
}

export interface ModuleInfo {
  id: string;
  name: string;
  version: string;
  folder: string;
  path: string;
  location: Location;
  workshopId: string | null;
  isOfficial: boolean;
  moduleType: string;
  category: string;
  deps: DepRef[];
  subModules: { name: string; dll: string | null; classType: string | null }[];
  url: string | null;
  updateSources: UpdateSource[];
  dlls: DllRef[];
  parseError: string | null;
  modified: number;
}

export interface GameDirs {
  root: string;
  bin: string;
  modulesDir: string;
  workshopDir: string | null;
  platform: string;
  version: string;
  exe: string;
  blse: string | null;
  configsDir: string;
  launcherData: string;
  detectedBy: string;
}

export interface ModEntry {
  id: string;
  enabled: boolean;
}

export type Fix =
  | { type: "enable"; moduleId: string }
  | { type: "disable"; moduleId: string }
  | { type: "sort" }
  | { type: "unblock"; moduleId: string }
  | { type: "search"; query: string }
  | { type: "retireCopy"; moduleId: string; path: string };

export type Severity = "error" | "warning" | "info";

export interface Issue {
  id: string;
  severity: Severity;
  kind: string;
  moduleId: string;
  relatedId: string | null;
  title: string;
  detail: string;
  fix: Fix | null;
}

export type InstallSource =
  | { kind: "nexus"; modId: number; fileId: number; fileName: string }
  | { kind: "github"; repo: string; tag: string; asset: string }
  | { kind: "url"; url: string; fileName: string }
  | { kind: "local"; fileName: string };

export interface InstallRecord {
  moduleId: string;
  folder: string;
  version: string;
  source: InstallSource;
  archiveSha256: string;
  installedAt: number;
}

export interface Overview {
  game: GameDirs | null;
  gameError: string | null;
  gameRunning: boolean;
  modules: ModuleInfo[];
  shadowed: ModuleInfo[];
  order: ModEntry[];
  issues: Issue[];
  installs: Record<string, InstallRecord>;
  defenderAvailable: boolean;
}

export interface SortResult {
  order: ModEntry[];
  changed: boolean;
  issues: Issue[];
}

export interface PlannedModule {
  id: string;
  name: string;
  version: string;
  folder: string;
  relRoot: string;
  files: number;
  size: number;
  dlls: { path: string; size: number; sha256: string }[];
  existing: { version: string; location: Location; path: string } | null;
  action: "install" | "update" | "downgrade" | "reinstall";
  missingDeps: string[];
  blocked: string | null;
}

/** İnceleme penceresindeki oyuna özel plan (`JobSnapshot.plan`; güvenlik raporu ayrı: `JobSnapshot.security`). */
export interface InstallPlan {
  sourceLabel: string;
  sourceUrl: string | null;
  modules: PlannedModule[];
  notes: string[];
}

/** Oyuna özel ayarlar (genel ayarlar kabukta: dil, tema, güvenlik, Nexus, nxm). */
export interface BannerlordSettings {
  gamePath: string | null;
  unblockAfterInstall: boolean;
  enableAfterInstall: boolean;
  autoSort: boolean;
  backupsPerModule: number;
  minimizeOnLaunch: boolean;
  preferBlse: boolean;
}

export type SettingsPatch = Partial<Omit<BannerlordSettings, "gamePath">>;

export interface NexusMod {
  modId: number;
  name: string;
  summary: string;
  version: string;
  author: string;
  pictureUrl: string | null;
  thumbnailUrl: string | null;
  endorsements: number;
  downloads: number;
  updatedAt: string;
  adult: boolean;
  status: string;
  url: string;
}

export interface NexusFile {
  fileId: number;
  name: string;
  version: string;
  category: string;
  size: number;
  fileName: string;
  date: number;
  primary: boolean;
  scan: string;
  description: string;
}

export interface NexusModPage extends NexusMod {
  requirements: { modId: number | null; name: string; external: boolean; url: string | null }[];
  files: NexusFile[];
}

export interface SearchPage {
  total: number;
  mods: NexusMod[];
}

export interface GhAsset {
  id: number;
  name: string;
  size: number;
  downloadUrl: string;
  sha256: string | null;
  downloads: number;
}

export interface GhRelease {
  id: number;
  tag: string;
  name: string;
  publishedAt: string;
  prerelease: boolean;
  notes: string;
  url: string;
  assets: GhAsset[];
}

export interface GhRepo {
  repo: string;
  description: string;
  stars: number;
  url: string;
  releases: GhRelease[];
}

export interface UpdateItem {
  moduleId: string;
  name: string;
  current: string;
  latest: string | null;
  provider: "nexus" | "github" | "steam" | "none";
  /** steam: Workshop kopyası güncel / Steam yönetiyor; steamPending: Steam'de daha yeni sürüm var, Steam indirecek. */
  status: "available" | "current" | "unknown" | "error" | "steam" | "steamPending";
  /** Steam satırlarında sourceUrl steamcommunity sayfasıdır. */
  sourceUrl: string | null;
  workshopId: string | null;
  nexusModId: number | null;
  nexusFileId: number | null;
  githubRepo: string | null;
  githubReleaseId: number | null;
  githubAssetId: number | null;
  githubAssetName: string | null;
  error: string | null;
}

/** steam_lookup: tek Workshop öğesi ya da koleksiyon. */
export interface WorkshopItem {
  id: string;
  title: string;
  /** Düz metin, en fazla 600 karakter. */
  description: string;
  previewUrl: string | null;
  fileSize: number;
  /** Unix saniye. */
  timeCreated: number;
  timeUpdated: number;
  subscriptions: number;
  favorited: number;
  tags: string[];
  /** https://steamcommunity.com/sharedfiles/filedetails/?id=… */
  url: string;
  installed: boolean;
  installedModuleId: string | null;
  localTimeUpdated: number | null;
  needsUpdate: boolean;
}

export interface WorkshopCollection {
  id: string;
  title: string;
  previewUrl: string | null;
}

export interface SteamLookup {
  collection: WorkshopCollection | null;
  items: WorkshopItem[];
}

export type SteamTarget = "item" | "workshop" | "downloads";

export interface BackupMeta {
  id: string;
  moduleId: string;
  name: string;
  version: string;
  folder: string;
  reason: "update" | "uninstall" | "duplicate" | "restore";
  created: number;
  size: number;
}

export interface Profile {
  id: string;
  name: string;
  created: number;
  updated: number;
  modules: { id: string; enabled: boolean; version: string }[];
}

export interface AppliedProfile {
  order: ModEntry[];
  missing: string[];
  issues: Issue[];
}

export interface ModuleDetails {
  size: number;
  files: number;
  record: InstallRecord | null;
  backups: BackupMeta[];
  dependents: string[];
}


/** Genel bakış/kart için (bannerlord_game). */
export interface GameView {
  root: string | null;
  version: string | null;
  modulesDir: string | null;
  workshopDir: string | null;
  launcherData: string;
  modules: number;
  enabled: number;
  running: boolean;
}
