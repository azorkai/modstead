// Cities: Skylines II arka uç tipleri (games/cities2/src ile birebir; alan adları camelCase).

import type { EngineResult } from "@/lib/types";

export interface PdxAccount {
  loggedIn: boolean | null;
  platform: string | null;
  userFolder: string | null;
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
  userDir: string;
  userDirExists: boolean;
  defaultUserDir: string;
  localModsDir: string;
  savesDir: string;
  mapsDir: string;
  logsDir: string;
  dataDir: string;
  defaultDataDir: string;
  running: boolean;
  account: PdxAccount;
  launch: { kind: "steam" | "xbox" | "exe" | "none"; supportsOptions: boolean };
  disks: DiskInfo[];
  bepinex: string[];
  protected: boolean;
}

export interface Cities2Settings {
  gamePath: string | null;
  userDir: string | null;
  dataDir: string | null;
  backupBeforeChanges: boolean;
  saveBackupsKeep: number;
  trashRetentionDays: number;
  developerMode: boolean;
  uiDeveloperMode: boolean;
}

export interface PdxRequirement {
  modId: string;
  name: string;
}

export interface PdxMeta {
  modId: string;
  name: string;
  author: string;
  summary: string;
  thumbnail: string | null;
  userVersion: string | null;
  latestVersion: number | null;
  requiredVersion: string | null;
  tags: string[];
  requirements: PdxRequirement[];
  rating: number | null;
  ratingsTotal: number;
  subscriptions: number;
  size: number | null;
  updated: string | null;
  url: string;
  fetchedAt: number;
}

export interface StaleVersion {
  folder: string;
  version: number;
  size: number;
}

export type ModKind = "code" | "asset" | "map" | "save" | "other";

export interface ModEntry {
  key: string;
  source: "paradox" | "local";
  name: string;
  folder: string;
  path: string;
  enabled: boolean;
  modId: string | null;
  version: string | null;
  kind: ModKind;
  dlls: string[];
  hasUi: boolean;
  size: number;
  fileCount: number;
  modified: number;
  stale: StaleVersion[];
  bepinex: boolean;
  knownBad: string | null;
  meta: PdxMeta | null;
}

export interface Counts {
  paradox: number;
  local: number;
  localEnabled: number;
  code: number;
  pendingUpdates: number;
  staleBytes: number;
  size: number;
}

export interface Snapshot {
  mods: ModEntry[];
  localDir: string;
  localExists: boolean;
  pdxRoots: string[];
  partial: string[];
  gameVersion: string | null;
  counts: Counts;
  metaFetchedAt: number | null;
}

export interface TrashMeta {
  id: string;
  name: string;
  original: string;
  kind: string;
  time: number;
  size: number;
}

export type FixAction = "clean-stale" | "remove-known-bad" | "remove-bepinex" | "disable-local";

export interface Fix {
  action: FixAction;
  label: string;
  folders: string[];
}

export type Severity = "danger" | "warn" | "info";

export interface Issue {
  id: string;
  severity: Severity;
  title: string;
  detail: string;
  mods: string[];
  fix: Fix | null;
  link: string | null;
}

export interface LogFile {
  name: string;
  size: number;
  modified: number;
  errors: number;
  warnings: number;
}

export interface LogLine {
  file: string;
  level: "error" | "warn";
  text: string;
  modKey: string | null;
  count: number;
}

export interface LogReport {
  dir: string;
  files: LogFile[];
  lines: LogLine[];
  gameVersion: string | null;
  moddingRuntime: string | null;
  gpu: string | null;
  crashes: number;
  lastCrash: number | null;
}

export interface HealthReport {
  issues: Issue[];
  score: number;
  checkedAt: number;
  gameVersion: string | null;
  logs: LogReport;
}

export interface SecurityScan {
  roots: string[];
  dlls: number;
  knownBad: string[];
  defender: EngineResult[];
  threat: boolean;
  scannedAt: number;
}

export interface SimDate {
  year: number;
  month: number;
  hour: number;
  minute: number;
}

export interface SaveInfo {
  id: string;
  file: string;
  name: string;
  cityName: string | null;
  population: number | null;
  money: number | null;
  xp: number | null;
  mapName: string | null;
  theme: string | null;
  simDate: SimDate | null;
  autoSave: boolean;
  gameMode: string | null;
  modsEnabled: string[];
  options: string[];
  size: number;
  modified: number;
  hasPreview: boolean;
  backups: number;
  error: string | null;
}

export interface SaveBackup {
  id: string;
  saveId: string;
  name: string;
  created: number;
  size: number;
  reason: string;
}

export interface PdxSearchPage {
  total: number;
  page: number;
  mods: PdxMeta[];
}

export interface PdxModDetail extends PdxMeta {
  description: string;
  screenshots: { image: string; thumbnail: string }[];
  changelog: { version: string; released: string; details: string }[];
  links: { url: string; kind: string }[];
  created: string | null;
}

export type PdxSort = "best" | "popularity" | "created" | "updated" | "rating";

// ───────────── Nexus ─────────────

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
  mainFileId: number | null;
}

// ───────────── Kurulum planı ─────────────

export interface PlanItem {
  key: string;
  kind: "code" | "save" | "map";
  name: string;
  targetName: string;
  action: "install" | "update" | "reinstall" | "downgrade";
  version: string | null;
  existingVersion: string | null;
  existingEnabled: boolean | null;
  dlls: string[];
  hasUi: boolean;
  size: number;
  fileCount: number;
  bepinex: boolean;
  duplicateOf: string | null;
  detail: string | null;
  warnings: string[];
}

export interface InstallPlan {
  kind: "cities2";
  sourceName: string;
  items: PlanItem[];
  warnings: string[];
  totalSize: number;
  fileCount: number;
  gameVersion: string | null;
  savesFolder: string | null;
  backupFirst: boolean;
}

export interface InstallOptions {
  keys: string[];
}
