// Bannerlord arayüz dili. Dil kabuktan gelir (`@/lib/i18n`); sözlükler bu oyunundur (Otağ'dan).
//
//   const t = useT();                 // bileşen içinde; dil değişince yeniden çizer
//   t.library.ready                   // düz metin
//   t.common.modsEnabled(3)           // sayı/ad içeren metin
//   rich(t.settings.x, { a: <b/> })   // metnin içine JSX
//   getT().store.saved                // React dışında (store, olay dinleyicileri)
//
// Yeni anahtar: önce tr.ts'e (asıl kaynak), sonra en.ts'e; en.ts eksikse tsc hata verir.

import { createElement, Fragment, type ReactNode } from "react";
import { currentLang, useLang as useShellLang, type Lang } from "@/lib/i18n";
import { en } from "./en";
import { tr, type Messages } from "./tr";

export type { Lang, Messages };

const dictionaries: Record<Lang, Messages> = { tr, en };
const localeTags: Record<Lang, string> = { tr: "tr-TR", en: "en-US" };

export function useLang(): Lang {
  return useShellLang((s) => s.lang);
}

export function useT(): Messages {
  return dictionaries[useLang()];
}

export function useLocale(): string {
  return localeTags[useLang()];
}

export function getT(): Messages {
  return dictionaries[currentLang()];
}

export function currentLocale(): string {
  return localeTags[currentLang()];
}

/** "{ad}" yer tutucularını React düğümleriyle doldurur. */
export function rich(template: string, slots: Record<string, ReactNode>): ReactNode {
  const parts = template.split(/\{(\w+)\}/);
  return createElement(Fragment, null, ...parts.map((p, i) => (i % 2 === 1 ? (slots[p] ?? `{${p}}`) : p)));
}
