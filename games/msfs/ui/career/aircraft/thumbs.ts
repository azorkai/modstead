// Mod uçaklarının paketlerindeki küçük resimler: arka uçtan ham bayt (`msfs_career_aircraft_thumb`) → blob adresi
// (CSP: img-src blob:). Adresler oturum boyunca önbellekte kalır; görsel yoksa ya da okunamazsa `null`.

import { useEffect, useState } from "react";
import { isTauri } from "@/lib/ipc";
import { careerApi } from "../api";

const cache = new Map<string, Promise<string | null>>();

/** Önizleme kipinde örnek görseller: başlık (ya da "başlık|boya") → adres (`mocks`). */
export const previewAircraftThumbs = new Map<string, string>();

function load(title: string, livery: string): Promise<string | null> {
  const key = `${title}|${livery}`;
  let p = cache.get(key);
  if (!p) {
    p = isTauri
      ? careerApi
          .aircraftThumb(title, livery || null)
          .then((buf) => URL.createObjectURL(new Blob([buf])))
          .catch(() => null)
      : Promise.resolve(previewAircraftThumbs.get(key) ?? previewAircraftThumbs.get(`${title}|`) ?? null);
    cache.set(key, p);
  }
  return p;
}

/** `title` null ise (paketin görseli yok) hemen `null`; yüklenene kadar `undefined`. */
export function useAircraftThumb(title: string | null, livery = ""): string | null | undefined {
  const key = title ? `${title}|${livery}` : "";
  const [state, setState] = useState<{ key: string; url: string | null | undefined }>({ key, url: title ? undefined : null });
  useEffect(() => {
    if (!title) {
      setState({ key: "", url: null });
      return;
    }
    let alive = true;
    void load(title, livery).then((url) => alive && setState({ key: `${title}|${livery}`, url }));
    return () => {
      alive = false;
    };
  }, [title, livery]);
  if (!title) return null;
  return state.key === key ? state.url : undefined;
}
