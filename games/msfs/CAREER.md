# MSFS 2024 career mode in Modstead

**English** · [Türkçe](KARIYER.md)

A free, open-source **career mode for Microsoft Flight Simulator 2024** that also works with MSFS 2020. You start as a
student pilot with nothing, take jobs from a job board, earn licences through checkrides and grow into an airline
captain with your own fleet. Every flight is prepared in the sim, tracked over SimConnect and written to your logbook,
and every rule, fee and penalty is documented on this page.

<p align="center">
  <img src="../../docs/screenshots/msfs-2024-career-mode-dashboard.png" alt="Modstead MSFS 2024 career mode dashboard during a cargo flight from LTBA to LTBU: live route map, flight phase, altitude, ground speed, fuel used and live score" width="900">
</p>

> **Status:** early development, like the rest of Modstead. The rules, the SimConnect protocol and the full job flow are
> covered by automated tests; automatic flight loading and the in-sim panel still need to be tried and tuned in a real
> sim (see [Known limits](#known-limits-and-roadmap)). The screenshots come from Modstead's preview mode with sample data.

## Contents

- [Features](#features)
- [Screenshots](#screenshots)
- [It runs inside Modstead](#it-runs-inside-modstead)
- [How a career flight starts](#how-a-career-flight-starts)
- [In-sim toolbar panel](#in-sim-toolbar-panel-msfs-2020-and-2024)
- [Rules and formulas](#rules-and-formulas)
- [Research: how other career add-ons work](#research-how-other-msfs-career-add-ons-work)
- [Architecture](#architecture)
- [Data sources](#data-sources)
- [Testing](#testing)
- [Known limits and roadmap](#known-limits-and-roadmap)
- [FAQ](#faq)

## Features

- **Job board** at your current airport: cargo, passengers, charter, aircraft ferry, bush flights, air ambulance,
  scheduled airline flights and training flights. Listings depend on your licences, the aircraft classes you can fly
  and your reputation, and refresh every 4 hours. Each job shows distance, block time, payload, aircraft class, pay and
  XP on a world map.
- **Two ways to earn:** fly *for an operator* (the aircraft, fuel and fees are theirs, you earn an hourly wage) or,
  after the CPL, fly *on your own account* (you pay rent, fuel and landing fees and keep the profit).
- **Automatic flight setup:** Modstead starts the sim if needed, picks a parking spot that suits the job and the
  aircraft from the sim's own airport data, writes the flight and route plan, moves the aircraft and loads the payload.
- **Flight tracking over SimConnect:** flight phases, landing rate, G and bank at touchdown, bounces, overspeed, stall
  and flap-speed warnings, low fuel and cheat detection (slew, teleport, refuelling in the air, crash).
- **Pre-flight checks:** tracking arms itself as soon as the required checks turn green, and the flight starts when you
  start the engines or move.
- **Licences and ratings:** SPL, PPL, CPL, multi-engine, instrument, helicopter, jet type rating, ATPL, narrowbody and
  widebody type ratings. Each needs hours, a level and a fee, then a checkride.
- **Logbook** with a score and grade for every flight, the flown track on a map, landing data, deductions, timeline and
  settlement.
- **Hangar and finance:** buy and sell aircraft, maintenance and wear, a loan with no time-based interest, and a
  transaction history.
- **SimBrief and PLN:** open the job in SimBrief with the route and aircraft filled in, or open the generated `.PLN`.
- **In-sim toolbar panel** for MSFS 2020 and 2024 that shows the route, phase, remaining distance, ETA, score and pay
  inside the sim, in full screen and VR.
- **Three difficulties** (Easy, Normal, Realistic) and three starts: student pilot, commercial pilot or airline pilot.
- **Free and local:** no subscription, no account and no server. Career data is plain JSON on your PC.

## Screenshots

| | |
|---|---|
| <img src="../../docs/screenshots/msfs-career-job-board-map.png" alt="MSFS career job board with air ambulance, cargo, charter, passenger, bush and ferry jobs and a map of the selected route" width="440"> | <img src="../../docs/screenshots/msfs-career-licences.png" alt="Pilot licences and ratings in the Modstead career: student, private, commercial, multi-engine, instrument, helicopter, jet and ATPL with illustrated cards" width="440"> |
| **Job board** with a route map | **Licences and ratings** with checkrides |
| <img src="../../docs/screenshots/msfs-career-logbook.png" alt="MSFS flight logbook with date, route, aircraft, block time, landing rate in fpm, grade and net pay for each flight" width="440"> | <img src="../../docs/screenshots/msfs-career-flight-details.png" alt="Flight details window: flown track on a map, score 91 grade A, landing at 168 fpm, deductions, timeline and settlement" width="440"> |
| **Logbook** | **Flight details** with the flown track |
| <img src="../../docs/screenshots/msfs-career-hangar-finance.png" alt="Hangar and finance page: owned aircraft with condition, aircraft prices by class, loan, credit limit and transactions" width="440"> | <img src="../../docs/screenshots/msfs-career-preflight-checks-light.png" alt="Pre-flight checks in light theme: sim connected, at the departure airport, aircraft suitable, slew off, fuel and payload advice" width="300"> |
| **Hangar and finance** | **Pre-flight checks** (light theme) |
| <img src="../../docs/screenshots/msfs-career-new-pilot-light.png" alt="New career registration in light theme: pilot name, callsign, home base, difficulty and starting rank" width="440"> | <img src="../../docs/screenshots/msfs-in-sim-toolbar-panel.png" alt="Modstead in-sim toolbar panel for MSFS in three states: in cruise, after landing and ready for departure" width="440"> |
| **New pilot** (light theme) | **In-sim toolbar panel** (browser preview) |

## It runs inside Modstead

The career mode is part of Modstead. Its data, its rules and the connection to the sim all live in the Modstead app;
nothing is installed inside the sim for the career itself. **There is no career without Modstead:** while Modstead is
closed, flights are not tracked. The optional in-sim panel only shows what Modstead writes; with Modstead closed it says
"Modstead not connected".

## How a career flight starts

When you press **Start flight** (`engine.rs`):

1. If the sim is not running, Modstead starts it (Steam or Microsoft Store) and waits for the SimConnect connection.
2. The parking spots of the departure airport come **from the sim's own data** (`RequestFacilityData`: TAXI_PARKING
   type, name, number, radius and offset from the reference point). A spot that suits the job and the aircraft size is
   chosen: light aircraft go to the GA apron, airliners to a gate, cargo jets to the cargo apron. The result is cached
   for 30 days.
3. A `.FLT` (aircraft title, livery, parking spot, position, time, live weather) and a `.PLN` (direct route) are written.
4. If you are already in a flight with the right aircraft, the aircraft is moved straight to the parking spot
   (`Initial Position`); otherwise `SimConnect_FlightLoad` is tried.
5. When the flight is open, the position is checked; if the aircraft is more than 150 m from the parking spot it is
   moved there. The payload is written to the payload stations (station 1 counts as the pilot; the load is spread over
   the rest).
6. If the flight has not opened after 150 seconds, Modstead switches to **manual mode**: you open a free flight at the
   departure airport and press **Move to parking**. When the pre-flight checks turn green, tracking arms itself; the
   flight starts when the engines run or the aircraft moves.

Modstead's own repositioning is never counted as cheating (a 30-second window).

## In-sim toolbar panel (MSFS 2020 and 2024)

A Modstead panel in the MSFS toolbar: route, phase, progress, remaining distance, ETA, score, deadline, last landing and
pay, and the pre-flight gate while preparing. Unlike a window on top of the desktop, it also works in full screen and VR.

<p align="center">
  <img src="../../docs/screenshots/msfs-in-sim-toolbar-panel.png" alt="Modstead MSFS toolbar panel showing a cargo flight in cruise, a medical flight after landing and a passenger flight ready for departure" width="900">
</p>

The image above is a **browser preview** of the panel's own HTML, CSS and JavaScript with simulated `L:` variables, not a
capture from the sim.

**Why a toolbar panel** (research summary):

- `SimConnect_Text` cannot be used in 2020 and does not exist in the 2024 reference.
- An EFB app only shows on the tablet and needs the SDK's `efb_api` package.
- A panel talking to a local HTTP server would open a new listening socket.
- A toolbar panel that reads `L:` variables needs no new port, no dependency and no injection, and the same package
  works in MSFS 2020 (SU12 and later) and MSFS 2024.

**Data path:**

- Over its open SimConnect connection, Modstead writes the `L:MODSTEAD_HUD_*` variables once a second
  (`AddToDataDefinition` + `SetDataOnSimObject`).
- The fields are listed in `hud.rs` → `FIELDS`. ICAO codes are sent as base-37 numbers.
- The panel (`ModsteadCareer.js`) only reads and displays. If `SEQ` stops increasing for 4 seconds it says "Modstead not
  connected".
- If the sim rejects the `L:` definitions (older 2020 builds), writing stops for that session.

**Package** (`games/msfs/hud/package`):

- Embedded in the app. Install, update and remove it from Career → Dashboard → **In-sim panel**.
- Installing writes it to the mod library, generates `layout.json` and `manifest.json` on the spot and links the package
  into the sims' Community folders, the same way as any other mod. The sims must be closed.
- The panel definition is `InGamePanels/modstead-career-hud.spb` (source: `hud/source/modstead-career-hud.xml`).
- This `.spb` was generated once from the documented SPB format
  ([spb2xml24](https://github.com/vectorial287/spb2xml24) `docs/FORMAT.md`). It was checked two ways: the same encoder
  reproduced the `.spb` of an installed panel byte for byte, and our file decodes back with every field intact.
- If the definition changes, the `.spb` must be rebuilt in MSFS developer mode or with the SDK package tool, and
  `HUD_VERSION` raised.

**Not yet tested in the real sim.** The first real flight will confirm that the panel appears in the toolbar and reads
the `L:` variables. Rich text through CommBus (`SimConnect_CallCommBusEvent`) in 2024 is the next step.

## Rules and formulas

### Licences

Normal difficulty. Easy: ×0.5 hours, ×0.6 fees. Realistic: ×2 hours, ×1.4 fees.

| Licence | Requires | Hours | Level | Fee | Checkride aircraft | Unlocks |
|---|---|---|---|---|---|---|
| SPL Student pilot | — | — | 1 | — | — | training flights |
| PPL Private pilot licence | SPL | 3 | 2 | $800 | light piston | cargo, aircraft ferry, bush |
| CPL Commercial pilot licence | PPL | 15 | 5 | $2,500 | light piston | passengers, charter, air ambulance, single turboprops, own-account jobs, aircraft ownership, loans |
| ME Multi-engine rating | PPL | 8 | 3 | $1,500 | piston twin | twins |
| IR Instrument rating | PPL | 10 | 4 | $2,000 | light piston | required for jets |
| H Helicopter rating | PPL | 5 | 3 | $3,500 | helicopter | helicopters |
| JET Jet type rating | CPL, IR | 30 | 8 | $6,000 | business jet | business jets |
| ATPL Airline transport pilot licence | CPL, ME, IR | 60 | 12 | $8,000 | regional turboprop | scheduled airline flights |
| TR-N Narrowbody type rating | ATPL, JET | 100 | 16 | $15,000 | narrowbody | A320, 737 |
| TR-W Widebody type rating | TR-N | 200 | 22 | $30,000 | widebody | 787, 777, A350 |

To pass a checkride: arrive, score at least 75 (Easy 65, Realistic 85) and land no harder than "firm". The fee is paid
even if you fail.

### Pay

- **For an operator:** `pay = hourly wage × (0.5 + block hours) × (1 + short-flight bonus) × job type × reputation / √difficulty`
- **Own account:** `revenue = typical cost × 1.1 + operator pay × 2 × (0.4 + 0.6 × load factor) × job type × reputation / √difficulty`;
  typical cost = rent + fuel + landing fee. The real cost is measured during the flight: rent (block time × hourly
  rent) or maintenance on your own aircraft, fuel burned × price, the destination's landing fee and damage.
- Short-flight bonus: below 150 nm, `0.6 × (1 − nm/150)`. Job type: air ambulance ×1.4, urgent ×1.35, bush ×1.3,
  charter ×1.25, ferry ×0.8. Reputation: 0 → ×0.85, 50 → ×1, 100 → ×1.2.
- Landing fee: $7 × max weight / 1,000 lb × (large 1.5 · medium 1 · small 0.3). Fuel: avgas $2.50/kg, jet fuel $0.95/kg.
- Late delivery: 10% per hour, at most 50%.

### Score (starts at 100; each rule has a cap)

| Rule | Deduction | Cap |
|---|---|---|
| Overspeed | 5 | 15 |
| Stall warning (above 150 ft AGL) | 5 | 15 |
| Flap speed limit | 3 | 9 |
| Bank > 45° (jets 35°) | 3 | 9 |
| Pitch > 25° / < −15° | 3 | 9 |
| G > 2.5 or < −1 | 5 | 10 |
| > 265 kt below 10,000 ft (turbine) | 5 | 10 |
| Taxi > 30 kt off the runway | 2 | 6 |
| Bounce | 4 | 12 |
| Landing with little fuel (< 30 min) | 5 | 5 |
| Landing rate (scaled by class; light aircraft: < 200 fpm 0 · 200–300: 3 · 300–400: 8 · 400–500: 15 · ≥ 500: 25) | | |
| Landing G > 1.5: 5 · > 2.0: 10; bank > 6°: 5 · > 10°: 10 | | |

Grades: A+ ≥ 95, A ≥ 88, B ≥ 78, C ≥ 65, D ≥ 50, F. **A flight is void** after slew in the air, a teleport or phase
skip, refuelling in the air, a flight that starts in the air, or a crash (score 0, no pay, −15 reputation for a crash).

The score sets XP and reputation, not money: a wrong deduction never costs you cash. Money only follows real events:
late delivery, damage, fuel and rent.

### XP, levels and reputation

- `XP = (100 + 60 × block hours) × score/100 × distance factor × class factor` (+400 for a passed checkride).
  Distance: < 50 nm 0.7 · < 150 0.85 · < 600 1 · < 2,500 1.1 · longer 1.2. Class: light aircraft 1 … widebody 1.5.
- Total XP for level L: `250 × L × (L − 1) / 2`.
- Reputation (0–100, starts at 50): `(score − 70) / 10`, clamped to −5..+3; late −3, failed −6, crash −15.
- Pilot rating: halfway between the average of the last 10 flights and the average of all flights.
- Licence hours are block time, capped at 1.5× the real time, so sim rate cannot farm hours.

### Aircraft, damage and loans

- What you can rent depends on the airport size (small airports: light and twin pistons, single turboprops and
  helicopters only).
- Your own aircraft: no rent, but maintenance; 12% wear per 100 hours; a hard landing costs 2 condition points,
  structural damage 8; below 40 it is grounded. Selling returns 70% of the price × condition.
- Damage class: landing above the class's "firm" threshold × 1.5 or G > 2 → inspection; × 2 or G > 2.6 → structural.
  Rental excess: inspection 0.5 hours of rent, structural 3, crash 20.
- Loan (with a CPL): limit `20,000 × level² × (0.5 + reputation/100) + half the fleet value`; an arrangement fee of 10%
  (Easy 5, Realistic 15) is added to the loan; no time-based interest; 25% of every profitable flight goes to the loan.

## Research: how other MSFS career add-ons work

| Product | Strength | Sim integration | Trade-offs users mention |
|---|---|---|---|
| **OnAir Company** | Deepest economy; formulas published in its manual; freelance → company progression | You open a free flight yourself. The app turns 6 checks green (time, fuel, payload, right aircraft, slew/unlimited fuel off, ≤ 4 nm from departure). Writes fuel, payload and date over SimConnect; for PMDG, Fenix and iniBuilds "enter it in the EFB". "Position" moves you to a stand or the runway | Subscription, must stay online, depends on its servers |
| **NeoFly 4** | 18 mission types, no deadlines, passengers and cargo together | You load the aircraft at departure; the flight is recorded automatically; fuel is synced | High running costs, demanding qualification flights |
| **A Pilot's Life 2** | Real airline schedules, type rating families, a pilot rating formula | FSUIPC; you position yourself, tracking starts automatically once "engines off, on ground, stationary" | Licence paperwork, no cargo or maintenance |
| **Air Hauler 2** | Reputation per customer, insurance, A/B/C checks | You set up the flight and connect with "OK" | Reports of the tracking window freezing |
| **FSEconomy** | A shared, persistent world; the 30/48 rule (at most 30 sim hours in 48 hours) | Writes fuel and payload to the sim; checks the aircraft title; slew cancels the flight | Dated interface |
| **Volanta / smartCARS** | "Board and fly": tracking starts by itself; landing rate and touchdown point | SimConnect | — |
| **MSFS 2024 career** | Licences, specialisations, employee → company | Built in | Penalties that are hard to understand, grind that favours long sessions, formulas not documented |

**Starting a flight from outside MSFS 2024:** no tool does this fully. `SimConnect_FlightLoad` is documented but not
reliable for custom ground starts (developer forum reports from November 2024 and March 2026);
`SimConnect_FlightPlanLoad` can leave the aircraft in the air; there is no command-line option for a flight, aircraft
or airport; EFB apps cannot load an FLT. The one reliable approach is OnAir's: you open any flight, the app checks it,
moves the aircraft and writes fuel and payload.

### What Modstead took

1. **A pre-flight gate** (OnAir): once the required checks are green, tracking arms itself (APL's "auto start"); fuel
   and payload suggestions are advice, not blockers.
2. **Published formulas** (OnAir manual, APL guide): the code, deduction and cap of every rule are shown in the app
   and on this page. Hidden penalties were the most criticised part of the MSFS 2024 career.
3. **Score drives XP and reputation, not money** (OnAir): a wrong deduction never burns cash. Money only follows real
   events: delay, damage, fuel and rent.
4. **A protected first stage** (OnAir freelance, MSFS 2024 employee): jobs "for an operator" have no costs; own-account
   jobs open after the CPL.
5. **A short-flight bonus**: half-hour sessions pay too (OnAir's distance curve).
6. **A pilot rating** (APL): halfway between the last 10 flights and all flights.
7. **Licences through checkrides** (APL, Air Hauler 2, MSFS 2024).
8. **Fair sim rate** (in the spirit of FSEconomy and OnAir): licence hours are block time, at most 1.5× the real time.
9. **Cheat detection from flight events** (2024): teleport, phase skip, crash.
10. **Aircraft with their own EFB** (PMDG, Fenix, iniBuilds, FBW): payload is not written; the plan values are shown.

### What Modstead avoids

No subscription and no always-online requirement (everything is local); no hard real-time deadlines (except urgent jobs,
the delivery window is 3× the block time + 24 hours); no hidden penalties; no fear of a single save slot (data is JSON,
written atomically); no lost flight when the sim crashes (the active flight is saved every 20 seconds and resumes when
the sim opens at the same place).

## Architecture

```
games/msfs/src/career/
  simconnect.rs   SimConnect network protocol (no DLL): packet encoding/decoding, framing
  link.rs         connection thread: connect when the sim opens, retry when it drops; port from SimConnect.xml
  engine.rs       career side of the link: data definitions, telemetry, pre-flight gate, automatic start, tracking
  tracker.rs      flight phases, landing capture, rules, cheat detection, score
  economy.rs      plan, pay, market price, costs, damage, loans
  progression.rs  licences, level/XP, reputation, pilot rating, title
  jobs.rs         job board (seeded, 4-hour windows), checkrides, travel
  aircraft.rs     aircraft classes: from values read from the sim, or from the aircraft name
  airports.rs     embedded airport database (airports.tsv) and geodesy
  hud.rs          in-sim panel: L: variables, package install
  flt.rs          parking spot choice, .FLT/.PLN writing, SimBrief link
  model.rs        persistent data; mod.rs: Career (operations, end-of-flight settlement); commands.rs: msfs_career_* commands
games/msfs/ui/career/   Career page (Dashboard, Job board, Logbook, Licences, Hangar & finance)
games/msfs/tools/       airports.py (OurAirports → airports.tsv), map.py (Natural Earth → ui/career/map/)
games/msfs/hud/         in-sim panel package (package/) and the panel definition source (source/); hud.rs installs and feeds it
```

**Connecting to the sim.** On every install, MSFS 2024 writes a local IPv4 entry (port 500 by default) to
`SimConnect.xml`. Modstead connects there over TCP and speaks the binary protocol that SimConnect.dll speaks itself
(packet layout from the open-source `node-simconnect` and the official `SIMCONNECT_RECV_*` structures). So no licensed
DLL is shipped and no new dependency is needed. Reads use a short timeout; the same thread also writes outgoing requests.

**What Modstead learns from the sim (2024):** installed aircraft and liveries (`EnumerateSimObjectsAndLiveries`), every
airport in the sim (`RequestAllFacilities`; job generation skips airports the sim does not have), airport parking
spots, and once you board an aircraft its engine type and count, max weight and category (the exact class).

**Telemetry** (about 10 Hz, `SIM_FRAME` × 6): position, altitude, AGL, ground and indicated speed, vertical speed,
heading, pitch, bank, on ground, G, fuel and total weight, combustion of 4 engines, parking brake, gear, flaps,
overspeed, stall, flap speed limit, sim rate, slew, on runway, **vertical speed, bank and pitch at the last touchdown**
(the sim's own measurement), absolute sim time and the crash flag. If a sim version does not know a variable it returns
an error; Modstead skips that field and keeps decoding.

**Events:** `msfs://career-live` (about 1 Hz: link, telemetry, pre-flight gate, launch step, flight summary) and
`msfs://career` (data changed). Modstead shows a notification when a flight ends.

**Data:** `games/msfs/career/{career.json, logbook.json, tracks/<flight>.json}` (persistent); cache in
`…/career/{aircraft.json, sim-airports.json, airports/<ICAO>.json, flights/<job>/}`.

## Data sources

- **Airports:** [OurAirports](https://ourairports.com/data/) (public domain). `tools/airports.py` drops closed fields,
  heliports and balloon ports, and land airports without runway data (about 30,400 airports, 2.5 MB).
- **Map:** [Natural Earth](https://www.naturalearthdata.com/) (public domain). The world view uses 1:50m land, lakes and
  borders; zoomed in, 1:10m clipped to 10° tiles. City names in Turkish and English (Populated Places).
  - `tools/map.py` simplifies, clips and writes "encoded polyline" data to `ui/career/map/`.
  - Coastlines are derived from the land rings; edges that clipping added along tile borders are skipped.
  - Each layer is loaded as a separate chunk the first time it is needed.
  - Airports in view come from the embedded database (`msfs_career_map_airports`).
  - Drag to pan. The mouse wheel zooms after a click or while Ctrl is held, so page scrolling never gets stuck on the map.
- **Protocol:** the SimConnect packet layout was rewritten in Rust using [node-simconnect](https://github.com/EvenAR/node-simconnect)
  and the MSFS SDK documentation as references (no code copied).

## Testing

```bash
cargo test -p game-msfs career                                     # rules, protocol, end-to-end flows
cargo test -p game-msfs real_simconnect -- --ignored --nocapture   # with MSFS 2024 running: read-only connection
node scripts/dev.mjs msfs --preview   # http://127.0.0.1:1421/?view=game:msfs:career  (&career=new|idle|ready, &hud=installed)
```

## Known limits and roadmap

- **MSFS 2020** opens only a named pipe by default. Without an IPv4 entry in `SimConnect.xml` there is no connection
  (the status says so; Modstead does not change your sim settings by itself). Named pipe support could be added with
  `tokio`'s `net` feature (a dependency decision).
- **FlightLoad** may not always open the flight in 2024; manual mode exists for that. It will be tried and tuned in the
  real sim.
- **Fuel** is not written automatically (2024's modular fuel system is aircraft-specific); the planned value is shown.
- **The in-sim panel** has not been tested in the real sim yet ([see above](#in-sim-toolbar-panel-msfs-2020-and-2024)).
- **Next:** rich text in the in-sim panel through 2024 CommBus, resuming an interrupted flight by moving to its last
  position, reputation per customer and region, A/B/C checks and failure risk, multi-leg jobs and airline contracts,
  hired pilots and a company, fuel and payload from the SimBrief OFP, and weather-driven jobs (that require an IR).

## FAQ

### Is this career mode free?
Yes. It is part of Modstead, which is free and open source under the GPL-3.0 licence. There is no subscription and no
account.

### Does it work with MSFS 2020?
Yes, with one setup step. MSFS 2024 opens a local IPv4 SimConnect port by default; MSFS 2020 only opens a named pipe.
Add a block like the one MSFS 2024 writes to `SimConnect.xml` in the sim's settings folder (the folder that holds
`UserCfg.opt`), next to the existing `<SimConnect.Comm>` entries, then restart the sim:

```xml
<SimConnect.Comm>
  <Descr>Static IP4 port</Descr>
  <Protocol>IPv4</Protocol>
  <Scope>local</Scope>
  <Port>500</Port>
</SimConnect.Comm>
```

Modstead reads the port from this file and never edits it for you.

### Does it replace the built-in MSFS 2024 career?
No, it runs next to it. It uses free flights in the sim and keeps its own career, licences and logbook in Modstead.

### Is it an alternative to OnAir, NeoFly or FSEconomy?
It covers similar ground (jobs, an economy, licences and a logbook) with a different focus: everything is local and
documented, and there is no subscription or server. It has no shared online world or multiplayer economy.

### Does it need an internet connection?
No. Jobs are generated locally and career data stays on your PC. Opening SimBrief is optional.

### Does it install anything into the sim?
Not for the career. The in-sim toolbar panel is optional and is installed like any other mod, into the Community folder.

### Which aircraft can I fly?
Any aircraft installed in the sim. Modstead classifies it from the sim's values (or its name) into a class such as light
piston, single turboprop or narrowbody jet; you can change the class by hand. For aircraft with their own EFB (PMDG,
Fenix, iniBuilds, FBW) Modstead does not write the payload and shows the planned values instead.

---

Microsoft Flight Simulator is a trademark of Microsoft. OnAir Company, NeoFly, A Pilot's Life, Air Hauler, FSEconomy,
Volanta, smartCARS and SimBrief belong to their respective owners. Modstead is an independent project and is not
affiliated with or endorsed by any of them.
