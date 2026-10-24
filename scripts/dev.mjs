#!/usr/bin/env node
// Aynı anda birden fazla geliştirme örneği çalıştırabilmek için ayrı yuva (slot) ile `tauri dev`.
//
//   node scripts/dev.mjs <yuva> [--preview]
//
// Yuvalar: platform, msfs, bannerlord, stardew, cities2. Her yuvanın kendi Vite portu, Cargo hedef klasörü,
// WebView2 hata ayıklama portu ve veri klasörü vardır; birbirlerinin derlemesini kilitlemez,
// tek örnek kilidine takılmaz. --preview yalnızca tarayıcı önizlemesini (örnek verilerle) açar.

import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Derleme kökü: yerel .cargo/config.toml'daki target-dir'in üst klasörü, yoksa depo kökü.
function buildRoot() {
  const cfg = join(ROOT, ".cargo", "config.toml");
  const m = existsSync(cfg) ? readFileSync(cfg, "utf8").match(/^target-dir\s*=\s*"([^"]+)"/m) : null;
  return m ? dirname(m[1]) : ROOT;
}
const BUILD = buildRoot();

const SLOTS = {
  platform: { port: 1420, cdp: 9520 },
  msfs: { port: 1421, cdp: 9521 },
  bannerlord: { port: 1422, cdp: 9522 },
  stardew: { port: 1423, cdp: 9523 },
  cities2: { port: 1424, cdp: 9524 },
};

const [slotName, flag] = process.argv.slice(2);
const slot = SLOTS[slotName];
if (!slot) {
  console.error(`Kullanım: node scripts/dev.mjs <${Object.keys(SLOTS).join("|")}> [--preview]`);
  process.exit(1);
}

const env = {
  ...process.env,
  MODSTEAD_PORT: String(slot.port),
  CARGO_TARGET_DIR: join(BUILD, slotName === "platform" ? "target" : `target-${slotName}`),
  MODSTEAD_DEV_INSTANCE: slotName === "platform" ? "" : slotName,
  // WebView2 hata ayıklama portu yuvaya özeldir (952x); yaygın 9222 gibi portlarla çakışmaz.
  WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${slot.cdp}`,
};

const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const args =
  flag === "--preview"
    ? ["vite", "--port", String(slot.port)]
    : [
        "tauri",
        "dev",
        "--config",
        JSON.stringify({
          build: { devUrl: `http://127.0.0.1:${slot.port}`, beforeDevCommand: `npx vite --port ${slot.port}` },
        }),
      ];

console.log(`▶ ${slotName}: http://127.0.0.1:${slot.port}  ·  CDP ${slot.cdp}  ·  hedef ${env.CARGO_TARGET_DIR}`);
const child = spawn(npx, args, { env, stdio: "inherit", shell: process.platform === "win32", windowsHide: true });
child.on("exit", (code) => process.exit(code ?? 0));
