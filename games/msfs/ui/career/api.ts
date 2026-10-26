// Kariyer komutlarının sarmalayıcıları (games/msfs/src/career/commands.rs). Hepsi `msfs_career_` önekli.

import { invoke } from "@/lib/ipc";
import type { AircraftClass, AircraftOption, AirportHit, CareerPath, CareerView, CreateRequest, DeckInfo, Difficulty, FlightDetail, Job, LedgerEntry, Live, LogEntry, HudStatus, MapAirport, MenuStatus, Metar, PathInfo, StartAt, TilesInfo, TrackPoint } from "./types";

export const careerApi = {
  state: () => invoke<CareerView>("msfs_career_state"),
  create: (request: CreateRequest) => invoke<CareerView>("msfs_career_create", { request }),
  reset: () => invoke<void>("msfs_career_reset"),
  /** Kariyer yollarının kataloğu: paketler zorlukla ölçekli (verilmezse pilotun zorluğu). */
  paths: (difficulty?: Difficulty) => invoke<PathInfo[]>("msfs_career_paths", { difficulty: difficulty ?? null }),
  /** Kariyer yolunu değiştirir (lisans, saat, para ve itibar kalır). */
  setPath: (path: CareerPath) => invoke<CareerView>("msfs_career_set_path", { path }),
  board: () => invoke<Job[]>("msfs_career_board"),
  /** Panodaki varışların ve aktif işin METAR'ları (gerekirse aviationweather.gov'dan). */
  weather: () => invoke<Metar[]>("msfs_career_weather"),
  medical: () => invoke<number>("msfs_career_medical"),
  rest: () => invoke<number>("msfs_career_rest"),
  maintain: (id: string, heavy: boolean) => invoke<number>("msfs_career_maintain", { id, heavy }),
  insure: (id: string, on: boolean) => invoke<void>("msfs_career_insure", { id, on }),
  appeal: (id: string, code: string) => invoke<LogEntry>("msfs_career_appeal", { id, code }),
  accept: (id: string) => invoke<void>("msfs_career_accept", { id }),
  cancel: () => invoke<void>("msfs_career_cancel"),
  aircraft: () => invoke<AircraftOption[]>("msfs_career_aircraft"),
  refreshAircraft: () => invoke<void>("msfs_career_refresh_aircraft"),
  /** Mod uçağının paketindeki küçük resim (ham bayt); `livery` verilirse o boyanınki. */
  aircraftThumb: (title: string, livery?: string | null) => invoke<ArrayBuffer>("msfs_career_aircraft_thumb", { title, livery: livery || null }),
  /** Yük ve yakıt uçağın kendi EFB'sinden mi: `null` otomatiğe döner. */
  setLoading: (title: string, own: boolean | null) => invoke<void>("msfs_career_set_loading", { title, own }),
  pickAircraft: (title: string, livery: string, fleetId: string | null) => invoke<void>("msfs_career_pick_aircraft", { title, livery, fleetId }),
  setClass: (title: string, cls: AircraftClass | null) => invoke<void>("msfs_career_set_class", { title, class: cls }),
  launch: (start?: StartAt) => invoke<void>("msfs_career_launch", { start: start ?? null }),
  reposition: () => invoke<void>("msfs_career_reposition"),
  finish: () => invoke<LogEntry>("msfs_career_finish"),
  abandon: () => invoke<LogEntry | null>("msfs_career_abandon"),
  logbook: () => invoke<LogEntry[]>("msfs_career_logbook"),
  flight: (id: string) => invoke<FlightDetail>("msfs_career_flight", { id }),
  checkride: (license: string) => invoke<void>("msfs_career_checkride", { license }),
  travel: (icao: string) => invoke<number>("msfs_career_travel", { icao }),
  airports: (query: string) => invoke<AirportHit[]>("msfs_career_airports", { query }),
  /** `detail`: 0 yalnızca büyükler, 1 ortalar da, 2 hepsi. Boylamlar açılmış olabilir (tarih çizgisi). */
  mapAirports: (box: { south: number; west: number; north: number; east: number }, detail: 0 | 1 | 2) =>
    invoke<MapAirport[]>("msfs_career_map_airports", { ...box, detail }),
  buy: (cls: AircraftClass, title: string) => invoke<void>("msfs_career_buy", { class: cls, title }),
  sell: (id: string) => invoke<number>("msfs_career_sell", { id }),
  repair: (id: string) => invoke<number>("msfs_career_repair", { id }),
  borrow: (amount: number) => invoke<number>("msfs_career_borrow", { amount }),
  repay: (amount: number) => invoke<number>("msfs_career_repay", { amount }),
  ledger: () => invoke<LedgerEntry[]>("msfs_career_ledger"),
  live: () => invoke<Live>("msfs_career_live"),
  simbrief: () => invoke<string | null>("msfs_career_simbrief"),
  revealPlan: () => invoke<void>("msfs_career_reveal_plan"),
  journal: (limit = 200) => invoke<string[]>("msfs_career_journal", { limit }),
  revealJournal: () => invoke<void>("msfs_career_reveal_journal"),
  hud: () => invoke<HudStatus>("msfs_career_hud"),
  hudInstall: () => invoke<HudStatus>("msfs_career_hud_install"),
  hudRemove: () => invoke<HudStatus>("msfs_career_hud_remove"),
  hudQueue: (on: boolean) => invoke<HudStatus>("msfs_career_hud_queue", { on }),
  menu: () => invoke<MenuStatus>("msfs_career_menu"),
  menuInstall: () => invoke<MenuStatus>("msfs_career_menu_install"),
  menuRemove: () => invoke<MenuStatus>("msfs_career_menu_remove"),
  menuQueue: (on: boolean) => invoke<MenuStatus>("msfs_career_menu_queue", { on }),
  /** Aktif uçuşun şimdiye kadarki izi. */
  track: () => invoke<TrackPoint[]>("msfs_career_track"),
  deckInfo: () => invoke<DeckInfo>("msfs_career_deck_info"),
  deckSetLan: (on: boolean) => invoke<DeckInfo>("msfs_career_deck_set_lan", { on }),
  /** Yerel ağ anahtarını yeniler: eski tablet bağlantıları çalışmaz olur. */
  deckRotate: () => invoke<DeckInfo>("msfs_career_deck_rotate"),
  /** Uçuş ekranını Modstead'in ayrı bir penceresinde açar (açıksa öne getirir). */
  deckOpen: () => invoke<void>("msfs_career_deck_open"),
  /** Haritanın raster katmanları ve karoların alınacağı yerel sunucu. */
  tilesInfo: () => invoke<TilesInfo>("msfs_career_tiles_info"),
};
