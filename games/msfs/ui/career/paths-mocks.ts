// Kariyer yollarının önizleme verisi (arka uçtaki `paths.rs` tablosunun aynısı). Adres parametreleri:
//   &path=airline|cargo|bush|medical|charter|aerial|general  → örnek pilot o yolda
//   &start=new  → o yolda sıfırdan yeni pilot (öğrenci) · &start=fast → o yolun "Deneyimli başla" paketiyle yeni pilot

import type { Airport, CareerPath, CareerView, ClassInfo, Difficulty, Job, PathInfo, PathStatus, PilotView, RankStep, Stats } from "./types";

type Rank = PathInfo["ranks"][number];

interface Def {
  id: CareerPath;
  nameTr: string;
  nameEn: string;
  kinds: PathInfo["kinds"];
  classes: PathInfo["classes"];
  route: string[];
  ranks: Rank[];
  fast: { licenses: string[]; hours: number; share: [ClassInfo["id"], number][]; night: number; instrument: number; money: number };
  homes: string[];
}

const R = (id: string, nameTr: string, nameEn: string, licenses: string[], hours: number, reputation: number): Rank => ({ id, nameTr, nameEn, licenses, hours, reputation });

const DEFS: Def[] = [
  {
    id: "airline",
    nameTr: "Havayolu",
    nameEn: "Airline",
    kinds: ["airline", "passenger"],
    classes: ["regional_turboprop", "regional_jet", "narrowbody", "widebody"],
    route: ["ppl", "cpl", "me", "ir", "atpl", "jet", "narrow", "wide"],
    ranks: [R("first_officer", "İkinci pilot", "First officer", ["atpl"], 0, 0), R("captain", "Kaptan", "Captain", ["atpl", "jet"], 60, 60), R("senior_captain", "Kıdemli kaptan", "Senior captain", ["atpl", "wide"], 150, 70)],
    fast: { licenses: ["spl", "ppl", "cpl", "me", "ir", "jet", "atpl", "narrow"], hours: 130, share: [["light_piston", 0.3], ["piston_twin", 0.15], ["turboprop_twin", 0.1], ["bizjet", 0.15], ["narrowbody", 0.3]], night: 0.12, instrument: 0.18, money: 10_000 },
    homes: ["LTFM", "EGLL", "EDDF", "LFPG", "KJFK", "OMDB"],
  },
  {
    id: "cargo",
    nameTr: "Kargo",
    nameEn: "Cargo",
    kinds: ["cargo"],
    classes: ["turboprop_single", "turboprop_twin", "regional_turboprop", "narrowbody", "widebody"],
    route: ["ppl", "cpl", "me", "ir", "atpl", "jet", "narrow", "wide"],
    ranks: [R("feeder_pilot", "Besleme pilotu", "Feeder pilot", ["cpl"], 0, 0), R("cargo_first_officer", "Kargo ikinci pilotu", "Cargo first officer", ["atpl"], 30, 50), R("cargo_captain", "Kargo kaptanı", "Cargo captain", ["atpl", "narrow"], 100, 65)],
    fast: { licenses: ["spl", "ppl", "cpl", "me", "ir"], hours: 30, share: [["light_piston", 0.55], ["piston_twin", 0.2], ["turboprop_single", 0.25]], night: 0.15, instrument: 0.12, money: 6_000 },
    homes: ["EDDP", "EBLG", "KMEM", "KSDF", "PANC", "VHHH"],
  },
  {
    id: "bush",
    nameTr: "Arazi (bush)",
    nameEn: "Bush",
    kinds: ["bush"],
    classes: ["light_piston", "turboprop_single"],
    route: ["ppl", "cpl", "ir", "me"],
    ranks: [R("bush_pilot", "Arazi pilotu", "Bush pilot", ["ppl"], 0, 0), R("senior_bush_pilot", "Kıdemli arazi pilotu", "Senior bush pilot", ["cpl"], 25, 55), R("chief_bush_pilot", "Baş arazi pilotu", "Chief bush pilot", ["cpl"], 80, 70)],
    fast: { licenses: ["spl", "ppl"], hours: 14, share: [["light_piston", 1]], night: 0.03, instrument: 0, money: 3_500 },
    homes: ["PATK", "PAMR", "CYXY", "NZQN", "AYMH", "HKNW"],
  },
  {
    id: "medical",
    nameTr: "Ambulans ve kurtarma",
    nameEn: "Air ambulance & rescue",
    kinds: ["medical", "sar"],
    classes: ["helicopter", "turboprop_single", "turboprop_twin"],
    route: ["ppl", "cpl", "heli", "ir", "me"],
    ranks: [R("ambulance_pilot", "Ambulans pilotu", "Air ambulance pilot", ["cpl"], 0, 0), R("senior_ambulance_pilot", "Kıdemli ambulans pilotu", "Senior ambulance pilot", ["cpl", "ir"], 25, 55), R("rescue_captain", "Kurtarma kaptanı", "Rescue captain", ["cpl", "ir", "heli"], 70, 70)],
    fast: { licenses: ["spl", "ppl", "cpl", "heli", "ir"], hours: 32, share: [["light_piston", 0.5], ["helicopter", 0.35], ["turboprop_single", 0.15]], night: 0.12, instrument: 0.1, money: 6_000 },
    homes: ["LOWI", "LSZH", "ENTC", "YBAS", "LTAC", "PAFA"],
  },
  {
    id: "charter",
    nameTr: "Charter ve iş jeti",
    nameEn: "Charter & business jets",
    kinds: ["charter"],
    classes: ["piston_twin", "turboprop_twin", "bizjet"],
    route: ["ppl", "cpl", "me", "ir", "jet"],
    ranks: [R("charter_pilot", "Charter pilotu", "Charter pilot", ["cpl"], 0, 0), R("charter_captain", "Charter kaptanı", "Charter captain", ["cpl", "me", "ir"], 30, 55), R("bizjet_captain", "İş jeti kaptanı", "Business jet captain", ["cpl", "ir", "jet"], 80, 70)],
    fast: { licenses: ["spl", "ppl", "cpl", "me", "ir"], hours: 32, share: [["light_piston", 0.5], ["piston_twin", 0.3], ["turboprop_twin", 0.2]], night: 0.1, instrument: 0.12, money: 6_000 },
    homes: ["KTEB", "LFMN", "LSGG", "EGLF", "LTBA", "KVNY"],
  },
  {
    id: "aerial",
    nameTr: "Hava işleri",
    nameEn: "Aerial work",
    kinds: ["tour", "skydive", "survey"],
    classes: ["light_piston", "turboprop_single"],
    route: ["ppl", "cpl", "me", "ir"],
    ranks: [R("aerial_pilot", "Hava işi pilotu", "Aerial work pilot", ["cpl"], 0, 0), R("senior_aerial_pilot", "Kıdemli hava işi pilotu", "Senior aerial work pilot", ["cpl"], 25, 55), R("master_pilot", "Usta pilot", "Master pilot", ["cpl", "me"], 70, 70)],
    fast: { licenses: ["spl", "ppl", "cpl"], hours: 22, share: [["light_piston", 0.8], ["turboprop_single", 0.2]], night: 0.04, instrument: 0, money: 5_000 },
    homes: ["KGCN", "PHOG", "NZQN", "BIRK", "LTFE", "LSZS"],
  },
  {
    id: "general",
    nameTr: "Serbest pilot",
    nameEn: "Freelance pilot",
    kinds: [],
    classes: [],
    route: [],
    ranks: [],
    fast: { licenses: ["spl", "ppl", "cpl", "me", "ir"], hours: 22, share: [["light_piston", 0.75], ["piston_twin", 0.25]], night: 0.08, instrument: 0.1, money: 6_000 },
    homes: ["LTBA", "LTFJ", "EGKB", "KPAO", "LFPN", "EDNY"],
  },
];

const HOME_DB: Record<string, [string, string, string, number, number, Airport["size"], number]> = {
  LTFM: ["İstanbul Airport", "Istanbul", "TR", 41.275, 28.732, "large", 13451],
  EGLL: ["London Heathrow Airport", "London", "GB", 51.471, -0.46, "large", 12799],
  EDDF: ["Frankfurt Main Airport", "Frankfurt am Main", "DE", 50.027, 8.558, "large", 13123],
  LFPG: ["Charles de Gaulle International Airport", "Paris (Roissy-en-France, Val-d'Oise)", "FR", 49.009, 2.554, "large", 13829],
  KJFK: ["John F. Kennedy International Airport", "New York", "US", 40.639, -73.779, "large", 14511],
  OMDB: ["Dubai International Airport", "Dubai", "AE", 25.25, 55.371, "large", 14590],
  EDDP: ["Leipzig/Halle Airport", "Schkeuditz", "DE", 51.421, 12.233, "large", 11811],
  EBLG: ["Liège Airport", "Grâce-Hollogne", "BE", 50.639, 5.444, "medium", 12106],
  KMEM: ["Frederick W. Smith International Airport", "Memphis", "US", 35.044, -89.976, "large", 11120],
  KSDF: ["Louisville Muhammad Ali International Airport", "Louisville", "US", 38.171, -85.735, "large", 11887],
  PANC: ["Ted Stevens Anchorage International Airport", "Anchorage", "US", 61.179, -149.993, "large", 12400],
  VHHH: ["Hong Kong International Airport", "Hong Kong", "HK", 22.312, 113.915, "large", 12467],
  PATK: ["Talkeetna Airport", "Talkeetna", "US", 62.32, -150.094, "medium", 3500],
  PAMR: ["Merrill Field", "Anchorage", "US", 61.213, -149.844, "medium", 4000],
  CYXY: ["Whitehorse / Erik Nielsen International Airport", "Whitehorse", "CA", 60.709, -135.066, "medium", 9497],
  NZQN: ["Queenstown Airport", "Queenstown", "NZ", -45.019, 168.746, "large", 6204],
  AYMH: ["Mount Hagen Kagamuga Airport", "Mount Hagen", "PG", -5.828, 144.299, "medium", 7185],
  HKNW: ["Nairobi Wilson Airport", "Nairobi", "KE", -1.322, 36.815, "medium", 5052],
  LOWI: ["Innsbruck Airport", "Innsbruck", "AT", 47.26, 11.344, "large", 6562],
  LSZH: ["Zürich Airport", "Zurich", "CH", 47.458, 8.548, "large", 12139],
  ENTC: ["Tromsø Airport", "Tromsø", "NO", 69.683, 18.919, "large", 8041],
  YBAS: ["Alice Springs Airport", "Alice Springs", "AU", -23.807, 133.903, "medium", 7999],
  LTAC: ["Esenboğa International Airport", "Ankara", "TR", 40.128, 32.995, "large", 12310],
  PAFA: ["Fairbanks International Airport", "Fairbanks", "US", 64.815, -147.856, "medium", 11800],
  KTEB: ["Teterboro Airport", "Teterboro", "US", 40.85, -74.061, "medium", 6997],
  LFMN: ["Nice-Côte d'Azur Airport", "Nice, Alpes-Maritimes", "FR", 43.658, 7.216, "large", 9721],
  LSGG: ["Geneva International Airport", "Geneva", "CH", 46.238, 6.109, "large", 12795],
  EGLF: ["Farnborough Airport", "Farnborough, Hampshire", "GB", 51.276, -0.776, "medium", 8005],
  LTBA: ["İstanbul Atatürk Airport", "Istanbul", "TR", 40.972, 28.824, "large", 8530],
  KVNY: ["Van Nuys Airport", "Van Nuys", "US", 34.21, -118.49, "medium", 8001],
  KGCN: ["Grand Canyon National Park Airport", "Grand Canyon - Tusayan", "US", 35.952, -112.147, "medium", 8999],
  PHOG: ["Kahului International Airport", "Kahului", "US", 20.896, -156.432, "large", 6998],
  BIRK: ["Reykjavík Domestic Airport", "Reykjavík", "IS", 64.129, -21.938, "medium", 5138],
  LTFE: ["Milas Bodrum International Airport", "Bodrum", "TR", 37.249, 27.664, "large", 9843],
  LSZS: ["Engadin Airport", "Samedan", "CH", 46.534, 9.884, "medium", 5905],
  LTFJ: ["Istanbul Sabiha Gökçen International Airport", "Pendik, Istanbul", "TR", 40.899, 29.309, "large", 11614],
  EGKB: ["London Biggin Hill Airport", "London", "GB", 51.331, 0.033, "medium", 5925],
  KPAO: ["Palo Alto Airport", "Palo Alto", "US", 37.461, -122.115, "medium", 2441],
  LFPN: ["Toussus-le-Noble Airport", "Toussus-le-Noble, Yvelines", "FR", 48.752, 2.106, "medium", 3609],
  EDNY: ["Bodensee Airport Friedrichshafen", "Friedrichshafen", "DE", 47.671, 9.511, "large", 7729],
};

const home = (icao: string): Airport => {
  const [name, city, country, lat, lon, size, runwayFt] = HOME_DB[icao];
  return { icao, name, city, country, lat, lon, size, runwayFt, elevationFt: 300, surface: "paved", lighted: true, scheduled: size === "large", runway: "09/27" };
};

const LEVEL: Record<string, number> = { spl: 1, ppl: 2, cpl: 5, me: 3, ir: 4, heli: 3, jet: 8, atpl: 12, narrow: 16, wide: 22 };
const r1 = (v: number) => Math.round(v * 10) / 10;
const hoursMult = (d: Difficulty) => (d === "easy" ? 0.5 : d === "realistic" ? 2 : 1);
const moneyMult = (d: Difficulty) => (d === "easy" ? 1.5 : d === "realistic" ? 0.7 : 1);

function fastStats(def: Def, d: Difficulty): Stats {
  const hours = r1(def.fast.hours * hoursMult(d));
  const classHours: Stats["classHours"] = {};
  let me = 0;
  for (const [c, share] of def.fast.share) {
    classHours[c] = r1(hours * share);
    if (!["light_piston", "turboprop_single", "helicopter"].includes(c)) me += hours * share;
  }
  return {
    flights: 0,
    hours,
    simHours: hours,
    distanceNm: 0,
    landings: Math.round(hours),
    butterLandings: 0,
    bestLandingFpm: null,
    earned: 0,
    spent: 0,
    jobsDone: 0,
    jobsFailed: 0,
    crashes: 0,
    scores: [],
    classHours,
    nightHours: r1(hours * def.fast.night),
    instrumentHours: r1(hours * def.fast.instrument),
    multiEngineHours: r1(me),
    crossCountryHours: r1(hours * 0.55),
    nightLandings: 3,
    instrumentApproaches: def.fast.licenses.includes("ir") ? 6 : 0,
    stableApproaches: 0,
    kindHours: {},
  };
}

export function mockCatalog(d: Difficulty, classes: ClassInfo[]): PathInfo[] {
  return DEFS.map((def) => {
    const s = fastStats(def, d);
    return {
      id: def.id,
      nameTr: def.nameTr,
      nameEn: def.nameEn,
      kinds: def.kinds,
      classes: def.classes,
      route: def.route,
      ranks: def.ranks.map((r) => ({ ...r, hours: r1(r.hours * hoursMult(d)) })),
      fast: {
        licenses: def.fast.licenses,
        hours: s.hours,
        level: Math.max(...def.fast.licenses.map((l) => LEVEL[l] ?? 1)),
        money: Math.round(def.fast.money * moneyMult(d)),
        nightHours: s.nightHours,
        instrumentHours: s.instrumentHours,
        multiEngineHours: s.multiEngineHours,
        flyable: classes.filter((c) => c.licenses.every((l) => def.fast.licenses.includes(l))).map((c) => c.id),
        rankId: def.ranks[0] && def.ranks[0].licenses.every((l) => def.fast.licenses.includes(l)) ? def.ranks[0].id : null,
      },
      scratchMoney: Math.round(3000 * moneyMult(d)),
      homes: def.homes.map(home),
    };
  });
}

const PAY = [0, 4, 7, 10];

export function mockStatus(p: PilotView, path: CareerPath): PathStatus {
  const def = DEFS.find((x) => x.id === path)!;
  const hours = def.kinds.length ? def.kinds.reduce((a, k) => a + (p.stats.kindHours?.[k] ?? 0), 0) : p.stats.hours;
  let rank = 0;
  for (const r of def.ranks) {
    if (r.licenses.every((l) => p.licenses.includes(l)) && hours + 1e-6 >= r.hours * hoursMult(p.difficulty) && p.reputation + 1e-6 >= r.reputation) rank += 1;
    else break;
  }
  rank = Math.max(rank, p.pathRanks?.[path] ?? 0);
  const ladder: RankStep[] = def.ranks.map((r, i) => ({
    id: r.id,
    nameTr: r.nameTr,
    nameEn: r.nameEn,
    licenses: r.licenses,
    missingLicenses: r.licenses.filter((l) => !p.licenses.includes(l)),
    hoursNeeded: r1(r.hours * hoursMult(p.difficulty)),
    reputationNeeded: r.reputation,
    payBonus: PAY[i + 1],
    reached: i < rank,
  }));
  const general = def.ranks.length === 0;
  return {
    path,
    nameTr: def.nameTr,
    nameEn: def.nameEn,
    kinds: def.kinds,
    route: def.route,
    hours: r1(hours),
    rank,
    rankId: rank > 0 ? def.ranks[rank - 1].id : null,
    ladder,
    payBonus: general ? 0 : PAY[rank],
    xpBonus: general ? 0 : 10,
    nextLicense: def.route.find((l) => !p.licenses.includes(l)) ?? null,
  };
}

/** Önizleme: `&path=` ve `&start=` parametrelerine göre örnek pilotu ve panoyu o yola uydurur. */
export function applyPathPreview(view: CareerView, board: Job[], params: URLSearchParams, classes: ClassInfo[]): void {
  const p = view.pilot as (PilotView & { title: string }) | null;
  if (!p) return;
  const path = (params.get("path") as CareerPath | null) ?? "general";
  const def = DEFS.find((x) => x.id === path) ?? DEFS[DEFS.length - 1];
  const start = params.get("start");
  p.path = def.id;
  p.pathRanks = {};
  if (start === "new" || start === "fast") {
    // Yeni kayıt: uçuş, defter ve filo boş.
    const fast = start === "fast";
    p.licenses = fast ? def.fast.licenses : ["spl"];
    p.stats = fast ? fastStats(def, p.difficulty) : { ...fastStats(def, p.difficulty), hours: 0, simHours: 0, landings: 0, nightHours: 0, instrumentHours: 0, multiEngineHours: 0, crossCountryHours: 0, classHours: {}, nightLandings: 0, instrumentApproaches: 0 };
    p.money = fast ? def.fast.money : 3000;
    p.loan = 0;
    p.reputation = 50;
    p.rating = null;
    p.start = fast ? "fast" : "student";
    const level = fast ? Math.max(...def.fast.licenses.map((l) => LEVEL[l] ?? 1)) : 1;
    p.level = level;
    p.levelXp = (250 * level * (level - 1)) / 2;
    p.xp = p.levelXp;
    p.nextLevelXp = (250 * (level + 1) * level) / 2;
    p.home = def.homes[0];
    p.location = def.homes[0];
    p.canContract = p.licenses.includes("cpl");
    p.status = { ...p.status, onDuty: false, dutySectors: 0, nightCurrent: true, ifrCurrent: p.licenses.includes("ir"), heliCurrent: p.licenses.includes("heli"), medicalRequired: p.licenses.includes("cpl") ? 1 : 2, medicalClass: p.licenses.includes("cpl") ? 1 : 2 };
    view.location = home(def.homes[0]);
    view.recent = [];
    view.fleet = [];
    view.active = null;
    for (const l of view.licenses) {
      l.held = p.licenses.includes(l.id);
      l.missingLicenses = l.requires.filter((r) => !p.licenses.includes(r));
      l.ready = !l.held && l.missingLicenses.length === 0 && p.stats.hours >= l.hoursNeeded && p.level >= l.levelNeeded;
    }
  } else if (def.kinds.length) {
    // Orta yolda bir pilot: yolunun işlerinde biraz saat.
    p.stats = { ...p.stats, kindHours: Object.fromEntries(def.kinds.map((k, i) => [k, i === 0 ? 9.6 : 3.2])) };
  }
  p.pathStatus = mockStatus(p, def.id);
  const rank = def.ranks[p.pathStatus.rank - 1];
  if (rank) p.title = currentTitle(rank);
  else if (start === "new") p.title = currentTitle({ id: "", nameTr: "Öğrenci pilot", nameEn: "Student pilot", licenses: [], hours: 0, reputation: 0 });
  // Pano: öğrenciye eğitim uçuşları; yolun türleri için birkaç örnek ilan öne eklenir.
  const base = board[1];
  const mk = (id: string, kind: Job["kind"], from: string, to: string, distanceNm: number, pay: number, extra: Partial<Job>): Job => ({
    ...base,
    id,
    kind,
    from,
    to,
    distanceNm,
    pay,
    quote: null,
    mode: "employee",
    urgent: false,
    care: "",
    objectives: [],
    xpEstimate: Math.round(120 + distanceNm * 0.9),
    plan: { ...base.plan, distanceNm, blockMin: Math.round(distanceNm / (extra.class === "narrowbody" || extra.class === "regional_jet" ? 6.5 : 2.6) + 24), airMin: Math.round(distanceNm / 3) },
    conditions: undefined,
    weather: "VFR",
    ...extra,
  });
  const from = p.location;
  if (start === "new") {
    board.splice(
      0,
      board.length,
      mk("t1", "training", from, "LTBU", 42, 70, { class: "light_piston", cargo: "training_flight", client: "Modstead Flight School" }),
      mk("t2", "training", from, "LTBR", 58, 80, { class: "light_piston", cargo: "training_flight", client: "Modstead Flight School" }),
      mk("t3", "training", from, "LTBQ", 61, 80, { class: "light_piston", cargo: "training_flight", client: "Modstead Flight School" }),
    );
  } else if (def.id === "airline") {
    const fast = p.licenses.includes("narrow");
    board.unshift(
      mk("a1", "airline", from, "LTAI", 290, fast ? 1870 : 1240, { class: fast ? "narrowbody" : "regional_turboprop", pax: fast ? 164 : 61, cargo: "tourists", client: "Lale Hava Yolları" }),
      mk("a2", "airline", from, "LTBJ", 178, fast ? 1420 : 980, { class: fast ? "regional_jet" : "regional_turboprop", pax: fast ? 74 : 52, cargo: "commuters", client: "Meridyen Air" }),
      mk("a3", "passenger", from, "LTFE", 227, 1360, { class: "turboprop_twin", pax: 8, cargo: "workers", client: "Ege Air Service" }),
    );
  } else if (def.id === "medical") {
    board.unshift(mk("m2", "sar", from, from, 64, 1680, { class: "helicopter", cargo: "rescue", client: "Lifewing Air Rescue", urgent: true }));
  } else if (def.id === "aerial") {
    board.unshift(mk("s1", "skydive", from, from, 18, 460, { class: "turboprop_single", pax: 8, cargo: "skydivers", client: "Kartal Paraşüt Kulübü" }));
  } else if (def.id === "bush") {
    board.unshift(mk("b2", "bush", from, "LTBQ", 61, 640, { class: "light_piston", pax: 1, cargoKg: 140, cargo: "camp_supplies", client: "Tundra Supply" }));
  } else if (def.id === "cargo") {
    board.unshift(mk("c1", "cargo", from, "LTBJ", 178, 1180, { class: "turboprop_single", cargoKg: 980, cargo: "mail", client: "Kuzey Ekspres Kargo" }));
  }
  // Yolun işleri primli, diğerleri yol dışı (yolun türü lisansla açık değilse hiçbiri).
  const open = def.kinds.length > 0 && board.some((j) => def.kinds.includes(j.kind));
  for (const j of board) {
    const on = def.kinds.includes(j.kind);
    j.offPath = open && !on && j.kind !== "training" && j.kind !== "checkride";
    j.pathPayBonus = on ? PAY[p.pathStatus.rank] : 0;
    j.pathXpBonus = on ? 10 : 0;
    if (on && j.pathPayBonus) j.pay = Math.round((j.pay * (1 + j.pathPayBonus / 100)) / 10) * 10;
  }
  void classes;
}

/** Önizlemede yol değiştirme: pilotun yolu ve durumu güncellenir. */
export function mockSetPath(view: CareerView, path: CareerPath): CareerView {
  const p = view.pilot;
  if (p) {
    p.path = path;
    p.pathStatus = mockStatus(p, path);
    const def = DEFS.find((x) => x.id === path)!;
    const r = def.ranks[p.pathStatus.rank - 1];
    if (r) p.title = currentTitle(r);
  }
  return view;
}

function currentTitle(r: Rank): string {
  return typeof navigator !== "undefined" && new URLSearchParams(location.search).get("lang") === "en" ? r.nameEn : r.nameTr;
}
