// Arka uçla konuşmanın tek yolu. Tauri dışında (tarayıcıda) "önizleme kipi" çalışır:
// komutlar src/lib/mock.ts ve oyunların kendi örnek verileriyle yanıtlanır. Sayfa Modstead'in yerel
// sunucusundan açıldıysa (ikinci ekran, tablet) "uzak taşıma" seçilir: komutlar HTTP ile gider (`setRemoteTransport`).

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

/** Uzak taşıma: Modstead'in yerel sunucusundaki salt okunur komut kapısı. */
export interface RemoteTransport {
  /** Sunucunun kökü, ör. `http://192.168.1.24:47213` (sondaki `/` atılır). */
  base: string;
  /** Yerel ağda her istekte `X-Modstead-Key` başlığıyla gider; aynı makinede gerekmez. */
  key?: string | null;
  /** İstek zaman aşımı (ms). */
  timeoutMs?: number;
}

let remote: RemoteTransport | null = null;

/** Komutları HTTP'ye yönlendirir (`null` kapatır). Uygulamanın kendisi ve önizleme kipi bunu çağırmaz. */
export function setRemoteTransport(opts: RemoteTransport | null) {
  remote = opts ? { ...opts, base: opts.base.replace(/\/+$/, "") } : null;
}

export function isRemote(): boolean {
  return remote !== null;
}

/** `GET {base}/api/call/<komut>?a=<JSON>`; yanıt JSON ya da `400 {"error"}`. Hata kodları: `unreachable`
 *  (sunucuya ulaşılamadı ya da zaman aşımı), `unauthorized` (anahtar geçersiz), `message` (komutun kendi hatası). */
async function remoteInvoke<T>(r: RemoteTransport, cmd: string, args?: Record<string, unknown>): Promise<T> {
  const url = `${r.base}/api/call/${encodeURIComponent(cmd)}?a=${encodeURIComponent(JSON.stringify(args ?? {}))}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), r.timeoutMs ?? 8000);
  let res: Response;
  let text: string;
  try {
    res = await fetch(url, {
      method: "GET",
      headers: r.key ? { "X-Modstead-Key": r.key } : undefined,
      signal: ctrl.signal,
      cache: "no-store",
      credentials: "omit",
    });
    text = await res.text();
  } catch (e) {
    throw { code: "unreachable", message: `Modstead'e ulaşılamadı (${cmd}): ${e instanceof Error ? e.message : String(e)}` };
  } finally {
    clearTimeout(timer);
  }
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (!res.ok) {
    const msg = body && typeof body === "object" && "error" in body ? String((body as { error: unknown }).error) : `HTTP ${res.status}`;
    throw { code: res.status === 401 || res.status === 403 ? "unauthorized" : "message", message: msg };
  }
  return body as T;
}

export async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  try {
    if (remote) return await remoteInvoke<T>(remote, cmd, args);
    return isTauri ? await tauriInvoke<T>(cmd, args) : await mockInvoke<T>(cmd, args);
  } catch (e) {
    throw toAppError(e);
  }
}

/** Arka uç olayını dinler; dönen işlev aboneliği bitirir. Uzak taşımada olay yoktur (sayfa yoklar). */
export function listen<T>(event: string, handler: (payload: T) => void): () => void {
  if (remote) return () => {};
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
  update: "modstead://update",
} as const;
