// Arka uçla konuşmanın tek yolu. Tauri dışında (tarayıcıda) "önizleme kipi" çalışır:
// komutlar src/lib/mock.ts ve oyunların kendi örnek verileriyle yanıtlanır.

import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import { listen as tauriListen } from "@tauri-apps/api/event";
import { mockInvoke, mockListen } from "./mock";
import type { AppError } from "./types";

export const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

function toAppError(e: unknown): AppError {
  if (e && typeof e === "object" && "message" in e) {
    const o = e as { code?: unknown; message?: unknown };
    return { code: typeof o.code === "string" ? o.code : "message", message: String(o.message) };
  }
  return { code: "message", message: String(e) };
}

export async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return isTauri ? await tauriInvoke<T>(cmd, args) : await mockInvoke<T>(cmd, args);
  } catch (e) {
    throw toAppError(e);
  }
}

/** Arka uç olayını dinler; dönen işlev aboneliği bitirir. */
export function listen<T>(event: string, handler: (payload: T) => void): () => void {
  if (!isTauri) return mockListen(event, handler as (p: unknown) => void);
  let stop: (() => void) | null = null;
  let cancelled = false;
  tauriListen<T>(event, (e) => handler(e.payload)).then((un) => {
    if (cancelled) un();
    else stop = un;
  });
  return () => {
    cancelled = true;
    stop?.();
  };
}

export function errorMessage(e: unknown): string {
  return toAppError(e).message;
}

export const EVENTS = {
  job: "modstead://job",
  gameChanged: "modstead://game-changed",
  nxm: "modstead://nxm",
  files: "modstead://files",
  notify: "modstead://notify",
} as const;
