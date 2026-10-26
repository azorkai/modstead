#!/usr/bin/env node
// Sürüm denetimi: package.json, package-lock.json, Cargo.toml (çalışma alanı ve üyeleri), Cargo.lock ve
// src-tauri/tauri.conf.json aynı sürümü taşımalı; etiket verildiyse (`v0.1.0`) o da bu sürüme eşit olmalı.
// Sürüm iş akışı (.github/workflows/release.yml) derlemeden önce bunu çalıştırır; etiketlemeden önce elle de
// çalıştırılabilir (bkz. docs/RELEASING.md):
//
//   node scripts/release-check.mjs [v<sürüm>]
//
// GitHub Actions içinde `version` ve `prerelease` çıktılarını GITHUB_OUTPUT'a yazar. Bağımlılığı yoktur.

import { appendFileSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CI = process.env.GITHUB_ACTIONS === "true";
const read = (path) => readFileSync(join(ROOT, path), "utf8");
const unquote = (value) => value?.replace(/^"(.*)"$/, "$1");

// İlk satır GitHub'da hata notu olarak da görünür; ayrıntı (tablo, öneri) yalnızca günlükte.
function fail([first, ...rest]) {
  console.error(CI ? `::error::${first}` : first);
  for (const line of rest) console.error(line);
  process.exit(1);
}

// TOML'un küçük bir alt kümesi yeter: tek köşeli parantezli bir bölümün `anahtar = değer` satırları.
function tomlSection(text, name) {
  const out = {};
  let inside = false;
  for (const line of text.split(/\r?\n/)) {
    const header = line.match(/^\s*\[([^\[\]]+)\]\s*(#.*)?$/);
    if (header) {
      inside = header[1].trim() === name;
      continue;
    }
    if (/^\s*\[\[/.test(line)) inside = false;
    if (!inside) continue;
    const kv = line.match(/^\s*([A-Za-z0-9_.-]+)\s*=\s*(.+?)\s*(#.*)?$/);
    if (kv) out[kv[1]] = kv[2];
  }
  return out;
}

const found = []; // { file, version }

const pkg = JSON.parse(read("package.json"));
found.push({ file: "package.json", version: pkg.version });

const lock = JSON.parse(read("package-lock.json"));
found.push({ file: "package-lock.json (version)", version: lock.version });
found.push({ file: 'package-lock.json (packages[""].version)', version: lock.packages?.[""]?.version });

const cargo = read("Cargo.toml");
const workspaceVersion = unquote(tomlSection(cargo, "workspace.package").version);
found.push({ file: "Cargo.toml ([workspace.package] version)", version: workspaceVersion });

// Çalışma alanı üyeleri sürümü ya kalıtır (`version.workspace = true`) ya da kendisi yazar.
const members = [...(cargo.match(/^\s*members\s*=\s*\[([\s\S]*?)\]/m)?.[1] ?? "").matchAll(/"([^"]+)"/g)].map((m) => m[1]);
if (members.length === 0) fail(["Cargo.toml: no [workspace] members found."]);
for (const member of members) {
  const section = tomlSection(read(`${member}/Cargo.toml`), "package");
  if (section["version.workspace"] === "true") continue;
  found.push({ file: `${member}/Cargo.toml ([package] version)`, version: unquote(section.version) });
}

// Cargo.lock: kaynağı (`source = …`) olmayan paketler çalışma alanının kendi paketleridir.
for (const block of read("Cargo.lock").split(/^\[\[package\]\]\s*$/m).slice(1)) {
  if (/^source\s*=/m.test(block)) continue;
  const name = unquote(block.match(/^name\s*=\s*(.+)$/m)?.[1]?.trim());
  const version = unquote(block.match(/^version\s*=\s*(.+)$/m)?.[1]?.trim());
  found.push({ file: `Cargo.lock (${name})`, version });
}

const tauri = JSON.parse(read("src-tauri/tauri.conf.json"));
found.push({ file: "src-tauri/tauri.conf.json (version)", version: tauri.version });

const width = Math.max(...found.map((f) => f.file.length));
const table = found.map((f) => `  ${f.file.padEnd(width)}  ${f.version ?? "(missing)"}`);
const versions = new Set(found.map((f) => f.version));
if (versions.size !== 1 || !found[0].version) {
  fail([
    "Version mismatch: every file must carry the same version.",
    ...table,
    "Bump them together (see docs/RELEASING.md), then run this check again.",
  ]);
}

const version = found[0].version;
// SemVer: NSIS ve Tauri bunu bekler; kısa çizgili sürümler (`0.2.0-beta.1`) ön sürüm olarak yayımlanır.
if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/.test(version)) {
  fail([`Version "${version}" is not a valid semantic version (for example 0.2.0 or 0.2.0-beta.1).`]);
}

const tagArg = process.argv[2]?.replace(/^refs\/tags\//, "");
if (tagArg !== undefined && tagArg !== `v${version}`) {
  fail([
    `Tag "${tagArg}" does not match the version in the files (${version}); the tag must be "v${version}".`,
    "Either bump the version to match the tag (see docs/RELEASING.md) or delete the tag and push the right one.",
  ]);
}

const prerelease = version.includes("-");
console.log(`Version ${version} is consistent across ${found.length} entries:`);
console.log(table.join("\n"));
if (tagArg !== undefined) console.log(`Tag ${tagArg} matches.`);
if (prerelease) console.log("This is a pre-release version.");

if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `version=${version}\nprerelease=${prerelease}\n`);
}
