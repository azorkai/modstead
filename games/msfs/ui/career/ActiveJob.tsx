// Aktif iş: rota haritası, plan, uçak seçimi, "Uçuşu başlat", otomatik başlatmanın adımları, uçuş öncesi
// kontrol kapısı ve uçuş sürerken canlı göstergeler.

import { useState } from "react";
import clsx from "clsx";
import { toast } from "sonner";
import {
  CircleAlert,
  CircleCheck,
  CircleDashed,
  ExternalLink,
  FileText,
  Flag,
  Fuel,
  Gauge,
  Mountain,
  Navigation,
  Package,
  Pause,
  Plane,
  Play,
  RefreshCw,
  Timer,
  TriangleAlert,
} from "lucide-react";
import { notifyError, openUrl } from "@/shell/actions";
import { Badge, Button, ConfirmDialog, ScoreRing, Spinner } from "@/ui";
import { careerApi } from "./api";
import { AircraftPicker } from "./AircraftPicker";
import { className as clsName, clock, duration, kg, landingTone, money, num } from "./format";
import { useCareerT } from "./i18n";
import { Fact, KindIcon, Route } from "./parts";
import { invalidateCareer, useLive } from "./queries";
import { RouteMap } from "./RouteMap";
import { useCareerUi } from "./store";
import type { ActiveView, CareerView, Check, FlightEvent, Live, Phase } from "./types";

export function ActiveJob({ view, active }: { view: CareerView; active: ActiveView }) {
  const t = useCareerT();
  const { data: live } = useLive();
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<"cancel" | "abandon" | null>(null);
  const setPick = useCareerUi((s) => s.setPick);
  const openFlight = useCareerUi((s) => s.openFlight);
  const job = active.job;
  const flying = active.stage === "flying" || active.stage === "interrupted";
  const flight = live?.flight ?? null;
  const parked = flight?.phase === "parked";
  const overdue = Date.now() / 1000 > active.deadlineAt;
  // Otomatik başlatma sürerken düğme kilitli; "manual" ve "done" adımlarında yeniden denenebilir.
  const preparing = !!live?.launch && !["done", "manual"].includes(live.launch.step) && active.stage === "launching";

  const act = async (name: string, f: () => Promise<unknown>, ok?: string) => {
    setBusy(name);
    try {
      await f();
      if (ok) toast.success(ok);
      invalidateCareer();
    } catch (e) {
      notifyError(e);
    } finally {
      setBusy(null);
    }
  };

  const finish = () =>
    act("finish", async () => {
      const e = await careerApi.finish();
      openFlight(e.id);
    });

  const tele = live?.telemetry ?? null;
  const showCurrent = !!tele && !!live?.inFlight;

  return (
    <section className="card overflow-hidden">
      {/* Üst bilgi */}
      <header className="flex items-start gap-4 px-5 pb-4 pt-5">
        <div className="accent-soft flex size-11 shrink-0 items-center justify-center rounded-2xl">
          <KindIcon kind={job.kind} className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-muted">{t.kinds[job.kind]}</span>
            <Badge tone={job.mode === "contract" ? "info" : "neutral"}>{t.mode[job.mode]}</Badge>
            {job.urgent && <Badge tone="danger">{t.jobs.urgent}</Badge>}
          </div>
          <Route from={job.from} to={job.to} size="lg" className="mt-1 text-fg" />
          <div className="mt-1 truncate text-[12.5px] text-fg-2">
            {active.from?.name ?? job.from} → {active.to?.name ?? job.to}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="tabular text-[24px] font-semibold leading-none text-accent">{job.kind === "checkride" ? "—" : money(job.pay)}</div>
          <div className={clsx("mt-1.5 text-[11.5px]", overdue ? "font-semibold text-danger" : "text-muted")}>
            {overdue ? t.active.overdue : t.active.deadline(new Date(active.deadlineAt * 1000).toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" }))}
          </div>
        </div>
      </header>

      {/* Harita */}
      <div className="relative mx-5 overflow-hidden rounded-[14px] border border-line">
        <RouteMap
          from={active.from ? { lat: active.from.lat, lon: active.from.lon, icao: job.from } : null}
          to={active.to ? { lat: active.to.lat, lon: active.to.lon, icao: job.to } : null}
          current={showCurrent ? { lat: tele!.lat, lon: tele!.lon } : null}
          heading={tele?.heading}
          className="aspect-[2.4/1] w-full"
          aspect={2.4}
        />
        <div className="pointer-events-none absolute left-3 top-3 flex gap-1.5">
          <span className="msfs-on-image rounded-full px-2.5 py-1 text-[11.5px] font-semibold text-white">{num(job.distanceNm)} nm</span>
          <span className="msfs-on-image rounded-full px-2.5 py-1 text-[11.5px] font-semibold text-white">{duration(job.plan.blockMin)}</span>
        </div>
      </div>

      {/* Plan */}
      <div className="grid grid-cols-4 gap-2 px-5 pt-4">
        <Fact label={t.jobs.class} value={clsName(job.class, view.classes)} icon={<Plane className="size-3.5" />} />
        <Fact
          label={t.active.payload}
          value={job.pax ? t.jobs.pax(job.pax) : job.cargoKg ? t.jobs.kg(kg(job.cargoKg)) : "—"}
          hint={t.cargo[job.cargo] ?? job.cargo}
          icon={<Package className="size-3.5" />}
        />
        <Fact label={t.active.fuel} value={`${kg(job.plan.fuelKg)} kg`} hint={`${kg(job.plan.fuelKg * 2.20462)} lb`} icon={<Fuel className="size-3.5" />} />
        <Fact label={t.active.cruise} value={`${num(job.plan.cruiseAltFt)} ft`} icon={<Mountain className="size-3.5" />} />
      </div>

      {/* Uçak */}
      <div className="mx-5 mt-4 flex items-center gap-3 rounded-[14px] border border-line bg-surface-2/40 px-4 py-3">
        <Plane className="size-4 shrink-0 text-muted" />
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-medium text-muted">{t.active.aircraft}</div>
          {active.aircraft ? (
            <div className="flex min-w-0 items-center gap-2">
              <span className="truncate text-[13px] font-semibold text-fg">{active.aircraft.title}</span>
              {active.aircraft.class && <Badge>{clsName(active.aircraft.class, view.classes)}</Badge>}
              {active.aircraft.fleetId && <Badge tone="accent">{t.pick.own}</Badge>}
            </div>
          ) : (
            <div className="text-[13px] text-fg-2">—</div>
          )}
        </div>
        {!flying && (
          <Button variant={active.aircraft ? "ghost" : "secondary"} size="sm" onClick={() => setPick(true)}>
            {active.aircraft ? t.active.change : t.active.choose}
          </Button>
        )}
      </div>

      {/* Durum + eylemler */}
      <div className="px-5 pb-5 pt-4">
        <StageLine active={active} live={live ?? null} />
        {live?.launch && !flying && <LaunchSteps launch={live.launch} from={job.from} />}

        {!flying && <Gate checks={live?.checks ?? []} hint={t.active.gateHint} />}
        {flying && flight && <LiveFlight flight={flight} live={live!} />}

        {live?.aircraft?.managesOwnLoading && !flying && (
          <p className="mt-3 flex items-start gap-2 rounded-xl bg-info/10 px-3 py-2 text-[12px] text-info">
            <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
            {t.active.ownLoading}
          </p>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {!flying && (
            <Button
              variant={active.stage === "ready" ? "secondary" : "primary"}
              size={active.stage === "ready" ? "md" : "lg"}
              icon={active.stage === "ready" ? <RefreshCw className="size-4" /> : <Play className="size-4 fill-current" />}
              disabled={!active.aircraft || busy !== null || preparing}
              loading={busy === "launch" || preparing}
              onClick={() => act("launch", careerApi.launch)}
            >
              {preparing ? t.active.preparing : active.stage === "ready" ? t.active.prepareAgain : live?.launch?.step === "manual" ? t.active.restart : t.active.start}
            </Button>
          )}
          {flying && (
            <Button variant="primary" size="lg" icon={<Flag className="size-4" />} disabled={!parked && !flight?.invalid} loading={busy === "finish"} onClick={finish}>
              {t.active.finish}
            </Button>
          )}
          {!flying && live?.inFlight && (
            <Button variant="secondary" icon={<Navigation className="size-4" />} loading={busy === "repo"} onClick={() => act("repo", careerApi.reposition)}>
              {t.active.reposition}
            </Button>
          )}
          <Button
            variant="ghost"
            icon={<ExternalLink className="size-4" />}
            onClick={() =>
              careerApi
                .simbrief()
                .then((u) => {
                  if (u) void openUrl(u);
                })
                .catch(notifyError)
            }
          >
            {t.active.simbrief}
          </Button>
          <Button variant="ghost" icon={<FileText className="size-4" />} onClick={() => careerApi.revealPlan().catch(notifyError)}>
            {t.active.pln}
          </Button>
          <span className="flex-1" />
          <Button variant="ghost" className="text-muted" onClick={() => setConfirm(flying ? "abandon" : "cancel")}>
            {flying ? t.active.abandon : t.active.cancel}
          </Button>
        </div>
      </div>

      <AircraftPicker view={view} active={active} />
      <ConfirmDialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          const which = confirm;
          setConfirm(null);
          void act(which!, () => (which === "abandon" ? careerApi.abandon().then((e) => e && openFlight(e.id)) : careerApi.cancel()));
        }}
        title={confirm === "abandon" ? t.active.abandonConfirm : t.active.cancelConfirm}
        confirmLabel={confirm === "abandon" ? t.active.abandon : t.active.cancel}
        danger
      >
        {confirm === "abandon" ? t.active.abandonBody : t.active.cancelBody}
      </ConfirmDialog>
    </section>
  );
}

function StageLine({ active, live }: { active: ActiveView; live: Live | null }) {
  const t = useCareerT();
  const icon =
    active.stage === "flying" ? (
      <Plane className="size-4 text-accent" />
    ) : active.stage === "interrupted" ? (
      <TriangleAlert className="size-4 text-warn" />
    ) : active.stage === "launching" ? (
      <Spinner className="size-4 text-accent" />
    ) : active.stage === "ready" ? (
      <CircleCheck className="size-4 text-ok" />
    ) : (
      <CircleDashed className="size-4 text-muted" />
    );
  return (
    <div className="flex items-center gap-2 text-[13px] font-semibold text-fg">
      {icon}
      {t.active.stage[active.stage]}
      {live?.paused && (
        <Badge tone="warn" icon={<Pause className="size-3" />}>
          {t.live.paused}
        </Badge>
      )}
    </div>
  );
}

const STEPS = ["waiting_sim", "fetching_airport", "loading", "positioning", "done"] as const;

function LaunchSteps({ launch, from }: { launch: NonNullable<Live["launch"]>; from: string }) {
  const t = useCareerT();
  const manual = launch.step === "manual";
  const idx = manual ? -1 : STEPS.indexOf(launch.step as (typeof STEPS)[number]);
  return (
    <div className="mt-3 rounded-[14px] border border-line bg-surface-2/40 p-3.5">
      {!manual && (
        <ol className="mb-2.5 flex items-center gap-1.5">
          {STEPS.map((s, i) => (
            <li key={s} className="flex flex-1 items-center gap-1.5">
              <span
                className={clsx(
                  "flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
                  i < idx || launch.step === "done" ? "bg-ok text-white" : i === idx ? "accent-surface text-accent-ink" : "bg-surface-3 text-muted",
                )}
              >
                {i < idx || launch.step === "done" ? "✓" : i + 1}
              </span>
              <span className={clsx("truncate text-[11.5px]", i === idx ? "font-semibold text-fg" : "text-muted")}>{t.launch[s]}</span>
              {i < STEPS.length - 1 && <span className="h-px flex-1 bg-line" />}
            </li>
          ))}
        </ol>
      )}
      {manual && <div className="mb-1 text-[12.5px] font-semibold text-warn">{t.active.manual}</div>}
      <p className="text-[12.5px] leading-relaxed text-fg-2">{manual ? `${launch.note} ${t.active.manualBody(from)}` : launch.note}</p>
    </div>
  );
}

function Gate({ checks, hint }: { checks: Check[]; hint: string }) {
  const t = useCareerT();
  if (checks.length === 0) return null;
  return (
    <div className="mt-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[12px] font-semibold text-fg">{t.active.gate}</span>
        <span className="text-[11px] text-muted">{hint}</span>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {checks.map((c) => (
          <div key={c.id} className={clsx("flex items-center gap-2 rounded-lg border px-2.5 py-2", c.ok ? "border-ok/25 bg-ok/5" : c.required ? "border-line bg-surface-2/50" : "border-warn/25 bg-warn/5")}>
            {c.ok ? <CircleCheck className="size-4 shrink-0 text-ok" /> : c.required ? <CircleDashed className="size-4 shrink-0 text-muted" /> : <TriangleAlert className="size-4 shrink-0 text-warn" />}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12px] font-medium text-fg">
                {t.checks[c.id]}
                {!c.required && <span className="ml-1 text-[10.5px] font-normal text-muted">({t.checks.optional})</span>}
              </span>
              {c.detail && <span className="block truncate text-[11px] text-muted">{c.detail}</span>}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Sadeleştirilmiş evre çizelgesi. */
const TIMELINE: { id: string; phases: Phase[] }[] = [
  { id: "preflight", phases: ["preflight"] },
  { id: "taxi_out", phases: ["taxi_out"] },
  { id: "takeoff", phases: ["takeoff", "climb"] },
  { id: "cruise", phases: ["cruise", "descent"] },
  { id: "approach", phases: ["approach"] },
  { id: "rollout", phases: ["rollout", "taxi_in"] },
  { id: "parked", phases: ["parked"] },
];

function LiveFlight({ flight, live }: { flight: NonNullable<Live["flight"]>; live: Live }) {
  const t = useCareerT();
  const tele = live.telemetry;
  const at = TIMELINE.findIndex((s) => s.phases.includes(flight.phase));
  return (
    <div className="mt-3 flex flex-col gap-3">
      {flight.invalid && (
        <div className="flex items-center gap-2 rounded-xl bg-danger/10 px-3 py-2 text-[12.5px] font-semibold text-danger">
          <TriangleAlert className="size-4" />
          {t.live.invalid}: {t.events[flight.invalid] ?? flight.invalid}
        </div>
      )}
      <ol className="flex items-center gap-1">
        {TIMELINE.map((s, i) => (
          <li key={s.id} className="flex flex-1 flex-col gap-1">
            <span className={clsx("h-1.5 rounded-full", i < at ? "bg-accent/60" : i === at ? "bg-accent" : "bg-surface-3")} />
            <span className={clsx("truncate text-center text-[10.5px]", i === at ? "font-semibold text-fg" : "text-muted")}>{t.phases[s.id]}</span>
          </li>
        ))}
      </ol>
      <div className="grid grid-cols-[1fr_auto] gap-3">
        <div className="grid grid-cols-3 gap-2">
          <Fact label={t.live.altitude} value={tele ? `${num(tele.altFt)} ft` : "—"} hint={tele && !tele.onGround ? `AGL ${num(tele.aglFt)}` : undefined} icon={<Mountain className="size-3.5" />} />
          <Fact label={t.live.speed} value={tele ? `${num(tele.gsKt)} kt` : "—"} hint={tele ? `IAS ${num(tele.iasKt)}` : undefined} icon={<Gauge className="size-3.5" />} />
          <Fact label={t.live.vs} value={tele ? `${tele.vsFpm > 0 ? "+" : ""}${num(tele.vsFpm)} fpm` : "—"} icon={<Navigation className="size-3.5" />} />
          <Fact label={t.live.remaining} value={`${num(flight.remainingNm, 1)} nm`} hint={`${t.logbook.flown} ${num(flight.flownNm, 1)} nm`} icon={<Flag className="size-3.5" />} />
          <Fact label={t.live.fuelUsed} value={`${num(flight.fuelUsedLb)} lb`} hint={tele ? `${num(tele.fuelLb)} lb` : undefined} icon={<Fuel className="size-3.5" />} />
          <Fact label={t.live.elapsed} value={clock(flight.elapsedS)} hint={tele && tele.simRate !== 1 ? `${tele.simRate}×` : undefined} icon={<Timer className="size-3.5" />} />
        </div>
        <div className="well flex w-[132px] flex-col items-center justify-center gap-1 px-2 py-3">
          <ScoreRing score={flight.scoreNow} size={88} stroke={7} />
          <span className="text-[11px] text-muted">{t.live.score}</span>
        </div>
      </div>
      {flight.landing && (
        <div className="flex items-center gap-3 rounded-xl border border-line bg-surface-2/50 px-3.5 py-2.5">
          <span className="text-[12px] font-semibold text-fg">{t.live.landing}</span>
          <Badge tone={landingTone(flight.landing.label)}>{t.landing[flight.landing.label]}</Badge>
          <span className="tabular text-[12.5px] text-fg-2">
            {num(flight.landing.fpm)} fpm · {num(flight.landing.g, 2)} G · {num(flight.landing.bank, 1)}°
          </span>
        </div>
      )}
      <Events events={flight.events} />
    </div>
  );
}

export function Events({ events, empty }: { events: FlightEvent[]; empty?: boolean }) {
  const t = useCareerT();
  if (events.length === 0) return empty === false ? null : <p className="text-[12px] text-muted">{t.live.noEvents}</p>;
  return (
    <ul className="flex flex-col gap-1">
      {events.map((e, i) => (
        <li key={`${e.t}-${e.code}-${i}`} className="flex items-center gap-2.5 rounded-lg px-2 py-1 text-[12px]">
          <span className="tabular w-[52px] shrink-0 text-[11px] text-muted">{clock(e.t)}</span>
          {e.severity === "fatal" ? (
            <TriangleAlert className="size-3.5 shrink-0 text-danger" />
          ) : e.penalty > 0 ? (
            <CircleAlert className="size-3.5 shrink-0 text-warn" />
          ) : (
            <RefreshCw className="size-3.5 shrink-0 text-muted" />
          )}
          <span className={clsx("min-w-0 flex-1 truncate", e.severity === "fatal" ? "font-semibold text-danger" : "text-fg-2")}>
            {t.events[e.code] ?? e.code}
            {e.value ? <span className="tabular text-muted"> · {num(e.value, 1)}</span> : null}
          </span>
          {e.penalty > 0 && <span className="tabular shrink-0 font-semibold text-warn">−{e.penalty}</span>}
        </li>
      ))}
    </ul>
  );
}
