# Modstead — Safe Mod Manager for MSFS, Bannerlord, Stardew Valley and Cities: Skylines II

**English** · [Türkçe](README.tr.md)

**Modstead** is a free, open-source mod manager for Windows that manages mods for
**Microsoft Flight Simulator 2020 & 2024**, **Mount & Blade II: Bannerlord**, **Stardew Valley (SMAPI)** and
**Cities: Skylines II** in one desktop app. Every download and archive goes through a security pipeline (allowlisted
sources, hash verification, safe extraction, content checks and a Microsoft Defender scan), and nothing is installed
until you review and approve it.

Built with [Tauri 2](https://tauri.app) (Rust) and React 19. Licensed under GPL-3.0.

> **Status:** early development (v0.1.0). Windows 10/11 only. There are no prebuilt releases yet; build from source
> (see [Building from source](#building-from-source)).

## Supported games

| Game | What Modstead does |
|---|---|
| **Microsoft Flight Simulator 2020 & 2024** | One mod library shared by both sims; mods are enabled per sim with junctions into the Community folder (no admin rights needed). Profiles, file and ICAO conflict detection, `exe.xml` add-on management, readiness checks (Content.xml, path length), a GitHub catalog (FlyByWire, Headwind…) and an in-app mod browser. |
| **Mount & Blade II: Bannerlord** | Module load order, `SubModule.xml` validation and fixes, version rules, direct launch with `_MODULES_`, `LauncherData.xml`, Steam Workshop modules, Nexus Mods and GitHub discovery, updates, profiles and backups. |
| **Stardew Valley (SMAPI)** | SMAPI install from the verified GitHub release (SHA-256; the installer is never executed), mod scan with SMAPI rules, health checks (missing or outdated dependencies, duplicate IDs, compatibility), smapi.io update checks, Nexus Mods search, `config.json` editor, profiles, save backups and SMAPI log summaries. |
| **Cities: Skylines II** | Paradox Mods catalog browsing (search, tags, requirements, changelogs), local mods, save games with in-game previews, health score with one-click fixes, crash and log analysis, and detection of known malicious mod versions. |

Games are detected automatically on **Steam, GOG, Epic Games and Xbox / Microsoft Store**.

## Features

- **One app for every game:** each game keeps its own pages, accent colour and typography inside the same shell.
  The home page shows the status of all games, recent activity and security events.
- **Security pipeline for every install:** downloads come only from allowlisted HTTPS hosts and are verified against the
  source's hash (GitHub SHA-256, Nexus Mods MD5). Archives are extracted into quarantine with protection against
  zip-slip, alternate data streams, device names, symlinks and zip bombs, checked against the game's content rules,
  scanned by Microsoft Defender and optionally looked up on VirusTotal by hash. You get a verdict and a risk score
  before anything is installed.
- **Installers are never run:** `.exe` and `.msi` files are reported, never executed.
- **Nexus Mods "Mod Manager Download":** a single `nxm://` handler routes each link to the right game; the previous
  handler is saved.
- **One account store:** Nexus Mods, VirusTotal and GitHub keys are stored once, in Windows Credential Manager,
  never in plain files.
- **Game-aware safety:** Modstead refuses to write into a game's mod folder while the game is running.
- Turkish and English interface, dark and light themes, command palette (`Ctrl+K`), drag-and-drop archive install.

## How the security pipeline works

```
resolve → download (allowlist, size limit) → verify hash → extract into quarantine
       → content check (game rules) → Microsoft Defender → optional VirusTotal → review dialog → install
```

The interface has no file system, shell or network permissions and runs under a strict Content Security Policy.
Every action goes through a validating Rust command, and paths coming from the interface are locked to their
expected root folder. To report a vulnerability, see [SECURITY.md](SECURITY.md).

## FAQ

### What is Modstead?
Modstead is a Windows desktop mod manager that combines three earlier single-game tools (Hangar for MSFS, Otağ for
Bannerlord and Vadi for Stardew Valley) and adds Cities: Skylines II, with one shared security pipeline.

### Is Modstead free?
Yes. Modstead is free and open source under the GNU General Public License v3.0.

### Is it safe to install mods with Modstead?
Every archive is hash-verified, safely extracted into quarantine, checked and scanned by Microsoft Defender before you
see the review dialog. Nothing is installed without your approval and installers are never executed. No scanner can
guarantee a mod is harmless, so Modstead shows a risk score instead of a blind "safe" label.

### Does Modstead work with Nexus Mods?
Yes. It registers as the Nexus Mods "Mod Manager Download" (`nxm://`) handler for all supported games. Premium
accounts can download directly in the app; free accounts download through the Nexus Mods website as Nexus requires.

### Is Modstead an alternative to Vortex or Mod Organizer 2?
For the four supported games, yes. Modstead focuses on game-specific features (MSFS sim linking, Bannerlord load
order, SMAPI health checks, Cities: Skylines II save previews) and a stricter install review rather than supporting
every game.

### Does it need administrator rights?
No. Modstead installs per user, MSFS mods are enabled with junctions that need no elevation, and the `nxm://` handler
is registered under the current user.

### Which platforms are supported?
Windows 10 and 11 (x64) with Microsoft Edge WebView2.

## Building from source

Requirements: Node.js 22+, Rust 1.85+ (MSVC toolchain), Microsoft Edge WebView2.

```bash
npm install                     # exact versions, install scripts disabled (.npmrc)
npm run dev                     # interface only, in the browser with sample data: http://127.0.0.1:1420
npm run app:dev                 # full desktop app (development)
npm run app:build               # NSIS installer
npm run typecheck && npm run build
cargo test --workspace          # Rust tests
```

Preview URL parameters: `?view=home|settings|game:<game>[:<page>]`, `&theme=dark|light`, `&lang=en`.

## Project structure

```
crates/core/        shared core (independent of Tauri): security pipeline, downloads, archives, jobs, Nexus/GitHub, game contract
games/<game>/src    the game's Rust crate (game-<game>): Game trait + <game>_ commands
games/<game>/ui     the game's interface module: pages, icon, artwork, preview data
src-tauri/          Tauri shell: plugins, game registry, shell commands, command routing
src/                interface shell, component kit, i18n dictionaries, styles
docs/               architecture (MIMARI.md) and design language (TASARIM.md), in Turkish
```

Game IDs: `msfs`, `bannerlord`, `stardew`, `cities2`. Settings and game data live in `%APPDATA%\app.modstead`;
cache, logs and quarantine in `%LOCALAPPDATA%\app.modstead`.

## License

[GPL-3.0](LICENSE). Modstead is an independent project and is not affiliated with or endorsed by Microsoft, Asobo
Studio, TaleWorlds Entertainment, ConcernedApe, Paradox Interactive, Colossal Order or Nexus Mods. Game names and
trademarks belong to their owners.
