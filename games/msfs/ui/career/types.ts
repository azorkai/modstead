// Kariyer kipinin arayüz tipleri; Rust tarafı games/msfs/src/career/ (serde camelCase).

export type AircraftClass =
  | "light_piston"
  | "piston_twin"
  | "turboprop_single"
  | "turboprop_twin"
  | "regional_turboprop"
  | "bizjet"
  | "regional_jet"
  | "narrowbody"
  | "widebody"
  | "helicopter";

export type Difficulty = "easy" | "normal" | "realistic";
export type JobKind = "training" | "cargo" | "passenger" | "charter" | "ferry" | "bush" | "medical" | "airline" | "checkride";
export type Mode = "employee" | "contract";
export type Stage = "accepted" | "launching" | "ready" | "flying" | "interrupted";
export type Phase = "preflight" | "taxi_out" | "takeoff" | "climb" | "cruise" | "descent" | "approach" | "rollout" | "taxi_in" | "parked";

export interface ClassInfo {
  id: AircraftClass;
  nameTr: string;
  nameEn: string;
  examples: string;
  seats: number;
  cargoKg: number;
  cruiseKt: number;
  minLegNm: number;
  maxLegNm: number;
  minRunwayFt: number;
  unpaved: boolean;
  burnKgH: number;
  fuel: "avgas" | "jet_a";
  rentH: number;
  price: number;
  maintH: number;
  wageH: number;
  parkingRadiusM: number;
  licenses: string[];
  firmFpm: number;
}

export interface Airport {
  icao: string;
  size: "large" | "medium" | "small" | "seaplane";
  name: string;
  city: string;
  country: string;
  lat: number;
  lon: number;
  elevationFt: number;
  runwayFt: number;
  surface: "paved" | "unpaved" | "water";
  lighted: boolean;
  scheduled: boolean;
  runway: string;
}

/** Sim içi panel (`msfs_career_hud`). */
export interface HudStatus {
  /** Kütüphane klasörü seçili mi (kurulum için gerekli). */
  library: boolean;
  installed: boolean;
  version: string | null;
  latest: string;
  sims: { id: string; short: string; linked: boolean; running: boolean }[];
  /** "Sim kapanınca kur" bekliyor mu. */
  queued?: boolean;
}

/** Ana menü kutusu: paket durumu ve sim sürümü koruması ("store:1.9.21.0"). */
export interface MenuStatus extends HudStatus {
  simVersion: string | null;
  installedFor: string | null;
  /** Bu makinede kurulamıyorsa nedeni (simin menü bileşeni yok ya da tanınmıyor; başka bir mod aynı bileşeni değiştiriyor). */
  blocked: string | null;
}

/** Haritadaki havalimanı (`msfs_career_map_airports`). */
export interface MapAirport {
  icao: string;
  name: string;
  size: Airport["size"];
  lat: number;
  lon: number;
  runway: string;
}

export interface AirportHit extends Airport {
  distanceNm: number | null;
  ticket: number | null;
}

export interface Stats {
  flights: number;
  hours: number;
  simHours: number;
  distanceNm: number;
  landings: number;
  butterLandings: number;
  bestLandingFpm: number | null;
  earned: number;
  spent: number;
  jobsDone: number;
  jobsFailed: number;
  crashes: number;
  scores: number[];
  classHours: Partial<Record<AircraftClass, number>>;
}

export interface Pilot {
  name: string;
  callsign: string;
  home: string;
  location: string;
  money: number;
  loan: number;
  xp: number;
  licenses: string[];
  reputation: number;
  difficulty: Difficulty;
  start: string;
  createdAt: string;
  stats: Stats;
}

export interface PilotView extends Pilot {
  level: number;
  levelXp: number;
  nextLevelXp: number;
  title: string;
  rating: number | null;
  canContract: boolean;
  creditLimit: number;
}

export interface Plan {
  distanceNm: number;
  blockMin: number;
  airMin: number;
  fuelKg: number;
  payloadKg: number;
  cruiseAltFt: number;
}

export interface Quote {
  revenue: number;
  estRent: number;
  estFuel: number;
  estFees: number;
  estProfit: number;
}

export interface Job {
  id: string;
  kind: JobKind;
  mode: Mode;
  from: string;
  to: string;
  distanceNm: number;
  class: AircraftClass | null;
  pax: number;
  cargoKg: number;
  cargo: string;
  client: string;
  pay: number;
  quote: Quote | null;
  plan: Plan;
  urgent: boolean;
  deadlineH: number;
  expiresAt: number;
  xpEstimate: number;
  checkride: string | null;
}

export interface AircraftPick {
  title: string;
  livery: string;
  class: AircraftClass | null;
  fleetId: string | null;
}

export interface ActiveView {
  job: Job;
  acceptedAt: number;
  deadlineAt: number;
  aircraft: AircraftPick | null;
  start: StartAt;
  /** Kalkış havalimanının pist uçları ("06L", "24R"). */
  runwayEnds: string[];
  stage: Stage;
  launchNote: string | null;
  from: Airport | null;
  to: Airport | null;
}

/** Uçuşun simde başlayacağı yer: park yerinde soğuk ya da pist başında motorlar çalışır. */
export interface StartAt {
  runway: boolean;
  /** Boşsa en uzun pistin birincil ucu. */
  end: string | null;
}

export interface FleetAircraft {
  id: string;
  class: AircraftClass | null;
  title: string;
  registration: string;
  location: string;
  hours: number;
  condition: number;
  pricePaid: number;
  boughtAt: string;
}

export interface LicenseView {
  id: string;
  short: string;
  nameTr: string;
  nameEn: string;
  aboutTr: string;
  aboutEn: string;
  requires: string[];
  hours: number;
  level: number;
  fee: number;
  examClass: AircraftClass;
  held: boolean;
  hoursNeeded: number;
  levelNeeded: number;
  missingLicenses: string[];
  ready: boolean;
}

export interface Landing {
  fpm: number;
  g: number;
  bank: number;
  pitch: number;
  iasKt: number;
  bounces: number;
  lat: number;
  lon: number;
  onRunway: boolean;
  label: "butter" | "smooth" | "good" | "firm" | "hard" | "very_hard";
}

export interface FlightEvent {
  t: number;
  code: string;
  severity: "info" | "minor" | "major" | "fatal";
  penalty: number;
  value: number;
}

export interface Summary {
  score: number;
  grade: string;
  blockS: number;
  airS: number;
  realS: number;
  fuelUsedLb: number;
  fuelLeftLb: number;
  flownNm: number;
  maxAltFt: number;
  landing: Landing | null;
  arrivedAtDestination: boolean;
  distanceToDestNm: number;
  invalid: string | null;
  crashed: boolean;
  simRateMax: number;
}

export interface Settlement {
  pay: number;
  latePenalty: number;
  rent: number;
  fuel: number;
  fees: number;
  maintenance: number;
  damage: number;
  net: number;
}

export type FlightResult = "completed" | "late" | "diverted" | "failed" | "crashed" | "invalid" | "abandoned";

export interface LogEntry {
  id: string;
  job: Job;
  result: FlightResult;
  aircraft: AircraftPick;
  registration: string;
  startedAt: number;
  endedAt: number;
  arrived: string;
  summary: Summary;
  landing: Landing | null;
  events: FlightEvent[];
  deductions: [string, number][];
  settlement: Settlement;
  xp: number;
  reputationDelta: number;
  creditedHours: number;
  checkridePassed: boolean | null;
}

/** [enlem, boylam, irtifa ft, yer hızı kt] */
export type TrackPoint = [number, number, number, number];

export interface FlightDetail {
  entry: LogEntry;
  track: TrackPoint[];
  from: Airport | null;
  to: Airport | null;
  arrived: Airport | null;
}

export interface LinkView {
  state: "waiting" | "connecting" | "connected";
  sim: string | null;
  detail: string | null;
}

export interface CareerView {
  pilot: PilotView | null;
  location: Airport | null;
  active: ActiveView | null;
  fleet: FleetAircraft[];
  licenses: LicenseView[];
  recent: LogEntry[];
  classes: ClassInfo[];
  link: LinkView;
}

export interface AircraftOption {
  title: string;
  liveries: string[];
  class: AircraftClass | null;
  classSource: "sim" | "user" | "name" | "unknown";
  flyable: boolean;
  managesOwnLoading: boolean;
}

export interface Telemetry {
  lat: number;
  lon: number;
  altFt: number;
  aglFt: number;
  gsKt: number;
  iasKt: number;
  vsFpm: number;
  heading: number;
  pitch: number;
  bank: number;
  onGround: boolean;
  g: number;
  fuelLb: number;
  totalLb: number;
  enginesOn: boolean;
  parkingBrake: boolean;
  gearDown: boolean;
  flaps: number;
  simRate: number;
  slew: boolean;
  absTime: number;
}

export interface Check {
  id: "connected" | "in_flight" | "at_departure" | "aircraft" | "slew" | "fuel" | "payload";
  ok: boolean;
  required: boolean;
  detail: string;
}

export interface FlightLive {
  phase: Phase;
  elapsedS: number;
  flownNm: number;
  remainingNm: number;
  fuelUsedLb: number;
  scoreNow: number;
  events: FlightEvent[];
  landing: Landing | null;
  invalid: string | null;
}

export interface Live {
  link: LinkView;
  inFlight: boolean;
  paused: boolean;
  telemetry: Telemetry | null;
  aircraft: { title: string; atcModel: string; atcId: string; class: AircraftClass | null; managesOwnLoading: boolean } | null;
  nearest: string | null;
  checks: Check[];
  launch: { step: "waiting_sim" | "fetching_airport" | "loading" | "positioning" | "done" | "manual"; note: string; elapsedS: number } | null;
  flight: FlightLive | null;
  /** Simin CAMERA STATE değeri: 2 kokpit, 16 açılış sineması ("Uçuşa hazır" bekleniyor). */
  camera?: number | null;
}

export interface LedgerEntry {
  ts: number;
  amount: number;
  kind: string;
  detail: string;
  balance: number;
}

export interface CreateRequest {
  name: string;
  callsign: string;
  home: string;
  difficulty: Difficulty;
  start: "student" | "commercial" | "airline";
}
