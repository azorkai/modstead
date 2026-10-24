// MSFS verisi: React Query ile önbelleklenir; arka uç `modstead://game-changed` (game: "msfs") yayınca tazelenir.

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { EVENTS, errorMessage, listen } from "@/lib/ipc";
import { keys as shellKeys, queryClient, upsertJob } from "@/lib/queries";
import { api } from "./api";
import type { OpReport, ScanResult } from "./types";

export const mk = {
  all: ["msfs"] as const,
  snapshot: ["msfs", "snapshot"] as const,
  settings: ["msfs", "settings"] as const,
  conflicts: ["msfs", "conflicts"] as const,
  startup: ["msfs", "startup"] as const,
  profiles: ["msfs", "profiles"] as const,
  catalog: ["msfs", "catalog"] as const,
  suggestion: ["msfs", "suggestion"] as const,
};

/** Sayfalar bir kez çağırır: oyun değişince (kurulum bitti, bağlantı değişti) MSFS verisi tazelenir. */
export function useMsfsEvents() {
  useEffect(
    () =>
      listen<{ game: string }>(EVENTS.gameChanged, (p) => {
        if (p.game === "msfs") void queryClient.invalidateQueries({ queryKey: mk.all });
      }),
    [],
  );
}

export function useSnapshot() {
  useMsfsEvents();
  return useQuery({ queryKey: mk.snapshot, queryFn: api.snapshot, staleTime: 60_000 });
}

export function useMsfsSettings() {
  return useQuery({ queryKey: mk.settings, queryFn: api.settings, staleTime: Infinity });
}

export function useConflicts(enabled = true) {
  return useQuery({ queryKey: mk.conflicts, queryFn: api.conflicts, enabled, staleTime: 60_000 });
}

export function useStartupPrograms() {
  return useQuery({ queryKey: mk.startup, queryFn: api.startupPrograms, staleTime: 60_000 });
}

export function useProfiles() {
  return useQuery({ queryKey: mk.profiles, queryFn: api.profiles, staleTime: Infinity });
}

export function useCatalog() {
  return useQuery({ queryKey: mk.catalog, queryFn: () => api.catalog(false), staleTime: 10 * 60_000, retry: 0 });
}

/** Diski yeniden tarar ve önbelleği yeniler. */
export async function rescan(): Promise<ScanResult | null> {
  try {
    const r = await api.scan();
    queryClient.setQueryData(mk.snapshot, r);
    void queryClient.invalidateQueries({ queryKey: mk.conflicts });
    void queryClient.invalidateQueries({ queryKey: shellKeys.games });
    return r;
  } catch (e) {
    toast.error(errorMessage(e));
    return null;
  }
}

/** Değişiklikten sonra: MSFS verisi + ana sayfa kartı. */
export function invalidateAll() {
  void queryClient.invalidateQueries({ queryKey: mk.all });
  void queryClient.invalidateQueries({ queryKey: shellKeys.games });
}

/** Toplu işlem sonucunu bildirir; başarısızları ayrıntıyla gösterir. */
export function reportOp(rep: OpReport, okText: (n: number) => string, failTitle: string) {
  if (rep.failed.length === 0) {
    if (rep.ok.length > 0) toast.success(okText(rep.ok.length));
  } else {
    toast.error(failTitle, { description: rep.failed.map(([, e]) => e).filter((v, i, a) => a.indexOf(v) === i).slice(0, 3).join(" · ") });
  }
  invalidateAll();
}

export { upsertJob };
