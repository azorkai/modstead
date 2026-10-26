// Arka uç verisi: React Query ile önbelleklenir, olaylarla tazelenir (events.ts).

import { QueryClient, useQueries, useQuery } from "@tanstack/react-query";
import { invoke } from "./ipc";
import type {
  AppInfo,
  GameId,
  GameStatus,
  GameStatusEntry,
  InstallCandidate,
  JobSnapshot,
  NexusStatus,
  NxmStatus,
  SecretsStatus,
  Settings,
  SettingsPatch,
  UpdateStatus,
} from "./types";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 },
  },
});

export const keys = {
  appInfo: ["app-info"] as const,
  settings: ["settings"] as const,
  games: ["games-status"] as const,
  detect: (id: GameId) => ["detect", id] as const,
  nexus: ["nexus"] as const,
  secrets: ["secrets"] as const,
  nxm: ["nxm-status"] as const,
  jobs: ["jobs"] as const,
  update: ["update"] as const,
};

export function useAppInfo() {
  return useQuery({ queryKey: keys.appInfo, queryFn: () => invoke<AppInfo>("app_info"), staleTime: Infinity });
}

export function useSettings() {
  return useQuery({ queryKey: keys.settings, queryFn: () => invoke<Settings>("settings_get"), staleTime: Infinity });
}

export async function updateSettings(patch: SettingsPatch): Promise<Settings> {
  const s = await invoke<Settings>("settings_update", { patch });
  queryClient.setQueryData(keys.settings, s);
  return s;
}

/** Tüm oyunların durumu; ana sayfa ve kenar çubuğu bunu kullanır. */
export function useGamesStatus() {
  return useQuery({
    queryKey: keys.games,
    queryFn: () => invoke<GameStatusEntry[]>("games_status"),
    staleTime: 60_000,
    refetchInterval: 120_000,
  });
}

export function useGameStatus(id: GameId): GameStatus | undefined {
  const { data } = useGamesStatus();
  return data?.find((g) => g.id === id)?.status;
}

function detectQuery(id: GameId) {
  return { queryKey: keys.detect(id), queryFn: () => invoke<InstallCandidate[]>("game_detect", { id }), staleTime: Infinity };
}

export function useDetect(id: GameId, enabled = true) {
  return useQuery({ ...detectQuery(id), enabled });
}

/** Birden çok oyunun kurulum taraması; hepsi aynı anda başlar (ilk kurulum). Sonuç sırası `ids` ile aynı. */
export function useDetectMany(ids: readonly GameId[]) {
  return useQueries({ queries: ids.map(detectQuery) });
}

export function useNexus() {
  return useQuery({ queryKey: keys.nexus, queryFn: () => invoke<NexusStatus>("nexus_status", { verify: false }), staleTime: 5 * 60_000 });
}

export function useSecrets() {
  return useQuery({ queryKey: keys.secrets, queryFn: () => invoke<SecretsStatus>("secrets_status") });
}

export function useNxmStatus() {
  return useQuery({ queryKey: keys.nxm, queryFn: () => invoke<NxmStatus>("nxm_status") });
}

export function useJobs() {
  return useQuery({ queryKey: keys.jobs, queryFn: () => invoke<JobSnapshot[]>("jobs_list"), staleTime: Infinity });
}

export const fetchUpdate = () => invoke<UpdateStatus>("update_status");

/** Modstead güncellemesi. Olaylar (`modstead://update`) önbelleği tazeler; güncelleme hazırken neyin beklettiği
 *  (açık oyun, süren indirme) yarım dakikada bir yeniden sorulur. */
export function useUpdate() {
  return useQuery({
    queryKey: keys.update,
    queryFn: fetchUpdate,
    staleTime: 30_000,
    refetchInterval: (q) => (q.state.data?.phase === "ready" ? 30_000 : false),
  });
}

/** Olaydan gelen görev görüntüsünü önbelleğe işler. */
export function upsertJob(job: JobSnapshot) {
  queryClient.setQueryData<JobSnapshot[]>(keys.jobs, (prev) => {
    const list = prev ?? [];
    const i = list.findIndex((j) => j.id === job.id);
    if (i === -1) return [job, ...list];
    const next = list.slice();
    next[i] = job;
    return next;
  });
}

export function removeJob(id: string) {
  queryClient.setQueryData<JobSnapshot[]>(keys.jobs, (prev) => (prev ?? []).filter((j) => j.id !== id));
}
