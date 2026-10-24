// Rust yapılarının camelCase karşılıkları (crates/core, src-tauri/src/commands.rs).

export type GameId = "msfs" | "bannerlord" | "stardew" | "cities2" | (string & {});

export interface NexusGame {
  domain: string;
  id: number;
}

export interface GameInfo {
  id: GameId;
  name: string;
  short: string;
  nexus: NexusGame[];
  steamAppIds: number[];
}

export type Tone = "info" | "ok" | "warn" | "danger";

export interface StatusNote {
  tone: Tone;
  text: string;
}

export interface InstallSummary {
  label: string;
  path: string;
  version: string | null;
  store: string;
  running: boolean;
}

export interface GameStatus {
  installed: boolean;
  installs: InstallSummary[];
  running: boolean;
  mods: number | null;
  enabled: number | null;
  issues: number | null;
  updates: number | null;
  notes: StatusNote[];
  checkedAt: number;
}

export interface GameStatusEntry {
  id: GameId;
  status: GameStatus;
}

export interface InstallCandidate {
  path: string;
  store: string;
  version: string | null;
  label: string;
}

export interface AppInfo {
  version: string;
  dataDir: string;
  localDir: string;
  language: "tr" | "en";
  defenderAvailable: boolean;
  games: GameInfo[];
}

export type ThemeSetting = "system" | "dark" | "light";
export type LanguageSetting = "auto" | "tr" | "en";

export interface Settings {
  theme: ThemeSetting;
  language: LanguageSetting;
  reduceMotion: boolean;
  requireScan: boolean;
  requireVerified: boolean;
  blockDangerous: boolean;
  virustotal: boolean;
  showAdult: boolean;
  nxmRegistered: boolean;
  nxmPreviousCommand: string | null;
  onboarded: boolean;
  games: string[];
  lastGame: string | null;
  resolvedLanguage: "tr" | "en";
}

export type SettingsPatch = Partial<Omit<Settings, "nxmRegistered" | "nxmPreviousCommand" | "resolvedLanguage">>;

export interface NexusUser {
  name: string;
  isPremium: boolean;
  isSupporter: boolean;
  profileUrl: string | null;
}

export interface NexusStatus {
  hasKey: boolean;
  user: NexusUser | null;
  rateLimit: { hourlyRemaining: number | null; dailyRemaining: number | null } | null;
  error: string | null;
}

export interface SecretsStatus {
  virustotal: boolean;
  github: boolean;
}

export interface NxmStatus {
  registered: boolean;
  otherHandler: string | null;
}

export interface PendingInput {
  nxm: { url: string; game: GameId | null }[];
  files: string[];
}

// ───────────── Güvenlik ─────────────

export type Severity = "info" | "low" | "medium" | "high" | "critical";

export interface Finding {
  severity: Severity;
  code: string;
  title: string;
  detail: string;
  path: string | null;
}

export interface EngineResult {
  status: "clean" | "threat" | "unavailable" | "skipped" | "error" | "unknown";
  engine: string;
  detail: string;
  malicious: number;
  suspicious: number;
  link: string | null;
}

export interface Verification {
  status: "verified" | "unverified" | "local" | "mismatch";
  method: string;
  detail: string;
}

export interface SourceInfo {
  url: string | null;
  domain: string | null;
  trust: "trusted" | "known" | "unknown" | "local";
  label: string;
}

export interface CodeFile {
  path: string;
  size: number;
  sha256: string;
  kind: "library" | "executable" | "script" | "installer" | "shortcut";
  expected: boolean;
}

export interface SecurityReport {
  verdict: "safe" | "caution" | "danger";
  score: number;
  source: SourceInfo;
  verification: Verification;
  archive: { name: string; kind: string; size: number; sha256: string } | null;
  defender: EngineResult;
  virustotal: EngineResult | null;
  nexusScan: string | null;
  findings: Finding[];
  codeFiles: CodeFile[];
  scannedFiles: number;
  totalSize: number;
  needsOverride: string | null;
  blocked: string | null;
  scannedAt: number;
}

// ───────────── Görevler ─────────────

export type Stage =
  | "queued"
  | "resolving"
  | "downloading"
  | "verifying"
  | "extracting"
  | "scanning"
  | "analyzing"
  | "review"
  | "installing"
  | "done"
  | "failed"
  | "cancelled";

export interface JobSnapshot {
  id: string;
  game: GameId;
  kind: string;
  title: string;
  source: string;
  stage: Stage;
  progress: number | null;
  bytes: number;
  total: number | null;
  message: string;
  error: string | null;
  security: SecurityReport | null;
  plan: unknown;
  result: unknown;
  created: number;
  updated: number;
}

export interface AppError {
  code: string;
  message: string;
}

export const FINAL_STAGES: Stage[] = ["done", "failed", "cancelled"];
