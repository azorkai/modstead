// Panel: solda aktif iş (yoksa yönlendirme), sağda sıradaki lisans hedefi, kariyer özeti, son uçuşlar ve sim içi panel.

import clsx from "clsx";
import { ArrowRight, Award, Briefcase, CircleCheck, Feather, Plane, Route as RouteIcon, Trophy, TriangleAlert } from "lucide-react";
import { useLang } from "@/lib/i18n";
import { Badge, Button, EmptyState, Progress } from "@/ui";
import { ActiveJob } from "./ActiveJob";
import { HudCard } from "./Hud";
import { TONE_BG, TONE_TEXT, gradeTone, hours, landingTone, money, num } from "./format";
import { useCareerT } from "./i18n";
import { Route } from "./parts";
import { useCareerUi } from "./store";
import type { CareerView, LicenseView, LogEntry } from "./types";

export function Dashboard({ view }: { view: CareerView }) {
  const t = useCareerT();
  const setTab = useCareerUi((s) => s.setTab);
  return (
    <div className="grid grid-cols-[1.55fr_1fr] items-start gap-5">
      <div className="min-w-0">
        {view.active ? (
          <ActiveJob view={view} active={view.active} />
        ) : (
          <section className="card overflow-hidden">
            <EmptyState
              icon={<Briefcase className="size-6" />}
              title={t.panel.noJob}
              action={
                <Button variant="primary" size="lg" icon={<ArrowRight className="size-4" />} onClick={() => setTab("jobs")}>
                  {t.panel.toBoard}
                </Button>
              }
            >
              {t.panel.noJobBody}
            </EmptyState>
          </section>
        )}
      </div>
      <div className="flex min-w-0 flex-col gap-5">
        <NextGoal view={view} />
        <Summary view={view} />
        <Recent view={view} />
        <HudCard />
      </div>
    </div>
  );
}

function Head({ title, action }: { title: string; action?: { label: string; onClick: () => void } }) {
  return (
    <header className="flex items-center gap-3 border-b border-line px-5 py-3.5">
      <h3 className="min-w-0 flex-1 text-[14px] font-semibold text-fg">{title}</h3>
      {action && (
        <button type="button" onClick={action.onClick} className="inline-flex items-center gap-1 text-[12px] font-medium text-accent hover:underline">
          {action.label}
          <ArrowRight className="size-3.5" />
        </button>
      )}
    </header>
  );
}

/** Sıradaki lisans: şartlara en çok yaklaşılan, henüz alınmamış olan. */
function pickGoal(list: LicenseView[], hoursHave: number, level: number): LicenseView | null {
  const open = list.filter((l) => !l.held && l.missingLicenses.length === 0);
  if (open.length === 0) return null;
  const score = (l: LicenseView) => Math.min(1, hoursHave / Math.max(0.1, l.hoursNeeded)) + Math.min(1, level / Math.max(1, l.levelNeeded)) + (l.ready ? 10 : 0);
  return [...open].sort((a, b) => score(b) - score(a))[0];
}

function NextGoal({ view }: { view: CareerView }) {
  const t = useCareerT();
  const lang = useLang((s) => s.lang);
  const setTab = useCareerUi((s) => s.setTab);
  const p = view.pilot!;
  const goal = pickGoal(view.licenses, p.stats.hours, p.level);
  if (!goal) return null;
  const h = Math.min(1, p.stats.hours / Math.max(0.1, goal.hoursNeeded));
  const l = Math.min(1, p.level / Math.max(1, goal.levelNeeded));
  return (
    <section className="card overflow-hidden">
      <Head title={t.panel.nextGoal} action={{ label: t.panel.allLicenses, onClick: () => setTab("licenses") }} />
      <div className="flex gap-4 px-5 py-4">
        <div className={clsx("flex size-14 shrink-0 items-center justify-center rounded-2xl font-mono text-[14px] font-bold", goal.ready ? "accent-surface text-accent-ink" : "accent-soft")}>{goal.short}</div>
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-semibold text-fg">{lang === "en" ? goal.nameEn : goal.nameTr}</div>
          <div className="mt-0.5 text-[12px] leading-relaxed text-fg-2">{lang === "en" ? goal.aboutEn : goal.aboutTr}</div>
          <div className="mt-3 flex flex-col gap-2">
            <Req label={t.licenses.hours(hours(p.stats.hours), hours(goal.hoursNeeded))} value={h} />
            <Req label={t.licenses.level(p.level, goal.levelNeeded)} value={l} />
            <div className="flex items-center justify-between text-[11.5px]">
              <span className={p.money >= goal.fee ? "text-fg-2" : "text-warn"}>{t.licenses.fee(money(goal.fee))}</span>
              {goal.ready && (
                <Badge tone="ok" icon={<CircleCheck className="size-3" />}>
                  {t.licenses.ready}
                </Badge>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Req({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-[11.5px] text-fg-2">
        <span>{label}</span>
        {value >= 1 && <CircleCheck className="size-3.5 text-ok" />}
      </div>
      <Progress value={value} tone={value >= 1 ? "ok" : "accent"} />
    </div>
  );
}

function Summary({ view }: { view: CareerView }) {
  const t = useCareerT();
  const s = view.pilot!.stats;
  const items = [
    { icon: Plane, label: t.panel.flights, value: num(s.flights) },
    { icon: RouteIcon, label: t.panel.distance, value: `${num(s.distanceNm)} nm` },
    { icon: Feather, label: t.panel.butter, value: num(s.butterLandings) },
    { icon: Trophy, label: t.panel.best, value: s.bestLandingFpm === null ? "—" : `${num(s.bestLandingFpm)} fpm` },
    { icon: Award, label: t.panel.done, value: num(s.jobsDone) },
    { icon: TriangleAlert, label: t.panel.crashes, value: num(s.crashes) },
  ];
  return (
    <section className="card overflow-hidden">
      <Head title={t.panel.stats} />
      <div className="grid grid-cols-3 gap-2 p-4">
        {items.map((i) => (
          <div key={i.label} className="well px-3 py-2.5">
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted">
              <i.icon className="size-3.5" />
              {i.label}
            </div>
            <div className="tabular mt-1 text-[15px] font-semibold text-fg">{i.value}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Recent({ view }: { view: CareerView }) {
  const t = useCareerT();
  const setTab = useCareerUi((s) => s.setTab);
  const openFlight = useCareerUi((s) => s.openFlight);
  return (
    <section className="card overflow-hidden">
      <Head title={t.panel.recent} action={view.recent.length ? { label: t.panel.seeAll, onClick: () => setTab("logbook") } : undefined} />
      {view.recent.length === 0 ? (
        <p className="px-5 py-5 text-[12.5px] text-fg-2">{t.panel.noFlights}</p>
      ) : (
        <ul>
          {view.recent.map((e) => (
            <RecentRow key={e.id} e={e} onClick={() => openFlight(e.id)} />
          ))}
        </ul>
      )}
    </section>
  );
}

function RecentRow({ e, onClick }: { e: LogEntry; onClick: () => void }) {
  const t = useCareerT();
  const ok = e.result === "completed" || e.result === "late";
  return (
    <li>
      <button type="button" onClick={onClick} className="flex w-full items-center gap-3 border-b border-line px-5 py-2.5 text-left transition-colors last:border-b-0 hover:bg-surface-2/50">
        <span className={clsx("flex size-8 shrink-0 items-center justify-center rounded-lg font-mono text-[12px] font-bold", TONE_BG[ok ? gradeTone(e.summary.grade) : "danger"], TONE_TEXT[ok ? gradeTone(e.summary.grade) : "danger"])}>
          {ok ? e.summary.grade : "—"}
        </span>
        <span className="min-w-0 flex-1">
          <Route from={e.job.from} to={e.arrived || e.job.to} size="sm" className="text-fg" />
          <span className="block truncate text-[11px] text-muted">{ok ? t.kinds[e.job.kind] : t.results[e.result]}</span>
        </span>
        <span className="shrink-0 text-right">
          <span className={clsx("tabular block text-[12.5px] font-semibold", e.settlement.net >= 0 ? "text-fg" : "text-danger")}>{money(e.settlement.net, true)}</span>
          {e.landing && <span className={clsx("tabular block text-[11px]", TONE_TEXT[landingTone(e.landing.label)])}>{num(e.landing.fpm)} fpm</span>}
        </span>
      </button>
    </li>
  );
}
