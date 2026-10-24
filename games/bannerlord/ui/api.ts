// Bannerlord komutlarının sarmalayıcısı (games/bannerlord/src/commands.rs; hepsi `bannerlord_` önekli).
// Genel işler (ayarlar, Nexus anahtarı, nxm, görevler, adres açma) kabuğun komutlarıdır.

import { errorMessage, invoke } from "@/lib/ipc";
import { currentLang } from "@/lib/i18n";
import type { JobSnapshot } from "@/lib/types";
import type {
  AppliedProfile,
  BackupMeta,
  BannerlordSettings,
  GameView,
  GhRepo,
  Issue,
  ModEntry,
  ModuleDetails,
  NexusModPage,
  Overview,
  Profile,
  SearchPage,
  SettingsPatch,
  SortResult,
  SteamLookup,
  SteamTarget,
  UpdateItem,
} from "./types";

const call = <T,>(cmd: string, args?: Record<string, unknown>) => invoke<T>(`bannerlord_${cmd}`, args);

/** Hata metni; arka uç mesajları küçük harfle başlayabilir. */
export function errorText(e: unknown): string {
  const m = errorMessage(e);
  return m.charAt(0).toLocaleUpperCase(currentLang()) + m.slice(1);
}

export type OpenKind = "module" | "game" | "modules" | "configs" | "backups" | "data";

export const api = {
  game: () => call<GameView>("game"),
  overview: (refresh = false) => call<Overview>("overview", { refresh }),
  validateOrder: (order: ModEntry[]) => call<Issue[]>("validate_order", { order }),
  sortOrder: (order: ModEntry[]) => call<SortResult>("sort_order", { order }),
  saveOrder: (order: ModEntry[]) => call<Overview>("save_order", { order }),
  launch: (order: ModEntry[], options: { continueGame?: boolean; useBlse?: boolean }) => call<void>("launch", { order, options }),
  resetGameFolder: () => call<Overview>("reset_game_folder"),

  unblockModule: (id: string) => call<Overview>("unblock_module", { id }),
  unblockAll: () => call<Overview>("unblock_all"),
  uninstallModule: (id: string) => call<Overview>("uninstall_module", { id }),
  retireCopy: (path: string) => call<Overview>("retire_copy", { path }),
  moduleDetails: (id: string) => call<ModuleDetails>("module_details", { id }),
  openPath: (kind: OpenKind, id?: string) => call<void>("open_path", { kind, id: id ?? null }),
  /** İzinli siteleri varsayılan tarayıcıda açar (kabuk komutu). */
  openUrl: (url: string) => invoke<void>("open_url", { url }),

  listBackups: () => call<BackupMeta[]>("list_backups"),
  restoreBackup: (id: string) => call<Overview>("restore_backup", { id }),
  deleteBackup: (id: string) => call<void>("delete_backup", { id }),

  listProfiles: () => call<Profile[]>("list_profiles"),
  saveProfile: (name: string, order: ModEntry[], id?: string) => call<Profile>("save_profile", { id: id ?? null, name, order }),
  renameProfile: (id: string, name: string) => call<void>("rename_profile", { id, name }),
  deleteProfile: (id: string) => call<void>("delete_profile", { id }),
  applyProfile: (id: string) => call<AppliedProfile>("apply_profile", { id }),
  exportProfile: (id: string) => call<string>("export_profile", { id }),
  importProfile: (text: string) => call<Profile>("import_profile", { text }),

  getSettings: () => call<BannerlordSettings>("get_settings"),
  updateSettings: (patch: SettingsPatch) => call<BannerlordSettings>("update_settings", { patch }),

  nexusSearch: (query: string, sort: string, offset = 0) => call<SearchPage>("nexus_search", { query, sort, offset }),
  nexusMod: (modId: number) => call<NexusModPage>("nexus_mod", { modId }),
  githubRepo: (repo: string) => call<GhRepo>("github_repo", { repo }),

  installNexus: (modId: number, fileId: number) => call<JobSnapshot>("install_nexus", { modId, fileId }),
  installGithub: (repo: string, assetId: number, releaseId?: number | null) => call<JobSnapshot>("install_github", { repo, releaseId: releaseId ?? null, assetId }),
  installLocal: (paths: string[]) => call<JobSnapshot[]>("install_local", { paths }),
  confirmJob: (id: string, acceptRisk: boolean, moduleIds: string[]) => call<JobSnapshot>("confirm_job", { id, acceptRisk, options: { moduleIds } }),

  checkUpdates: () => call<UpdateItem[]>("check_updates"),

  /** Küçük harfli modül kimliği → logo adresi (Nexus/Steam görsel sunucuları). */
  moduleImages: (refresh = false) => call<Record<string, string>>("module_images", { refresh }),
  /** Workshop öğe/koleksiyon bağlantısı ya da sayısal kimlik. */
  steamLookup: (input: string) => call<SteamLookup>("steam_lookup", { input }),
  /** Steam istemcisinde öğe sayfası, Bannerlord Workshop'u ya da indirmeler açılır. */
  steamOpen: (target: SteamTarget, id?: string | null) => call<void>("steam_open", { target, id: id ?? null }),
};
