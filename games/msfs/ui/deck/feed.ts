// Uçuş ekranının canlı verisi: saniyede bir yoklama (bağlantı koparsa artan aralıkla yeniden deneme), uçağın
// 60 fps yumuşatılmış konumu (son örnekten yer hızı ve izle ileri tahmin, yeni örneğe yumuşak geçiş) ve yakıt
// akışının örneklerden ölçülmesi.

import { useCallback, useEffect, useRef, useState } from "react";
import type { AppError } from "@/lib/types";
import { careerApi } from "../career/api";
import type { SmoothPos } from "../career/RouteMap";
import type { Live, Telemetry } from "../career/types";
import { advance, angleDiff, bearing, distanceNm, norm360 } from "./calc";

export interface Feed {
  live: Live | null;
  /** Son başarılı yanıtın zamanı (ms). */
  okAt: number | null;
  /** Art arda başarısız deneme sayısı. */
  failures: number;
  error: AppError | null;
  /** Sıradaki denemenin zamanı (ms; yalnızca hata varken). */
  retryAt: number | null;
  retry: () => void;
}

/** Canlı durumu ≈1 sn'de bir sorar; hata olursa 1, 2, 4, 8, 15 sn arayla dener. Sekme gizliyken 5 sn'de bir. */
export function useLiveFeed(onSample?: (live: Live, at: number) => void): Feed {
  const [st, setSt] = useState<Omit<Feed, "retry">>({ live: null, okAt: null, failures: 0, error: null, retryAt: null });
  const kick = useRef<() => void>(() => {});
  const cb = useRef(onSample);
  cb.current = onSample;

  useEffect(() => {
    let alive = true;
    let timer = 0;
    let failures = 0;
    let busy = false;
    const schedule = (ms: number) => {
      clearTimeout(timer);
      timer = window.setTimeout(() => void run(), ms);
    };
    const run = async () => {
      if (busy) return;
      busy = true;
      try {
        const live = await careerApi.live();
        if (!alive) return;
        failures = 0;
        const at = Date.now();
        cb.current?.(live, at);
        setSt({ live, okAt: at, failures: 0, error: null, retryAt: null });
        schedule(document.hidden ? 5000 : 1000);
      } catch (e) {
        if (!alive) return;
        failures++;
        const delay = Math.min(15_000, 1000 * 2 ** Math.min(failures - 1, 4));
        setSt((s) => ({ ...s, failures, error: e as AppError, retryAt: Date.now() + delay }));
        schedule(delay);
      } finally {
        busy = false;
      }
    };
    kick.current = () => {
      clearTimeout(timer);
      void run();
    };
    const onVisible = () => {
      if (!document.hidden) kick.current();
    };
    document.addEventListener("visibilitychange", onVisible);
    void run();
    return () => {
      alive = false;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const retry = useCallback(() => kick.current(), []);
  return { ...st, retry };
}

/** Uçağın ekrandaki konumu: son örnekten ileri tahmin (en çok 3 sn), görünen konum tahmine üstel yaklaşır (τ ≈ 0,25 sn). */
export class Smoother {
  private sample: { lat: number; lon: number; hdg: number; trk: number; gs: number; rate: number; t: number; frozen: boolean } | null = null;
  private prev: { lat: number; lon: number; t: number } | null = null;
  private shown: { lat: number; lon: number; hdg: number; trk: number } | null = null;
  private last = 0;

  push(tel: Telemetry | null, frozen: boolean, now = performance.now()) {
    if (!tel) {
      this.sample = this.prev = this.shown = null;
      return;
    }
    let trk = this.sample?.trk ?? tel.heading;
    if (this.prev) {
      const nm = distanceNm(this.prev, tel);
      // Yere göre iz iki örnek arasından; durunca ya da ışınlanınca burun yönü.
      if (nm >= 5 || (tel.onGround && tel.gsKt < 3)) trk = tel.heading;
      else if (nm > 0.004 && now - this.prev.t > 300) trk = bearing(this.prev, tel);
    }
    this.prev = { lat: tel.lat, lon: tel.lon, t: now };
    this.sample = { lat: tel.lat, lon: tel.lon, hdg: tel.heading, trk, gs: tel.gsKt, rate: tel.simRate || 1, t: now, frozen: frozen || tel.slew };
    if (!this.shown || distanceNm(this.shown, tel) > 3) this.shown = { lat: tel.lat, lon: tel.lon, hdg: tel.heading, trk };
  }

  /** Son örneğin yere göre izi (derece). */
  track(): number | null {
    return this.sample?.trk ?? null;
  }

  get = (now = performance.now()): SmoothPos | null => {
    const s = this.sample;
    const d = this.shown;
    if (!s || !d) return null;
    const dt = s.frozen ? 0 : Math.min(3, Math.max(0, (now - s.t) / 1000));
    const target = advance(s, s.trk, (s.gs * s.rate * dt) / 3600);
    const step = Math.min(0.1, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    const a = 1 - Math.exp(-step / 0.25);
    d.lat += (target.lat - d.lat) * a;
    d.lon += (target.lon - d.lon) * a;
    d.hdg = norm360(d.hdg + angleDiff(d.hdg, s.hdg) * a);
    d.trk = norm360(d.trk + angleDiff(d.trk, s.trk) * a);
    return { lat: d.lat, lon: d.lon, heading: d.hdg, track: d.trk };
  };
}

/** Yakıt akışı: son 3 dakikanın örneklerinden (sim saati varsa onunla) lb/sa. Yakıt eklenince baştan ölçer. */
export class BurnMeter {
  private pts: { t: number; lb: number }[] = [];

  push(tel: Telemetry | null, at: number) {
    if (!tel || !tel.enginesOn) {
      this.pts = [];
      return;
    }
    const t = tel.absTime > 0 ? tel.absTime * 1000 : at;
    const last = this.pts[this.pts.length - 1];
    if (last) {
      // Duraklatmada sim saati durur: aynı anı iki kez sayma. Yakıt eklendi ya da saat geri gitti: baştan.
      if (tel.fuelLb > last.lb + 1 || t < last.t - 1000) this.pts = [];
      else if (t <= last.t) return;
    }
    this.pts.push({ t, lb: tel.fuelLb });
    while (this.pts.length > 2 && this.pts[0].t < t - 180_000) this.pts.shift();
  }

  /** lb/sa; en az 20 saniyelik veri yoksa `null`. */
  rate(): number | null {
    if (this.pts.length < 3) return null;
    const [a, b] = [this.pts[0], this.pts[this.pts.length - 1]];
    const h = (b.t - a.t) / 3_600_000;
    if (h < 20 / 3600) return null;
    const r = (a.lb - b.lb) / h;
    return r > 0.5 ? r : null;
  }
}

/** Saniyede bir yenilenen saat (geri sayımlar ve "son veri" yazısı için). */
export function useNow(ms = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}
