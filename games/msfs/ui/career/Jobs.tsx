// İş ilanları: bulunduğun havalimanının panosu. Tek satır süzgeç (sıralama, iş türü, saat, hava), solda iş satırları
// (rota, ne taşındığı, uçak sınıfı, saat ve hava, ücret), sağda seçili işin haritası, gerekenleri, ödemesi ve
// "İşi al"dan sonra ne olacağı.

import { useEffect, useMemo, useState, type ReactNode } from "react";
import clsx from "clsx";
import { toast } from "sonner";
import { Lock, MapPinned, Package, Plane, RefreshCw } from "lucide-react";
import { notifyError } from "@/shell/actions";
import { Badge, Button, Dialog, DialogBody, DialogHeader, IconButton, Segmented, Skeleton } from "@/ui";
import { careerApi } from "./api";
import { className as clsName, duration, money, num } from "./format";
import { useCareerT } from "./i18n";
import { AirportLine, AirportSearch, Hint, KindIcon, PageTitle, Route, StatusTag, carryText } from "./parts";
import { WxChip, objectiveLabel } from "./Dispatch";
import { CatTag, CondInline, ConditionsBlock, TIME_FILTERS, WX_FILTERS, carriesPassengers, condOf, matchesCond, timeGroup, totalBonus, wxGroup, type TimeFilter, type WxFilter } from "./Conditions";
import { invalidateCareer, useBoard, useWeather } from "./queries";
import { useRealT } from "./real-i18n";
import { RouteMap } from "./RouteMap";
import { hasPath, onPath } from "./paths";
import { usePathT } from "./paths-i18n";
import { PathTag } from "./CareerPaths";
import { useCareerUi } from "./store";
import type { AirportHit, CareerView, Job } from "./types";

type Filter = "all" | "employee" | "contract" | "urgent";
type PathFilter = "all" | "on" | "off";
type Sort = "best" | "pay" | "short";

/** Pilot bu işi uçabilir mi? Uçamıyorsa nedeni (kısa, düz yazı). */
export function cannotFly(job: Job, view: CareerView, t: ReturnType<typeof useCareerT>): string | null {
  const p = view.pilot;
  if (!p) return null;
  const need = (view.classes.find((c) => c.id === job.class)?.licenses ?? []).filter((l) => !p.licenses.includes(l));
  if (need.length) return t.guide.cantLicence(need.map((id) => view.licenses.find((l) => l.id === id)?.short ?? id.toUpperCase()).join(", "));
  if (job.irRequired || (condOf(job).needsIr && !p.licenses.includes("ir"))) return t.guide.cantIr;
  return null;
}

/** Kazanç hızı: kâr (ya da ücret) / blok süresi; acil işe küçük ek. */
export function jobRate(job: Job): number {
  return ((job.quote ? job.quote.estProfit : job.pay) / Math.max(20, job.plan.blockMin)) * (job.urgent ? 1.1 : 1);
}

export function Jobs({ view }: { view: CareerView }) {
  const t = useCareerT();
  const r = useRealT();
  const { data: jobs, isLoading, refetch, isFetching } = useBoard(true);
  const [sort, setSort] = useState<Sort>("best");
  const [filter, setFilter] = useState<Filter>("all");
  const [timeF, setTimeF] = useState<TimeFilter>("all");
  const [wxF, setWxF] = useState<WxFilter>("all");
  const [pathF, setPathF] = useState<PathFilter>("all");
  const [selId, setSelId] = useState<string | null>(null);
  const pt = usePathT();
  const pathOn = hasPath(view.pilot);
  const [travel, setTravel] = useState(false);
  const loc = view.location;

  const byPath = (j: Job, f: PathFilter) => (f === "all" ? true : f === "on" ? onPath(j) : !!j.offPath);
  const byMode = (j: Job, f: Filter) => (f === "all" ? true : f === "urgent" ? j.urgent : j.mode === f) && byPath(j, pathF);
  const list = useMemo(() => {
    const l = (jobs ?? []).filter((j) => byMode(j, filter) && matchesCond(j, timeF, wxF));
    const fly = (j: Job) => (cannotFly(j, view, t) ? 0 : 1);
    const key: Record<Sort, (j: Job) => number> = { best: jobRate, pay: (j) => (j.quote ? j.quote.estProfit : j.pay), short: (j) => -j.plan.blockMin };
    return [...l].sort((a, b) => fly(b) - fly(a) || key[sort](b) - key[sort](a));
  }, [jobs, filter, timeF, wxF, pathF, sort, view, t]);
  const sel = list.find((j) => j.id === selId) ?? list[0] ?? null;
  const count = (f: Filter) => (jobs ?? []).filter((j) => byMode(j, f) && matchesCond(j, timeF, wxF)).length;
  // Saat ve hava seçeneklerinin sayıları diğer süzgeçlerle birlikte; boş seçenekler gizlenir (seçili olan kalır).
  const timeCount = (f: TimeFilter) => (jobs ?? []).filter((j) => byMode(j, filter) && matchesCond(j, "all", wxF) && (f === "all" || timeGroup(condOf(j)) === f)).length;
  const wxCount = (f: WxFilter) => (jobs ?? []).filter((j) => byMode(j, filter) && matchesCond(j, timeF, "all") && (f === "all" || wxGroup(condOf(j)) === f)).length;
  const filtered = filter !== "all" || timeF !== "all" || wxF !== "all" || pathF !== "all";
  const pathCount = (f: PathFilter) => (jobs ?? []).filter((j) => (filter === "all" || (filter === "urgent" ? j.urgent : j.mode === filter)) && matchesCond(j, timeF, wxF) && byPath(j, f)).length;
  const clear = () => {
    setPathF("all");
    setFilter("all");
    setTimeF("all");
    setWxF("all");
  };

  return (
    <div className="flex flex-col gap-6">
      <PageTitle
        eyebrow={t.jobs.subtitle(loc?.icao ?? "", loc?.city ?? "")}
        title={t.jobs.title}
        subtitle={t.guide.introJobs(loc?.icao ?? "")}
        aside={
          <>
            <Button variant="secondary" icon={<MapPinned className="size-4" />} onClick={() => setTravel(true)} disabled={!!view.active}>
              {t.jobs.travel}
            </Button>
            <IconButton label={t.hangar.refresh} onClick={() => void refetch()}>
              <RefreshCw className={clsx("size-4", isFetching && "animate-spin")} />
            </IconButton>
          </>
        }
      />
      {(jobs ?? []).length > 0 && (
        <div className="card flex flex-wrap items-center gap-x-4 gap-y-2.5 px-4 py-2.5">
          <Pick label={t.guide.sort} value={sort} onChange={(v) => setSort(v as Sort)} options={[["best", t.guide.sortBest], ["pay", t.guide.sortPay], ["short", t.guide.sortShort]]} />
          <span className="h-5 w-px bg-line-strong" />
          <Segmented<Filter>
            id="career-jobs"
            size="sm"
            value={filter}
            onChange={setFilter}
            options={(["all", "employee", "contract", "urgent"] as const).filter((f) => f === "all" || f === filter || count(f) > 0).map((f) => ({ value: f, label: t.jobs.filters[f], count: count(f) }))}
          />
          <Hint text={`${t.guide.employee} ${t.guide.contract}`} />
          {/* Yol süzgeci varken satır bilerek ikiye bölünür: üstte sıralama ve çalışma biçimi, altta yol, saat, hava. */}
          {pathOn ? <span className="basis-full" /> : <span className="h-5 w-px bg-line-strong" />}
          {pathOn && (
            <>
              <Pick
                label={pt.tags.filter}
                value={pathF}
                onChange={(v) => setPathF(v as PathFilter)}
                options={(["all", "on", "off"] as const).filter((f) => f === "all" || f === pathF || pathCount(f) > 0).map((f) => [f, `${f === "all" ? pt.tags.filterAll : f === "on" ? pt.tags.filterOn : pt.tags.filterOff} (${pathCount(f)})`])}
              />
              <span className="h-5 w-px bg-line-strong" />
            </>
          )}
          <Pick
            label={r.cond.filterTime}
            value={timeF}
            onChange={(v) => setTimeF(v as TimeFilter)}
            options={TIME_FILTERS.filter((f) => f === "all" || f === timeF || timeCount(f) > 0).map((f) => [f, `${r.cond.filter[f]} (${timeCount(f)})`])}
          />
          <Pick
            label={r.cond.filterWeather}
            value={wxF}
            onChange={(v) => setWxF(v as WxFilter)}
            options={WX_FILTERS.filter((f) => f === "all" || f === wxF || wxCount(f) > 0).map((f) => [f, `${r.cond.filter[f]} (${wxCount(f)})`])}
          />
          <span className="flex-1" />
          {filtered && (
            <button type="button" onClick={clear} className="text-[12px] font-semibold text-accent hover:underline">
              {t.guide.clearFilters}
            </button>
          )}
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-[minmax(0,1fr)_400px] gap-6">
          <div className="flex flex-col gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-[84px]" />
            ))}
          </div>
          <Skeleton className="h-[560px]" />
        </div>
      ) : list.length === 0 ? (
        <section className="card flex items-center gap-6 px-8 py-8">
          <Plane className="size-7 shrink-0 text-muted" strokeWidth={1.5} />
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-semibold text-fg">{t.jobs.empty}</div>
            <p className="mt-1 text-[13px] text-fg-2">{t.guide.jobsEmpty}</p>
          </div>
          {filtered ? (
            <Button variant="secondary" onClick={clear}>
              {t.guide.clearFilters}
            </Button>
          ) : (
            <Button variant="secondary" icon={<MapPinned className="size-4" />} onClick={() => setTravel(true)} disabled={!!view.active}>
              {t.jobs.travel}
            </Button>
          )}
        </section>
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)_400px] items-start gap-6">
          <ul className="card min-w-0 overflow-hidden">
            {list.map((j) => (
              <JobStrip key={j.id} job={j} view={view} selected={sel?.id === j.id} onClick={() => setSelId(j.id)} />
            ))}
          </ul>
          {sel && <JobDetail key={sel.id} job={sel} view={view} />}
        </div>
      )}
      <TravelDialog open={travel} onClose={() => setTravel(false)} />
    </div>
  );
}

/** Küçük, etiketli açılır seçim (süzgeç satırı). */
function Pick({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <label className="flex items-center gap-2">
      <span className="text-[12px] font-medium text-muted">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-7 rounded-full border border-line-strong bg-surface-2 pl-3 pr-7 text-[12px] font-semibold text-fg outline-none transition-colors hover:border-[color-mix(in_oklab,var(--accent)_35%,var(--line-strong))] focus:border-accent"
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}

/** İş satırı: tür ve ne taşındığı; rota ile saat ve hava; mesafe, süre ve uçak sınıfı; ücret (birimiyle) ve XP. */
export function JobStrip({ job, view, selected, onClick, trailing }: { job: Job; view: CareerView; selected?: boolean; onClick: () => void; trailing?: ReactNode }) {
  const t = useCareerT();
  const r = useRealT();
  const bonus = totalBonus(job);
  const value = job.quote ? job.quote.estProfit : job.pay;
  const blocked = cannotFly(job, view, t);
  const cat = condOf(job).wx?.category ?? job.weather;
  return (
    <li
      className={clsx(
        "group relative flex items-center border-t border-line transition-colors first:border-t-0",
        selected ? "bg-[color-mix(in_oklab,var(--accent)_7%,transparent)]" : "hover:bg-surface-2/45",
      )}
    >
      {selected && <span className="absolute inset-y-2.5 left-0 w-[3px] rounded-r-full bg-accent" />}
      <button type="button" onClick={onClick} aria-pressed={selected} className="flex min-w-0 flex-1 items-center gap-4 py-3.5 pl-6 pr-4 text-left">
        <span className={clsx("flex size-10 shrink-0 items-center justify-center rounded-xl transition-colors", selected ? "accent-surface" : "bg-surface-2 text-fg-2 group-hover:text-accent")}>
          <KindIcon kind={job.kind} className="size-[18px]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-1.5 text-[12px]">
            <span className="shrink-0 font-semibold text-fg-2">{t.kinds[job.kind]}</span>
            <span className="text-muted">·</span>
            <span className="truncate text-muted">{carryText(job, t)}</span>
            {job.urgent && (
              <>
                <span className="text-muted">·</span>
                <span className="shrink-0 font-semibold text-danger">{t.jobs.urgent}</span>
              </>
            )}
            {job.mode === "contract" && (
              <>
                <span className="text-muted">·</span>
                <span className="shrink-0 font-semibold text-info">{t.mode.contract}</span>
              </>
            )}
            <span className="ml-1 shrink-0">
              <PathTag job={job} compact />
            </span>
          </span>
          <span className="mt-1 flex min-w-0 items-center justify-between gap-4">
            <Route from={job.from} to={job.to} className="shrink-0 text-fg" />
            <span className="flex min-w-0 items-center gap-2 text-[12px] text-fg-2">
              <CondInline job={job} />
              {cat && <CatTag category={cat} />}
            </span>
          </span>
          <span className="tabular mt-1 flex min-w-0 items-center gap-2 whitespace-nowrap text-[12px] text-fg-2">
            <span>{num(job.distanceNm)} nm</span>
            <span className="text-muted">·</span>
            <span>{duration(job.plan.blockMin)}</span>
            <span className="text-muted">·</span>
            <span className="truncate">{clsName(job.class, view.classes)}</span>
            {blocked && (
              <span className="inline-flex shrink-0 items-center gap-1 font-semibold text-danger">
                <Lock className="size-3" />
                {blocked}
              </span>
            )}
          </span>
        </span>
        <span className="w-[112px] shrink-0 text-right">
          <span className="num block text-[20px] text-fg">{money(value)}</span>
          <span className={clsx("tabular mt-1 block text-[11.5px]", job.quote ? (value > 0 ? "text-ok" : "text-danger") : "text-muted")}>{job.quote ? t.guide.profit : t.guide.pay}</span>
          <span className="tabular block text-[11.5px] text-muted">
            {t.jobs.xp(job.xpEstimate)}
            {bonus > 0 && <span className="font-semibold text-accent"> · {r.cond.bonusShort(bonus)}</span>}
          </span>
        </span>
      </button>
      {trailing && <div className="shrink-0 py-3.5 pr-6">{trailing}</div>}
    </li>
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
  const blocked = cannotFly(job, view, t);
  const c = condOf(job);
  const licences = (view.classes.find((x) => x.id === job.class)?.licenses ?? []).filter((l) => l !== "spl").map((id) => view.licenses.find((l) => l.id === id)?.short ?? id.toUpperCase());
  const needs: string[] = [t.guide.needsAircraft(clsName(job.class, view.classes))];
  if (licences.length) needs.push(t.guide.needsLicences(licences.join(", ")));
  if (c.needsIr || job.irRequired) needs.push(r.cond.needIr);
  if ((c.time === "night" || c.nightArrival) && c.time !== "now") needs.push(r.cond.needNight);
  if (c.nightArrival && carriesPassengers(job)) needs.push(r.cond.needNightPax);
  return (
    <aside className="card sticky top-4 flex flex-col overflow-hidden">
      <div className="relative">
        <RouteMap
          from={names.from ? { lat: names.from.lat, lon: names.from.lon, icao: job.from } : null}
          to={names.to ? { lat: names.to.lat, lon: names.to.lon, icao: job.to } : null}
          className="aspect-[1.8/1] w-full"
          aspect={1.8}
        />
        <span className="msfs-on-image absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-semibold text-white">
          <KindIcon kind={job.kind} className="size-3.5" />
          {t.kinds[job.kind]}
        </span>
      </div>
      <div className="flex flex-col gap-4 p-5">
        <div>
          <div className="truncate text-[12px] text-muted">
            {job.client} · {carryText(job, t)}
          </div>
          <Route from={job.from} to={job.to} size="lg" className="mt-1 text-fg" />
          <div className="mt-2 flex flex-col gap-1">
            <AirportLine icao={job.from} name={names.from?.name} city={names.from?.city} />
            <AirportLine icao={job.to} name={names.to?.name} city={names.to?.city} />
          </div>
          <div className="tabular mt-2 text-[12px] text-fg-2">
            {num(job.distanceNm)} nm · {duration(job.plan.blockMin)} · {t.guide.dueIn(job.deadlineH)}
          </div>
        </div>

        {/* Ödeme: kim neyi öder, ne kazanırsın */}
        <div className="rounded-[14px] border border-line">
          <div className="flex items-baseline justify-between gap-3 px-3.5 pb-2 pt-3">
            <div>
              <div className="num text-[24px] text-fg">{money(q ? q.estProfit : job.pay)}</div>
              <div className="mt-1 text-[11.5px] text-muted">
                {q ? t.guide.profit : t.guide.pay} · {t.jobs.xp(job.xpEstimate)}
              </div>
            </div>
            <StatusTag tone={job.mode === "contract" ? "info" : "neutral"}>{t.mode[job.mode]}</StatusTag>
          </div>
          <p className="px-3.5 pb-3 text-[12px] leading-relaxed text-fg-2">{job.mode === "contract" ? t.guide.contract : t.guide.employee}</p>
          {q && (
            <dl className="flex flex-col gap-1 border-t border-line px-3.5 py-2.5 text-[12.5px]">
              <Line label={t.jobs.revenue} value={money(job.pay)} />
              <Line label={t.jobs.rent} value={money(-q.estRent)} />
              <Line label={t.jobs.fuelCost} value={money(-q.estFuel)} />
              <Line label={t.jobs.fees} value={money(-q.estFees)} />
              {(q.estNav ?? 0) > 0 && <Line label={r.settlement.navFees} value={money(-q.estNav)} sub />}
              {(q.estHandling ?? 0) > 0 && <Line label={r.settlement.handling} value={money(-q.estHandling)} sub />}
              <div className="my-1 h-px bg-line" />
              <Line label={t.jobs.profit} value={money(q.estProfit, true)} strong tone={q.estProfit > 0 ? "ok" : "danger"} />
            </dl>
          )}
        </div>

        {(job.offPath || onPath(job)) && <PathNote job={job} />}

        {/* Gerekenler */}
        <div>
          <div className="mb-1.5 text-[12px] font-semibold text-fg-2">{t.guide.needsTitle}</div>
          <ul className="flex flex-col gap-1 text-[12.5px] text-fg">
            {needs.map((n) => (
              <li key={n} className="flex gap-2">
                <span className="mt-[7px] size-1 shrink-0 rounded-full bg-muted" />
                {n}
              </li>
            ))}
          </ul>
          {blocked && (
            <p className="mt-2 flex items-center gap-1.5 text-[12px] font-semibold text-danger">
              <Lock className="size-3.5" />
              {t.guide.cantFly}: {blocked}
            </p>
          )}
        </div>

        <ConditionsBlock job={job} sim={view.link.sim} />

        {destWx && !c.wx && (
          <div className="rounded-[14px] border border-line px-3.5 py-2.5">
            <div className="flex items-center gap-2">
              <span className="text-[12px] font-semibold text-fg-2">{r.wx.title}</span>
              <span className="font-mono text-[12px] font-semibold text-fg">{job.to}</span>
              <WxChip category={destWx.category} />
              {destWx.wet && <Badge tone="info">{r.wx.wet}</Badge>}
            </div>
            <div className="tabular mt-1 text-[12px] text-fg-2">
              {r.wx.wind(destWx.windDir, destWx.windKt, destWx.gustKt)} · {destWx.visibilitySm !== null ? r.wx.vis(destWx.visibilitySm) : "—"} · {r.wx.ceiling(destWx.ceilingFt)}
            </div>
            {job.weatherBonus > 0 && <div className="mt-1 text-[11.5px] font-semibold text-accent">{r.wx.bonus(job.weatherBonus)}</div>}
          </div>
        )}

        {job.care && (
          <p className="flex items-start gap-2 rounded-xl bg-info/10 px-3 py-2 text-[12px] text-info">
            <Package className="mt-0.5 size-3.5 shrink-0" />
            <span>
              <b className="font-semibold">{r.care[job.care]}:</b> {r.careHint[job.care]}
            </span>
          </p>
        )}
        {job.objectives.length > 0 && (
          <div className="rounded-[14px] border border-line px-3.5 py-2.5">
            <div className="text-[12px] font-semibold text-fg-2">{r.flight.objectives}</div>
            <p className="mt-1 text-[11.5px] text-fg-2">{r.missionHint[job.kind]}</p>
            <ol className="mt-1.5 flex flex-col gap-0.5 text-[12px] text-fg">
              {job.objectives.map((o, i) => (
                <li key={i} className="flex gap-2">
                  <span className="tabular w-4 shrink-0 font-mono text-muted">{i + 1}</span>
                  {objectiveLabel(r, o)}
                </li>
              ))}
            </ol>
          </div>
        )}

        {/* İşi alınca ne olur */}
        <div>
          <div className="mb-2 text-[12px] font-semibold text-fg-2">{t.guide.stepsTitle}</div>
          <ol className="flex flex-col gap-2">
            {t.guide.steps.map((s, i) => (
              <li key={s} className="flex items-start gap-2.5 text-[12.5px] leading-snug text-fg-2">
                <span className="tabular flex size-5 shrink-0 items-center justify-center rounded-full bg-surface-3 font-mono text-[10.5px] font-bold text-fg">{i + 1}</span>
                {s}
              </li>
            ))}
          </ol>
        </div>
      </div>
      <div className="mt-auto border-t border-line bg-surface-2/40 p-4">
        <Button variant="primary" size="lg" className="w-full" loading={busy} disabled={!!view.active || !!blocked} onClick={accept}>
          {view.active ? t.jobs.busy : blocked ? t.guide.cantFly : t.jobs.accept}
        </Button>
      </div>
    </aside>
  );
}

/** İşin kariyer yoluna uyumu: yolundaysa primler ve rütbeye sayılması, değilse yol dışı notu. */
function PathNote({ job }: { job: Job }) {
  const pt = usePathT();
  const on = onPath(job);
  return (
    <div className={clsx("flex items-start gap-2.5 rounded-[14px] px-3.5 py-2.5 text-[12px] leading-relaxed", on ? "accent-soft" : "border border-dashed border-line-strong text-fg-2")}>
      <span className="mt-[1px] shrink-0">
        <PathTag job={job} compact />
      </span>
      <span>{on ? pt.tags.onPathHint(job.pathPayBonus ?? 0, job.pathXpBonus ?? 0) : pt.tags.offPathHint}</span>
    </div>
  );
}

function Line({ label, value, strong, tone, sub }: { label: string; value: string; strong?: boolean; tone?: "ok" | "danger"; sub?: boolean }) {
  return (
    <div className={clsx("flex items-center justify-between", sub && "pl-3 text-[12px]")}>
      <dt className={clsx(strong ? "font-semibold text-fg" : "text-fg-2")}>{label}</dt>
      <dd className={clsx("tabular", strong && "text-[14px] font-semibold", tone === "ok" ? "text-ok" : tone === "danger" ? "text-danger" : "text-fg")}>{value}</dd>
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
              <div className="num text-[20px] text-fg">{target.icao}</div>
              <div className="mt-0.5 truncate text-[12px] text-fg-2">{target.name}</div>
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
