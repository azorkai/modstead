// Arayüz dili. Kabuk sözlükleri src/i18n/{tr,en}.ts; oyunlar kendi sözlüklerini `useDict` ile kullanır.
// Türkçe asıl kaynaktır; İngilizce aynı tipe bağlıdır, eksik anahtar derleme hatası verir.

import { create } from "zustand";
import { en } from "@/i18n/en";
import { tr, type Dict } from "@/i18n/tr";

export type Lang = "tr" | "en";

const dicts: Record<Lang, Dict> = { tr, en };

function guess(): Lang {
  return typeof navigator !== "undefined" && navigator.language?.toLowerCase().startsWith("tr") ? "tr" : "en";
}

export const useLang = create<{ lang: Lang; setLang: (l: Lang) => void }>((set) => ({
  lang: guess(),
  setLang: (lang) => {
    document.documentElement.lang = lang;
    set({ lang });
  },
}));

export function currentLang(): Lang {
  return useLang.getState().lang;
}

export function useT(): Dict {
  return dicts[useLang((s) => s.lang)];
}

/** Bileşen dışı kullanım (bildirimler, olay işleyicileri). */
export function t(): Dict {
  return dicts[currentLang()];
}

/** Oyun paketlerinin sözlükleri: `const d = useDict({ tr: trDict, en: enDict })`. */
export function useDict<T>(d: { tr: T; en: T }): T {
  return d[useLang((s) => s.lang)];
}
