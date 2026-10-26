// Uçak aileleri: simdeki başlıktan gerçek uçak tipine ve fotoğrafına. MSFS 2024'ün kendi uçakları şifreli akış
// paketlerinde durur (küçük resimleri okunamaz); bu yüzden her aile için açık lisanslı bir fotoğraf gömülüdür
// (photos/, kaynak ve lisanslar credits.ts). Sıra önemlidir: özel olan genelden önce gelir (Beluga > A330).

import type { AircraftClass } from "../types";
import { credits, type PhotoCredit } from "./credits";
import familyList from "./families.json";

export interface Family {
  id: string;
  /** Gerçek tip adı (üretici + model). */
  name: string;
  match: RegExp;
}

// Liste `families.json`'da: Modstead'in yerel sunucusu da (simin içindeki menü için) aynı dosyayı okur.
// Desenler büyük/küçük harf duyarsızdır; Rust'ın regex'iyle de çalışsın diye ileriye/geriye bakma yok.
export const FAMILIES: Family[] = (familyList as { id: string; name: string; match: string }[]).map((f) => ({ id: f.id, name: f.name, match: new RegExp(f.match, "i") }));

const photos = import.meta.glob<string>("./photos/*.jpg", { eager: true, query: "?url", import: "default" });
const photoOf = (id: string) => photos[`./photos/${id}.jpg`];

/** Sınıf başına yedek çizim (ailesi bilinmeyen ya da fotoğrafı olmayan uçaklar için). */
const art = import.meta.glob<string>("../art/*.svg", { eager: true, query: "?url", import: "default" });
const CLASS_ART: Record<AircraftClass, string> = {
  light_piston: "ppl",
  piston_twin: "me",
  turboprop_single: "cpl",
  turboprop_twin: "cpl",
  regional_turboprop: "ir",
  bizjet: "jet",
  regional_jet: "narrow",
  narrowbody: "narrow",
  widebody: "wide",
  helicopter: "heli",
};

export function familyOf(title: string): Family | undefined {
  return FAMILIES.find((f) => f.match.test(title));
}

export interface AircraftVisual {
  src: string | undefined;
  /** Gerçek fotoğraf mı, sınıf çizimi mi. */
  photo: boolean;
  family?: Family;
  credit?: PhotoCredit;
}

const cache = new Map<string, AircraftVisual>();

export function aircraftVisual(title: string, cls: AircraftClass | null | undefined): AircraftVisual {
  const key = `${title}|${cls ?? ""}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const family = title ? familyOf(title) : undefined;
  const src = family && photoOf(family.id);
  const v: AircraftVisual = src
    ? { src, photo: true, family, credit: credits[family.id] }
    : { src: cls ? art[`../art/${CLASS_ART[cls]}.svg`] : undefined, photo: false, family };
  cache.set(key, v);
  return v;
}
