// Kariyer önizleme verisi. Adres: ?view=game:msfs:career  ·  &career=new (ilk kayıt) | idle (aktif iş yok) | ready (kontrol kapısı)
// Uçuş ekranı: /deck.html (aynı veri; uçak rotada ilerler)  ·  &career=landed (indi, parka taksi) · &career=parked (park etti, uçuşu bitir)  ·  &deck=lan (yerel ağ erişimi açık başlar)

import type { Airport, AirportHit, CareerView, DeckInfo, HudStatus, MenuStatus, ClassInfo, FlightDetail, Job, Landing, LedgerEntry, Live, LogEntry, Metar, TilesInfo, TrackPoint } from "./types";
import type { CareerPath, Difficulty, JobConditions, ScenarioWx } from "./types";
import { applyPathPreview, mockCatalog, mockSetPath } from "./paths-mocks";
import { aircraftMocks } from "./aircraft/mocks";

const params = typeof location !== "undefined" ? new URLSearchParams(location.search) : new URLSearchParams();
const mode = params.get("career") ?? "flying";
const now = Math.floor(Date.now() / 1000);

const A = (icao: string, name: string, city: string, lat: number, lon: number, size: Airport["size"] = "medium", runwayFt = 9000): Airport => ({
  icao,
  size,
  name,
  city,
  country: "TR",
  lat,
  lon,
  elevationFt: 100,
  runwayFt,
  surface: "paved",
  lighted: true,
  scheduled: size !== "small",
  runway: "05/23",
});

const airports: Airport[] = [
  A("LTBA", "Atatürk Havalimanı", "İstanbul", 40.976, 28.814, "large", 9843),
  A("LTFJ", "Sabiha Gökçen Uluslararası Havalimanı", "İstanbul", 40.898, 29.309, "large", 9842),
  A("LTFM", "İstanbul Havalimanı", "İstanbul", 41.275, 28.752, "large", 13451),
  A("LTBU", "Tekirdağ Çorlu Havalimanı", "Çorlu", 41.138, 27.919, "medium", 9843),
  A("LTFE", "Milas-Bodrum Havalimanı", "Bodrum", 37.251, 27.664, "medium", 9843),
  A("LTAI", "Antalya Havalimanı", "Antalya", 36.899, 30.8, "large", 11155),
  A("LTBJ", "İzmir Adnan Menderes Havalimanı", "İzmir", 38.292, 27.157, "large", 10630),
  A("LTBR", "Bursa Yenişehir Havalimanı", "Bursa", 40.255, 29.562, "medium", 9843),
  A("LTBQ", "Cengiz Topel Havalimanı", "Kocaeli", 40.735, 30.083, "small", 9843),
];
const apt = (icao: string) => airports.find((a) => a.icao === icao)!;

// Harita önizlemesi: birkaç küçük alan daha (gerçek veritabanı yalnızca uygulamada).
const mapExtra: Airport[] = [
  A("LTBW", "İstanbul Hezarfen Airfield", "Çatalca", 41.104, 28.548, "small", 1755),
  A("LTBX", "Samandıra Ordu Havalimanı", "İstanbul", 40.993, 29.216, "small", 4000),
  A("LTBG", "Bandırma Havalimanı", "Bandırma", 40.318, 27.978, "small", 9800),
  A("LTBF", "Balıkesir Merkez Havalimanı", "Balıkesir", 39.619, 27.926, "small", 9800),
  A("LTBH", "Çanakkale Havalimanı", "Çanakkale", 40.138, 26.427, "medium", 6200),
  A("LTFD", "Balıkesir Koca Seyit Havalimanı", "Edremit", 39.554, 27.014, "medium", 7300),
  A("LTBE", "Bursa Yunuseli", "Bursa", 40.233, 29.009, "small", 5500),
  A("LTAC", "Ankara Esenboğa Havalimanı", "Ankara", 40.128, 32.995, "large", 12303),
  A("LTAF", "Adana Havalimanı", "Adana", 36.982, 35.28, "medium", 9022),
  A("LGAV", "Athens International", "Athens", 37.936, 23.947, "large", 13123),
  A("LBSF", "Sofia Airport", "Sofia", 42.695, 23.406, "large", 11811),
].map((a, i) => ({ ...a, runway: ["05/23", "18/36", "09/27", "14/32", "01/19", "06/24", "17/35", "03/21", "11/29", "16/34", "07/25"][i] }));

// Sim içi panel: &hud=installed ile kurulu başlar.
let hud: HudStatus = {
  library: true,
  installed: params.get("hud") === "installed",
  version: params.get("hud") === "installed" ? "0.1.0" : null,
  latest: "0.1.0",
  sims: [
    { id: "msfs2024", short: "2024", linked: params.get("hud") === "installed", running: false },
    { id: "msfs2020", short: "2020", linked: params.get("hud") === "installed", running: false },
  ],
};

let menuPkg: MenuStatus = {
  library: true,
  installed: false,
  version: null,
  latest: "0.1.0",
  sims: [{ id: "msfs2024", short: "2024", linked: false, running: false }],
  simVersion: "store:1.9.21.0",
  installedFor: null,
  blocked: null,
};

function mapAirports(a: Record<string, unknown>) {
  const [s, w, n, e, d] = [a.south, a.west, a.north, a.east, a.detail].map(Number);
  const sizes = d >= 2 ? ["large", "medium", "small", "seaplane"] : d === 1 ? ["large", "medium"] : ["large"];
  return [...airports, ...mapExtra]
    .filter((x) => x.lat >= s && x.lat <= n && (((x.lon - w) % 360) + 360) % 360 <= e - w && sizes.includes(x.size))
    .map(({ icao, name, size, lat, lon, runway }) => ({ icao, name, size, lat, lon, runway }));
}

const C = (c: Partial<ClassInfo> & Pick<ClassInfo, "id" | "nameTr" | "nameEn" | "examples">): ClassInfo => ({
  seats: 3,
  cargoKg: 250,
  cruiseKt: 110,
  minLegNm: 15,
  maxLegNm: 260,
  minRunwayFt: 1400,
  unpaved: true,
  burnKgH: 30,
  fuel: "avgas",
  rentH: 140,
  price: 85_000,
  maintH: 25,
  wageH: 70,
  parkingRadiusM: 6,
  licenses: ["spl"],
  firmFpm: 300,
  ...c,
});

const classes: ClassInfo[] = [
  C({ id: "light_piston", nameTr: "Hafif pistonlu", nameEn: "Light piston", examples: "C152, C172, DA40, PA-28, Cub" }),
  C({ id: "piston_twin", nameTr: "Çift motorlu pistonlu", nameEn: "Piston twin", examples: "Baron G58, DA62, Seneca", seats: 5, rentH: 380, price: 350_000, maintH: 70, licenses: ["ppl", "me"] }),
  C({ id: "turboprop_single", nameTr: "Tek motorlu turboprop", nameEn: "Single turboprop", examples: "Caravan, Kodiak, PC-12, TBM 930", seats: 8, rentH: 750, price: 1_200_000, maintH: 140, licenses: ["cpl"] }),
  C({ id: "turboprop_twin", nameTr: "Çift motorlu turboprop", nameEn: "Twin turboprop", examples: "King Air 350, Twin Otter", seats: 9, rentH: 1300, price: 2_200_000, maintH: 220, licenses: ["cpl", "me"] }),
  C({ id: "regional_turboprop", nameTr: "Bölgesel turboprop", nameEn: "Regional turboprop", examples: "ATR 42/72, Dash 8 Q400", seats: 68, rentH: 2400, price: 9_000_000, maintH: 420, licenses: ["atpl"] }),
  C({ id: "bizjet", nameTr: "İş jeti", nameEn: "Business jet", examples: "Citation CJ4, Longitude, HondaJet", seats: 8, rentH: 2600, price: 6_000_000, maintH: 450, licenses: ["cpl", "ir", "jet"] }),
  C({ id: "regional_jet", nameTr: "Bölgesel jet", nameEn: "Regional jet", examples: "CRJ 550/700, E175, A220", seats: 80, rentH: 3600, price: 14_000_000, maintH: 650, licenses: ["atpl", "jet"] }),
  C({ id: "narrowbody", nameTr: "Dar gövde jet", nameEn: "Narrowbody jet", examples: "A320neo, A321, 737-800", seats: 170, rentH: 5200, price: 28_000_000, maintH: 900, licenses: ["atpl", "narrow"] }),
  C({ id: "widebody", nameTr: "Geniş gövde jet", nameEn: "Widebody jet", examples: "787, 777, A330, A350, 747", seats: 300, rentH: 11_000, price: 80_000_000, maintH: 1800, licenses: ["atpl", "wide"] }),
  C({ id: "helicopter", nameTr: "Helikopter", nameEn: "Helicopter", examples: "H125, H135, Bell 407, Cabri G2", seats: 5, rentH: 900, price: 900_000, maintH: 200, licenses: ["ppl", "heli"] }),
];

// Hava ve zaman senaryoları (`career::conditions`): ön ayar değerleri arka uçtaki tabloyla aynı.
const SWX = (file: string, sky: string, ceilingFt: number | null, visibilitySm: number, windKt: number, category: ScenarioWx["category"], extra: Partial<ScenarioWx> = {}): ScenarioWx => ({
  file,
  sky,
  ceilingFt,
  visibilitySm,
  windDir: 270,
  windKt,
  tempC: 15,
  precip: "",
  thunderstorm: false,
  snowCoverM: 0,
  category,
  ...extra,
});
const PRESET = {
  clear: SWX("ClearSky.WPR", "", null, 10, 2, "VFR"),
  few: SWX("FewClouds.WPR", "FEW016 FEW164", null, 10, 4, "VFR"),
  broken: SWX("BrokenClouds.WPR", "FEW015 BKN030", 3000, 8, 12, "MVFR"),
  overcast: SWX("Overcast.WPR", "FEW015 OVC040 BKN100", 4000, 5, 8, "MVFR"),
  rain: SWX("Rain.WPR", "SCT015 BKN030 SCT100", 3000, 3, 10, "MVFR", { precip: "rain" }),
  snow: SWX("Snow.WPR", "OVC018 SCT047", 1800, 1, 5, "IFR", { precip: "snow", tempC: -5, snowCoverM: 0.5 }),
  storm: SWX("Storm.WPR", "OVC015 OVC030CB BKN200", 1500, 1.5, 30, "IFR", { precip: "rain", thunderstorm: true }),
};
const today = Math.floor(now / 86400) * 86400;
/** İstanbul'da yaklaşık yerel saat (boylamdan UTC+2) → unix. */
const localAt = (h: number, m: number, base = today) => base + (h - 2) * 3600 + m * 60;
const cond = (p: Partial<JobConditions>): JobConditions => ({
  time: "now",
  weather: "live",
  utc: 0,
  utcOffsetMin: 120,
  sunDeg: 0,
  fallback: false,
  nightArrival: false,
  season: "",
  wx: null,
  payBonus: 0,
  xpBonus: 0,
  needsIr: false,
  ...p,
});

const job = (p: Partial<Job> & Pick<Job, "id" | "kind" | "from" | "to" | "distanceNm" | "pay">): Job => ({
  mode: "employee",
  class: "light_piston",
  pax: 0,
  cargoKg: 0,
  cargo: "spare_parts",
  client: "Bulut Kargo",
  quote: null,
  plan: { distanceNm: p.distanceNm, blockMin: Math.round(p.distanceNm / 1.55 + 14), airMin: Math.round(p.distanceNm / 1.55 + 5), fuelKg: 52, payloadKg: 120, cruiseAltFt: 4500 },
  urgent: false,
  deadlineH: 26,
  expiresAt: now + 3 * 3600,
  xpEstimate: 160,
  checkride: null,
  care: "",
  weather: "VFR",
  weatherBonus: 0,
  irRequired: false,
  objectives: [],
  ...p,
});

const board: Job[] = [
  job({
    id: "j1",
    kind: "medical",
    from: "LTBA",
    to: "LTBJ",
    distanceNm: 178,
    pay: 1560,
    class: "turboprop_single",
    pax: 2,
    cargoKg: 140,
    cargo: "patient_transfer",
    client: "Ege Air Service",
    urgent: true,
    deadlineH: 3,
    conditions: cond({ time: "night", utc: localAt(22, 10), sunDeg: -41, nightArrival: true, payBonus: 10, xpBonus: 5 }),
  }),
  job({
    id: "j2",
    kind: "cargo",
    from: "LTBA",
    to: "LTBU",
    distanceNm: 41.7,
    pay: 240,
    cargoKg: 180,
    cargo: "spare_parts",
    conditions: cond({ time: "dusk", weather: "few", utc: localAt(17, 35), sunDeg: 3, wx: PRESET.few, payBonus: 5, xpBonus: 3 }),
  }),
  job({
    id: "j3",
    kind: "charter",
    mode: "contract",
    from: "LTBA",
    to: "LTFE",
    distanceNm: 227,
    pay: 6180,
    class: "turboprop_twin",
    pax: 6,
    cargo: "film_crew",
    client: "Mavi Charter",
    quote: { revenue: 6180, estRent: 1690, estFuel: 450, estFees: 105, estNav: 64, estHandling: 24, estProfit: 3935, fuelPrice: 1.06 },
    weather: "MVFR",
    conditions: cond({ time: "day", weather: "overcast", utc: localAt(11, 20), sunDeg: 38, wx: PRESET.overcast }),
  }),
  job({
    id: "j4",
    kind: "passenger",
    from: "LTBA",
    to: "LTAI",
    distanceNm: 290,
    pay: 2550,
    class: "turboprop_single",
    pax: 7,
    cargo: "tourists",
    client: "Toros Aviation",
    weather: "IFR",
    conditions: cond({ time: "day", weather: "storm", utc: localAt(14, 5), sunDeg: 31, wx: PRESET.storm, payBonus: 35, xpBonus: 18, needsIr: true }),
  }),
  job({
    id: "j5",
    kind: "bush",
    from: "LTBA",
    to: "LTBQ",
    distanceNm: 67,
    pay: 510,
    cargoKg: 160,
    pax: 1,
    cargo: "survey_team",
    client: "Granite Mining Co.",
    conditions: cond({ time: "day", weather: "clear", utc: localAt(9, 45), sunDeg: 27, wx: PRESET.clear }),
  }),
  job({
    id: "j6",
    kind: "ferry",
    from: "LTBA",
    to: "LTBR",
    distanceNm: 58,
    pay: 350,
    class: "piston_twin",
    cargo: "aircraft_delivery",
    client: "Atlas Lojistik",
    weather: "IFR",
    conditions: cond({
      time: "night",
      weather: "snow",
      utc: localAt(19, 40, Math.floor(Date.UTC(new Date().getUTCFullYear() + 1, 0, 15) / 1000)),
      sunDeg: -27,
      nightArrival: true,
      season: "Winter",
      wx: PRESET.snow,
      payBonus: 35,
      xpBonus: 18,
      needsIr: true,
    }),
  }),
  job({
    id: "j10",
    kind: "cargo",
    from: "LTBA",
    to: "LTBR",
    distanceNm: 58,
    pay: 290,
    cargoKg: 140,
    cargo: "mail",
    client: "Harbor Mail",
    weather: "MVFR",
    plan: { distanceNm: 58, blockMin: 51, airMin: 42, fuelKg: 48, payloadKg: 140, cruiseAltFt: 3000 },
    conditions: cond({ time: "day", weather: "rain", utc: localAt(13, 15), sunDeg: 35, wx: PRESET.rain, payBonus: 5, xpBonus: 3 }),
  }),
  job({
    id: "j11",
    kind: "passenger",
    from: "LTBA",
    to: "LTBJ",
    distanceNm: 178,
    pay: 1240,
    class: "piston_twin",
    pax: 4,
    cargo: "commuters",
    client: "Kuzey Hava Taksi",
    weather: "MVFR",
    conditions: cond({ time: "dawn", weather: "broken", utc: localAt(6, 55), sunDeg: 1, wx: PRESET.broken, payBonus: 5, xpBonus: 3 }),
  }),
  job({
    id: "j7",
    kind: "tour",
    from: "LTBA",
    to: "LTBA",
    distanceNm: 46,
    pay: 380,
    pax: 3,
    cargo: "sightseeing",
    client: "Kuzey Hava Taksi",
    objectives: [
      { kind: "overfly", name: "Silivri", lat: 41.07, lon: 28.25, radiusNm: 1.5, minFt: null, maxFt: 3000, agl: true, maxKt: null, holdS: 0 },
      { kind: "overfly", name: "Çatalca", lat: 41.14, lon: 28.46, radiusNm: 1.5, minFt: null, maxFt: 3000, agl: true, maxKt: null, holdS: 0 },
    ],
  }),
  job({ id: "j8", kind: "cargo", from: "LTBA", to: "LTFE", distanceNm: 236, pay: 2160, class: "turboprop_single", cargoKg: 640, cargo: "live_animals", care: "livestock", weather: "IFR", weatherBonus: 15, client: "Skyline Freight" }),
  job({ id: "j9", kind: "cargo", from: "LTBA", to: "LTBS", distanceNm: 205, pay: 980, cargoKg: 120, cargo: "dangerous_goods", care: "dangerous", weather: "LIFR", irRequired: true, client: "Atlas Lojistik" }),
];

const active = board[1];
const track: TrackPoint[] = Array.from({ length: 28 }, (_, i) => {
  const f = i / 27;
  return [40.976 + (41.138 - 40.976) * f * 0.72, 28.814 + (27.919 - 28.814) * f * 0.72, i < 4 ? i * 1100 : 4500, 108];
});

const pilot = {
  name: "Deniz Yılmaz",
  callsign: "TC-DNZ",
  home: "LTBA",
  location: "LTBA",
  money: 18_640,
  loan: 42_500,
  xp: 3_420,
  licenses: ["spl", "ppl", "cpl", "me"],
  reputation: 64,
  difficulty: "normal" as const,
  start: "student",
  createdAt: "2026-10-01T10:00:00Z",
  stats: {
    flights: 31,
    hours: 22.4,
    simHours: 26.1,
    distanceNm: 3120,
    landings: 34,
    butterLandings: 6,
    bestLandingFpm: 48,
    earned: 21_300,
    spent: 9_850,
    jobsDone: 28,
    jobsFailed: 2,
    crashes: 0,
    scores: [82, 88, 91, 76, 95, 89, 93, 97, 90, 86],
    classHours: { light_piston: 19.2, piston_twin: 3.2 },
    nightHours: 2.4,
    instrumentHours: 1.1,
    multiEngineHours: 3.2,
    crossCountryHours: 14.8,
    nightLandings: 4,
    instrumentApproaches: 3,
    stableApproaches: 19,
  },
  birthYear: 1994,
  level: 5,
  levelXp: 2500,
  nextLevelXp: 3750,
  title: "Ticari pilot",
  rating: 89.6,
  canContract: true,
  creditLimit: 512_000,
  status: {
    landings90d: 14,
    nightLandings90d: 2,
    heliLandings90d: 0,
    passengerCurrent: true,
    nightCurrent: false,
    heliCurrent: false,
    approaches6m: 3,
    ifrCurrent: false,
    medicalRequired: 1,
    medicalClass: 1,
    medicalUntil: now + 86400 * 38,
    medicalValid: true,
    onDuty: true,
    dutyStart: now - 3600 * 4.5,
    dutySectors: 2,
    dutyMaxH: 12.5,
    dutyLeftH: 8,
    hours28d: 11.6,
    hours12m: 22.4,
    enforceCurrency: true,
    enforceDuty: false,
  },
  medicalFee: 250,
  restCost: 0,
};

// Arka uçtaki İngilizce açıklamalar (src/career/progression.rs → about_en).
const ABOUT_EN: Record<string, string> = {
  spl: "Training flights with an instructor at the flight school. Every career starts here.",
  ppl: "Small cargo, aircraft ferry and bush work in light aircraft.",
  cpl: "Paid passengers and charters, single turboprops and flying on your own account (company).",
  me: "Twin piston and twin turboprop aircraft.",
  ir: "Night and bad-weather work; required for jets.",
  heli: "Short-range, medical and charter work by helicopter.",
  jet: "Business jets, and regional jets with an ATPL.",
  atpl: "Regional turboprops and scheduled airline flights.",
  narrow: "A320 family, 737 and similar.",
  wide: "787, 777, A350 and long-haul flights.",
};

const lic = (id: string, short: string, nameTr: string, nameEn: string, aboutTr: string, requires: string[], hoursNeeded: number, levelNeeded: number, fee: number, examClass: ClassInfo["id"], held: boolean, ready = false) => ({
  id,
  short,
  nameTr,
  nameEn,
  aboutTr,
  aboutEn: ABOUT_EN[id] ?? aboutTr,
  requires,
  hours: hoursNeeded,
  level: levelNeeded,
  fee,
  examClass,
  held,
  hoursNeeded,
  levelNeeded,
  missingLicenses: requires.filter((r) => !pilot.licenses.includes(r)),
  ready,
});

const licenses = [
  lic("spl", "SPL", "Öğrenci pilot", "Student pilot", "Uçuş okulunda eğitmenle eğitim uçuşları.", [], 0, 1, 0, "light_piston", true),
  lic("ppl", "PPL", "Özel pilot lisansı", "Private pilot licence", "Hafif uçakla küçük kargo, uçak teslimi ve arazi işleri.", ["spl"], 3, 2, 800, "light_piston", true),
  lic("cpl", "CPL", "Ticari pilot lisansı", "Commercial pilot licence", "Ücretli yolcu ve charter işleri, kendi hesabına uçuşlar.", ["ppl"], 15, 5, 2500, "light_piston", true),
  lic("me", "ME", "Çok motor yetkisi", "Multi-engine rating", "Çift motorlu pistonlu ve turboprop uçaklar.", ["ppl"], 8, 3, 1500, "piston_twin", true),
  lic("ir", "IR", "Aletli uçuş yetkisi", "Instrument rating", "Gece ve kötü hava işleri; jetlerin şartı.", ["ppl"], 10, 4, 2000, "light_piston", false, true),
  lic("heli", "H", "Helikopter yetkisi", "Helicopter rating", "Helikopterle kısa mesafe, tıbbi ve charter işleri.", ["ppl"], 5, 3, 3500, "helicopter", false, true),
  lic("jet", "JET", "Jet tip intibakı", "Jet type rating", "İş jetleri ve bölgesel jetler (ATPL ile).", ["cpl", "ir"], 30, 8, 6000, "bizjet", false),
  lic("atpl", "ATPL", "Havayolu taşımacı pilot lisansı", "Airline transport pilot licence", "Bölgesel turboproplar ve tarifeli seferler.", ["cpl", "me", "ir"], 60, 12, 8000, "regional_turboprop", false),
  lic("narrow", "TR-N", "Dar gövde tip yetkisi", "Narrowbody type rating", "A320 ailesi, 737 ve benzerleri.", ["atpl", "jet"], 100, 16, 15000, "narrowbody", false),
  lic("wide", "TR-W", "Geniş gövde tip yetkisi", "Widebody type rating", "787, 777, A350 ve uzun menzil seferleri.", ["narrow"], 200, 22, 30000, "widebody", false),
];

const entry = (id: string, j: Job, grade: string, score: number, fpm: number, label: Landing["label"], net: number, ago: number, result: LogEntry["result"] = "completed"): LogEntry => ({
  id,
  job: j,
  result,
  aircraft: { title: j.class === "light_piston" ? "Cessna Skyhawk G1000 Asobo" : "Daher TBM 930 Asobo", livery: "", class: j.class, fleetId: null },
  registration: "",
  startedAt: now - ago - 3600,
  endedAt: now - ago,
  arrived: j.to,
  summary: {
    score,
    grade,
    blockS: j.plan.blockMin * 60,
    airS: j.plan.airMin * 60,
    realS: j.plan.blockMin * 60,
    fuelUsedLb: 96,
    fuelLeftLb: 210,
    flownNm: j.distanceNm * 1.04,
    maxAltFt: 4500,
    landing: null,
    arrivedAtDestination: result !== "diverted",
    distanceToDestNm: 0.4,
    invalid: null,
    crashed: false,
    simRateMax: 1,
    nightS: 0,
    imcS: 0,
    stableApproach: score >= 90,
    approach: { gateFt: 500, evaluated: true, stable: score >= 90, reasons: score >= 90 ? [] : ["sink"], vsFpm: score >= 90 ? -620 : -1240, iasKt: 68, bank: 3.1 },
    instrumentApproaches: 0,
    procedures: [
      { code: "beacon", ok: true },
      { code: "nav_lights", ok: true },
      { code: "strobe", ok: score >= 90 },
      { code: "landing_lights", ok: true },
      { code: "transponder", ok: true },
    ],
    comfort: j.pax > 0 ? (score >= 90 ? 94 : 81) : null,
    cargoDamage: 0,
    bonuses: score >= 90 ? [["procedures", 5], ["stable_approach", 5], ["comfort", 3]] : [["procedures", 4]],
    bonusPct: score >= 90 ? 13 : 4,
    objectivesDone: 0,
    objectivesTotal: 0,
  },
  landing: {
    fpm,
    g: 1.18,
    bank: 1.2,
    pitch: 3.1,
    iasKt: 62,
    bounces: 0,
    lat: 0,
    lon: 0,
    onRunway: true,
    label,
    night: false,
    imc: false,
    windKt: 12,
    windDir: 40,
    crosswindKt: 7,
    headwindKt: 9,
    visibilityM: 9999,
    weightLb: 2280,
    overweight: false,
    runway: { runway: "05", heading: 52, distanceM: score >= 90 ? 310 : 1180, centerlineM: 1.6, lengthM: 3000, widthM: 45, tdzM: 900 },
  },
  events: [
    { t: 312, code: "takeoff", severity: "info", penalty: 0, value: 64 },
    { t: 1408, code: "bank", severity: "minor", penalty: 3, value: 47.2 },
    { t: 2210, code: "touchdown", severity: "info", penalty: 0, value: fpm },
  ],
  deductions: score < 95 ? [["bank", 3]] : [],
  settlement: { pay: net, latePenalty: 0, rent: 0, fuel: 0, fees: 0, maintenance: 0, damage: 0, net },
  xp: 182,
  reputationDelta: 1.8,
  creditedHours: 0.62,
  checkridePassed: null,
});

const log: LogEntry[] = [
  entry("f1", job({ id: "x1", kind: "cargo", from: "LTFJ", to: "LTBA", distanceNm: 22, pay: 190 }), "A+", 97, 74, "smooth", 190, 3600 * 5),
  entry("f2", job({ id: "x2", kind: "passenger", from: "LTBJ", to: "LTFJ", distanceNm: 210, pay: 1240, class: "turboprop_single", pax: 6 }), "A", 91, 168, "smooth", 1240, 86400),
  entry("f3", job({ id: "x3", kind: "bush", from: "LTFE", to: "LTBJ", distanceNm: 82, pay: 610 }), "B", 84, 312, "firm", 610, 86400 * 2),
  entry("f4", job({ id: "x4", kind: "charter", mode: "contract", from: "LTAI", to: "LTFE", distanceNm: 160, pay: 4100, class: "turboprop_twin", pax: 5 }), "C", 71, 452, "hard", 2380, 86400 * 3, "late"),
  entry("f5", job({ id: "x5", kind: "checkride", from: "LTBA", to: "LTBR", distanceNm: 58, pay: 0, cargo: "examiner" }), "A", 92, 96, "smooth", 0, 86400 * 5),
];
log[3].settlement = { pay: 4100, tip: 123, latePenalty: 410, cargoClaim: 0, rent: 1690, fuel: 420, fees: 105, navFees: 58, handling: 20, maintenance: 0, insurance: 0, damage: 650, net: 4100 + 123 - 410 - 1690 - 420 - 105 - 58 - 20 - 650 };
log[3].deductions = [["bank", 3], ["long_landing", 3], ["unstable_approach", 5]];
log[3].summary.simRateMax = 2;
log[4].checkridePassed = true;

const view: CareerView = {
  pilot: mode === "new" ? null : pilot,
  location: apt("LTBA"),
  active:
    mode === "new" || mode === "idle"
      ? null
      : {
          job: active,
          acceptedAt: now - 1800,
          deadlineAt: now + 20 * 3600,
          aircraft: { title: "Cessna Skyhawk G1000 Asobo", livery: "", class: "light_piston", fleetId: null },
          start: { runway: false, end: null },
          runwayEnds: ["05", "23", "17L", "35R"],
          stage: mode === "ready" ? "ready" : "flying",
          launchNote: null,
          from: apt(active.from),
          to: apt(active.to),
          dispatch: {
            ifr: false,
            nightArrival: false,
            fuel: { rule: "vfr_day", taxiKg: 1, tripKg: 11, contingencyKg: 1, alternateKg: 9, finalReserveKg: 13, extraKg: 24, minimumKg: 35, blockKg: 59, reserveMin: 30, enduranceMin: 136 },
            weights: { emptyKg: 767, payloadKg: 180, zfwKg: 947, towKg: 1006, lwKg: 995, mtowKg: 1157, mlwKg: 1157, fuelCapacityKg: 145, fromSim: true },
            alternate: { icao: "LTFM", name: "İstanbul Havalimanı", distanceNm: 40 },
            departure: { icao: "LTBA", availableFt: 9843, requiredFt: 1460, densityAltFt: 640, lighted: true, fuel: "both" },
            arrival: { icao: "LTBU", availableFt: 9000, requiredFt: 1240, densityAltFt: 900, lighted: true, fuel: "both" },
            issues: [],
          },
        },
  fleet: [
    {
      id: "a1",
      class: "light_piston",
      title: "Cessna Skyhawk G1000 Asobo",
      registration: "TC-KRM",
      location: "LTBA",
      hours: 41.5,
      condition: 86,
      pricePaid: 85_000,
      boughtAt: "2026-10-12T10:00:00Z",
      sinceInspectionH: 92.4,
      inspectedAt: now - 86400 * 200,
      sinceHeavyH: 1210,
      heavyAt: now - 86400 * 400,
      cycles: 58,
      insured: true,
      due: { inspectionLeftH: 7.6, inspectionLeftDays: 165, heavyLeftH: 790, heavyLeftDays: null, inTolerance: false, grounded: false, inspectionCost: 1200, heavyCost: 18000 },
      value: 51_170,
      premiumH: 1,
      heavyHere: true,
    },
    {
      id: "a2",
      class: "turboprop_single",
      title: "Daher TBM 930 Asobo",
      registration: "TC-BLT",
      location: "LTBJ",
      hours: 6.2,
      condition: 37,
      pricePaid: 1_200_000,
      boughtAt: "2026-10-20T10:00:00Z",
      sinceInspectionH: 6.2,
      inspectedAt: now - 86400 * 6,
      sinceHeavyH: 6.2,
      heavyAt: now - 86400 * 6,
      cycles: 4,
      insured: false,
      due: { inspectionLeftH: 193.8, inspectionLeftDays: 354, heavyLeftH: 3593.8, heavyLeftDays: null, inTolerance: false, grounded: false, inspectionCost: 5000, heavyCost: 180000 },
      value: 310_800,
      premiumH: 8,
      heavyHere: true,
    },
  ],
  licenses,
  recent: log.slice(0, 5),
  classes,
  link: mode === "new" ? { state: "waiting", sim: null, detail: "Sim kapalı." } : { state: "connected", sim: "msfs2024", detail: null },
  achievements: [
    { id: "first_flight", group: "flying", progress: 31, target: 1, done: true },
    { id: "landings_100", group: "flying", progress: 34, target: 100, done: false },
    { id: "hours_10", group: "flying", progress: 22.4, target: 10, done: true },
    { id: "hours_100", group: "flying", progress: 22.4, target: 100, done: false },
    { id: "butter_10", group: "skill", progress: 6, target: 10, done: false },
    { id: "perfect", group: "skill", progress: 0, target: 1, done: false },
    { id: "stable_50", group: "skill", progress: 19, target: 50, done: false },
    { id: "night_25", group: "skill", progress: 4, target: 25, done: false },
    { id: "ppl", group: "career", progress: 1, target: 1, done: true },
    { id: "cpl", group: "career", progress: 1, target: 1, done: true },
    { id: "atpl", group: "career", progress: 0, target: 1, done: false },
    { id: "fleet_5", group: "career", progress: 2, target: 5, done: false },
    { id: "tours", group: "world", progress: 1, target: 5, done: false },
    { id: "rescue", group: "world", progress: 0, target: 3, done: false },
    { id: "countries_10", group: "world", progress: 1, target: 10, done: false },
  ],
};

// Kariyer yolları: &path=<yol> örnek pilotu o yola koyar; &start=new|fast o yolda yeni pilot (bkz. paths-mocks.ts).
applyPathPreview(view, board, params, classes);

// Uçuş ekranı önizlemesi: uçak sayfa açıldığında rotanın ortasında, seyirde; 9 dakikada %90'a gelir ve başa döner.
// Rüzgâr 040°/14 kt sağ arkadan: burun izden ~6° sağda (rüzgâra karşı düzeltme).
const ROUTE = { from: { lat: 40.976, lon: 28.814 }, to: { lat: 41.138, lon: 27.919 }, nm: 41.7, elev: 100, cruise: 4500 };
const T0 = Date.now();
const LOOP_S = 540;
const progress = () => 0.5 + ((((Date.now() - T0) / 1000) % LOOP_S) / LOOP_S) * 0.4;
const at = (f: number) => ({ lat: ROUTE.from.lat + (ROUTE.to.lat - ROUTE.from.lat) * f, lon: ROUTE.from.lon + (ROUTE.to.lon - ROUTE.from.lon) * f });
/** Uçulan mesafeye göre irtifa: kalkıştan sonra tırmanış, seyir, 3° alçalma. */
const altAt = (flown: number) => Math.min(ROUTE.cruise, 160 + flown * 520, ROUTE.elev + (ROUTE.nm - flown) * 318);
const usedLb = (flown: number) => 8 + (flown / 111) * 55;

function flyingNow(): Pick<Live, "telemetry" | "flight"> {
  if (mode === "landed" || mode === "parked") {
    return {
      telemetry: { lat: ROUTE.to.lat - 0.004, lon: ROUTE.to.lon + 0.006, altFt: 168, aglFt: 0, gsKt: 14, iasKt: 12, vsFpm: 0, heading: 52, pitch: 0, bank: 0, onGround: true, g: 1, fuelLb: 98, totalLb: 2314, enginesOn: true, parkingBrake: false, gearDown: true, flaps: 10, simRate: 1, slew: false, absTime: 0 },
      flight: {
        phase: mode === "parked" ? "parked" : "taxi_in",
        elapsedS: 1820,
        flownNm: 42.6,
        remainingNm: 0.4,
        fuelUsedLb: 32,
        scoreNow: 94,
        events: [
          { t: 1792, code: "touchdown", severity: "info", penalty: 0, value: 96 },
          { t: 1102, code: "bank", severity: "minor", penalty: 3, value: 46.1 },
          { t: 318, code: "takeoff", severity: "info", penalty: 0, value: 62 },
        ],
        landing: log[0].landing,
        invalid: null,
      },
    };
  }
  const f = progress();
  const flown = ROUTE.nm * f;
  const remaining = ROUTE.nm - flown;
  const p = at(f);
  const alt = altAt(flown);
  const descending = alt < ROUTE.cruise && flown > ROUTE.nm / 2;
  const fuelLb = 130 - usedLb(flown);
  const wobble = Math.sin(Date.now() / 7000);
  return {
    telemetry: {
      lat: p.lat,
      lon: p.lon,
      altFt: Math.round(alt + (descending ? 0 : wobble * 18)),
      aglFt: Math.round(alt - 140),
      gsKt: 111,
      iasKt: descending ? 112 : 104,
      vsFpm: descending ? -590 : Math.round(wobble * 40),
      heading: 290,
      pitch: descending ? -1.5 : 2,
      bank: 0,
      onGround: false,
      g: 1,
      fuelLb,
      totalLb: 2216 + fuelLb,
      enginesOn: true,
      parkingBrake: false,
      gearDown: true,
      flaps: 0,
      simRate: 1,
      slew: false,
      absTime: 0,
    },
    flight: {
      phase: remaining < 5 ? "approach" : descending ? "descent" : "cruise",
      elapsedS: Math.round(380 + (flown / 111) * 3600),
      flownNm: flown,
      remainingNm: remaining,
      fuelUsedLb: usedLb(flown),
      scoreNow: 97,
      events: [
        { t: 1102, code: "bank", severity: "minor", penalty: 3, value: 46.1 },
        { t: 318, code: "takeoff", severity: "info", penalty: 0, value: 62 },
      ],
      landing: null,
      invalid: null,
    },
  };
}

/** Şimdiye kadarki iz: yarım deniz milinde bir nokta. */
function trackNow(): TrackPoint[] {
  const flown = ROUTE.nm * progress();
  const n = Math.max(2, Math.round(flown * 2));
  return Array.from({ length: n }, (_, i) => {
    const d = (flown * i) / n;
    const p = at(d / ROUTE.nm);
    return [p.lat, p.lon, Math.round(altAt(d)), i === 0 ? 60 : 108] as TrackPoint;
  });
}

const live: Live = {
  link: view.link,
  inFlight: mode !== "new" && mode !== "idle",
  paused: false,
  telemetry:
    mode === "ready"
      ? { lat: 40.9762, lon: 28.8141, altFt: 163, aglFt: 0, gsKt: 0, iasKt: 0, vsFpm: 0, heading: 52, pitch: 0, bank: 0, onGround: true, g: 1, fuelLb: 260, totalLb: 2390, enginesOn: false, parkingBrake: true, gearDown: true, flaps: 0, simRate: 1, slew: false, absTime: 0 }
      : { lat: 41.093, lon: 28.17, altFt: 4520, aglFt: 4380, gsKt: 112, iasKt: 104, vsFpm: -40, heading: 284, pitch: 2, bank: 0, onGround: false, g: 1, fuelLb: 214, totalLb: 2330, enginesOn: true, parkingBrake: false, gearDown: true, flaps: 0, simRate: 1, slew: false, absTime: 0 },
  aircraft: { title: "Cessna Skyhawk G1000 Asobo", atcModel: "C172", atcId: "TC-DNZ", class: "light_piston", managesOwnLoading: false },
  nearest: mode === "ready" ? "LTBA" : null,
  checks:
    mode === "ready"
      ? [
          { id: "connected", ok: true, required: true, detail: "msfs2024" },
          { id: "in_flight", ok: true, required: true, detail: "" },
          { id: "at_departure", ok: true, required: true, detail: "0.1 nm" },
          { id: "aircraft", ok: true, required: true, detail: "Cessna Skyhawk G1000 Asobo" },
          { id: "slew", ok: true, required: true, detail: "" },
          { id: "fuel", ok: true, required: false, detail: "260/115 lb" },
          { id: "payload", ok: false, required: false, detail: "180/397 lb" },
        ]
      : [],
  launch: mode === "ready" ? { step: "done", note: "Hazır. Yakıtı plana göre ayarlayın; motorları çalıştırdığınızda takip başlar.", elapsedS: 46 } : null,
  env:
    mode === "new" || mode === "idle"
      ? null
      : {
          lightBeacon: true,
          lightLanding: mode !== "ready",
          lightNav: true,
          lightStrobe: mode !== "ready",
          lightTaxi: false,
          windKt: mode === "ready" ? 12 : 14,
          windDir: 40,
          visibilityM: 9999,
          inCloud: false,
          precip: 0,
          temperatureC: mode === "ready" ? 18 : 9,
          qnhHpa: 1016,
          seatbeltSign: true,
          cabinAltFt: 4500,
          transponder: 4521,
        },
  flight:
    mode === "ready" || mode === "idle" || mode === "new"
      ? null
      : {
          phase: "cruise",
          elapsedS: 1290,
          flownNm: 31.2,
          remainingNm: 12.4,
          fuelUsedLb: 46,
          scoreNow: 97,
          events: [
            { t: 1102, code: "bank", severity: "minor", penalty: 3, value: 46.1 },
            { t: 318, code: "takeoff", severity: "info", penalty: 0, value: 62 },
          ],
          landing: null,
          invalid: null,
        },
};

const hits = (q: string): AirportHit[] => {
  const k = q.trim().toLowerCase();
  return airports
    .filter((a) => a.icao.toLowerCase().startsWith(k) || a.name.toLowerCase().includes(k) || a.city.toLowerCase().includes(k))
    .map((a) => ({ ...a, distanceNm: 120, ticket: 80 }));
};

const metar = (icao: string, raw: string, category: Metar["category"], windDir: number, windKt: number, vis: number, ceiling: number | null, temp: number, wet = false): Metar => ({
  icao,
  raw,
  observed: now - 1200,
  windDir,
  windKt,
  gustKt: null,
  visibilitySm: vis,
  ceilingFt: ceiling,
  tempC: temp,
  dewpointC: temp - 6,
  qnhHpa: 1016,
  wet,
  thunderstorm: false,
  category,
  fetchedAt: now - 300,
});

const metars: Metar[] = [
  metar("LTBA", "LTBA 261150Z 04012KT 9999 FEW030 18/09 Q1016 NOSIG", "VFR", 40, 12, 10, null, 18),
  metar("LTBU", "LTBU 261150Z 06008KT 9999 SCT035 17/10 Q1016", "VFR", 60, 8, 10, null, 17),
  metar("LTFE", "LTFE 261150Z 21014KT 4000 -RA BKN008 OVC015 19/17 Q1009", "IFR", 210, 14, 2.5, 800, 19, true),
  metar("LTBS", "LTBS 261150Z 00000KT 0300 FG VV002 15/15 Q1012", "LIFR", 0, 0, 0.2, 200, 15),
  metar("LTAI", "LTAI 261150Z 18010KT 9999 BKN025 24/14 Q1011", "MVFR", 180, 10, 10, 2500, 24),
];

const ledger: LedgerEntry[] = [
  { ts: now - 3600 * 5, amount: 190, kind: "job_pay", detail: "LTFJ → LTBA", balance: 18_640 },
  { ts: now - 86400, amount: 1240, kind: "job_pay", detail: "LTBJ → LTFJ", balance: 18_450 },
  { ts: now - 86400 * 3, amount: 825, kind: "contract", detail: "LTAI → LTFE", balance: 17_210 },
  { ts: now - 86400 * 4, amount: -85_000, kind: "aircraft_buy", detail: "TC-KRM", balance: 16_385 },
  { ts: now - 86400 * 4, amount: 50_000, kind: "loan", detail: "55000", balance: 101_385 },
];

const detail = (id: string): FlightDetail => {
  const e = log.find((x) => x.id === id) ?? log[0];
  return { entry: e, track, from: apt(e.job.from) ?? null, to: apt(e.job.to) ?? null, arrived: apt(e.arrived) ?? null };
};

/** QR'a benzeyen yer tutucu (okunmaz): sunucununkiyle aynı biçim (beyaz zemin, 4 modül sessiz bölge). */
function fakeQr(text: string): string {
  const n = 25;
  let h = 2166136261;
  for (const c of text) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const finder = (x: number, y: number) => {
    for (const [fx, fy] of [
      [0, 0],
      [n - 7, 0],
      [0, n - 7],
    ]) {
      const [dx, dy] = [x - fx, y - fy];
      if (dx >= 0 && dx < 7 && dy >= 0 && dy < 7) return Math.max(Math.abs(dx - 3), Math.abs(dy - 3)) !== 2;
      if (dx >= -1 && dx <= 7 && dy >= -1 && dy <= 7) return false;
    }
    return null;
  };
  let d = "";
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      h = Math.imul(h ^ (x * 31 + y), 16777619);
      const on = finder(x, y) ?? (x === 6 || y === 6 ? (x + y) % 2 === 0 : ((h >>> 7) & 3) === 0 || ((h >>> 3) & 1) === 1);
      if (on) d += `${d ? " " : ""}M${x + 4},${y + 4}h1v1h-1z`;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n + 8} ${n + 8}" shape-rendering="crispEdges" stroke="none"><rect width="100%" height="100%" fill="#FFFFFF"/><path d="${d}" fill="#000000"/></svg>`;
}

let deckKey = "q7Ve2xK9";
const lanUrl = () => `http://192.168.1.24:47213/deck?k=${deckKey}&lang=tr`;
const withLan = (d: DeckInfo, on: boolean): DeckInfo => ({ ...d, lan: { ...d.lan, enabled: on, url: on ? lanUrl() : null, error: null }, qrSvg: on ? fakeQr(lanUrl()) : null });
let deck: DeckInfo = withLan(
  { port: 47213, localUrl: "http://127.0.0.1:47213/deck", lan: { enabled: false, ip: "192.168.1.24", url: null, error: null }, qrSvg: null, windowOpen: false },
  params.get("deck") === "lan",
);

export const careerMocks: Record<string, (args?: Record<string, unknown>) => unknown> = {
  msfs_career_state: () => view,
  msfs_career_create: () => view,
  msfs_career_reset: () => null,
  msfs_career_paths: (a) => mockCatalog((a?.difficulty as Difficulty | null) ?? view.pilot?.difficulty ?? "normal", classes),
  msfs_career_set_path: (a) => mockSetPath(view, String(a?.path ?? "general") as CareerPath),
  msfs_career_board: () => board,
  msfs_career_weather: () => metars,
  msfs_career_medical: () => 250,
  msfs_career_rest: () => 0,
  msfs_career_maintain: () => 1200,
  msfs_career_insure: () => null,
  msfs_career_appeal: () => log[3],
  msfs_career_accept: () => null,
  msfs_career_cancel: () => null,
  // Uçak listesi (sim + mod uçakları), küçük resim ve yük yöntemi: aircraft/mocks.ts.
  ...aircraftMocks,
  msfs_career_refresh_aircraft: () => null,
  msfs_career_pick_aircraft: () => null,
  msfs_career_launch: () => null,
  msfs_career_reposition: () => null,
  msfs_career_finish: () => log[0],
  msfs_career_abandon: () => null,
  msfs_career_logbook: () => log,
  msfs_career_flight: (a) => detail(String(a?.id ?? "f1")),
  msfs_career_checkride: () => null,
  msfs_career_travel: () => 80,
  msfs_career_airports: (a) => hits(String(a?.query ?? "")),
  msfs_career_map_airports: (a) => mapAirports(a ?? {}),
  msfs_career_buy: () => null,
  msfs_career_sell: () => 59_500,
  msfs_career_repair: () => 3_500,
  msfs_career_borrow: () => 55_000,
  msfs_career_repay: () => 10_000,
  msfs_career_ledger: () => ledger,
  msfs_career_live: (): Live => (live.flight ? { ...live, ...flyingNow() } : live),
  msfs_career_track: () => (live.flight ? trackNow() : []),
  msfs_career_deck_info: () => deck,
  msfs_career_deck_set_lan: (a) => (deck = withLan(deck, !!a?.on)),
  msfs_career_deck_rotate: () => {
    deckKey = Math.random().toString(36).slice(2, 10);
    return (deck = withLan(deck, deck.lan.enabled));
  },
  msfs_career_deck_open: () => {
    deck = { ...deck, windowOpen: true };
    return null;
  },
  // Önizlemede karo sunucusu yoktur: harita yalnızca vektörle çizilir. Raster katmanları denemek için `?tiles=<kök>`
  // çalışan bir Modstead'in yerel sunucusunu gösterir (ör. http://127.0.0.1:47213); örnek görüntü uydurulmaz.
  msfs_career_tiles_info: (): TilesInfo => ({
    base: /^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(params.get("tiles") ?? "") ? params.get("tiles") : null,
    layers: [
      { id: "relief", minZoom: 0, maxZoom: 5, online: false, attribution: "Natural Earth", license: "Public Domain", licenseUrl: "https://www.naturalearthdata.com/about/terms-of-use/" },
      {
        id: "sat",
        minZoom: 0,
        maxZoom: 13,
        online: true,
        attribution: "EOxCloudless https://cloudless.eox.at by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2016)",
        license: "CC BY 4.0",
        licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
      },
    ],
  }),
  msfs_career_simbrief: () => "https://dispatch.simbrief.com/options/custom?orig=LTBA&dest=LTBU&type=C172",
  msfs_career_reveal_plan: () => null,
  msfs_career_reveal_journal: () => null,
  msfs_career_journal: () => [
    "2026-10-25 16:40:02.114 [bağlantı] SimConnect oturumu açıldı: msfs2024 127.0.0.1:500 protokol 6 sürüm 12.2.282174.999",
    "2026-10-25 16:40:02.120 [sim] ana menü / dünya haritası (yer tutucu konum -0.0000, 90.0003)",
    "2026-10-25 16:41:15.402 [komut] uçuşu başlat: LTBA → LTBU · Cessna Skyhawk G1000 Asobo · park yeri",
    "2026-10-25 16:41:16.010 [başlatma] FlightLoad gönderiliyor: …\\flights\\LTBA-1\\Modstead.flt · Cessna Skyhawk G1000 Asobo · LTBA park 12",
    "2026-10-25 16:41:31.877 [akış] FLT_LOADED",
    "2026-10-25 16:41:32.203 [sim] kamera 16 oyun içi sinema → 2 kokpit",
    "2026-10-25 16:41:36.540 [takip] kontrol kapısı tamam: takip kuruldu (Cessna Skyhawk G1000 Asobo, 40.97612, 28.81463)",
  ],
  msfs_career_hud: () => hud,
  msfs_career_hud_install: () => (hud = { ...hud, installed: true, version: hud.latest, sims: hud.sims.map((s) => ({ ...s, linked: true })) }),
  msfs_career_hud_remove: () => (hud = { ...hud, installed: false, version: null, sims: hud.sims.map((s) => ({ ...s, linked: false })) }),
  msfs_career_hud_queue: (args) => (hud = { ...hud, queued: !!(args as { on?: boolean } | undefined)?.on }),
  msfs_career_menu: () => menuPkg,
  msfs_career_menu_install: () => (menuPkg = { ...menuPkg, installed: true, version: menuPkg.latest, installedFor: menuPkg.simVersion, sims: menuPkg.sims.map((s) => ({ ...s, linked: true })) }),
  msfs_career_menu_remove: () => (menuPkg = { ...menuPkg, installed: false, version: null, installedFor: null, sims: menuPkg.sims.map((s) => ({ ...s, linked: false })) }),
  msfs_career_menu_queue: (args) => (menuPkg = { ...menuPkg, queued: !!(args as { on?: boolean } | undefined)?.on }),
};
