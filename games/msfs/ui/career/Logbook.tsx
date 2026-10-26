// Seyir defteri: toplamlar şeridi + uçuşlar tablosu (süzgeçli). Satıra tıklayınca uçuş ayrıntısı açılır.

import { useMemo, useState } from "react";
import clsx from "clsx";
import { BookOpen } from "lucide-react";
import { Button, Segmented, Skeleton } from "@/ui";
import { TONE_BG, TONE_TEXT, className as clsName, dateTime, duration, gradeTone, hours, landingTone, money, num } from "./format";
import { useCareerT } from "./i18n";
import { Hint, KindIcon, PageTitle, Route, ScoreSpark, StatCell, StatStrip, StatusTag } from "./parts";
import { useLogbook } from "./queries";
import { useCareerUi } from "./store";
import type { CareerView, LogEntry } from "./types";

type Filter = "all" | "done" | "issues";
const isOk = (e: LogEntry) => e.result === "completed";

export function Logbook({ view }: { view: CareerView }) {
  const t = useCareerT();
  const { data: log, isLoading } = useLogbook();
  const openFlight = useCareerUi((s) => s.openFlight);
  const setTab = useCareerUi((s) => s.setTab);
  const [filter, setFilter] = useState<Filter>("all");
  const p = view.pilot!;
  const s = p.stats;
  const scores = s.scores;
  const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
  const net = s.earned - s.spent;
  const list = useMemo(() => (log ?? []).filter((e) => (filter === "all" ? true : filter === "done" ? isOk(e) : !isOk(e))), [log, filter]);
  const count = (f: Filter) => (log ?? []).filter((e) => (f === "all" ? true : f === "done" ? isOk(e) : !isOk(e))).length;

  return (
    <div className="flex flex-col gap-6">
      <PageTitle
        eyebrow={t.logbook.eyebrow(s.flights, hours(s.hours))}
        title={t.logbook.title}
        subtitle={t.guide.introLogbook}
        aside={
          (log?.length ?? 0) > 0 && (
            <Segmented<Filter>
              id="career-logbook"
              value={filter}
              onChange={setFilter}
              options={(["all", "done", "issues"] as const).map((f) => ({ value: f, label: f === "all" ? t.logbook.filterAll : f === "done" ? t.logbook.filterDone : t.logbook.filterIssues, count: count(f) }))}
            />
          )
        }
      />

      <StatStrip>
        <StatCell label={t.panel.flights} value={num(s.flights)} sub={t.logbook.landings(num(s.landings))} />
        <StatCell label={t.hero.hours} value={hours(s.hours)} unit={t.units.h} hint={t.logbook.hoursRule} sub={`${num(s.distanceNm)} nm`} />
        <StatCell label={t.logbook.avgScore} value={avg === null ? "—" : num(avg, 0)} unit={avg === null ? undefined : "/ 100"} tone={avg !== null && avg >= 85 ? "ok" : undefined} hint={t.guide.grade} sub={scores.length ? <ScoreSpark scores={scores} className="mt-0.5" /> : "—"} title={t.logbook.lastScores} />
        <StatCell label={t.panel.butter} value={num(s.butterLandings)} hint={t.guide.fpm} sub={s.bestLandingFpm === null ? "—" : t.logbook.best(`${num(s.bestLandingFpm)} fpm`)} />
        <StatCell label={t.guide.colEarned} value={money(net)} tone={net >= 0 ? "ok" : "danger"} sub={t.logbook.earnedSpent(money(s.earned), money(s.spent))} />
      </StatStrip>

      <section className="card overflow-hidden">
        {isLoading ? (
          <div className="flex flex-col gap-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : !log || log.length === 0 ? (
          <div className="flex items-center gap-6 px-8 py-8">
            <BookOpen className="size-7 shrink-0 text-muted" strokeWidth={1.5} />
            <div className="min-w-0 flex-1">
              <div className="text-[15px] font-semibold text-fg">{t.logbook.empty}</div>
              <p className="mt-1 text-[13px] text-fg-2">{t.guide.logbookEmpty}</p>
            </div>
            <Button variant="secondary" onClick={() => setTab("jobs")}>
              {t.guide.goToJobs}
            </Button>
          </div>
        ) : (
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="border-b border-line bg-surface-2/50 text-left">
                <Th className="pl-6">{t.guide.colDate}</Th>
                <Th>{t.guide.colFlight}</Th>
                <Th>{t.guide.colAircraft}</Th>
                <Th className="text-right">{t.guide.colTime}</Th>
                <Th className="text-right">
                  <span className="inline-flex items-center gap-1">
                    {t.guide.colLanding}
                    <Hint text={t.guide.fpm} />
                  </span>
                </Th>
                <Th className="text-center">
                  <span className="inline-flex items-center gap-1">
                    {t.guide.colGrade}
                    <Hint text={t.guide.grade} />
                  </span>
                </Th>
                <Th className="pr-6 text-right">{t.guide.colEarned}</Th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-[12.5px] text-muted">
                    {t.logbook.noneFiltered}
                  </td>
                </tr>
              )}
              {list.map((e) => {
                const ok = e.result === "completed" || e.result === "late";
                const g = ok ? gradeTone(e.summary.grade) : "danger";
                return (
                  <tr key={e.id} onClick={() => openFlight(e.id)} className="group cursor-pointer border-b border-line transition-colors last:border-b-0 hover:bg-surface-2/50">
                    <td className="tabular whitespace-nowrap py-3 pl-6 pr-3 font-mono text-[11.5px] text-fg-2">{dateTime(e.endedAt)}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2.5">
                        <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-muted transition-colors group-hover:text-accent">
                          <KindIcon kind={e.job.kind} className="size-3.5" />
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <Route from={e.job.from} to={e.arrived || e.job.to} size="sm" className="text-fg" />
                            {!ok && <StatusTag tone="danger">{t.results[e.result]}</StatusTag>}
                            {e.result === "late" && <StatusTag tone="warn">{t.results.late}</StatusTag>}
                          </div>
                          <div className="truncate text-[11px] text-muted">{t.kinds[e.job.kind]}</div>
                        </div>
                      </div>
                    </td>
                    <td className="max-w-[240px] px-3 py-3">
                      <div className="truncate text-fg">{e.aircraft.title || "—"}</div>
                      <div className="truncate text-[11px] text-muted">{clsName(e.aircraft.class ?? e.job.class, view.classes)}</div>
                    </td>
                    <td className="tabular whitespace-nowrap px-3 py-3 text-right text-fg-2">{duration(e.summary.blockS / 60)}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-right">
                      {e.landing ? (
                        <>
                          <div className={clsx("tabular font-mono text-[12px] font-semibold", TONE_TEXT[landingTone(e.landing.label)])}>{num(e.landing.fpm)} fpm</div>
                          <div className="text-[11px] text-muted">{t.landing[e.landing.label]}</div>
                        </>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span className="inline-flex items-center gap-1.5">
                        <span className={clsx("inline-flex h-6 min-w-8 items-center justify-center rounded-md px-1.5 font-mono text-[12px] font-bold", TONE_BG[g], TONE_TEXT[g])}>{ok ? e.summary.grade : "—"}</span>
                        {ok && <span className="tabular w-6 text-left text-[11px] text-muted">{e.summary.score}</span>}
                      </span>
                    </td>
                    <td className={clsx("tabular whitespace-nowrap py-3 pl-3 pr-6 text-right text-[13px] font-semibold", e.settlement.net >= 0 ? "text-fg" : "text-danger")}>{money(e.settlement.net, true)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {!!log?.length && (
          <p className="flex flex-wrap gap-x-5 gap-y-1 border-t border-line bg-surface-2/40 px-6 py-2.5 text-[11.5px] text-muted">
            <span>{t.guide.legendGrade}</span>
            <span>{t.guide.legendLanding}</span>
            <span>{t.logbook.hoursRule}</span>
          </p>
        )}
      </section>
    </div>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return <th className={clsx("px-3 py-2.5 text-[11.5px] font-semibold text-muted", className)}>{children}</th>;
}
