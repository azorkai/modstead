// Cities: Skylines II komutlarının tek giriş noktası (hepsi `cities2_` önekli; bkz. games/cities2/src/commands.rs).

import { invoke } from "@/lib/ipc";
import type { JobSnapshot } from "@/lib/types";
import type {
  Cities2Settings,
  Environment,
  FixAction,
  HealthReport,
  LogReport,
  NexusModPage,
  NexusSearchPage,
  PdxModDetail,
  PdxSearchPage,
  PdxSort,
  SaveBackup,
  SaveInfo,
  SecurityScan,
  Snapshot,
  TrashMeta,
} from "./types";

export type FolderKind = "user" | "mods" | "cache" | "saves" | "maps" | "logs" | "data" | "save-backups" | "trash" | "game" | "pdx";

export const api = {
  environment: () => invoke<Environment>("cities2_environment"),
  settings: () => invoke<Cities2Settings>("cities2_settings_get"),
  updateSettings: (settings: Cities2Settings) => invoke<Cities2Settings>("cities2_settings_update", { settings }),
  snapshot: () => invoke<Snapshot>("cities2_snapshot"),
  setEnabled: (folders: string[], enabled: boolean) => invoke<number>("cities2_set_enabled", { folders, enabled }),
  uninstall: (folders: string[]) => invoke<TrashMeta[]>("cities2_uninstall", { folders }),
  trash: () => invoke<TrashMeta[]>("cities2_list_trash"),
  restoreTrash: (id: string) => invoke<string>("cities2_restore_trash", { id }),
  deleteTrash: (id: string | null) => invoke<number>("cities2_delete_trash", { id }),
  health: () => invoke<HealthReport>("cities2_health"),
  fix: (action: FixAction, folders?: string[]) => invoke<string>("cities2_fix", { action, folders: folders ?? null }),
  securityScan: () => invoke<SecurityScan>("cities2_security_scan"),
  saves: () => invoke<SaveInfo[]>("cities2_list_saves"),
  savePreview: (id: string, large = false) => invoke<string | null>("cities2_save_preview", { id, large }),
  saveBackups: () => invoke<SaveBackup[]>("cities2_list_save_backups"),
  backupSave: (id: string) => invoke<SaveBackup>("cities2_backup_save", { id }),
  restoreSave: (id: string, backup: string) => invoke<void>("cities2_restore_save", { id, backup }),
  deleteSaveBackup: (backup: string) => invoke<void>("cities2_delete_save_backup", { backup }),
  logs: () => invoke<LogReport>("cities2_logs"),
  readLog: (name: string) => invoke<string>("cities2_read_log", { name }),
  launch: () => invoke<void>("cities2_launch"),
  openPath: (kind: FolderKind, rel?: string | null) => invoke<void>("cities2_open_path", { kind, rel: rel ?? null }),
  confirmJob: (id: string, acceptRisk: boolean, options: unknown) => invoke<unknown>("cities2_confirm_job", { id, acceptRisk, options }),
  pdxSearch: (query: string, sort: PdxSort, tag: string | null, page: number) => invoke<PdxSearchPage>("cities2_pdx_search", { query, sort, tag, page }),
  pdxMod: (modId: string) => invoke<PdxModDetail>("cities2_pdx_mod", { modId }),
  pdxRefresh: (force = false) => invoke<number>("cities2_pdx_refresh", { force }),
  nexusSearch: (query: string, sort: string, category: string | null, offset: number) => invoke<NexusSearchPage>("cities2_nexus_search", { query, sort, category, offset }),
  nexusMod: (modId: number) => invoke<NexusModPage>("cities2_nexus_mod", { modId }),
  installNexus: (modId: number, fileId: number | null, name: string | null) => invoke<JobSnapshot>("cities2_install_nexus", { modId, fileId, name }),
};
