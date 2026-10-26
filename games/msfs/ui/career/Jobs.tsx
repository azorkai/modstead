// İş ilanları: bulunduğun havalimanının panosu. Solda ilanlar, sağda seçili ilanın haritası ve hesabı.

import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { toast } from "sonner";
import { Clock, Lock, MapPinned, Package, Plane, RefreshCw, Sparkles, Users } from "lucide-react";
import { notifyError } from "@/shell/actions";
import { Badge, Button, Dialog, DialogBody, DialogHeader, EmptyState, Segmented, Skeleton } from "@/ui";
import { careerApi } from "./api";
import { className as clsName, duration, kg, money, num } from "./format";
import { useCareerT } from "./i18n";
import { AirportLine, AirportSearch, Fact, KindIcon, Route } from "./parts";
import { CareChip, WxChip, objectiveLabel } from "./Dispatch";
import { invalidateCareer, useBoard, useWeather } from "./queries";
import { useRealT } from "./real-i18n";
import { RouteMap } from "./RouteMap";
import { useCareerUi } from "./store";
import type { AirportHit, CareerView, Job } from "./types";

type Filter = "all" | "employee" | "contract" | "urgent";

export function Jobs({ view }: { view: CareerView }) {
  const t = useCareerT();
  const { data: jobs, isLoading, refetch, isFetching } = useBoard(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [selId, setSelId] = useState<string | null>(null);
  const [travel, setTravel] = useState(false);
  const loc = view.location;

  const list = useMemo(
    () => (jobs ?? []).filter((j) => (filter === "all" ? true : filter === "urgent" ? j.urgent : j.mode === filter)),
    [jobs, filter],
  );
  const sel = list.find((j) => j.id === selId) ?? list[0] ?? null;
  const count = (f: Filter) => (jobs ?? []).filter((j) => (f === "all" ? true : f === "urgent" ? j.urgent : j.mode === f)).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end gap-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-display text-[22px] font-semibold tracking-tight text-fg">{t.jobs.title}</h2>
          <p className="mt-0.5 text-[12.5px] text-fg-2">{t.jobs.subtitle(loc?.icao ?? "", loc?.city ?? "")}</p>
        </div>
        <Segmented<Filter>
          id="career-jobs"
          value={filter}
          onChange={setFilter}
          options={(["all", "employee", "contract", "urgent"] as const).filter((f) => f === "all" || count(f) > 0).map((f) => ({ value: f, label: t.jobs.filters[f], count: count(f) }))}
        />
        <Button variant="secondary" icon={<MapPinned className="size-4" />} onClick={() => setTravel(true)} disabled={!!view.active}>
          {t.jobs.travel}
        </Button>
        <Button variant="ghost" icon={<RefreshCw className={clsx("size-4", isFetching && "animate-spin")} />} onClick={() => void refetch()} aria-label="refresh" />
      </div>

      {isLoading ? (
        <div className="grid grid-cols-[1fr_400px] gap-5">
          <div className="flex flex-col gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-[92px]" />
            ))}
          </div>
          <Skeleton className="h-[480px]" />
        </div>
      ) : list.length === 0 ? (
        <section className="card">
          <EmptyState icon={<Plane className="size-6" />} title={t.jobs.empty}>
            {t.jobs.emptyBody}
          </EmptyState>
        </section>
      ) : (
        <div className="grid grid-cols-[1fr_400px] items-start gap-5">
          <div className="flex min-w-0 flex-col gap-2">
            {list.map((j) => (
              <JobCard key={j.id} job={j} view={view} selected={sel?.id === j.id} onClick={() => setSelId(j.id)} />
            ))}
          </div>
          {sel && <JobDetail job={sel} view={view} />}
        </div>
      )}
      <TravelDialog open={travel} onClose={() => setTravel(false)} />
    </div>
  );
}

function JobCard({ job, view, selected, onClick }: { job: Job; view: CareerView; selected: boolean; onClick: () => void }) {
  const t = useCareerT();
  const r = useRealT();
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "card flex items-center gap-4 px-4 py-3.5 text-left transition-colors",
        selected ? "border-[color-mix(in_oklab,var(--accent)_55%,transparent)] bg-[color-mix(in_oklab,var(--accent)_5%,var(--surface))]" : "hover:border-line-strong",
      )}
    >
      <div className={clsx("flex size-10 shrink-0 items-center justify-center rounded-xl", selected ? "accent-surface text-accent-ink" : "accent-soft")}>
        <KindIcon kind={job.kind} className="size-[18px]" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">{t.kinds[job.kind]}</span>
          {job.urgent && <Badge tone="danger">{t.jobs.urgent}</Badge>}
          {job.mode === "contract" && <Badge tone="info">{t.mode.contract}</Badge>}
          <CareChip care={job.care} />
          <WxChip category={job.weather} />
          {job.irRequired && (
            <Badge tone="danger" icon={<Lock className="size-3" />}>
              {r.wx.irRequired}
            </Badge>
          )}
          {job.weatherBonus > 0 && <Badge tone="accent">+%{job.weatherBonus}</Badge>}
        </div>
        <Route from={job.from} to={job.to} className="mt-0.5 text-fg" />
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11.5px] text-fg-2">
          <span className="tabular">{num(job.distanceNm)} nm</span>
          <span>{clsName(job.class, view.classes)}</span>
          {job.pax > 0 && (
            <span className="inline-flex items-center gap-1">
              <Users className="size-3" />
              {t.jobs.pax(job.pax)}
            </span>
          )}
          {job.cargoKg > 0 && (
            <span className="inline-flex items-center gap-1">
              <Package className="size-3" />
              {t.jobs.kg(kg(job.cargoKg))}
            </span>
          )}
          <span className="inline-flex items-center gap-1 text-muted">
            <Clock className="size-3" />
            {t.jobs.deadline(job.deadlineH)}
          </span>
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div className="tabular text-[18px] font-semibold text-fg">{money(job.pay)}</div>
        {job.quote ? (
          <div className={clsx("tabular text-[11.5px]", job.quote.estProfit > 0 ? "text-ok" : "text-danger")}>
            {t.jobs.profit} {money(job.quote.estProfit, true)}
          </div>
        ) : (
          <div className="tabular text-[11.5px] text-muted">{t.jobs.xp(job.xpEstimate)}</div>
        )}
      </div>
    </button>
  );
}

function JobDetail({ job, view }: { job: Job; view: CareerView }) {
  const t = useCareerT();
  const r = useRealT();
  const { data: metars } = useWeather();
  const destWx = metars?.find((m) => m.icao === job.to) ?? null;
  const [busy, setBusy] = useState(false);
  const [names, setNames] = useState<{ from: AirportHit | null; to: AirportHit | null }>({ from: null, to: null });
  const setTab = useCareerUi((s) => s.setTab);
  const setPick = useCareerUi((s) => s.setPick);
  useEffect(() => {
    let alive = true;
    void Promise.all([careerApi.airports(job.from), careerApi.airports(job.to)]).then(([a, b]) => {
      if (alive) setNames({ from: a.find((x) => x.icao === job.from) ?? null, to: b.find((x) => x.icao === job.to) ?? null });
    });
    return () => {
      alive = false;
    };
  }, [job.from, job.to]);

  const accept = async () => {
    setBusy(true);
    try {
      await careerApi.accept(job.id);
      invalidateCareer();
      toast.success(t.jobs.accepted);
      setTab("panel");
      setPick(true);
    } catch (e) {
      notifyError(e);
      invalidateCareer();
    } finally {
      setBusy(false);
    }
  };

  const q = job.quote;
  return (
    <aside className="card sticky top-4 overflow-hidden">
      <div className="relative">
        <RouteMap
          from={names.from ? { lat: names.from.lat, lon: names.from.lon, icao: job.from } : null}
          to={names.to ? { lat: names.to.lat, lon: names.to.lon, icao: job.to } : null}
          className="aspect-[1.7/1] w-full"
          aspect={1.7}
        />
        <span className="msfs-on-image absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-semibold text-white">
          <KindIcon kind={job.kind} className="size-3.5" />
          {t.kinds[job.kind]}
        </span>
      </div>
      <div className="flex flex-col gap-3 p-4">
        <div>
          <Route from={job.from} to={job.to} className="text-fg" />
          <div className="mt-1.5 flex flex-col gap-1">
            <AirportLine icao={job.from} name={names.from?.name} city={names.from?.city} />
            <AirportLine icao={job.to} name={names.to?.name} city={names.to?.city} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Fact label={t.jobs.distance} value={`${num(job.distanceNm)} nm`} hint={duration(job.plan.blockMin)} />
          <Fact label={t.jobs.class} value={clsName(job.class, view.classes)} />
          <Fact label={t.active.payload} value={job.pax ? t.jobs.pax(job.pax) : job.cargoKg ? t.jobs.kg(kg(job.cargoKg)) : "—"} hint={t.cargo[job.cargo] ?? job.cargo} />
          <Fact label={t.jobs.client} value={job.client} hint={t.jobs.deadline(job.deadlineH)} />
        </div>
        <div className="rounded-[14px] border border-line bg-surface-2/40 p-3">
          <div className="mb-1 flex items-center gap-2">
            <Badge tone={job.mode === "contract" ? "info" : "neutral"}>{t.mode[job.mode]}</Badge>
            <span className="text-[11.5px] text-muted">{t.jobs.xp(job.xpEstimate)}</span>
          </div>
          <p className="text-[11.5px] leading-relaxed text-fg-2">{t.modeHint[job.mode]}</p>
          <dl className="mt-2.5 flex flex-col gap-1 text-[12.5px]">
            <Line label={q ? t.jobs.revenue : t.jobs.pay} value={money(job.pay)} strong />
            {q && (
              <>
                <Line label={t.jobs.rent} value={money(-q.estRent)} />
                <Line label={t.jobs.fuelCost} value={money(-q.estFuel)} />
                <Line label={t.jobs.fees} value={money(-q.estFees)} />
                {(q.estNav ?? 0) > 0 && <Line label={`  ${r.settlement.navFees}`} value={money(-q.estNav)} />}
                {(q.estHandling ?? 0) > 0 && <Line label={`  ${r.settlement.handling}`} value={money(-q.estHandling)} />}
                <div className="my-1 h-px bg-line" />
                <Line label={t.jobs.profit} value={money(q.estProfit, true)} strong tone={q.estProfit > 0 ? "ok" : "danger"} />
              </>
            )}
          </dl>
        </div>
        {job.care && (
          <p className="flex items-start gap-2 rounded-xl bg-info/10 px-3 py-2 text-[11.5px] text-info">
            <Package className="mt-0.5 size-3.5 shrink-0" />
            <span>
              <b className="font-semibold">{r.care[job.care]}:</b> {r.careHint[job.care]}
            </span>
          </p>
        )}
        {job.objectives.length > 0 && (
          <div className="well px-3 py-2">
            <div className="text-[11.5px] font-semibold text-fg">{r.flight.objectives}</div>
            <p className="mt-0.5 text-[11.5px] text-fg-2">{r.missionHint[job.kind]}</p>
            <ul className="mt-1 flex flex-col gap-0.5 text-[11.5px] text-fg-2">
              {job.objectives.map((o, i) => (
                <li key={i}>
                  {i + 1}. {objectiveLabel(r, o)}
                </li>
              ))}
            </ul>
          </div>
        )}
        {destWx && (
          <div className="well px-3 py-2">
            <div className="flex items-center gap-2">
              <span className="text-[11.5px] font-semibold text-fg">{r.wx.title}</span>
              <span className="font-mono text-[11.5px] text-fg-2">{job.to}</span>
              <WxChip category={destWx.category} />
              {destWx.wet && <Badge tone="info">{r.wx.wet}</Badge>}
            </div>
            <div className="tabular mt-0.5 text-[11.5px] text-fg-2">
              {r.wx.wind(destWx.windDir, destWx.windKt, destWx.gustKt)} · {destWx.visibilitySm !== null ? r.wx.vis(destWx.visibilitySm) : "—"} · {r.wx.ceiling(destWx.ceilingFt)}
            </div>
            <div className="mt-0.5 truncate font-mono text-[10.5px] text-muted" title={destWx.raw}>
              {destWx.raw}
            </div>
            {job.weatherBonus > 0 && <div className="mt-1 text-[11.5px] font-medium text-accent">{r.wx.bonus(job.weatherBonus)}</div>}
            {job.irRequired && <div className="mt-1 text-[11.5px] font-medium text-danger">{r.dispatch.issues.imc_without_ir("")}</div>}
          </div>
        )}
        {job.urgent && (
          <p className="flex items-center gap-2 text-[11.5px] text-danger">
            <Sparkles className="size-3.5" />
            {t.jobs.urgent} · {t.jobs.deadline(job.deadlineH)}
          </p>
        )}
        <Button variant="primary" size="lg" className="w-full" loading={busy} disabled={!!view.active || job.irRequired} onClick={accept}>
          {view.active ? t.jobs.busy : t.jobs.accept}
        </Button>
      </div>
    </aside>
  );
}

function Line({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: "ok" | "danger" }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-fg-2">{label}</dt>
      <dd className={clsx("tabular", strong && "font-semibold", tone === "ok" ? "text-ok" : tone === "danger" ? "text-danger" : "text-fg")}>{value}</dd>
    </div>
  );
}

function TravelDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useCareerT();
  const [target, setTarget] = useState<AirportHit | null>(null);
  const [busy, setBusy] = useState(false);
  const go = async () => {
    if (!target) return;
    setBusy(true);
    try {
      await careerApi.travel(target.icao);
      invalidateCareer();
      toast.success(t.jobs.moved(target.icao));
      onClose();
      setTarget(null);
    } catch (e) {
      notifyError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onClose={onClose} width={520} game="msfs">
      <DialogHeader title={t.jobs.travel} subtitle={t.jobs.travelHint} icon={<MapPinned className="size-5" />} onClose={onClose} />
      <DialogBody className="flex flex-col gap-3">
        <AirportSearch onPick={setTarget} placeholder={t.jobs.travelPh} autoFocus showTicket />
        {target && (
          <div className="flex items-center gap-3 rounded-[14px] border border-line bg-surface-2/50 px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="font-mono text-[16px] font-semibold text-fg">{target.icao}</div>
              <div className="truncate text-[12px] text-fg-2">{target.name}</div>
              <div className="text-[11.5px] text-muted">{target.distanceNm !== null && `${num(target.distanceNm)} nm`}</div>
            </div>
            <Button variant="primary" loading={busy} onClick={go}>
              {t.jobs.go(money(target.ticket ?? 0))}
            </Button>
          </div>
        )}
      </DialogBody>
    </Dialog>
  );
}
