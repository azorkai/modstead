// Uçak listesinin önizleme verisi: simin kendi uçakları ve mod paketlerinden uçaklar (Fenix, PMDG, Just Flight,
// Black Square, topluluk helikopteri). Paketlerin küçük resimleri yerine ailelerin gömülü fotoğrafları kullanılır.

import type { AircraftClass, AircraftOption, AircraftSpecs } from "../types";
import { previewAircraftThumbs } from "./thumbs";
import a320 from "./photos/a320.jpg?url";
import a321 from "./photos/a321.jpg?url";
import b737 from "./photos/b737.jpg?url";
import bell407 from "./photos/bell407.jpg?url";
import kingair from "./photos/kingair.jpg?url";
import pa28 from "./photos/pa28.jpg?url";

const specs = (mtowLb: number, emptyLb: number, fuelCapacityGal: number, cruiseKt: number, engines: number, engineType: number): AircraftSpecs => ({
  category: "Airplane",
  engineType,
  engines,
  mtowLb,
  emptyLb,
  fuelCapacityGal,
  cruiseKt,
  payloadStations: 0,
  maxTakeoffLb: 0,
  maxLandingLb: 0,
});

const base = (title: string, cls: AircraftClass | null, rest: Partial<AircraftOption> = {}): AircraftOption => ({
  title,
  liveries: [],
  class: cls,
  classSource: cls ? "sim" : "unknown",
  autoClass: cls,
  autoSource: cls ? "sim" : "unknown",
  flyable: true,
  managesOwnLoading: false,
  loadingSource: "",
  autoLoading: false,
  origin: "sim",
  package: null,
  sims: [],
  thumb: false,
  icaoType: "",
  realType: "",
  confidence: cls ? "high" : null,
  specs: null,
  specsSource: "",
  ...rest,
});

const mod = (title: string, cls: AircraftClass, pkg: { id: string; title: string; creator: string; simobject: string }, rest: Partial<AircraftOption> = {}): AircraftOption =>
  base(title, cls, { origin: "mod", package: pkg, sims: ["msfs2024"], thumb: true, classSource: "icao", autoSource: "icao", specsSource: "cfg", ...rest });

const FENIX = { id: "fnx-aircraft-320", title: "Fenix Airbus A320", creator: "Fenix Simulations", simobject: "FNX_32X" };
const PMDG = { id: "pmdg-aircraft-738", title: "PMDG 737-800", creator: "PMDG", simobject: "PMDG 737-800" };
const JF = { id: "justflight-aircraft-pa28r-arrow-iii", title: "PA-28R Arrow III", creator: "Just Flight", simobject: "JF_PA28R" };
const BKSQ = { id: "bksq-aircraft-analogkingair", title: "Analog King Air 350", creator: "Black Square", simobject: "BKSQ_KingAir350" };
const COWAN = { id: "cowansim-bell206", title: "Bell 206B JetRanger III", creator: "Cowan Simulation", simobject: "Cowan_B206" };

const fenixEfb = { managesOwnLoading: true, loadingSource: "package" as const, autoLoading: true };

let list: AircraftOption[] = [
  base("Cessna Skyhawk G1000 Asobo", "light_piston", { liveries: ["Asobo White", "Turkish Aero Club"], realType: "Cessna 172 Skyhawk", icaoType: "C172", classSource: "icao", autoSource: "icao" }),
  base("Diamond DA62 Asobo", "piston_twin", { classSource: "name", autoSource: "name", confidence: "low", realType: "Diamond DA62" }),
  base("Daher TBM 930 Asobo", "turboprop_single", { realType: "Daher TBM 930" }),
  base("A320neo V2", "narrowbody", { liveries: ["Airbus House Livery", "Turkish Airlines"], flyable: false, icaoType: "A20N", realType: "Airbus A320neo", classSource: "icao", autoSource: "icao" }),
  base("Kuşkonmaz Ultralight", null, { flyable: false }),
  mod("FenixA320 CFM SL", "narrowbody", FENIX, {
    ...fenixEfb,
    flyable: false,
    liveries: ["Fenix House Colors", "Turkish Airlines TC-JPP", "Pegasus TC-DCI"],
    icaoType: "A320",
    realType: "Airbus A320",
    confidence: "high",
    specs: specs(169_754, 94_137, 6180, 460, 2, 1),
  }),
  mod("FenixA320 IAE WF", "narrowbody", FENIX, { ...fenixEfb, flyable: false, liveries: ["Fenix House Colors", "JetBlue N706JB"], icaoType: "A320", realType: "Airbus A320", confidence: "high", specs: specs(169_754, 94_137, 6180, 460, 2, 1) }),
  mod("PMDG 737-800 BW Turkish Airlines", "narrowbody", PMDG, {
    ...fenixEfb,
    flyable: false,
    sims: ["msfs2020", "msfs2024"],
    icaoType: "B738",
    realType: "Boeing 737-800",
    confidence: "high",
    specs: specs(174_200, 91_300, 6875, 453, 2, 1),
  }),
  mod("Just Flight PA-28R Arrow III G-BOYH", "light_piston", JF, {
    sims: ["msfs2020"],
    icaoType: "P28R",
    realType: "Piper PA-28R Arrow",
    confidence: "high",
    managesOwnLoading: false,
    loadingSource: "user",
    autoLoading: true,
    liveries: [],
    specs: specs(2750, 1637, 72, 137, 1, 0),
  }),
  mod("Black Square Analog King Air 350", "turboprop_twin", BKSQ, {
    sims: ["msfs2020", "msfs2024"],
    classSource: "cfg",
    autoSource: "cfg",
    confidence: "medium",
    managesOwnLoading: true,
    loadingSource: "package",
    autoLoading: true,
    realType: "Beechcraft King Air 350",
    specs: specs(15_000, 9_955, 539, 303, 2, 5),
  }),
  mod("Bell 206B JetRanger III", "helicopter", COWAN, {
    flyable: false,
    classSource: "cfg",
    autoSource: "cfg",
    confidence: "high",
    icaoType: "B06",
    realType: "Bell 206",
    specs: { ...specs(3200, 1700, 91, 115, 1, 3), category: "Helicopter" },
  }),
];

// Önizlemede paketlerin küçük resimleri (gerçekte paketin kendi görselleri).
for (const [title, url] of [
  ["FenixA320 CFM SL", a320],
  ["FenixA320 CFM SL|Turkish Airlines TC-JPP", a321],
  ["FenixA320 IAE WF", a320],
  ["PMDG 737-800 BW Turkish Airlines", b737],
  ["Just Flight PA-28R Arrow III G-BOYH", pa28],
  ["Black Square Analog King Air 350", kingair],
  ["Bell 206B JetRanger III", bell407],
] as const) {
  previewAircraftThumbs.set(title.includes("|") ? title : `${title}|`, url);
}

export const aircraftMocks: Record<string, (args?: Record<string, unknown>) => unknown> = {
  msfs_career_aircraft: () => list,
  msfs_career_aircraft_thumb: () => {
    throw { code: "not_found", message: "önizleme" };
  },
  msfs_career_set_loading: (a) => {
    const title = String(a?.title ?? "");
    const own = a?.own as boolean | null | undefined;
    list = list.map((o) =>
      o.title !== title ? o : own === null || own === undefined ? { ...o, managesOwnLoading: o.autoLoading, loadingSource: o.autoLoading ? (o.origin === "mod" ? "package" : "title") : "" } : { ...o, managesOwnLoading: own, loadingSource: "user" },
    );
    return null;
  },
  msfs_career_set_class: (a) => {
    const title = String(a?.title ?? "");
    const cls = (a?.class ?? null) as AircraftClass | null;
    list = list.map((o) => (o.title !== title ? o : cls ? { ...o, class: cls, classSource: "user", confidence: null } : { ...o, class: o.autoClass, classSource: o.autoSource, confidence: o.autoClass ? "high" : null }));
    return null;
  },
};
