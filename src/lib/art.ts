// Oyunların kütüphane görselleri (Steam'in yerel önbelleğinden; bkz. src-tauri `art://` protokolü).
// Görsel yoksa (ör. Steam dışı kurulum) `null` döner; bileşen oyunun SVG görseline düşer.

import { useEffect, useState } from "react";
import { isTauri } from "./ipc";

export type ArtKind = "hero" | "logo" | "header" | "portrait" | "icon";

export function artUrl(game: string, kind: ArtKind): string {
  // Önizleme kipinde aynı görselleri Vite geliştirme sunucusu verir (vite.config.ts → steamArt).
  return isTauri ? `http://art.localhost/${game}/${kind}` : `/__art/${game}/${kind}`;
}

const probes = new Map<string, Promise<string | null>>();

function probe(url: string): Promise<string | null> {
  let p = probes.get(url);
  if (!p) {
    p = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(url);
      img.onerror = () => resolve(null);
      img.src = url;
    });
    probes.set(url, p);
  }
  return p;
}

/** Görsel adresi; yüklenene kadar `undefined`, yoksa `null`. */
export function useArt(game: string, kind: ArtKind): string | null | undefined {
  const url = artUrl(game, kind);
  const [state, setState] = useState<{ url: string; value: string | null | undefined }>({ url, value: undefined });
  useEffect(() => {
    let alive = true;
    void probe(url).then((value) => alive && setState({ url, value }));
    return () => {
      alive = false;
    };
  }, [url]);
  return state.url === url ? state.value : undefined;
}
