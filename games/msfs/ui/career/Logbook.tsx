// Seyir defteri: özet sayılar + uçuşlar tablosu. Satıra tıklayınca uçuş ayrıntısı açılır.

import clsx from "clsx";
import { BookOpen } from "lucide-react";
import { EmptyState, Skeleton, Stat } from "@/ui";
import { TONE_BG, TONE_TEXT, className as clsName, dateTime, duration, gradeTone, hours, landingTone, money, num } from "./format";
import { useCareerT } from "./i18n";
import { KindIcon, Route } from "./parts";
import { useLogbook } from "./queries";
import { useCareerUi } from "./store";
import type { CareerView } from "./types";

export function Logbook({ view }: { view: CareerView }) {
  const t = useCareerT();
  const { data: log, isLoading } = useLogbook();
  const openFlight = useCareerUi((s) => s.openFlight);
  const p = view.pilot!;
  const scores = p.stats.scores;
  const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-display text-[22px] font-semibold tracking-tight text-fg">{t.logbook.title}</h2>
        <p className="mt-0.5 text-[12.5px] text-fg-2">{t.logbook.subtitle(log?.length ?? 0)}</p>
      </div>
      <div className="grid grid-cols-5 gap-3">
        <Stat label={t.panel.flights} value={num(p.stats.flights)} />
        <Stat label={t.hero.hours} value={hours(p.stats.hours)} hint={`${t.logbook.block} ${hours(p.stats.simHours)}`} />
        <Stat label={t.logbook.score} value={avg === null ? "—" : num(avg, 0)} tone={avg !== null && avg >= 85 ? "ok" : undefined} />
        <Stat label={t.panel.butter} value={num(p.stats.butterLandings)} hint={`${num(p.stats.landings)} ${t.logbook.landing.toLowerCase()}`} />
        <Stat label={t.logbook.net} value={money(p.stats.earned - p.stats.spent)} tone={p.stats.earned - p.stats.spent >= 0 ? "ok" : "danger"} />
      </div>

      <section className="card overflow-hidden">
        {isLoading ? (
          <div className="flex flex-col gap-2 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-11" />
            ))}
          </div>
        ) : !log || log.length === 0 ? (
          <EmptyState icon={<BookOpen className="size-6" />} title={t.logbook.empty}>
            {t.logbook.emptyBody}
          </EmptyState>
        ) : (
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="border-b border-line text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
                <th className="px-5 py-2.5 font-semibold">{t.logbook.date}</th>
                <th className="px-3 py-2.5 font-semibold">{t.logbook.route}</th>
                <th className="px-3 py-2.5 font-semibold">{t.logbook.aircraft}</th>
                <th className="px-3 py-2.5 text-right font-semibold">{t.logbook.block}</th>
                <th className="px-3 py-2.5 text-right font-semibold">{t.logbook.landing}</th>
                <th className="px-3 py-2.5 text-center font-semibold">{t.logbook.grade}</th>
                <th className="px-5 py-2.5 text-right font-semibold">{t.logbook.net}</th>
              </tr>
            </thead>
            <tbody>
              {log.map((e) => {
                const ok = e.result === "completed" || e.result === "late";
                const g = ok ? gradeTone(e.summary.grade) : "danger";
                return (
                  <tr key={e.id} onClick={() => openFlight(e.id)} className="cursor-pointer border-b border-line transition-colors last:border-b-0 hover:bg-surface-2/50">
                    <td className="tabular whitespace-nowrap px-5 py-2.5 text-fg-2">{dateTime(e.endedAt)}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <KindIcon kind={e.job.kind} className="size-3.5 text-muted" />
                        <Route from={e.job.from} to={e.arrived || e.job.to} size="sm" className="text-fg" />
                        {!ok && <span className="text-[11px] text-danger">{t.results[e.result]}</span>}
                        {e.result === "late" && <span className="text-[11px] text-warn">{t.results.late}</span>}
                      </div>
                    </td>
                    <td className="max-w-[220px] px-3 py-2.5">
                      <div className="truncate text-fg">{e.aircraft.title || "—"}</div>
                      <div className="truncate text-[11px] text-muted">{clsName(e.aircraft.class ?? e.job.class, view.classes)}</div>
                    </td>
                    <td className="tabular whitespace-nowrap px-3 py-2.5 text-right text-fg-2">{duration(e.summary.blockS / 60)}</td>
                    <td className={clsx("tabular whitespace-nowrap px-3 py-2.5 text-right", e.landing ? TONE_TEXT[landingTone(e.landing.label)] : "text-muted")}>{e.landing ? `${num(e.landing.fpm)} fpm` : "—"}</td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={clsx("inline-flex h-6 min-w-8 items-center justify-center rounded-md px-1.5 font-mono text-[12px] font-bold", TONE_BG[g], TONE_TEXT[g])}>{ok ? e.summary.grade : "—"}</span>
                    </td>
                    <td className={clsx("tabular whitespace-nowrap px-5 py-2.5 text-right font-semibold", e.settlement.net >= 0 ? "text-fg" : "text-danger")}>{money(e.settlement.net, true)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
