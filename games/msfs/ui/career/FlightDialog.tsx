// Uçuş ayrıntısı: uçulan iz, iniş, puan dökümü, hesap ve zaman çizelgesi.

import clsx from "clsx";
import { BookOpen, CircleCheck, CircleX } from "lucide-react";
import { Badge, Dialog, DialogBody, DialogHeader, ScoreRing, Skeleton } from "@/ui";
import { Events } from "./ActiveJob";
import { TONE_TEXT, className as clsName, dateTime, duration, landingTone, money, num } from "./format";
import { useCareerT } from "./i18n";
import { Fact, Route } from "./parts";
import { useFlight } from "./queries";
import { RouteMap } from "./RouteMap";
import { useCareerUi } from "./store";
import type { CareerView } from "./types";

export function FlightDialog({ view }: { view: CareerView }) {
  const t = useCareerT();
  const id = useCareerUi((s) => s.flightId);
  const close = () => useCareerUi.getState().openFlight(null);
  const { data } = useFlight(id);
  const e = data?.entry;

  return (
    <Dialog open={!!id} onClose={close} width={860} game="msfs">
      <DialogHeader
        title={e ? <Route from={e.job.from} to={e.arrived || e.job.to} className="text-fg" /> : t.logbook.detail}
        subtitle={e ? `${t.kinds[e.job.kind]} · ${dateTime(e.endedAt)} · ${e.aircraft.title || clsName(e.job.class, view.classes)}` : undefined}
        icon={<BookOpen className="size-5" />}
        onClose={close}
      />
      <DialogBody className="flex flex-col gap-4">
        {!data || !e ? (
          <Skeleton className="h-[420px]" />
        ) : (
          <>
            <div className="grid grid-cols-[1fr_220px] gap-4">
              <div className="overflow-hidden rounded-[14px] border border-line">
                <RouteMap
                  from={data.from ? { lat: data.from.lat, lon: data.from.lon, icao: e.job.from } : null}
                  to={data.to ? { lat: data.to.lat, lon: data.to.lon, icao: e.job.to } : null}
                  track={data.track}
                  className="aspect-[2/1] w-full"
                  aspect={2}
                />
              </div>
              <div className="well flex flex-col items-center justify-center gap-2 px-3 py-4">
                <ScoreRing score={e.summary.score} size={104} label={t.logbook.score} />
                <div className="font-mono text-[20px] font-bold text-fg">{e.summary.grade}</div>
                <Badge tone={e.result === "completed" ? "ok" : e.result === "late" ? "warn" : "danger"}>{t.results[e.result]}</Badge>
                {e.checkridePassed !== null && (
                  <span className={clsx("flex items-center gap-1 text-[12px] font-semibold", e.checkridePassed ? "text-ok" : "text-danger")}>
                    {e.checkridePassed ? <CircleCheck className="size-4" /> : <CircleX className="size-4" />}
                    {e.checkridePassed ? t.logbook.checkridePassed : t.logbook.checkrideFailed}
                  </span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-5 gap-2">
              <Fact label={t.logbook.block} value={duration(e.summary.blockS / 60)} hint={`${t.logbook.hours} ${num(e.creditedHours, 2)}`} />
              <Fact label={t.logbook.flown} value={`${num(e.summary.flownNm, 1)} nm`} hint={`${num(e.job.distanceNm)} nm`} />
              <Fact label={t.logbook.maxAlt} value={`${num(e.summary.maxAltFt)} ft`} />
              <Fact label={t.logbook.fuelUsed} value={`${num(e.summary.fuelUsedLb)} lb`} hint={`${num(e.summary.fuelLeftLb)} lb`} />
              <Fact label={t.logbook.xp} value={`+${num(e.xp)}`} hint={`${t.logbook.rep} ${e.reputationDelta >= 0 ? "+" : ""}${num(e.reputationDelta, 1)}`} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-3">
                {e.landing && (
                  <div className="rounded-[14px] border border-line p-3.5">
                    <div className="mb-2 flex items-center gap-2">
                      <span className="text-[13px] font-semibold text-fg">{t.live.landing}</span>
                      <Badge tone={landingTone(e.landing.label)}>{t.landing[e.landing.label]}</Badge>
                    </div>
                    <div className="grid grid-cols-4 gap-2 text-center">
                      <Mini label="fpm" value={num(e.landing.fpm)} tone={TONE_TEXT[landingTone(e.landing.label)]} />
                      <Mini label="G" value={num(e.landing.g, 2)} />
                      <Mini label="°" value={num(e.landing.bank, 1)} />
                      <Mini label="kt" value={num(e.landing.iasKt)} />
                    </div>
                    {e.landing.bounces > 0 && <p className="mt-2 text-[11.5px] text-warn">{t.events.bounce} × {e.landing.bounces}</p>}
                  </div>
                )}
                <div className="rounded-[14px] border border-line p-3.5">
                  <div className="mb-2 text-[13px] font-semibold text-fg">{t.logbook.deductions}</div>
                  {e.deductions.length === 0 ? (
                    <p className="text-[12px] text-ok">{t.logbook.noDeductions}</p>
                  ) : (
                    <ul className="flex flex-col gap-1 text-[12.5px]">
                      {e.deductions.map(([code, v]) => (
                        <li key={code} className="flex justify-between">
                          <span className="text-fg-2">{t.events[code] ?? code}</span>
                          <span className="tabular font-semibold text-warn">−{v}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="mt-2.5 text-[11px] leading-relaxed text-muted">
                    {t.logbook.hoursRule}
                    {e.summary.simRateMax > 1 && ` ${t.logbook.simRate(e.summary.simRateMax)}.`}
                  </p>
                </div>
              </div>
              <div className="flex flex-col gap-3">
                <div className="rounded-[14px] border border-line p-3.5">
                  <div className="mb-2 text-[13px] font-semibold text-fg">{t.logbook.settlement}</div>
                  <dl className="flex flex-col gap-1 text-[12.5px]">
                    <Line label={t.logbook.pay} value={e.settlement.pay} />
                    <Line label={t.logbook.latePenalty} value={-e.settlement.latePenalty} />
                    <Line label={t.logbook.rent} value={-e.settlement.rent} />
                    <Line label={t.logbook.fuel} value={-e.settlement.fuel} />
                    <Line label={t.logbook.fees} value={-e.settlement.fees} />
                    <Line label={t.logbook.maintenance} value={-e.settlement.maintenance} />
                    <Line label={t.logbook.damage} value={-e.settlement.damage} />
                    <div className="my-1 h-px bg-line" />
                    <div className="flex justify-between text-[13.5px] font-semibold">
                      <dt className="text-fg">{t.logbook.total}</dt>
                      <dd className={clsx("tabular", e.settlement.net >= 0 ? "text-ok" : "text-danger")}>{money(e.settlement.net, true)}</dd>
                    </div>
                  </dl>
                </div>
                <div className="rounded-[14px] border border-line p-3.5">
                  <div className="mb-2 text-[13px] font-semibold text-fg">{t.logbook.timeline}</div>
                  <div className="max-h-[190px] overflow-y-auto">
                    <Events events={e.events} />
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </DialogBody>
    </Dialog>
  );
}

function Mini({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="well px-2 py-2">
      <div className={clsx("tabular text-[15px] font-semibold", tone ?? "text-fg")}>{value}</div>
      <div className="text-[10.5px] text-muted">{label}</div>
    </div>
  );
}

function Line({ label, value }: { label: string; value: number }) {
  if (value === 0) return null;
  return (
    <div className="flex justify-between">
      <dt className="text-fg-2">{label}</dt>
      <dd className={clsx("tabular", value < 0 ? "text-fg-2" : "text-fg")}>{money(value, value > 0)}</dd>
    </div>
  );
}
