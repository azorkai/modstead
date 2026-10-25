// Kariyer komutlarının sarmalayıcıları (games/msfs/src/career/commands.rs). Hepsi `msfs_career_` önekli.

import { invoke } from "@/lib/ipc";
import type { AircraftClass, AircraftOption, AirportHit, CareerView, CreateRequest, FlightDetail, Job, LedgerEntry, Live, LogEntry, HudStatus, MapAirport } from "./types";

export const careerApi = {
  state: () => invoke<CareerView>("msfs_career_state"),
  create: (request: CreateRequest) => invoke<CareerView>("msfs_career_create", { request }),
  reset: () => invoke<void>("msfs_career_reset"),
  board: () => invoke<Job[]>("msfs_career_board"),
  accept: (id: string) => invoke<void>("msfs_career_accept", { id }),
  cancel: () => invoke<void>("msfs_career_cancel"),
  aircraft: () => invoke<AircraftOption[]>("msfs_career_aircraft"),
  refreshAircraft: () => invoke<void>("msfs_career_refresh_aircraft"),
  pickAircraft: (title: string, livery: string, fleetId: string | null) => invoke<void>("msfs_career_pick_aircraft", { title, livery, fleetId }),
  setClass: (title: string, cls: AircraftClass | null) => invoke<void>("msfs_career_set_class", { title, class: cls }),
  launch: () => invoke<void>("msfs_career_launch"),
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
  hud: () => invoke<HudStatus>("msfs_career_hud"),
  hudInstall: () => invoke<HudStatus>("msfs_career_hud_install"),
  hudRemove: () => invoke<HudStatus>("msfs_career_hud_remove"),
};
