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
> covered by automated tests. Automatic flight loading, the toolbar panel and the main menu page have been tried in a
> real MSFS 2024 (1.9.21.0); the current toolbar panel (0.3.0) has not been flown with yet (see
> [Known limits](#known-limits-and-roadmap)). The app screenshots come from Modstead's preview mode with sample data; the
> main menu screenshots were taken in the sim with a sample career.

## Contents

- [Features](#features)
- [Screenshots](#screenshots)
- [It runs inside Modstead](#it-runs-inside-modstead)
- [How a career flight starts](#how-a-career-flight-starts)
- [In-sim toolbar panel](#in-sim-toolbar-panel-msfs-2020-and-2024)
- [Career page in the MSFS 2024 main menu](#career-page-in-the-msfs-2024-main-menu)
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
  aircraft from the sim's own airport data (or puts you on the runway with the engines running), writes the flight in
  the sim's own free-flight format with the route as the active GPS plan, moves the aircraft and loads the payload. It
  works from the sim's main menu and from inside another flight.
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
- **Career page in the MSFS 2024 main menu:** a *Modstead Career* tile next to the sim's own tiles opens a full-screen
  page with the active job, the job board, aircraft choice with photos and your pilot profile. Take a job, pick an
  aircraft and start the flight without leaving the sim; mouse, keyboard and controller work as on the sim's own pages.
- **Aircraft photos** for 75 real aircraft families (Wikimedia Commons, credited in
  [`ui/career/aircraft/CREDITS.md`](ui/career/aircraft/CREDITS.md)).
- **Career journal:** a detailed log of the sim connection, every flight start step and the tracking, shown on the
  dashboard, so "what happened?" always has an answer.
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
| <img src="../../docs/screenshots/msfs-2024-main-menu-career-jobs.png" alt="Modstead career page in the MSFS 2024 main menu: job board at LTBA with ambulance, cargo, charter, passenger, bush and ferry jobs and the selected job's details" width="440"> | <img src="../../docs/screenshots/msfs-2024-main-menu-career-pilot.png" alt="Pilot tab of the Modstead career page in the MSFS 2024 main menu: level and XP, reputation, pilot rating, career summary, licences and recent flights" width="440"> |
| **Job board in the MSFS 2024 main menu** (captured in the sim, Turkish interface) | **Pilot profile in the main menu** (captured in the sim) |

## It runs inside Modstead

The career mode is part of Modstead. Its data, its rules and the connection to the sim all live in the Modstead app;
the career itself needs nothing installed inside the sim. The toolbar panel and the main menu tile are optional
packages that only show what Modstead serves. **There is no career without Modstead:** while Modstead is closed, flights
are not tracked, the panel says "Modstead not connected" and the main menu tile does not appear.

## How a career flight starts

When you press **Start flight** (`engine.rs`):

1. If the sim is not running, Modstead starts it (Steam or Microsoft Store) and waits for the SimConnect connection.
2. The parking spots of the departure airport come **from the sim's own data** (`RequestFacilityData`: TAXI_PARKING
   type, name, number, radius and offset from the reference point). A spot that suits the job and the aircraft size is
   chosen: light aircraft go to the GA apron, airliners to a gate, cargo jets to the cargo apron. The result is cached
   for 30 days.
3. A `.FLT` (aircraft title, livery, parking spot or runway threshold, position, time, live weather, plan) and a `.PLN`
   (direct route) are written.
4. If you are already in a flight with the right aircraft, the aircraft is moved straight to the parking spot or the
   runway (`Initial Position`); otherwise `SimConnect_FlightLoad` is sent. This works both from the sim's main menu and
   from inside another flight.
5. When the flight is open, the position is checked; if the aircraft is more than 150 m from the target it is moved
   there. The payload is written to the payload stations (station 1 counts as the pilot; the load is spread over the
   rest).
6. If the flight has not opened after 150 seconds, Modstead switches to **manual mode**: you open a free flight at the
   departure airport and press **Move to parking**. When the pre-flight checks turn green, tracking arms itself; the
   flight starts when the engines run or the aircraft moves.

Modstead's own repositioning is never counted as cheating (a 30-second window). While a flight loads and while the sim
loads a flight and places the aircraft (`FLT_LOAD`, `TELEPORT_*`, 5 seconds after `SimStart`), tracking does not
update, so momentary speeds seen during loading (8 kt) do not count as the start of the flight.

### What we learned in the real MSFS 2024 (October 2026, sim 1.9.21.0)

- **Flight file format.** With `FlightLoad`, 2024 only opens files shaped like its own free-flight file and silently
  ignores anything else (our 2020-style file did nothing in the main menu). `flt::write_flt_2024` is a template taken
  from the sim's `MISSIONS\Custom\CustomFlight\CustomFlight.FLT` with the aircraft-specific sections (fuel, engines,
  lights, cockpit variables) removed: the free-flight logic in `[ObjectFile]`/`[WolfProgram]`, cabin services, ATC and
  the window. `[Departure]`/`[Arrival]` are not written (2024 may then put the aircraft somewhere else). The plan goes
  in `[GPS_Engine]`: on a ground start it does not move the aircraft and enters the sim's GPS as the active plan (the
  next waypoint is the destination).
- **Aircraft you cannot fly.** Of the 520 titles that `EnumerateSimObjectsAndLiveries` returns, 351 are "Passive" models
  for AI traffic; they are filtered out and cannot be picked (`aircraft::is_passive`).
- **The menu sends data too.** In the main menu, 2024 keeps sending the user aircraft's data at the last flight's
  position (a placeholder 0°, 90° on first start). The camera tells whether you are in a flight (`CAMERA STATE`, once a
  second, on change): 32 main menu, 12 world map, 35 transition, 31 outside the user aircraft / "Ready to fly", 16
  in-game cinematic, 29 ESC menu, 2 cockpit, 3 external. Data that arrives with a menu camera is not counted as flying;
  when the sim is paused the data stops but the camera still shows a flight.
- **Runway start.** The sim's `FLIGHT_RUNWAY` state only opens cleanly when loaded from the main menu ("Ready to fly" →
  short take-off cinematic → cockpit, engines running). Loaded on top of an open flight, "Ready to fly" never comes and
  the sim stays in the cinematic (camera 16); the camera variable cannot be written either. So with a flight open, a
  runway start is loaded as `PREFLIGHT_TAXI`: pilot in the seat, engines running, no cinematic. If the camera then stays
  at 31, Modstead switches it to the cockpit (2). ("Reset view", `CAMERA REQUEST ACTION` 1, is not used because it moves
  the camera outside.)
- **Parking.** When starting at a parking spot, 2024 deliberately starts you next to the aircraft (external control);
  Shift+C boards it. Switching the camera to the cockpit does not seat the pilot, it only moves to the eyes of the pilot
  standing outside, so Modstead leaves it alone.
- **Engines cannot be started from outside.** The `ENGINE_AUTO_START` event and the `GENERAL ENG COMBUSTION` variable have
  no effect on 2024 aircraft; engines only come running with the sim's taxi or runway state.
- **Avionics.** `FlightPlanLoad` only fills the sim's ATC plan; sending a plan to the avionics needs the "Planned Route
  API" that is open to JavaScript inside the sim (Working Title, DevSupport, 2025). `[GPS_Engine]` loads it into the
  sim's GPS.

All of this can be followed in the career journal (below).

### Career journal

`career::journal`: a detailed, continuous log of the sim connection and the tracking
(`<cache>/career/logs/career.log`, rotated at 4 MB, two old copies kept). It records the connection, every start step,
the path and target of FlightLoad, the sim's flow and system events, camera changes, menu/flight transitions,
teleports, SimConnect exceptions, tracking phases and penalties, your commands, package installs and actions that come
from inside the sim. The *Journal* card on Career → Dashboard shows the latest lines.

## In-sim toolbar panel (MSFS 2020 and 2024)

A Modstead panel in the MSFS toolbar: route, phase, progress, remaining distance, ETA, score, deadline, last landing and
pay, and the pre-flight gate while preparing. Unlike a window on top of the desktop, it also works in full screen and VR.

<p align="center">
  <img src="../../docs/screenshots/msfs-in-sim-toolbar-panel.png" alt="Modstead MSFS toolbar panel showing a cargo flight in cruise, a medical flight after landing and a passenger flight ready for departure" width="900">
</p>

The image above is a **browser preview** of the panel's own HTML, CSS and JavaScript with simulated `L:` variables,
inside the sim's own panel frame (its `common.css`, `ingameUi` template CSS and Roboto fonts); it is not a capture from
the sim.

**Screens** (a status dot in the title bar: green connected, grey connecting, red not connected):

| State | What it shows |
|---|---|
| Connecting | Until `SEQ` increases once after the panel opens (at most 2.5 s). |
| Modstead not connected | Why, and what to do. If the language was never learned, the English text is shown below too. |
| No career / no active job | What to do and where in Modstead (Modstead › MSFS › Career, Career › Job board). |
| Preparing / ready for departure | Route, distance, planned block time, pay, deadline and the pre-flight gate by name. When ready, only the remaining suggestions and when tracking starts. |
| In flight | The route line fills with progress; remaining nm and ETA in large type; score and grade, number of deductions, fpm and G of the last landing, pay, time to deadline (yellow when late); a phase timeline (taxi → parked) and the next phase. |
| Interrupted | Remaining and total distance, score, pay and deadline; a note that the flight resumes from the same place. |

When the panel is resized the whole layout scales with it (the font size is computed from the panel's inner size and
everything is in em). A wide, low panel switches to two columns; in a narrow panel the checklist becomes one column.

**Why a toolbar panel** (research summary):

- `SimConnect_Text` cannot be used in 2020 and does not exist in the 2024 reference.
- An EFB app only shows on the tablet and needs the SDK's `efb_api` package.
- A panel talking to a local HTTP server would open a new listening socket.
- A toolbar panel that reads `L:` variables needs no new port, no dependency and no injection, and the same package
  works in MSFS 2020 (SU12 and later) and MSFS 2024.

**Data path:**

- Over its open SimConnect connection, Modstead writes the `L:MODSTEAD_HUD_*` variables once a second
  (`AddToDataDefinition` + `SetDataOnSimObject`).
- The fields are listed in `hud.rs` → `FIELDS`. ICAO codes are sent as base-37 numbers. The pre-flight gate is a single
  number in `CHECK_LIST`: one base-4 digit per check in `CHECK_IDS` order (0 absent, 1 done, 2 missing, 3 missing
  suggestion).
- The panel (`ModsteadCareer.js`) only reads and displays. If `SEQ` stops increasing for 4 seconds it says "Modstead not
  connected". The first `SEQ` seen when the panel opens is only a baseline: an `L:` variable keeps its last value after
  Modstead closes.
- The language comes from `LANG`; the panel keeps the last known language in the sim's data store
  (`MODSTEAD_HUD_LANG`).
- If the sim rejects the `L:` definitions (older 2020 builds), writing stops for that session.

**Package** (`games/msfs/hud/package`):

- Embedded in the app. Install, update and remove it from Career → Dashboard → **In-sim panel**.
- Installing writes it to the mod library, generates `layout.json` and `manifest.json` on the spot and links the package
  into the sims' Community folders, the same way as any other mod. The sims must be closed.
- The panel definition is `InGamePanels/modstead-career-hud.spb` (source: `hud/source/modstead-career-hud.xml`).
- This `.spb` was generated once from the documented SPB format
  ([spb2xml24](https://github.com/vectorial287/spb2xml24) `docs/FORMAT.md`). It was checked two ways: the same encoder
  reproduced the `.spb` of an installed panel byte for byte, and our file decodes back with every field intact.
- If the definition changes, the `.spb` must be rebuilt in MSFS developer mode, with the SDK package tool or with the
  same encoder, and `HUD_VERSION` raised. In 0.2.0 the default size grew from 24×30 to 35×37 (at least 26×26); the
  unit is a percentage of the screen height (the sim's own Objectives panel is 36×22, METAR 45×15, ATC 48×55). The
  sim remembers the size you set; the new default shows on first open or after resetting the layout.

**The sim's panel frame** (MSFS 2024, `fs-base-ui/html_ui/Templates/ingameUi`): `ingame-ui` > a header
(`ingame-ui-header`: title, minimise, maximise, pin, close) + `.ingameUiContent` > `.ingameUiWrapper` > the panel's
own elements. The background of `ingame-ui` is `--backgroundColorContrastedPanel` (translucent light grey), the
header's is `--backgroundColorPanel`; the header text comes from `Name` in the `.spb` and is upper-cased. The panel
definition also supports `headerVisible` and `noBackground` (hiding the header also removes the close button; not
used).

**First real test (2024, 0.1.0) and fixes (0.2.0):**

- *Texts were empty:* the installed `ModsteadCareer.js` had a real line break inside a string (instead of `"\n"`). That
  syntax error stopped the whole script: the custom element was never defined and no `SimVar` was read. The dot, arrow
  and empty pill that did show were CSS only (the dot was green in CSS and did not reflect the connection). A test in
  `hud.rs` now checks strings and brackets. Field and method names also carry an `ms` prefix, so they cannot clash with
  built-in properties such as `HTMLElement.lang` (`this.lang = null` sets the attribute to "null") or with the sim's
  `UIElement` base class.
- *The dark background stopped halfway:* with `content-fit="false"` the two wrapper layers got no height and the root
  only grew as tall as its content, showing the grey background of `ingame-ui` below. Now `content-fit="true"` (the
  sim's `fittedContent` class) and the wrappers stretch; the background is on `ingame-ui` itself, with no margin.
- *A grey title bar reading "MODSTEAD CAREER":* the sim's buttons stay; the strip uses the same dark surface, and a
  status dot + MODSTEAD + Career/Kariyer replace the title text. Turkish texts are written in upper case: the sim's
  engine turns "i" into "I" with `text-transform`, not into "İ".
- The font is the sim's own Roboto (`font-family: "Roboto-Regular"`, weights 300/400/600/700); the "Roboto Mono" of the
  old CSS does not exist in the sim.

0.2.0 was tried in every state and four sizes on a test page built with the sim's own `common.css`, `ingameUi` template
CSS and Roboto fonts. A DOM and computed-style check inside the real sim (Coherent GT) has not been done yet; the
debugger is at `http://127.0.0.1:19999`, and the page is listed in `pagelist.json` as `ModsteadCareer.html` (its id
changes on every start).

**Updating without restarting the sim (0.3.0):** the sim reads panels and the package list only at start-up, and
Modstead never writes to the mod folder while the sim runs. So the panel itself is now a small loader
(`ModsteadLoader.js`): while Modstead is open it takes the code (`/hud/app.js`), the styles (`/hud/app.css`) and the
markup (`/hud/body.html`) from Modstead's local server; while Modstead is closed it uses the copy in the package. It
polls the version (`/hud/v`) every 5 seconds and reloads itself when it changes. Package updates still happen with the
sim closed; the card offers "Update when the sim closes".

### Local server

`career::hud_server` (added with the maintainer's approval): it listens only on `127.0.0.1`, on the first free port of
`47213`–`47215`. The endpoints and rules are in [`hud/menu/API.md`](hud/menu/API.md) (Turkish). In short:

- It gives the sim's pages their code, styles and career data: status, live data, job board, aircraft and their photos.
- It takes career actions from inside the sim: accepting a job, choosing an aircraft, starting and cancelling.
- `Host` must be `127.0.0.1` or `localhost`, as protection against DNS rebinding.
- CORS and `POST` are open only to the sim's `coui://` pages.
- There is no file or shell access; it never reads files from disk.

Aircraft photos are embedded at build time (`build.rs`); the family matching lives in
`ui/career/aircraft/families.json`, shared with the app's interface.

## Career page in the MSFS 2024 main menu

<p align="center">
  <img src="../../docs/screenshots/msfs-2024-main-menu-career-tile.png" alt="Modstead Career tile in the MSFS 2024 main menu next to the sim's own World Photographer, Career, Free Flight and Marketplace tiles, showing the active job LTBA to LTBU ready to start" width="488">
</p>

A *Modstead Career* tile in the MSFS 2024 main menu and a full-screen career page (`career::menu`, `hud/menu-package`,
interface in `hud/menu`). Tried in the real sim (1.9.21.0, fs-base-ui 0.1.10) in October 2026. The screenshots on this
page were taken in the sim with a sample career and the Turkish interface.

**How it gets in.** MSFS 2024 does not let Community packages replace the sim's own HTML files (`mainUI.html`
included). The root component of the main menu can be replaced, though: the MasterPage under `fs-base-ui/cookedcomps`
(`{7DA60FBA-EF32-48F2-974D-F8BEA35337A4}`, a one-line `.html` and a `.json`). On install, Modstead reads **the copy in
your own sim**, adds an invisible image before the last `</ui-resource-element>` and writes the result into the
package. The image's `onload` runs the loader (`/Modstead/ModsteadMenuLoader.js`) only in the main menu and only once.

- The code of the tile and the page comes from the local server (`/menu/app.js`, `/menu/app.css`). The loader asks for
  the version every 5 seconds; when Modstead updates, it removes the old code and loads the new one without a sim
  restart.
- With Modstead closed, nothing is added to the menu. The package is only linked into MSFS 2024.
- If another package already replaces the same component, nothing is installed and the card says why.

**Protection** (approved by the maintainer): a sim update that changes the component could break the menu with an old
copy.

- The package records the sim version, the fs-base-ui version and a digest of the component (`modstead-menu.json`). On
  the Microsoft Store the sim version is read from the package key in the registry (`stores::appx_versions`); on Steam
  from `buildid` in the `appmanifest`.
- While Modstead is open it checks every 30 seconds, whenever the sim is closed. If the component changed, the package
  is regenerated; if that is not possible, the package is removed and you are told.
- Known gap: if the sim updates while Modstead is closed and is then started without Modstead, the protection cannot
  run for that start.

**Mouse.** In the sim's menu, mouse events (mousedown, click) only reach elements that carry `data-input-group`; other
elements only get hover, and the click goes to the sim itself. The tile carries `generic-button`, the page
`inputLocker`.

**Keyboard and controller.** While the page is open, the sim's main menu also handles keys: ESC opens "Quit to
desktop?", Space and Q/E reach the tiles and tabs behind the page. So the page behaves like the sim's own pages:

- The sim's main menu module (`coui://html_UI/Global/lib.js`; `import()` returns the same live instance) exports the
  input stack (`UIInputStackListener`), `setInputBar`/`clearInputBar` and `InputBarParams`/`InputBarButtonParams`. The
  minified export names can change with every update, so they are found by class and function name.
- When the page opens, `KEY_MENU_SR_*` actions (back, select, directions, next/previous tab) are added to the input
  stack and our own buttons go into the sim's input bar: "ESC Close/Back · Select · Q E Switch tab". When it closes,
  both are removed and the sim's own bar ("ESC Quit to desktop · R Release notes") comes back.
- The context is `MAX` (the sim's transitions and `lockInput` use it too). In `DEFAULT`, the main menu re-registered
  its own actions when focus changed and took the keys back (Space opened the Marketplace tile behind the page). When a
  sim popup (the quit question, a notification) appears, the context is released and taken back once it closes.
- On the keyboard "select" is Space (⎵ in the sim's input bar); Enter never reaches the page in the menu.
- If the module cannot be found (an older sim), the page falls back to its own key bar and keyboard events.

**The page.** Tabs: Active job (photo; a departure–arrival strip with runway, length and elevation; payload, fuel,
altitude, customer, deadline and XP; on the right the aircraft, the start position and the preparation checks), Job
board, Aircraft choice and Pilot (level and XP, reputation, pilot rating, career summary, licences, recent flights).
The background is fully opaque; when it was translucent the sim's tiles showed through. The sim's font has no "→" (it
renders as a box): texts use "–" and the route arrow is an SVG.

<table>
  <tr>
    <td width="50%"><img src="../../docs/screenshots/msfs-2024-main-menu-career-jobs.png" alt="Job board tab of the Modstead career page in the MSFS 2024 main menu with the selected cargo job's details"><br><sub><b>Job board</b> inside the sim</sub></td>
    <td width="50%"><img src="../../docs/screenshots/msfs-2024-main-menu-career-pilot.png" alt="Pilot tab of the Modstead career page in the MSFS 2024 main menu with licences and recent flights"><br><sub><b>Pilot</b> tab inside the sim</sub></td>
  </tr>
</table>

**Testing.** Outside the sim: headless Edge and a page that imitates the sim's main menu with sample data. In the sim:
the Coherent debugger (`127.0.0.1:19999`, read-only inspection and live reload); real clicks and keys only with the sim
in front.

Rich text through CommBus (`SimConnect_CallCommBusEvent`) in 2024 is the next step for the toolbar panel.

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
  hud_server.rs   local server on 127.0.0.1 for the in-sim pages: code, career data, career actions
  menu.rs         MSFS 2024 main menu tile: package built from the sim's own component, update guard
  families.rs     aircraft families: real aircraft type and photo for a sim title
  journal.rs      career journal: detailed log of the sim link, flight starts and tracking
  flt.rs          parking spot choice, .FLT/.PLN writing (2020 and 2024 formats), SimBrief link
  model.rs        persistent data; mod.rs: Career (operations, end-of-flight settlement); commands.rs: msfs_career_* commands
games/msfs/ui/career/   Career page (Dashboard, Job board, Logbook, Licences, Hangar & finance); aircraft/ photos and families
games/msfs/tools/       airports.py (OurAirports → airports.tsv), map.py (Natural Earth → ui/career/map/)
games/msfs/hud/         toolbar panel package (package/) and its definition source (source/); main menu package
                        (menu-package/) and the main menu page (menu/, served by hud_server.rs)
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
`…/career/{aircraft.json, sim-airports.json, airports/<ICAO>.json, flights/<job>/, logs/career.log}`.

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
- **Aircraft photos:** [Wikimedia Commons](https://commons.wikimedia.org/), under each photo's own licence (CC BY,
  CC BY-SA or public domain); author, licence and source for every photo are in
  [`ui/career/aircraft/CREDITS.md`](ui/career/aircraft/CREDITS.md). They are not covered by the project's GPL-3.0.
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
- **FlightLoad** was tried in the real MSFS 2024 ([see above](#what-we-learned-in-the-real-msfs-2024-october-2026-sim-19210)).
  Parking and runway starts open from the main menu and from inside a flight; a runway start from the main menu
  (`FLIGHT_RUNWAY`) still awaits a user test. Manual mode stays as a fallback.
- **Engines** cannot be started from outside (2024 aircraft ignore the event); on a parking start you start them.
- **Fuel** is not written automatically (2024's modular fuel system is aircraft-specific); the planned value is shown.
- **Avionics:** the plan goes into the sim's GPS; whether it shows in the G1000/FMS has not been confirmed. If not, an
  in-sim page will send it through the Planned Route API.
- **The toolbar panel 0.3.0** has not been flown with in the real sim yet
  ([see above](#in-sim-toolbar-panel-msfs-2020-and-2024)). The main menu tile and page were tried.
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
Not for the career itself. The toolbar panel (MSFS 2020 and 2024) and the main menu tile (MSFS 2024) are optional and
are installed like any other mod, into the Community folder, from Career → Dashboard. Both only show what Modstead
serves on `127.0.0.1`; with Modstead closed the panel says so and the tile does not appear.

### Can I use the career without leaving the sim?
In MSFS 2024, yes, for the everyday loop: the main menu page lets you take a job, choose an aircraft and start the
flight, and the toolbar panel follows the flight. Modstead still has to be running on the PC. Buying aircraft,
licences, loans and the full logbook are in the Modstead app.

### Which aircraft can I fly?
Any aircraft installed in the sim. Modstead classifies it from the sim's values (or its name) into a class such as light
piston, single turboprop or narrowbody jet; you can change the class by hand. For aircraft with their own EFB (PMDG,
Fenix, iniBuilds, FBW) Modstead does not write the payload and shows the planned values instead.

---

Microsoft Flight Simulator is a trademark of Microsoft. OnAir Company, NeoFly, A Pilot's Life, Air Hauler, FSEconomy,
Volanta, smartCARS and SimBrief belong to their respective owners. Modstead is an independent project and is not
affiliated with or endorsed by any of them.
