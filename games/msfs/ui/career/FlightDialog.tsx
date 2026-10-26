// Uçuş ayrıntısı uçuşun hikâyesini sırasıyla anlatır: 1 Plan (iş, yük, koşullar) → 2 Uçuş (iz, süre, mesafe,
// irtifa, yakıt) → 3 İniş (sertlik, yaklaşma, teker koyma) → 4 Puan (not, kesintiler, prosedürler, olaylar) →
// 5 Hesap (ücret, masraflar, kazanç, XP, itibar).

import clsx from "clsx";
import { BookOpen, CircleCheck, CircleX } from "lucide-react";
import { Dialog, DialogBody, DialogHeader, ScoreRing, Skeleton } from "@/ui";
import { Events } from "./ActiveJob";
import { ConditionsBlock } from "./Conditions";
import { TONE_TEXT, className as clsName, dateTime, duration, gradeTone, landingTone, money, num } from "./format";
import { useCareerT } from "./i18n";
import { DeductionRow, FlightExtras } from "./FlightExtras";
import { Hint, Route, StatusTag, carryText } from "./parts";
import { useFlight } from "./queries";
import { useRealT } from "./real-i18n";
import { RouteMap } from "./RouteMap";
import { useCareerUi } from "./store";
import type { CareerView, LogEntry } from "./types";

export function FlightDialog({ view }: { view: CareerView }) {
  const t = useCareerT();
  const r = useRealT();
  const id = useCareerUi((s) => s.flightId);
  const close = () => useCareerUi.getState().openFlight(null);
  const { data } = useFlight(id);
  const e = data?.entry;
  const scenario = !!e?.job.conditions && !(e.job.conditions.time === "now" && e.job.conditions.weather === "live");

  return (
    <Dialog open={!!id} onClose={close} width={900} game="msfs">
      <DialogHeader
        title={e ? <Route from={e.job.from} to={e.arrived || e.job.to} size="lg" className="text-fg" /> : t.logbook.detail}
        subtitle={e ? `${t.kinds[e.job.kind]} · ${dateTime(e.endedAt)} · ${e.aircraft.title || clsName(e.job.class, view.classes)}` : undefined}
        icon={<BookOpen className="size-5" />}
        onClose={close}
      />
      <DialogBody className="flex flex-col gap-6 [&>*]:shrink-0">
        {!data || !e ? (
          <Skeleton className="h-[420px]" />
        ) : (
          <>
            {/* 1 Plan */}
            <Step n={1} title={t.guide.storyPlan}>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-fg-2">
                <span className="font-semibold text-fg">{t.kinds[e.job.kind]}</span>
                <span className="text-muted">·</span>
                <span>{e.job.client}</span>
                <span className="text-muted">·</span>
                <span>{carryText(e.job, t)}</span>
                <span className="text-muted">·</span>
                <span>{t.mode[e.job.mode]}</span>
                <span className="text-muted">·</span>
                <span className="tabular">{t.guide.planned(`${num(e.job.distanceNm)} nm`, duration(e.job.plan.blockMin))}</span>
              </div>
              {scenario && <ConditionsBlock job={e.job} className="mt-3" />}
            </Step>

            {/* 2 Uçuş */}
            <Step n={2} title={t.guide.storyFlown}>
              <div className="overflow-hidden rounded-[14px] border border-line">
                <RouteMap
                  from={data.from ? { lat: data.from.lat, lon: data.from.lon, icao: e.job.from } : null}
                  to={data.to ? { lat: data.to.lat, lon: data.to.lon, icao: e.job.to } : null}
                  track={data.track}
                  className="aspect-[2.6/1] w-full"
                  aspect={2.6}
                />
                <dl className="grid grid-cols-4 divide-x divide-line border-t border-line">
                  <Spec label={t.logbook.block} value={duration(e.summary.blockS / 60)} hint={`${t.logbook.hours} ${num(e.creditedHours, 2)}`} />
                  <Spec label={t.logbook.flown} value={`${num(e.summary.flownNm, 1)} nm`} hint={e.arrived && e.arrived !== e.job.to ? `${t.guide.landed} ${e.arrived}` : `${num(e.job.distanceNm)} nm`} />
                  <Spec label={t.logbook.maxAlt} value={`${num(e.summary.maxAltFt)} ft`} />
                  <Spec label={t.logbook.fuelUsed} value={`${num(e.summary.fuelUsedLb)} lb`} hint={`${num(e.summary.fuelLeftLb)} lb`} />
                </dl>
              </div>
            </Step>

            {/* 3 İniş */}
            <Step n={3} title={t.guide.storyLanding} hint={t.guide.fpm}>
              <div className="grid grid-cols-2 items-start gap-3">
                {e.landing ? (
                  <div className="min-w-0 overflow-hidden rounded-[14px] border border-line">
                    <div className="flex items-center gap-2 border-b border-line bg-surface-2/40 px-3.5 py-2">
                      <span className="min-w-0 flex-1 text-[12px] font-semibold text-fg-2">{t.live.landing}</span>
                      <StatusTag tone={landingTone(e.landing.label) === "neutral" ? "neutral" : landingTone(e.landing.label)}>{t.landing[e.landing.label]}</StatusTag>
                    </div>
                    <div className="grid grid-cols-4 divide-x divide-line">
                      <Mini label="fpm" value={num(e.landing.fpm)} tone={TONE_TEXT[landingTone(e.landing.label)]} />
                      <Mini label="G" value={num(e.landing.g, 2)} />
                      <Mini label="° bank" value={num(e.landing.bank, 1)} />
                      <Mini label="kt IAS" value={num(e.landing.iasKt)} />
                    </div>
                    {e.landing.bounces > 0 && (
                      <p className="border-t border-line px-3.5 py-2 text-[11.5px] text-warn">
                        {t.events.bounce} × {e.landing.bounces}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-[12.5px] text-muted">—</p>
                )}
                <FlightExtras e={e} part="landing" />
              </div>
            </Step>

            {/* 4 Puan */}
            <Step n={4} title={t.guide.storyScore} hint={t.guide.grade}>
              <div className="grid grid-cols-[200px_minmax(0,1fr)] items-start gap-3">
                <Verdict e={e} />
                <div className="flex min-w-0 flex-col gap-3">
                  <Card title={t.logbook.deductions}>
                    {e.deductions.length === 0 ? (
                      <p className="flex items-center gap-1.5 text-[12px] text-ok">
                        <CircleCheck className="size-3.5" />
                        {t.logbook.noDeductions}
                      </p>
                    ) : (
                      <ul className="flex flex-col gap-1 text-[12.5px]">
                        {e.deductions.map(([code, v]) => (
                          <DeductionRow key={code} e={e} code={code} value={v} label={t.events[code] ?? code} />
                        ))}
                      </ul>
                    )}
                    {e.summary.simRateMax > 1 && <p className="mt-2 text-[11px] text-muted">{t.logbook.simRate(e.summary.simRateMax)}.</p>}
                  </Card>
                  <FlightExtras e={e} part="score" />
                  <Card title={t.logbook.timeline}>
                    <div className="max-h-[180px] overflow-y-auto">
                      <Events events={e.events} />
                    </div>
                  </Card>
                </div>
              </div>
            </Step>

            {/* 5 Hesap */}
            <Step n={5} title={t.guide.storyPay}>
              <div className="grid grid-cols-[minmax(0,1fr)_240px] items-start gap-3">
                <Card title={t.logbook.settlement}>
                  <dl className="flex flex-col gap-1 text-[12.5px]">
                    <Line label={t.logbook.pay} value={e.settlement.pay} />
                    <Line label={r.settlement.tip} value={e.settlement.tip ?? 0} />
                    <Line label={t.logbook.latePenalty} value={-e.settlement.latePenalty} />
                    <Line label={r.settlement.cargoClaim} value={-(e.settlement.cargoClaim ?? 0)} />
                    <Line label={t.logbook.rent} value={-e.settlement.rent} />
                    <Line label={t.logbook.fuel} value={-e.settlement.fuel} />
                    <Line label={t.logbook.fees} value={-e.settlement.fees} />
                    <Line label={r.settlement.navFees} value={-(e.settlement.navFees ?? 0)} />
                    <Line label={r.settlement.handling} value={-(e.settlement.handling ?? 0)} />
                    <Line label={t.logbook.maintenance} value={-e.settlement.maintenance} />
                    <Line label={r.settlement.insurance} value={-(e.settlement.insurance ?? 0)} />
                    <Line label={t.logbook.damage} value={-e.settlement.damage} />
                    <div className="mt-1.5 flex items-baseline justify-between border-t border-line pt-2">
                      <dt className="text-[12.5px] font-semibold text-fg">{t.guide.colEarned}</dt>
                      <dd className={clsx("num text-[20px]", e.settlement.net >= 0 ? "text-ok" : "text-danger")}>{money(e.settlement.net, true)}</dd>
                    </div>
                  </dl>
                </Card>
                <div className="flex flex-col divide-y divide-line overflow-hidden rounded-[14px] border border-line">
                  <Spec label={t.logbook.xp} value={`+${num(e.xp)}`} hint={t.guide.xp} tone="text-accent" />
                  <Spec label={t.logbook.rep} value={`${e.reputationDelta >= 0 ? "+" : ""}${num(e.reputationDelta, 1)}`} hint={t.guide.reputation} />
                  <Spec label={t.logbook.hours} value={num(e.creditedHours, 2)} hint={t.logbook.hoursRule} />
                </div>
              </div>
            </Step>
          </>
        )}
      </DialogBody>
    </Dialog>
  );
}

/** Hikâyenin bir adımı: numara, başlık (isteğe bağlı açıklama ipucu) ve içerik. */
function Step({ n, title, hint, children }: { n: number; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <h3 className="flex items-center gap-2.5">
        <span className="tabular flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-3 font-mono text-[11px] font-bold text-fg">{n}</span>
        <span className="text-[14px] font-semibold text-fg">{title}</span>
        {hint && <Hint text={hint} />}
      </h3>
      {children}
    </section>
  );
}

/** Not paneli: puan halkası, harf notu, sonuç; itiraz ve sınav sonucu. */
function Verdict({ e }: { e: LogEntry }) {
  const t = useCareerT();
  const r = useRealT();
  const ok = e.result === "completed" || e.result === "late";
  const g = ok ? gradeTone(e.summary.grade) : "danger";
  return (
    <div className="flex flex-col items-center justify-center gap-2.5 rounded-[14px] border border-line bg-surface-2/40 px-3 py-4">
      <ScoreRing score={e.summary.score} size={104} label={t.logbook.score} />
      <div className={clsx("num text-[30px]", TONE_TEXT[g])}>{ok ? e.summary.grade : "—"}</div>
      <StatusTag tone={e.result === "completed" ? "ok" : e.result === "late" || e.result === "partial" ? "warn" : "danger"}>{t.results[e.result]}</StatusTag>
      {(e.appealed?.length ?? 0) > 0 && <StatusTag tone="info">{r.flight.appealed}</StatusTag>}
      {e.checkridePassed !== null && (
        <span className={clsx("flex items-center gap-1 text-center text-[12px] font-semibold", e.checkridePassed ? "text-ok" : "text-danger")}>
          {e.checkridePassed ? <CircleCheck className="size-4" /> : <CircleX className="size-4" />}
          {e.checkridePassed ? t.logbook.checkridePassed : t.logbook.checkrideFailed}
        </span>
      )}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 overflow-hidden rounded-[14px] border border-line">
      <div className="border-b border-line bg-surface-2/40 px-3.5 py-2 text-[12px] font-semibold text-fg-2">{title}</div>
      <div className="px-3.5 py-3">{children}</div>
    </div>
  );
}

function Spec({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: string }) {
  const long = !!hint && hint.length > 40;
  return (
    <div className="min-w-0 px-4 py-3">
      <dt className="flex items-center gap-1.5 truncate text-[11.5px] text-muted">
        {label}
        {long && <Hint text={hint} />}
      </dt>
      <dd className={clsx("num mt-1.5 truncate text-[18px]", tone ?? "text-fg")}>{value}</dd>
      {hint && !long && <dd className="tabular mt-1 truncate text-[11px] text-muted">{hint}</dd>}
    </div>
  );
}

function Mini({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="px-3 py-3 text-center">
      <div className={clsx("num text-[18px]", tone ?? "text-fg")}>{value}</div>
      <div className="mt-1 font-mono text-[10.5px] text-muted">{label}</div>
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
