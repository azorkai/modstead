// Panel: her durumda tek belirgin sonraki adım ana sütunun başında. İş yoksa sana uygun üç ilan (tek tıkla "İşi al"),
// iş alındıysa uçuşa hazırlık, uçuştayken canlı uçuş, indiysen uçuşu bitirme (ActiveJob). Sağda kısa pilot durumu ve son
// uçuşlar; altta uçuş araçları ve kapalı başlayan teşhis.

import { useMemo, useState } from "react";
import clsx from "clsx";
import { toast } from "sonner";
import { AppWindow, ArrowRight, ClipboardCheck, Lock, MonitorSmartphone, X } from "lucide-react";
import { useLang } from "@/lib/i18n";
import { notifyError } from "@/shell/actions";
import { Badge, Button, Skeleton } from "@/ui";
import { ActiveJob } from "./ActiveJob";
import { AircraftPhoto } from "./aircraft/AircraftPhoto";
import { aircraftVisual } from "./aircraft/families";
import { careerApi } from "./api";
import { CondInline } from "./Conditions";
import { DeckCard, useOpenDeck } from "./DeckCard";
import { DispatchCard } from "./Dispatch";
import { TONE_BG, TONE_TEXT, className as clsName, duration, gradeTone, hours, landingTone, money, num } from "./format";
import { HudCard, MenuCard, packageNeeds, usePackage } from "./Hud";
import { useCareerT } from "./i18n";
import { DiagnosticsPanel } from "./Journal";
import { cannotFly, jobRate } from "./Jobs";
import { Bar, Disclosure, Hint, INK, KindIcon, LICENSE_ART, MoreLink, Panel, Route, carryText, pickGoal } from "./parts";
import { hasPath, onPath, pathLicenceGoal } from "./paths";
import { usePathT } from "./paths-i18n";
import { PathGoals, PathTag } from "./CareerPaths";
import { invalidateCareer, useAircraftOptions, useBoard, useDeckInfo } from "./queries";
import { RecordsCard } from "./Records";
import { useCareerUi } from "./store";
import type { AircraftClass, CareerView, Job, LogEntry } from "./types";

const PASS: Record<string, number> = { easy: 65, normal: 75, realistic: 85 };

export function Dashboard({ view }: { view: CareerView }) {
  return (
    <div className="flex flex-col gap-6">
      <HowItWorks view={view} />
      <div className="grid grid-cols-[minmax(0,1fr)_320px] items-start gap-6 min-[1500px]:grid-cols-[minmax(0,1fr)_368px]">
        <div className="flex min-w-0 flex-col gap-6">
          {view.active ? (
            <>
              <ActiveJob view={view} active={view.active} />
              <DispatchCard active={view.active} />
            </>
          ) : (
            <>
              <NextFlight view={view} />
              {hasPath(view.pilot) && <PathGoals view={view} />}
              <Goal view={view} />
            </>
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-6">
          <RecordsCard view={view} />
          <Recent view={view} />
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <FlightTools />
        <DiagnosticsPanel />
      </div>
    </div>
  );
}

// ───────────── Sıradaki uçuş ─────────────

/** Panodan uçulabilecek işler: kazanç hızına göre (panodaki "Sana en uygun" sırası), önce farklı türler. Yolu olan
 *  pilotta yolundaki işler öne çıkar (kazanç hızı ×1,6); yol dışı iyi bir iş yine de üçüncü sıraya girebilir. */
function recommend(jobs: Job[], view: CareerView, t: ReturnType<typeof useCareerT>, n = 3): Job[] {
  const score = (j: Job) => jobRate(j) * (onPath(j) ? 1.6 : 1);
  const sorted = jobs.filter((j) => j.kind !== "checkride" && !cannotFly(j, view, t)).sort((a, b) => score(b) - score(a));
  const out: Job[] = [];
  for (const j of sorted) if (out.length < n && !out.some((o) => o.kind === j.kind)) out.push(j);
  for (const j of sorted) if (out.length < n && !out.includes(j)) out.push(j);
  return out;
}

function NextFlight({ view }: { view: CareerView }) {
  const t = useCareerT();
  const pt = usePathT();
  const setTab = useCareerUi((s) => s.setTab);
  const { data: jobs, isLoading } = useBoard(true);
  const picks = useMemo(() => recommend(jobs ?? [], view, t), [jobs, view, t]);
  const loc = view.location;
  const mine = hasPath(view.pilot) ? (jobs ?? []).filter(onPath).length : 0;
  return (
    <Panel
      title={t.panel.nextTitle}
      subtitle={loc ? `${t.panel.nextSub(loc.icao, jobs?.length ?? 0)}${mine > 0 ? ` · ${pt.tags.boardSub(mine)}` : ""}` : undefined}
      aside={
        <span className="flex items-center gap-2">
          <Hint text={<StepsHint />} />
          <MoreLink onClick={() => setTab("jobs")}>{t.panel.allJobs(jobs?.length ?? 0)}</MoreLink>
        </span>
      }
    >
      {isLoading ? (
        <div className="flex flex-col gap-2 p-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-[76px]" />
          ))}
        </div>
      ) : picks.length === 0 ? (
        <div className="px-6 py-7">
          <div className="text-[14px] font-semibold text-fg">{t.panel.noRecommended}</div>
          <p className="mt-1 max-w-[60ch] text-[12.5px] leading-relaxed text-fg-2">{t.panel.noRecommendedBody}</p>
          <Button className="mt-4" variant="secondary" icon={<ArrowRight className="size-4" />} onClick={() => setTab("jobs")}>
            {t.panel.toBoard}
          </Button>
        </div>
      ) : (
        <ul className="@container">
          {picks.map((j, i) => (
            <Pick key={j.id} job={j} view={view} first={i === 0} />
          ))}
        </ul>
      )}
    </Panel>
  );
}

/** Sınıfın tanınan bir uçağı (fotoğrafı olsun diye); simdeki uçak listesinde o sınıftan biri varsa o. */
const CLASS_SAMPLE: Partial<Record<AircraftClass, string>> = {
  light_piston: "Cessna Skyhawk",
  piston_twin: "Beechcraft Baron G58",
  turboprop_single: "Cessna 208 Grand Caravan",
  turboprop_twin: "Beechcraft King Air 350i",
  bizjet: "Cessna Citation CJ4",
  narrowbody: "Airbus A320neo",
  widebody: "Boeing 787-10",
  helicopter: "Airbus H125",
};

function useClassTitle(cls: AircraftClass | null): string {
  const { data: options = [] } = useAircraftOptions(true);
  return useMemo(() => {
    if (!cls) return "";
    const own = options.find((o) => o.class === cls && aircraftVisual(o.title, cls).photo);
    return own?.title ?? CLASS_SAMPLE[cls] ?? "";
  }, [options, cls]);
}

/** Önerilen iş: uçağın fotoğrafı, tür ve müşteri, rota, plan ve koşul tek satırda; kazanç ve "İşi al". */
function Pick({ job, view, first }: { job: Job; view: CareerView; first: boolean }) {
  const t = useCareerT();
  const setTab = useCareerUi((s) => s.setTab);
  const setPick = useCareerUi((s) => s.setPick);
  const [busy, setBusy] = useState(false);
  const title = useClassTitle(job.class);
  const photo = !!title && aircraftVisual(title, job.class).photo;
  const accept = async () => {
    setBusy(true);
    try {
      await careerApi.accept(job.id);
      invalidateCareer();
      toast.success(t.jobs.accepted);
      setPick(true);
    } catch (e) {
      notifyError(e);
      invalidateCareer();
    } finally {
      setBusy(false);
    }
  };
  return (
    <li className="flex items-center gap-4 border-t border-line px-6 py-4 first:border-t-0 @min-[720px]:gap-6">
      <button type="button" onClick={() => setTab("jobs")} className="group flex min-w-0 flex-1 items-center gap-4 text-left @min-[720px]:gap-6">
        {photo ? (
          <AircraftPhoto title={title} cls={job.class} className="h-[52px] w-[80px] shrink-0 rounded-[10px] @min-[720px]:h-[60px] @min-[720px]:w-[96px]" />
        ) : (
          <span className="flex h-[52px] w-[80px] shrink-0 items-center justify-center rounded-[10px] bg-surface-2 text-fg-2 @min-[720px]:h-[60px] @min-[720px]:w-[96px]">
            <KindIcon kind={job.kind} className="size-5" />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-1.5 text-[12px] text-muted">
            <KindIcon kind={job.kind} className="size-3.5 shrink-0" />
            <span className="shrink-0 font-semibold text-fg-2">{t.kinds[job.kind]}</span>
            <span>·</span>
            <span className="truncate">{carryText(job, t)}</span>
            {job.urgent && (
              <>
                <span>·</span>
                <span className="shrink-0 font-semibold text-danger">{t.jobs.urgent}</span>
              </>
            )}
            <span className="ml-1 shrink-0">
              <PathTag job={job} compact />
            </span>
          </span>
          <span className="mt-1 flex min-w-0 items-baseline justify-between gap-4">
            <Route from={job.from} to={job.to} className="shrink-0 text-fg transition-colors group-hover:text-accent" />
            <span className="hidden min-w-0 text-[12px] text-fg-2 @min-[720px]:block">
              <CondInline job={job} />
            </span>
          </span>
          <span className="tabular mt-1 flex min-w-0 items-center gap-2 whitespace-nowrap text-[12px] text-fg-2">
            <span>{num(job.distanceNm)} nm</span>
            <span className="text-muted">·</span>
            <span>{duration(job.plan.blockMin)}</span>
            <span className="text-muted">·</span>
            <span className="hidden truncate @min-[720px]:inline">{clsName(job.class, view.classes)}</span>
            <span className="min-w-0 @min-[720px]:hidden">
              <CondInline job={job} />
            </span>
          </span>
        </span>
      </button>
      <div className="w-[100px] shrink-0 text-right">
        <div className="num text-[20px] text-fg">{money(job.quote ? job.quote.estProfit : job.pay)}</div>
        <div className="tabular mt-1 text-[11.5px] text-muted">{job.quote ? t.guide.profit : t.guide.pay}</div>
        <div className="tabular text-[11.5px] text-muted">{t.jobs.xp(job.xpEstimate)}</div>
      </div>
      <Button size="sm" variant={first ? "primary" : "secondary"} className="shrink-0" loading={busy} onClick={accept}>
        {t.jobs.accept}
      </Button>
    </li>
  );
}

// ───────────── Sıradaki lisans ─────────────

/** Sıradaki lisans tek satırda: ne gerektiği düz yazıyla; sınava hazırsa "Sınava gir". */
function Goal({ view }: { view: CareerView }) {
  const t = useCareerT();
  const lang = useLang((s) => s.lang);
  const setTab = useCareerUi((s) => s.setTab);
  const setPick = useCareerUi((s) => s.setPick);
  const [busy, setBusy] = useState(false);
  const p = view.pilot!;
  const ready = view.licenses.filter((l) => l.ready && !l.held);
  // Yolu olan pilotta sıradaki lisans yolun lisans sırasından (önkoşulu eksikse önce o).
  const route = p.pathStatus?.route ?? [];
  const goal = ready.find((l) => route.includes(l.id)) ?? (hasPath(p) ? pathLicenceGoal(view, null) : null) ?? ready[0] ?? pickGoal(view.licenses, p.stats.hours, p.level);
  if (!goal) return null;
  const isReady = goal.ready && !goal.held;
  const name = lang === "en" ? goal.nameEn : goal.nameTr;
  const take = async () => {
    setBusy(true);
    try {
      await careerApi.checkride(goal.id);
      invalidateCareer();
      toast.success(t.licenses.taken);
      setPick(true);
    } catch (e) {
      notifyError(e);
    } finally {
      setBusy(false);
    }
  };
  const needs: string[] = [];
  const hoursLeft = Math.max(0, goal.hoursNeeded - p.stats.hours);
  if (hoursLeft > 0) needs.push(t.panel.needHours(hours(hoursLeft)));
  if (goal.levelNeeded > p.level) needs.push(t.panel.needLevel(goal.levelNeeded));
  if (goal.missingLicenses.length) needs.push(t.panel.needLicences(goal.missingLicenses.map((id) => view.licenses.find((l) => l.id === id)?.short ?? id).join(", ")));
  needs.push(t.panel.examFee(money(goal.fee)));
  const line = isReady ? [t.licenses.fee(money(goal.fee)), t.licenses.exam(clsName(goal.examClass, view.classes))].join(" · ") : needs.join(" · ");
  const sentence = line.charAt(0).toLocaleUpperCase(lang === "en" ? "en" : "tr") + line.slice(1);
  const progress = Math.min(1, p.stats.hours / Math.max(0.1, goal.hoursNeeded));
  return (
    <section className={clsx("card @container", isReady && "border-[color-mix(in_oklab,var(--accent)_40%,var(--line))]")}>
      <div className="flex items-center gap-6 py-3 pl-3 pr-6">
        <div data-theme="dark" data-game="msfs" className="relative h-[66px] w-[106px] shrink-0 overflow-hidden rounded-[10px]" style={{ background: INK }}>
          {LICENSE_ART[goal.id] && <img src={LICENSE_ART[goal.id]} alt="" draggable={false} className="absolute inset-0 size-full object-cover" />}
          <span className="absolute bottom-1 left-1.5 rounded-[4px] bg-black/55 px-1 font-mono text-[10px] font-bold tracking-[0.06em] text-white">{goal.short}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className={clsx("text-[12px] font-semibold", isReady ? "text-accent" : "text-muted")}>{isReady ? t.panel.readyEyebrow : t.panel.goalEyebrow}</div>
          <div className="mt-0.5 flex min-w-0 items-center gap-1.5">
            <span className="truncate text-[14px] font-semibold text-fg">{name}</span>
            <Hint text={`${t.guide.unlocks}: ${lang === "en" ? goal.aboutEn : goal.aboutTr}${isReady ? ` ${t.guide.checkrideHow(PASS[p.difficulty] ?? 75)}` : ""}`} />
          </div>
          <div className="tabular mt-0.5 truncate text-[12.5px] text-fg-2" title={isReady ? t.licenses.pass(PASS[p.difficulty] ?? 75) : sentence}>
            {sentence}
          </div>
        </div>
        {isReady ? (
          <>
            {ready.length > 1 && (
              <span className="hidden @min-[880px]:inline-flex">
                <MoreLink onClick={() => setTab("licenses")}>{t.panel.alsoReady(ready.length - 1)}</MoreLink>
              </span>
            )}
            <Button variant="subtle" icon={<ClipboardCheck className="size-4" />} loading={busy} onClick={take}>
              {t.licenses.take}
            </Button>
          </>
        ) : (
          <>
            <div className="hidden w-[150px] shrink-0 @min-[640px]:block">
              <div className="tabular mb-1.5 flex items-center justify-between text-[11.5px] text-muted">
                <span>{t.licenses.hours(hours(p.stats.hours), hours(goal.hoursNeeded))}</span>
                {goal.missingLicenses.length > 0 && <Lock className="size-3" />}
              </div>
              <Bar value={progress} />
            </div>
            <MoreLink onClick={() => setTab("licenses")}>{t.tabs.licenses}</MoreLink>
          </>
        )}
      </div>
    </section>
  );
}

// ───────────── Son uçuşlar ─────────────

function Recent({ view }: { view: CareerView }) {
  const t = useCareerT();
  const setTab = useCareerUi((s) => s.setTab);
  const openFlight = useCareerUi((s) => s.openFlight);
  return (
    <Panel
      title={
        <span className="flex items-center gap-1.5">
          {t.panel.recent}
          <Hint text={`${t.guide.grade} ${t.guide.fpm}`} />
        </span>
      }
      aside={view.recent.length ? <MoreLink onClick={() => setTab("logbook")}>{t.panel.seeAll}</MoreLink> : undefined}
    >
      {view.recent.length === 0 ? (
        <p className="px-6 py-4 text-[12.5px] leading-relaxed text-fg-2">{t.panel.noFlights}</p>
      ) : (
        <ul>
          {view.recent.slice(0, 5).map((e) => (
            <RecentRow key={e.id} e={e} onClick={() => openFlight(e.id)} />
          ))}
        </ul>
      )}
    </Panel>
  );
}

function RecentRow({ e, onClick }: { e: LogEntry; onClick: () => void }) {
  const t = useCareerT();
  const ok = e.result === "completed" || e.result === "late";
  const g = ok ? gradeTone(e.summary.grade) : "danger";
  return (
    <li>
      <button type="button" onClick={onClick} className="flex w-full items-center gap-3 border-t border-line px-6 py-3 text-left transition-colors first:border-t-0 hover:bg-surface-2/50">
        <span className={clsx("flex h-7 w-9 shrink-0 items-center justify-center rounded-md font-mono text-[12px] font-bold", TONE_BG[g], TONE_TEXT[g])}>{ok ? e.summary.grade : "—"}</span>
        <span className="min-w-0 flex-1">
          <Route from={e.job.from} to={e.arrived || e.job.to} size="sm" className="text-fg" />
          <span className="block truncate text-[11.5px] text-muted">{ok ? t.kinds[e.job.kind] : t.results[e.result]}</span>
        </span>
        <span className="shrink-0 text-right">
          <span className={clsx("tabular block text-[12.5px] font-semibold", e.settlement.net >= 0 ? "text-fg" : "text-danger")}>{money(e.settlement.net, true)}</span>
          {e.landing && <span className={clsx("tabular block text-[11px]", TONE_TEXT[landingTone(e.landing.label)])}>{num(e.landing.fpm)} fpm</span>}
        </span>
      </button>
    </li>
  );
}

/** "İşi al"dan sonra ne olur: üç adım (ipucu içinde). */
function StepsHint() {
  const t = useCareerT();
  return (
    <span className="block">
      <span className="mb-1 block font-semibold text-fg">{t.guide.stepsTitle}</span>
      {t.guide.steps.map((s, i) => (
        <span key={s} className="block">
          {i + 1}. {s}
        </span>
      ))}
    </span>
  );
}

const HOW_KEY = "msfs.career.how";

/** Giriş cümlesi ve "Kariyer nasıl işler?" (dört adım). Henüz uçuşu olmayanda açık başlar; kapatılırsa hatırlanır. */
function HowItWorks({ view }: { view: CareerView }) {
  const t = useCareerT();
  const [open, setOpen] = useState(() => {
    try {
      const v = localStorage.getItem(HOW_KEY);
      if (v) return v === "open";
    } catch {
      // depolama yoksa varsayılana düş
    }
    return (view.pilot?.stats.flights ?? 0) === 0;
  });
  const toggle = (v: boolean) => {
    setOpen(v);
    try {
      localStorage.setItem(HOW_KEY, v ? "open" : "closed");
    } catch {
      // önizleme ya da kısıtlı depolama: tercih hatırlanmaz
    }
  };
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-4">
        <p className="min-w-0 flex-1 text-[13px] text-fg-2">{t.guide.introPanel}</p>
        {!open && (
          <button type="button" onClick={() => toggle(true)} className="shrink-0 text-[12.5px] font-semibold text-accent hover:underline">
            {t.guide.howShow}
          </button>
        )}
      </div>
      {open && (
        <section className="card relative px-6 py-4">
          <div className="mb-3 flex items-center gap-3">
            <h3 className="title min-w-0 flex-1 text-[15px] text-fg">{t.guide.howTitle}</h3>
            <button type="button" onClick={() => toggle(false)} className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[12px] font-semibold text-fg-2 transition-colors hover:bg-surface-2 hover:text-fg">
              <X className="size-3.5" />
              {t.guide.howHide}
            </button>
          </div>
          <ol className="grid grid-cols-4 gap-4">
            {t.guide.how.map((h, i) => (
              <li key={h.title} className="flex gap-3">
                <span className="num w-7 shrink-0 text-[20px] text-accent">{i + 1}</span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold text-fg">{h.title}</span>
                  <span className="mt-0.5 block text-pretty text-[12px] leading-relaxed text-fg-2">{h.body}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}

const TOOLS_KEY = "msfs.career.tools";

/** Uçuş araçları: tek satırlık özet (her aracın durumu, "Pencerede aç", işlem bekleyen varsa uyarı). Bir şey işlem
 *  beklerken açık, hepsi hazırken kapalı başlar; kullanıcının tercihi hatırlanır. Açılınca üç kart eşit boyda. */
function FlightTools() {
  const t = useCareerT();
  const { data: hud } = usePackage("hud");
  const { data: menu } = usePackage("menu");
  const { data: deck } = useDeckInfo();
  const { open: openDeck, busy } = useOpenDeck();
  const noServer = !!deck && (deck.port === null || !deck.localUrl);
  const needs = [packageNeeds(hud), packageNeeds(menu)].filter(Boolean).length + (noServer ? 1 : 0);
  const [pref, setPref] = useState<boolean | null>(() => {
    try {
      const v = localStorage.getItem(TOOLS_KEY);
      return v ? v === "open" : null;
    } catch {
      return null;
    }
  });
  const open = pref ?? needs > 0;
  const toggle = () => {
    setPref(!open);
    try {
      localStorage.setItem(TOOLS_KEY, open ? "closed" : "open");
    } catch {
      // önizleme ya da kısıtlı depolama: tercih hatırlanmaz
    }
  };
  const state = (s: typeof hud) => {
    const n = packageNeeds(s);
    if (!s) return "—";
    return n === "install" ? t.guide.toolsNotInstalled : n === "update" ? t.guide.toolsUpdate : n === "link" ? t.guide.toolsNotLinked : t.guide.toolsInstalled(s.version ?? "");
  };
  const summary = (
    <>
      <span>
        {t.deck.title} <span className={noServer ? "text-warn" : "text-fg-2"}>{noServer ? t.guide.toolsNoServer : t.guide.toolsReady}</span>
      </span>
      <span className="text-muted"> · </span>
      <span>
        {t.menuTile.title} <span className={packageNeeds(menu) ? "text-warn" : "text-fg-2"}>{state(menu)}</span>
      </span>
      <span className="text-muted"> · </span>
      <span>
        {t.hud.title} <span className={packageNeeds(hud) ? "text-warn" : "text-fg-2"}>{state(hud)}</span>
      </span>
    </>
  );
  return (
    <Disclosure
      open={open}
      onToggle={toggle}
      icon={<MonitorSmartphone />}
      title={t.panel.tools}
      eyebrow={summary}
      aside={
        <>
          {needs > 0 && (
            <Badge tone="warn" dot>
              {t.guide.toolsAction(needs)}
            </Badge>
          )}
          {!open && (
            <Button size="sm" variant="secondary" icon={<AppWindow className="size-3.5" />} loading={busy} disabled={noServer} onClick={() => void openDeck()}>
              {t.deck.open}
            </Button>
          )}
        </>
      }
    >
      <div className="grid grid-cols-3 items-stretch gap-4 p-4">
        <DeckCard />
        <MenuCard />
        <HudCard />
      </div>
    </Disclosure>
  );
}
