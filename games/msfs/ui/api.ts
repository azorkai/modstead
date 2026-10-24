// MSFS komutlarının sarmalayıcıları (games/msfs/src/commands.rs). Hepsi `msfs_` önekli.

import { invoke } from "@/lib/ipc";
import type { JobSnapshot, SecurityReport } from "@/lib/types";
import type {
  CatalogItem,
  ConfirmOptions,
  Conflict,
  ExeEntry,
  FixOutcome,
  LibrarySuggestion,
  ModVerification,
  MsfsSettings,
  OpReport,
  Profile,
  ReadinessFix,
  ScanResult,
  SimId,
  SimInstall,
} from "./types";

export const api = {
  settings: () => invoke<MsfsSettings>("msfs_settings_get"),
  saveSettings: (patch: Partial<MsfsSettings>) => invoke<MsfsSettings>("msfs_settings_save", { patch }),
  sims: () => invoke<SimInstall[]>("msfs_sims"),
  suggestLibrary: () => invoke<LibrarySuggestion>("msfs_suggest_library"),

  snapshot: () => invoke<ScanResult>("msfs_snapshot"),
  scan: () => invoke<ScanResult>("msfs_scan"),
  conflicts: () => invoke<Conflict[]>("msfs_conflicts"),
  startupPrograms: () => invoke<ExeEntry[]>("msfs_startup_programs"),

  setEnabled: (ids: string[], sim: SimId, enabled: boolean) => invoke<OpReport>("msfs_set_enabled", { ids, sim, enabled }),
  importMods: (ids: string[]) => invoke<OpReport>("msfs_import", { ids }),
  uninstall: (ids: string[]) => invoke<OpReport>("msfs_uninstall", { ids }),
  removeBrokenLink: (path: string) => invoke<void>("msfs_remove_broken_link", { path }),
  fixNested: (path: string) => invoke<string[]>("msfs_fix_nested", { path }),
  updateMeta: (id: string, meta: { favorite?: boolean; tags?: string[]; notes?: string }) => invoke<void>("msfs_update_meta", { id, ...meta }),
  rescanSecurity: (id: string) => invoke<SecurityReport>("msfs_rescan_security", { id }),

  verify: (id: string) => invoke<ModVerification>("msfs_verify", { id }),
  applyFix: (fix: ReadinessFix) => invoke<FixOutcome>("msfs_apply_fix", { fix }),
  launch: (sim: SimId) => invoke<void>("msfs_launch", { sim }),
  /** "library" | "community:<sim>" | "mod:<kimlik>" */
  reveal: (target: string) => invoke<void>("msfs_reveal", { target }),
  thumbnail: (id: string) => invoke<ArrayBuffer>("msfs_thumbnail", { id }),

  profiles: () => invoke<Profile[]>("msfs_profiles"),
  saveProfile: (name: string, description: string, id?: string) => invoke<Profile>("msfs_profile_save", { name, description, id: id ?? null }),
  deleteProfile: (id: string) => invoke<void>("msfs_profile_delete", { id }),
  applyProfile: (id: string, sim?: SimId) => invoke<OpReport>("msfs_profile_apply", { id, sim: sim ?? null }),

  catalog: (force = false) => invoke<CatalogItem[]>("msfs_catalog", { force }),
  installCatalog: (id: string, sim: SimId) => invoke<JobSnapshot>("msfs_install_catalog", { id, sim }),
  installUrl: (url: string) => invoke<JobSnapshot>("msfs_install_url", { url }),
  confirmJob: (id: string, acceptRisk: boolean, options: ConfirmOptions | null) => invoke<JobSnapshot>("msfs_confirm_job", { id, acceptRisk, options }),
  openBrowser: (url: string) => invoke<void>("msfs_open_browser", { url }),
};
