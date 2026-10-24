// MSFS komutlarının tipleri (games/msfs/src: sims.rs, scanner.rs, package.rs, readiness.rs, install.rs…).

import type { SecurityReport } from "@/lib/types";

export type SimId = "msfs2020" | "msfs2024";
export type Category = "aircraft" | "livery" | "airport" | "scenery" | "avionics" | "tool" | "mission" | "core" | "other";
export type BuiltFor = "2020" | "2024";

export interface SimInstall {
  id: SimId;
  name: string;
  short: string;
  /** "steam" | "store" | "manual" | "disabled" | "" */
  edition: string;
  detected: boolean;
  configDir: string | null;
  userCfg: string | null;
  packagesPath: string | null;
  communityPath: string | null;
  community2024Path: string | null;
  exeXml: string | null;
  contentXml: string | null;
  running: boolean;
  sharesPackages: boolean;
  overridden: boolean;
}

export interface Dependency {
  name: string;
  version: string;
}

export interface PackageInfo {
  folder: string;
  path: string;
  title: string;
  creator: string;
  manufacturer: string;
  contentType: string;
  category: Category;
  version: string;
  minGameVersion: string;
  builder: string;
  builtFor: BuiltFor;
  size: number;
  fileCount: number;
  dependencies: Dependency[];
  thumbnail: string | null;
  icaos: string[];
  hasLayout: boolean;
  wasmModules: number;
  manifestOk: boolean;
}

export type SimStateKind = "enabled" | "disabled" | "physical" | "foreign" | "absent";

export interface SimState {
  state: SimStateKind;
  container: string | null;
  linkPath: string | null;
}

export interface ModMeta {
  sourceUrl: string | null;
  sourceLabel: string | null;
  catalogId: string | null;
  releaseTag: string | null;
  installedAt: string | null;
  archiveSha256: string | null;
  report: SecurityReport | null;
  stripped: string[];
  favorite: boolean;
  tags: string[];
  notes: string;
}

export interface Issue {
  level: "error" | "warning" | "info";
  code: string;
  title: string;
  detail: string;
  sim: SimId | null;
  path: string | null;
  modId: string | null;
}

export type CheckStatus = "ok" | "warn" | "error" | "unknown";

export type ReadinessFix =
  | { kind: "enableExeEntry"; sim: SimId; name: string; path: string }
  | { kind: "activateContentPackage"; sim: SimId; package: string };

export interface ReadinessCheck {
  id: string;
  code: string;
  status: CheckStatus;
  group: "sim" | "companion" | "package" | "path" | "files";
  sim: SimId | null;
  title: string;
  detail: string;
  optional: boolean;
  hint: string | null;
  fix: ReadinessFix | null;
  source: string | null;
  /** Etkilenen öğe sayısı (ör. yol sınırını aşan dosyalar). */
  count: number | null;
}

export interface ModVerification {
  id: string;
  title: string;
  checks: ReadinessCheck[];
  status: CheckStatus;
  filesChecked: number;
  durationMs: number;
  verifiedAt: string;
}

export interface FixOutcome {
  message: string;
  file: string;
  backup: string;
}

export interface ModEntry {
  id: string;
  info: PackageInfo;
  /** library: kütüphanede · community: Community'de gerçek klasör · external: başka bir aracın bağlantısı */
  source: "library" | "community" | "external";
  libraryPath: string | null;
  sims: Partial<Record<SimId, SimState>>;
  meta: ModMeta;
  issues: Issue[];
  readiness: ReadinessCheck[];
}

export interface Stats {
  total: number;
  library: number;
  unmanaged: number;
  external: number;
  enabled: Partial<Record<SimId, number>>;
  totalSize: number;
  byCategory: Partial<Record<Category, number>>;
}

export interface ScanResult {
  mods: ModEntry[];
  sims: SimInstall[];
  issues: Issue[];
  stats: Stats;
  libraryPath: string | null;
  libraryFree: number | null;
  scannedAt: string;
}

export interface Conflict {
  sim: SimId;
  kind: "files" | "airport";
  aId: string;
  aTitle: string;
  bId: string;
  bTitle: string;
  shared: number;
  samples: string[];
  icao: string | null;
}

export interface ExeEntry {
  sim: SimId;
  name: string;
  path: string;
  commandLine: string;
  disabled: boolean;
  exists: boolean;
  /** installed | suspicious | other */
  signedHint: string;
}

export interface Profile {
  id: string;
  name: string;
  description: string;
  sims: Partial<Record<SimId, string[]>>;
  createdAt: string;
  updatedAt: string;
}

export interface OpReport {
  ok: string[];
  failed: [string, string][];
}

export interface SimOverride {
  packagesPath: string | null;
  disabled: boolean;
}

export interface MsfsSettings {
  libraryPath: string | null;
  simOverrides: Partial<Record<SimId, SimOverride>>;
  stripExecutables: boolean;
  onboarded: boolean;
}

export interface LibrarySuggestion {
  path: string;
  free: number | null;
  reason: string;
  sameDriveAsCommunity: boolean;
}

export interface ReleaseAsset {
  releaseId: number;
  assetId: number;
  tag: string;
  publishedAt: string;
  name: string;
  size: number;
  url: string;
  sha256: string | null;
  notes: string;
}

export interface VariantStatus {
  sim: SimId;
  label: string;
  labelEn: string | null;
  latest: ReleaseAsset | null;
}

export interface CatalogItem {
  id: string;
  name: string;
  nameEn: string | null;
  author: string;
  category: Category;
  description: string;
  descriptionEn: string | null;
  homepage: string;
  repo: string;
  folders: string[];
  variantsStatus: VariantStatus[];
  error: string | null;
}

// ───────────── Kurulum planı (JobSnapshot.plan) ─────────────

export interface DetectedPackage {
  rel: string;
  folder: string;
  title: string;
  creator: string;
  version: string;
  category: Category;
  builtFor: BuiltFor;
  size: number;
  fileCount: number;
  executables: number;
  existingId: string | null;
  existingVersion: string | null;
  existingBuiltFor: BuiltFor | null;
  action: "install" | "update" | "variant";
}

export interface PlanSim {
  id: SimId;
  short: string;
  usable: boolean;
  running: boolean;
}

export interface InstallPlan {
  packages: DetectedPackage[];
  suggestedSims: SimId[];
  sims: PlanSim[];
  stripExecutables: boolean;
  strip: string[];
  library: string;
  catalogId: string | null;
  releaseTag: string | null;
}

export interface ConfirmOptions {
  packages: string[];
  sims: SimId[];
}
