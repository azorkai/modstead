import type { ThemeSetting } from "./types";

const KEY = "modstead.theme";

function resolve(pref: ThemeSetting): "dark" | "light" {
  if (pref !== "system") return pref;
  return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

let current: ThemeSetting = "system";

/** Temayı uygular ve ilk boyamada doğru görünsün diye yerelde de hatırlar. */
export function applyTheme(pref: ThemeSetting) {
  current = pref;
  document.documentElement.dataset.theme = resolve(pref);
  try {
    localStorage.setItem(KEY, pref);
  } catch {
    /* depolama kapalı olabilir */
  }
}

export function applyReduceMotion(on: boolean) {
  document.documentElement.dataset.reduceMotion = on ? "true" : "false";
}

/** Açılışta, ayarlar gelmeden önce çağrılır. */
export function initTheme() {
  let saved: ThemeSetting = "system";
  try {
    const v = localStorage.getItem(KEY);
    if (v === "dark" || v === "light" || v === "system") saved = v;
  } catch {
    /* depolama kapalı olabilir */
  }
  applyTheme(saved);
  window.matchMedia?.("(prefers-color-scheme: light)").addEventListener("change", () => {
    if (current === "system") applyTheme("system");
  });
}
