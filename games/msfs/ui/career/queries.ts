// Kariyer verisi: React Query ile önbelleklenir. Arka uç `msfs://career` yayınca tazelenir; canlı durum
// `msfs://career-live` olayıyla (≈1 Hz) gelir, olay gelmezse (önizleme kipi) yoklanır.

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { isTauri, listen } from "@/lib/ipc";
import { queryClient } from "@/lib/queries";
import { careerApi } from "./api";
import type { Difficulty, Live } from "./types";

export const ck = {
  all: ["msfs", "career"] as const,
  state: ["msfs", "career", "state"] as const,
  board: ["msfs", "career", "board"] as const,
  logbook: ["msfs", "career", "logbook"] as const,
  aircraft: ["msfs", "career", "aircraft"] as const,
  ledger: ["msfs", "career", "ledger"] as const,
  live: ["msfs", "career", "live"] as const,
  weather: ["msfs", "career", "weather"] as const,
  track: ["msfs", "career", "track"] as const,
  deck: ["msfs", "career", "deck"] as const,
  tiles: ["msfs", "career", "tiles"] as const,
  paths: (difficulty: string) => ["msfs", "career", "paths", difficulty] as const,
  flight: (id: string) => ["msfs", "career", "flight", id] as const,
};

export const CAREER_EVENTS = { changed: "msfs://career", live: "msfs://career-live" } as const;

/** Kariyer sayfası bir kez çağırır. */
export function useCareerEvents() {
  useEffect(() => {
    const a = listen(CAREER_EVENTS.changed, () => {
      // Canlı durum kendi olayıyla gelir; geri kalan her şey tazelenir.
      void queryClient.invalidateQueries({ queryKey: ck.all, predicate: (q) => q.queryKey[2] !== "live" });
    });
    const b = listen<Live>(CAREER_EVENTS.live, (live) => queryClient.setQueryData(ck.live, live));
    return () => {
      a();
      b();
    };
  }, []);
}

export function useCareer() {
  return useQuery({ queryKey: ck.state, queryFn: careerApi.state, staleTime: 30_000 });
}

export function useBoard(enabled: boolean) {
  return useQuery({ queryKey: ck.board, queryFn: careerApi.board, enabled, staleTime: 60_000 });
}

export function useLogbook() {
  return useQuery({ queryKey: ck.logbook, queryFn: careerApi.logbook, staleTime: 60_000 });
}

export function useAircraftOptions(enabled = true) {
  return useQuery({ queryKey: ck.aircraft, queryFn: careerApi.aircraft, enabled, staleTime: 60_000 });
}

export function useLedger() {
  return useQuery({ queryKey: ck.ledger, queryFn: careerApi.ledger, staleTime: 60_000 });
}

export function useFlight(id: string | null) {
  return useQuery({ queryKey: ck.flight(id ?? ""), queryFn: () => careerApi.flight(id!), enabled: !!id, staleTime: Infinity });
}

/** Gerçek hava: panodaki varışlar ve aktif iş (30 dakika önbellek; sunucuya en çok 30 dakikada bir). */
export function useWeather(enabled = true) {
  return useQuery({ queryKey: ck.weather, queryFn: careerApi.weather, enabled, staleTime: 10 * 60_000, refetchInterval: 15 * 60_000 });
}

export function useLive() {
  // Olay ≈1 sn'de bir gelir; yoklama yalnızca yedek (sim kapalıyken olay seyrekleşir).
  return useQuery({ queryKey: ck.live, queryFn: careerApi.live, refetchInterval: isTauri ? 5000 : 2000, staleTime: 1000 });
}

/** Aktif uçuşun izi (uçuş ekranı ≈10 sn'de bir tazeler; aradaki konumları kendisi ekler). */
export function useTrack(enabled: boolean, interval = 10_000) {
  return useQuery({ queryKey: ck.track, queryFn: careerApi.track, enabled, refetchInterval: interval, staleTime: interval / 2 });
}

/** Uçuş ekranının adresi, yerel ağ durumu ve QR. Pencere açık mı bilgisi için ara ara yoklanır. */
export function useDeckInfo() {
  return useQuery({ queryKey: ck.deck, queryFn: careerApi.deckInfo, staleTime: 5_000, refetchInterval: 15_000 });
}

/** Kariyer yollarının kataloğu (durağan; zorluk değişince yeniden). Eski uygulamada komut yoksa hata döner. */
export function usePaths(difficulty: Difficulty | null) {
  return useQuery({ queryKey: ck.paths(difficulty ?? "pilot"), queryFn: () => careerApi.paths(difficulty ?? undefined), staleTime: Infinity, retry: false });
}

export function invalidateCareer() {
  void queryClient.invalidateQueries({ queryKey: ck.all });
}
