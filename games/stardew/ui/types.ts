// Stardew komutlarının tipleri (games/stardew/src, serde camelCase karşılıkları).

export type Season = "auto" | "spring" | "summer" | "fall" | "winter";

export interface Smapi {
  installed: boolean;
  version: string | null;
}

export interface DiskInfo {
  label: string;
  path: string;
  free: number | null;
  low: boolean;
}

export interface Environment {
  gamePath: string | null;
  store: string | null;
  version: string | null;
  smapi: Smapi;
  modsPath: string | null;
  modsExists: boolean;
  mods: number;
  enabled: number;
  appdata: string | null;
  savesDir: string | null;
  logsDir: string | null;
  dataDir: string;
  defaultDataDir: string;
  disks: DiskInfo[];
  running: boolean;
}

export interface StardewSettings {
  gamePath: string | null;
  dataDir: string | null;
  season: Season;
  autoCheckUpdates: boolean;
  backupSavesOnLaunch: boolean;
  trashRetentionDays: number;
  saveBackupsKeep: number;
  activeProfile: string | null;
}

export interface Dependency {
  uniqueId: string;
  minimumVersion: string | null;
  isRequired: boolean;
}

export interface ContentPackFor {
  uniqueId: string;
  minimumVersion: string | null;
}

export type ModKind = "smapi" | "content" | "unknown";

export interface ModInfo {
  folder: string;
  folderName: string;
  group: string | null;
  enabled: boolean;
  disabledByParent: boolean;
  manifestError: string | null;
  problems: string[];
  uniqueId: string | null;
  name: string;
  author: string | null;
  version: string | null;
  description: string | null;
  kind: ModKind;
  entryDll: string | null;
  contentPackFor: ContentPackFor | null;
  minimumApiVersion: string | null;
  minimumGameVersion: string | null;
  dependencies: Dependency[];
  updateKeys: string[];
  nexusId: number | null;
  size: number;
  fileCount: number;
  modified: number;
  hasConfig: boolean;
  executables: string[];
  dlls: string[];
  isCore: boolean;
}

export interface Stray {
  path: string;
  kind: "archive" | "no-manifest" | "empty";
  size: number;
}

export interface ScanResult {
  modsPath: string | null;
  exists: boolean;
  mods: ModInfo[];
  strays: Stray[];
  scannedAt: number;
}

export type FixKind = "enable" | "disable" | "open-folder" | "install-smapi" | "find-dependency" | "install-archive" | "open-url" | "view-updates" | "open-settings";

export interface Fix {
  kind: FixKind;
  label: string;
  folders: string[];
  target: string | null;
}

export type Severity = "error" | "warning" | "info";

export interface Issue {
  id: string;
  severity: Severity;
  kind: string;
  title: string;
  detail: string;
  mods: string[];
  fix: Fix | null;
}

export interface HealthReport {
  score: number;
  errors: number;
  warnings: number;
  infos: number;
  issues: Issue[];
}

export interface UpdateEntry {
  uniqueId: string;
  name: string | null;
  installed: string | null;
  latest: string | null;
  url: string | null;
  hasUpdate: boolean;
  compatStatus: string | null;
  compatSummary: string | null;
  brokeIn: string | null;
  nexusId: number | null;
  errors: string[];
}

export interface UpdateCache {
  checkedAt: number;
  smapi: UpdateEntry | null;
  entries: UpdateEntry[];
}

export interface ModsSnapshot {
  scan: ScanResult;
  health: HealthReport;
  updates: UpdateCache | null;
}

export type JournalAction = { type: "rename"; from: string; to: string } | { type: "trash"; original: string; trashed: string } | { type: "added"; path: string };

export interface JournalEntry {
  id: string;
  time: number;
  kind: string;
  title: string;
  details: string[];
  actions: JournalAction[];
  undone: boolean;
  legacy: boolean;
}

export interface TrashMeta {
  id: string;
  original: string;
  rel: string;
  name: string;
  uniqueId: string | null;
  version: string | null;
  reason: string;
  time: number;
  size: number;
}

export interface FileHash {
  path: string;
  size: number;
  sha256: string;
}

export interface LookupResult {
  uniqueId: string;
  name: string | null;
  url: string;
  found: boolean;
  nexusId: number | null;
}

// ───────────── Nexus (Keşfet) ─────────────

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
  category: string;
}

export interface NexusSearchPage {
  total: number;
  mods: NexusMod[];
}

export interface NexusCategory {
  name: string;
  count: number;
}

export interface NexusRequirement {
  modId: number | null;
  name: string;
  external: boolean;
  url: string | null;
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
  /** Nexus'un kendi virüs taraması: VERIFIED, UNSCANNED, SUSPICIOUS… */
  scan: string;
  description: string;
}

export interface NexusModPage extends NexusMod {
  requirements: NexusRequirement[];
  files: NexusFile[];
  mainFileId: number | null;
}

// ───────────── Kurulum planları (inceleme penceresi) ─────────────

export interface StagedMod {
  key: string;
  folderName: string;
  name: string;
  uniqueId: string | null;
  version: string | null;
  author: string | null;
  description: string | null;
  kind: ModKind;
  action: "install" | "update" | "reinstall" | "downgrade";
  existingFolder: string | null;
  existingVersion: string | null;
  existingEnabled: boolean | null;
  size: number;
  fileCount: number;
  warnings: string[];
  missingDeps: string[];
  manifestError: string | null;
  keepsConfig: boolean;
}

export interface ModsPlan {
  kind: "mods";
  sourceName: string;
  mods: StagedMod[];
  warnings: string[];
  totalSize: number;
  fileCount: number;
  sourceInMods: boolean;
}

export interface SmapiPlan {
  kind: "smapi";
  version: string;
  installedVersion: string | null;
  gameDir: string | null;
  files: number;
  bundledMods: string[];
  keepsUserConfig: boolean;
  releaseUrl: string | null;
}

export type InstallPlan = ModsPlan | SmapiPlan;

export interface ModsOptions {
  keys: string[];
  removeSource: boolean;
}

// ───────────── Profiller, kayıtlar, günlük ─────────────

export interface Profile {
  id: string;
  name: string;
  description: string | null;
  mods: string[];
  createdAt: number;
  updatedAt: number;
}

export interface DiffItem {
  folder: string;
  name: string;
}

export interface ProfileDiff {
  profileId: string;
  enable: DiffItem[];
  disable: DiffItem[];
  missing: string[];
  unchanged: number;
}

export interface SaveBackup {
  file: string;
  created: number;
  size: number;
  reason: string;
}

export interface SaveInfo {
  folder: string;
  farmer: string | null;
  farm: string | null;
  money: number | null;
  day: number | null;
  season: number | null;
  year: number | null;
  playedMs: number | null;
  modified: number;
  size: number;
  backups: SaveBackup[];
}

export interface LogEntry {
  time: string;
  level: string;
  source: string;
  message: string;
}

export interface LogReport {
  exists: boolean;
  path: string | null;
  modified: number;
  smapiVersion: string | null;
  gameVersion: string | null;
  os: string | null;
  modsLoaded: number | null;
  contentPacksLoaded: number | null;
  skipped: { name: string; reason: string }[];
  errors: LogEntry[];
  warnings: LogEntry[];
  bySource: Record<string, { errors: number; warnings: number }>;
  crashed: boolean;
  totalLines: number;
}

export interface LaunchResult {
  backedUp: number;
  backupError: string | null;
  vanilla: boolean;
}

export interface GameExited {
  code: number | null;
  durationMs: number;
  vanilla: boolean;
}
