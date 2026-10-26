// Uçuş ekranının türetilmiş verisi: kariyer durumu + canlı örnek + hava → kartların okuduğu tek model.

import type { MapPoint } from "../career/RouteMap";
import type { ActiveView, CareerView, Env, FlightLive, Live, Metar, Telemetry } from "../career/types";
import { LB_PER_KG, descentNm, distanceNm, windComponents } from "./calc";

export interface DeckModel {
  now: number;
  view: CareerView | null;
  active: ActiveView | null;
  live: Live | null;
  /** Uçak simde uçuşta mı (harita uçağı çizer). */
  airborneView: boolean;
  tel: Telemetry | null;
  flight: FlightLive | null;
  env: Env | null;
  /** Yere göre iz (derece); yoksa burun yönü. */
  course: number | null;
  wind: { dir: number; kt: number; head: number; cross: number } | null;
  flownNm: number | null;
  remainingNm: number | null;
  totalNm: number | null;
  /** Varış zamanı (ms, yer hızıyla). */
  etaMs: number | null;
  deadlineMs: number | null;
  /** Alçalma noktasına kalan mesafe (eksi: geçildi). */
  todNm: number | null;
  destElevFt: number | null;
  /** Yakıt (kg). */
  fuel: {
    onBoardKg: number;
    usedKg: number | null;
    burnKgH: number | null;
    burnPlanned: boolean;
    enduranceMin: number | null;
    atDestKg: number | null;
  } | null;
  metar: Metar | null;
  alternate: MapPoint | null;
}

export function buildModel(p: {
  now: number;
  view: CareerView | null;
  live: Live | null;
  course: number | null;
  burnLbH: number | null;
  metars: Metar[] | undefined;
  alternate: MapPoint | null;
}): DeckModel {
  const { now, view, live } = p;
  const active = view?.active ?? null;
  const tel = live?.telemetry ?? null;
  const flight = live?.flight ?? null;
  const env = live?.env ?? null;
  const airborneView = !!tel && !!live?.inFlight;
  const course = airborneView ? (p.course ?? tel!.heading) : null;
  const wind = env && course !== null ? { dir: env.windDir, kt: env.windKt, ...windComponents(env.windDir, env.windKt, course) } : null;

  const to = active?.to ?? null;
  const remainingNm = flight ? flight.remainingNm : airborneView && to ? distanceNm(tel!, to) : null;
  const flownNm = flight ? flight.flownNm : null;
  const totalNm = flownNm !== null && remainingNm !== null ? flownNm + remainingNm : (active?.job.distanceNm ?? null);
  const gs = tel && !tel.onGround && tel.gsKt > 30 ? tel.gsKt * (tel.simRate || 1) : null;
  const etaMs = remainingNm !== null && gs ? now + (remainingNm / gs) * 3_600_000 : null;
  const destElevFt = to?.elevationFt ?? null;
  const todNm = tel && remainingNm !== null && !tel.onGround ? remainingNm - descentNm(tel.altFt, destElevFt ?? 0) : null;

  // Yakıt: ölçülen akış yoksa sınıfın planlanan saatlik yakıtı.
  let fuel: DeckModel["fuel"] = null;
  if (tel && live?.inFlight) {
    const onBoardKg = tel.fuelLb / LB_PER_KG;
    const cls = active?.aircraft?.class ?? live.aircraft?.class ?? null;
    const planned = view?.classes.find((c) => c.id === cls)?.burnKgH ?? null;
    const measured = p.burnLbH !== null ? p.burnLbH / LB_PER_KG : null;
    const burnKgH = measured ?? (tel.enginesOn ? planned : null);
    const enduranceMin = burnKgH ? (onBoardKg / burnKgH) * 60 : null;
    const atDestKg = burnKgH && remainingNm !== null && gs ? onBoardKg - burnKgH * (remainingNm / gs) : null;
    fuel = { onBoardKg, usedKg: flight ? flight.fuelUsedLb / LB_PER_KG : null, burnKgH, burnPlanned: measured === null && burnKgH !== null, enduranceMin, atDestKg };
  }

  const metar = to ? (p.metars?.find((m) => m.icao === to.icao) ?? null) : null;
  return {
    now,
    view,
    active,
    live,
    airborneView,
    tel,
    flight,
    env,
    course,
    wind,
    flownNm,
    remainingNm,
    totalNm,
    etaMs,
    deadlineMs: active ? active.deadlineAt * 1000 : null,
    todNm,
    destElevFt,
    fuel,
    metar,
    alternate: p.alternate,
  };
}

/** "3 sa 05 dk" / "12 dk" / "45 sn" */
export function span(ms: number, en: boolean): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return en ? `${s} s` : `${s} sn`;
  const m = Math.round(s / 60);
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return en ? `${r} min` : `${r} dk`;
  if (h >= 48) return en ? `${Math.round(h / 24)} days` : `${Math.round(h / 24)} gün`;
  return en ? `${h} h ${String(r).padStart(2, "0")} min` : `${h} sa ${String(r).padStart(2, "0")} dk`;
}
