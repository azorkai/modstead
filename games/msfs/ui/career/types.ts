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
export type JobKind = "training" | "cargo" | "passenger" | "charter" | "ferry" | "bush" | "medical" | "airline" | "checkride" | "tour" | "skydive" | "survey" | "sar";
export type FlightCategory = "VFR" | "MVFR" | "IFR" | "LIFR";
/** Yükün özel durumu (boş: sıradan). */
export type Care = "" | "fragile" | "livestock" | "medical" | "perishable" | "dangerous";
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

/** Haritanın raster katmanı (`msfs_career_tiles_info`). */
export interface TileLayerInfo {
  /** "relief" (çevrimdışı gölgeli kabartma) | "sat" (çevrimiçi uydu görüntüsü) */
  id: string;
  minZoom: number;
  maxZoom: number;
  /** İnternet gerektirir (bağlantı yoksa karolar 503 döner). */
  online: boolean;
  /** Görüntü haritada görünürken köşede gösterilecek atıf. */
  attribution: string;
  license?: string;
  licenseUrl?: string;
}

/** Karolar `{base}/api/tiles/<katman>/<z>/<x>/<y>` adresinden alınır (XYZ, Web Mercator, 256 px). */
export interface TilesInfo {
  /** Yerel sunucunun kökü; çalışmıyorsa `null` (harita yalnızca vektörle çizilir). */
  base: string | null;
  layers: TileLayerInfo[];
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
  nightHours: number;
  instrumentHours: number;
  multiEngineHours: number;
  crossCountryHours: number;
  nightLandings: number;
  instrumentApproaches: number;
  stableApproaches: number;
  /** İş türü → saat (kariyer yolunda uçulan saat bundan). */
  kindHours?: Partial<Record<string, number>>;
}

/** Pilot sicili: yeterlilik, sağlık sertifikası, görev süresi (`records::Status`). */
export interface RecordsStatus {
  landings90d: number;
  nightLandings90d: number;
  heliLandings90d: number;
  passengerCurrent: boolean;
  nightCurrent: boolean;
  heliCurrent: boolean;
  approaches6m: number;
  ifrCurrent: boolean;
  medicalRequired: number;
  medicalClass: number;
  medicalUntil: number;
  medicalValid: boolean;
  onDuty: boolean;
  dutyStart: number;
  dutySectors: number;
  dutyMaxH: number;
  dutyLeftH: number;
  hours28d: number;
  hours12m: number;
  enforceCurrency: boolean;
  enforceDuty: boolean;
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
  birthYear: number;
  /** Kariyer yolu (yeni sürüm; eski uygulamada yok → "general" sayılır). */
  path?: CareerPath;
  pathSince?: number;
  pathRanks?: Partial<Record<CareerPath, number>>;
}

export interface PilotView extends Pilot {
  level: number;
  levelXp: number;
  nextLevelXp: number;
  title: string;
  rating: number | null;
  canContract: boolean;
  creditLimit: number;
  status: RecordsStatus;
  medicalFee: number;
  restCost: number;
  /** Kariyer yolunun durumu: rütbe, basamaklar, yoldaki saat, primler (`paths.rs`). */
  pathStatus?: PathStatus;
}

/** Kariyer yolu (`games/msfs/src/career/paths.rs`). */
export type CareerPath = "airline" | "cargo" | "bush" | "medical" | "charter" | "aerial" | "general";

export interface RankStep {
  id: string;
  nameTr: string;
  nameEn: string;
  licenses: string[];
  missingLicenses: string[];
  hoursNeeded: number;
  reputationNeeded: number;
  payBonus: number;
  reached: boolean;
}

export interface PathStatus {
  path: CareerPath;
  nameTr: string;
  nameEn: string;
  kinds: JobKind[];
  route: string[];
  /** Yolun işlerinde uçulan saat (Genel'de toplam saat). */
  hours: number;
  /** 0 = henüz ilk basamakta değil; 1..3. */
  rank: number;
  rankId: string | null;
  ladder: RankStep[];
  payBonus: number;
  xpBonus: number;
  nextLicense: string | null;
}

/** Yol kataloğu (`msfs_career_paths`): kayıt ekranı ve yol değiştirme penceresi. */
export interface PathInfo {
  id: CareerPath;
  nameTr: string;
  nameEn: string;
  kinds: JobKind[];
  classes: AircraftClass[];
  route: string[];
  ranks: { id: string; nameTr: string; nameEn: string; licenses: string[]; hours: number; reputation: number }[];
  fast: {
    licenses: string[];
    hours: number;
    level: number;
    money: number;
    nightHours: number;
    instrumentHours: number;
    multiEngineHours: number;
    flyable: AircraftClass[];
    rankId: string | null;
  };
  scratchMoney: number;
  homes: Airport[];
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
  estNav: number;
  estHandling: number;
  estProfit: number;
  fuelPrice: number;
}

/** Hava işinin hedefi (`missions::Objective`). */
export interface Objective {
  kind: "overfly" | "drop" | "line" | "search";
  name: string;
  lat: number;
  lon: number;
  radiusNm: number;
  minFt: number | null;
  maxFt: number | null;
  agl: boolean;
  maxKt: number | null;
  holdS: number;
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
  care: Care;
  weather: FlightCategory | null;
  weatherBonus: number;
  irRequired: boolean;
  objectives: Objective[];
  /** Kariyer yoluna uyum: yol dışı mı; yoldaysa ücrete eklenmiş prim ve uçuş sonu XP primi (%). */
  offPath?: boolean;
  pathPayBonus?: number;
  pathXpBonus?: number;
  /** Hava ve zaman senaryosu (`conditions::JobConditions`); yoksa canlı hava ve gerçek saat. */
  conditions?: JobConditions;
}

/** Kalkış saati: `now` gerçek saat (canlı). */
export type TimeOfDay = "now" | "day" | "dawn" | "dusk" | "night";
/** Hava: `live` simin canlı havası, diğerleri simin yerleşik ön ayarları. */
export type WeatherPreset = "live" | "clear" | "few" | "scattered" | "broken" | "overcast" | "rain" | "snow" | "storm";

/** Ön ayarın türetilmiş değerleri (`conditions::ScenarioWx`; METAR'ın karşılığı). */
export interface ScenarioWx {
  file: string;
  /** Bulut katmanları METAR biçiminde ("FEW015 BKN030"); boşsa açık. */
  sky: string;
  ceilingFt: number | null;
  visibilitySm: number;
  windDir: number;
  windKt: number;
  tempC: number;
  precip: "" | "rain" | "snow";
  thunderstorm: boolean;
  snowCoverM: number;
  category: FlightCategory;
}

export interface JobConditions {
  time: TimeOfDay;
  weather: WeatherPreset;
  /** Simdeki kalkış anı (unix sn, UTC); `now` ise 0. */
  utc: number;
  /** Yaklaşık yerel saat farkı (dk; boylamdan). */
  utcOffsetMin: number;
  sunDeg: number;
  /** İstenen ışık yok (kutup gecesi/gündüzü): en yakın an seçildi. */
  fallback: boolean;
  nightArrival: boolean;
  season: string;
  wx: ScenarioWx | null;
  payBonus: number;
  xpBonus: number;
  needsIr: boolean;
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
  dispatch: Dispatch | null;
}

/** Uçuş kâğıdı (`dispatch::Dispatch`). */
export interface Dispatch {
  ifr: boolean;
  nightArrival: boolean;
  fuel: {
    rule: "ifr" | "vfr_day" | "vfr_night" | "heli_vfr";
    taxiKg: number;
    tripKg: number;
    contingencyKg: number;
    alternateKg: number;
    finalReserveKg: number;
    extraKg: number;
    minimumKg: number;
    blockKg: number;
    reserveMin: number;
    enduranceMin: number;
  };
  weights: { emptyKg: number; payloadKg: number; zfwKg: number; towKg: number; lwKg: number; mtowKg: number; mlwKg: number; fuelCapacityKg: number; fromSim: boolean };
  alternate: { icao: string; name: string; distanceNm: number } | null;
  departure: RunwayInfo;
  arrival: RunwayInfo;
  issues: { code: string; blocking: boolean; value: number }[];
}

export interface RunwayInfo {
  icao: string;
  availableFt: number;
  requiredFt: number;
  densityAltFt: number;
  lighted: boolean;
  fuel: "both" | "avgas" | "none";
}

/** METAR (`weather::Metar`). */
export interface Metar {
  icao: string;
  raw: string;
  observed: number;
  windDir: number | null;
  windKt: number;
  gustKt: number | null;
  visibilitySm: number | null;
  ceilingFt: number | null;
  tempC: number | null;
  dewpointC: number | null;
  qnhHpa: number | null;
  wet: boolean;
  thunderstorm: boolean;
  category: FlightCategory;
  fetchedAt: number;
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
  sinceInspectionH: number;
  inspectedAt: number;
  sinceHeavyH: number;
  heavyAt: number;
  cycles: number;
  insured: boolean;
}

/** Filodaki uçak, bakım durumu ve sigorta primiyle. */
export interface FleetView extends FleetAircraft {
  due: {
    inspectionLeftH: number;
    inspectionLeftDays: number;
    heavyLeftH: number;
    heavyLeftDays: number | null;
    inTolerance: boolean;
    grounded: boolean;
    inspectionCost: number;
    heavyCost: number;
  };
  value: number;
  premiumH: number;
  heavyHere: boolean;
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
  night?: boolean;
  imc?: boolean;
  windKt?: number;
  windDir?: number;
  crosswindKt?: number;
  headwindKt?: number;
  visibilityM?: number;
  weightLb?: number;
  overweight?: boolean;
  runway?: { runway: string; heading: number; distanceM: number; centerlineM: number; lengthM: number; widthM: number; tdzM: number } | null;
}

export interface ApproachGate {
  gateFt: number;
  evaluated: boolean;
  stable: boolean;
  reasons: ("sink" | "bank" | "gear" | "speed_high" | "speed_low")[];
  vsFpm: number;
  iasKt: number;
  bank: number;
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
  nightS?: number;
  imcS?: number;
  stableApproach?: boolean | null;
  approach?: ApproachGate | null;
  instrumentApproaches?: number;
  procedures?: { code: string; ok: boolean | null }[];
  comfort?: number | null;
  cargoDamage?: number;
  bonuses?: [string, number][];
  bonusPct?: number;
  objectivesDone?: number;
  objectivesTotal?: number;
}

export interface Settlement {
  pay: number;
  tip?: number;
  latePenalty: number;
  cargoClaim?: number;
  rent: number;
  fuel: number;
  fees: number;
  navFees?: number;
  handling?: number;
  maintenance: number;
  insurance?: number;
  damage: number;
  net: number;
}

export type FlightResult = "completed" | "late" | "diverted" | "failed" | "crashed" | "invalid" | "abandoned" | "partial";

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
  appealed?: string[];
  /** Bu uçuşla ulaşılan yeni rütbe (kimlik), varsa. */
  promotion?: string | null;
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
  fleet: FleetView[];
  licenses: LicenseView[];
  recent: LogEntry[];
  classes: ClassInfo[];
  link: LinkView;
  achievements: Achievement[];
}

export interface Achievement {
  id: string;
  group: "flying" | "skill" | "career" | "world";
  progress: number;
  target: number;
  done: boolean;
}

/** Simden saniyede bir gelen ortam (`env::Env`). */
export interface Env {
  lightBeacon: boolean;
  lightLanding: boolean;
  lightNav: boolean;
  lightStrobe: boolean;
  lightTaxi: boolean;
  windKt: number;
  windDir: number;
  visibilityM: number;
  inCloud: boolean;
  precip: number;
  temperatureC: number;
  qnhHpa: number;
  seatbeltSign: boolean;
  cabinAltFt: number;
  transponder: number;
  /** Sim aktif duraklatmada (uçak donar). Modstead kalkıştan sonraki ilk dakikalarda bunu kendisi kapatır. */
  activePause?: boolean;
}

export interface AircraftOption {
  title: string;
  liveries: string[];
  class: AircraftClass | null;
  /** "user" elle · "icao" tip kodu · "sim" simin değerleri · "cfg" mod paketinin dosyaları · "name" addan tahmin */
  classSource: "user" | "icao" | "sim" | "cfg" | "name" | "unknown";
  flyable: boolean;
  managesOwnLoading: boolean;
  /** Kendi EFB'sinin kaynağı: "user" elle · "package" paketin geliştiricisi · "title" başlıktan · "" yok. */
  loadingSource: "user" | "package" | "title" | "";
  /** Elle seçim olmasaydı kendi EFB'si sayılır mıydı. */
  autoLoading: boolean;
  /** "sim": simin listesi ya da uçulan uçak · "mod": kütüphanedeki ya da Community'deki bir paket. */
  origin: "sim" | "mod";
  package: AircraftPackage | null;
  /** Mod paketinin etkin olduğu simler. */
  sims: ("msfs2020" | "msfs2024")[];
  /** Paketin kendi küçük resmi var (`msfs_career_aircraft_thumb`). */
  thumb: boolean;
  icaoType: string;
  /** Gerçek tip adı ("Airbus A320neo"); bilinmiyorsa boş. */
  realType: string;
  confidence: "high" | "medium" | "low" | null;
  /** Elle verilmiş sınıf olmasa hangi sınıf olurdu. */
  autoClass: AircraftClass | null;
  autoSource: "icao" | "sim" | "cfg" | "name" | "unknown";
  /** Uçuş kâğıdının değerleri: simden (uçağa binildi) ya da paketin dosyalarından. */
  specs: AircraftSpecs | null;
  specsSource: "sim" | "cfg" | "";
}

export interface AircraftPackage {
  id: string;
  title: string;
  creator: string;
  /** `SimObjects/Airplanes/<klasör>`: aynı uçağın sürümleri birlikte gösterilir. */
  simobject: string;
}

export interface AircraftSpecs {
  category: string;
  engineType: number;
  engines: number;
  mtowLb: number;
  emptyLb: number;
  fuelCapacityGal: number;
  cruiseKt: number;
  payloadStations: number;
  maxTakeoffLb: number;
  maxLandingLb: number;
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
  env?: Env | null;
  /** Modstead'in yönettiği sim hızı (zaman hızlandırma); eski uygulamada yok. */
  rate?: RateView;
}

/** Zaman hızlandırmanın neden açılamadığı ya da neden 1×'e dönüldüğü. */
export type RateHold = "no_flight" | "ground" | "phase" | "low" | "descent" | "arrival" | "warning";

export interface RateView {
  /** Modstead'in hedeflediği hız (1 = normal). */
  target: number;
  /** Hız Modstead'den açıldı (varışta kendiliğinden 1×'e döner). */
  managed: boolean;
  hold: RateHold | null;
  returned: RateHold | null;
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
  /** "student": sıfırdan · "fast": deneyimli başla (yolun paketi). Eski: "commercial" | "airline". */
  start: "student" | "fast" | "commercial" | "airline";
  birthYear?: number | null;
  path?: CareerPath;
}

/** Uçuş ekranı: yerel sunucunun adresi, isteğe bağlı yerel ağ erişimi ve QR (`msfs_career_deck_info`). */
export interface DeckInfo {
  /** Yerel sunucunun portu; sunucu çalışmıyorsa `null`. */
  port: number | null;
  /** Bu makinede açılacak adres (`http://127.0.0.1:<port>/deck`). */
  localUrl: string | null;
  lan: {
    enabled: boolean;
    ip: string | null;
    /** Tabletin açacağı adres (anahtar ve dil dahil). */
    url: string | null;
    error: string | null;
  };
  /** `lan.url`'nin QR kodu (sunucunun ürettiği SVG; beyaz zemin, sessiz bölge dahil). */
  qrSvg: string | null;
  /** Modstead'in uçuş ekranı penceresi açık mı. */
  windowOpen: boolean;
}
