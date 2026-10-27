// Aktif iş: başlıkta rota ve kazanç, tam genişlikte rota haritası; uçuş öncesinde plan, koşullar, uçak, başlangıç
// noktası, otomatik başlatmanın adımları ve kontrol kapısı; uçuşta evre çizelgesi, gösterge şeridi ve olaylar.

import { useState } from "react";
import clsx from "clsx";
import { toast } from "sonner";
import {
  CircleAlert,
  CircleCheck,
  CircleDashed,
  ClipboardList,
  ExternalLink,
  FileText,
  Flag,
  MonitorSmartphone,
  Navigation,
  Pause,
  Plane,
  PlaneTakeoff,
  Play,
  RefreshCw,
  SquareParking,
  TriangleAlert,
} from "lucide-react";
import { notifyError, openUrl } from "@/shell/actions";
import { Button, ConfirmDialog, ScoreRing, Spinner } from "@/ui";
import { careerApi } from "./api";
import { AircraftPicker } from "./AircraftPicker";
import { AircraftPhoto } from "./aircraft/AircraftPhoto";
import { useAircraftT } from "./aircraft/i18n";
import { ConditionsBlock } from "./Conditions";
import { className as clsName, clock, duration, kg, landingTone, money, num } from "./format";
import { useCareerT } from "./i18n";
import { Hint, KindIcon, Route, StatusTag, TONE_FG, dueText, type GaugeTone } from "./parts";
import { invalidateCareer, useAircraftOptions, useLive } from "./queries";
import { RouteMap } from "./RouteMap";
import { useCareerUi } from "./store";
import type { ActiveView, CareerView, Check, FlightEvent, Live, Phase, StartAt } from "./types";

const STAGE_TONE: Record<ActiveView["stage"], GaugeTone | "neutral"> = { accepted: "neutral", launching: "info", ready: "ok", flying: "accent", interrupted: "warn" };

export function ActiveJob({ view, active }: { view: CareerView; active: ActiveView }) {
  const t = useCareerT();
  const { data: live } = useLive();
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<"cancel" | "abandon" | null>(null);
  const [start, setStart] = useState<StartAt>(active.start ?? { runway: false, end: null });
  const setPick = useCareerUi((s) => s.setPick);
  const openFlight = useCareerUi((s) => s.openFlight);
  const job = active.job;
  // Seçilen uçağın listedeki kaydı: mod paketi, kendi EFB'si (uçak simde yüklenmeden önce de bilinsin).
  const ac = useAircraftT();
  const { data: options } = useAircraftOptions(!!active.aircraft);
  const picked = active.aircraft ? options?.find((o) => o.title === active.aircraft!.title) : undefined;
  const ownLoading = live?.aircraft?.managesOwnLoading ?? picked?.managesOwnLoading ?? false;
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

  const map = (aspect: number, cls: string) => (
    <div className="relative">
      <RouteMap
        from={active.from ? { lat: active.from.lat, lon: active.from.lon, icao: job.from } : null}
        to={active.to ? { lat: active.to.lat, lon: active.to.lon, icao: job.to } : null}
        current={showCurrent ? { lat: tele!.lat, lon: tele!.lon } : null}
        heading={tele?.heading}
        className={clsx("w-full", cls)}
        aspect={aspect}
        topRightInset={[140, 44]}
      />
      <div className="pointer-events-none absolute left-3 top-3 flex gap-1.5">
        <span className="msfs-on-image rounded-full px-2.5 py-1 font-mono text-[11.5px] font-semibold text-white">{num(job.distanceNm)} nm</span>
        <span className="msfs-on-image rounded-full px-2.5 py-1 text-[11.5px] font-semibold text-white">{duration(job.plan.blockMin)}</span>
      </div>
      {/* Uçuş ekranı: aynı harita ve canlı veriler ayrı bir pencerede (ikinci ekran). */}
      <button
        type="button"
        title={t.active.deckHint}
        onClick={() => careerApi.deckOpen().catch(notifyError)}
        className="msfs-on-image absolute right-3 top-3 inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[11.5px] font-semibold text-white transition-colors hover:bg-white/15"
      >
        <MonitorSmartphone className="size-3.5" />
        {t.active.deck}
      </button>
    </div>
  );

  return (
    <section className="card overflow-hidden">
      {/* Başlık: tür, rota, kazanç */}
      <header className="flex items-start gap-6 px-6 pb-5 pt-5">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5 text-[12px] text-muted">
            <KindIcon kind={job.kind} className="size-3.5 shrink-0" />
            <span className="shrink-0 font-medium text-fg-2">{t.kinds[job.kind]}</span>
            <span>·</span>
            <span className="truncate">{job.client}</span>
            <span>·</span>
            <span className="inline-flex shrink-0 items-center gap-1">
              {t.mode[job.mode]}
              <Hint text={job.mode === "contract" ? t.guide.contract : t.guide.employee} />
            </span>
            {job.urgent && <span className="shrink-0 font-semibold text-danger">· {t.jobs.urgent}</span>}
          </div>
          <Route from={job.from} to={job.to} size="xl" className="mt-2.5 text-fg" />
          <div className="mt-1.5 truncate text-[12.5px] text-fg-2">
            {active.from?.name ?? job.from} <span className="text-muted">→</span> {active.to?.name ?? job.to}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="num text-[30px] text-fg">{job.kind === "checkride" ? "—" : money(job.pay)}</div>
          <div className={clsx("tabular mt-1.5 text-[12px]", overdue ? "font-semibold text-danger" : "text-muted")}>
            {overdue ? t.active.overdue : dueText(active.deadlineAt, t)}
          </div>
        </div>
      </header>

      {flying ? (
        <>
          {parked && (
            <div className="mx-6 mb-5 flex items-center gap-4 rounded-[14px] border border-[color-mix(in_oklab,var(--accent)_40%,var(--line))] bg-[color-mix(in_oklab,var(--accent)_7%,transparent)] px-4 py-3.5">
              <Flag className="size-5 shrink-0 text-accent" />
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-semibold text-fg">{t.active.landedTitle}</div>
                <div className="mt-0.5 text-[12.5px] text-fg-2">{t.active.landedBody}</div>
              </div>
              <Button variant="primary" size="lg" icon={<Flag className="size-4" />} loading={busy === "finish"} onClick={finish}>
                {t.active.finish}
              </Button>
            </div>
          )}
          <div className="flex flex-col gap-4 border-t border-line px-6 py-5">
            {!parked && <StageLine active={active} live={live ?? null} />}
            {flight && <LiveFlight flight={flight} live={live!} />}
          </div>
          <div className="border-t border-line">{map(2.6, "aspect-[2.6/1]")}</div>
        </>
      ) : (
        <>
          {/* Hazırlık: uçak, başlangıç, durum ve "Uçuşu başlat" */}
          <div className="flex flex-col gap-4 border-t border-line px-6 py-5">
            <StageLine active={active} live={live ?? null} />
            <PrepSteps done={[!!active.aircraft, !!active.aircraft, active.stage === "ready" || active.stage === "launching"]} />
            <div className="flex items-center gap-4 rounded-[14px] border border-line p-2.5 pr-4">
              {active.aircraft ? (
                <AircraftPhoto title={active.aircraft.title} option={picked} livery={active.aircraft.livery} cls={active.aircraft.class} className="aspect-[16/9] w-[120px] shrink-0 rounded-[10px]" />
              ) : (
                <div className="flex aspect-[16/9] w-[120px] shrink-0 items-center justify-center rounded-[10px] border border-dashed border-line-strong text-muted">
                  <Plane className="size-5" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="text-[12px] text-muted">{t.active.aircraft}</div>
                {active.aircraft ? (
                  <>
                    <div className="mt-0.5 truncate text-[14px] font-semibold text-fg">{active.aircraft.title}</div>
                    <div className="mt-0.5 truncate text-[12px] text-fg-2">
                      {active.aircraft.class ? clsName(active.aircraft.class, view.classes) : ""}
                      {active.aircraft.fleetId && <span className="text-accent"> · {t.pick.own}</span>}
                      {picked?.origin === "mod" && picked.package && <span className="text-muted"> · {ac.mod} · {picked.package.title}</span>}
                    </div>
                  </>
                ) : (
                  <div className="mt-0.5 text-[13px] text-fg-2">{t.panel.unknownAircraft}</div>
                )}
              </div>
              <Button variant={active.aircraft ? "ghost" : "primary"} size="sm" onClick={() => setPick(true)}>
                {active.aircraft ? t.active.change : t.active.choose}
              </Button>
            </div>
            <StartChoice value={start} onChange={setStart} ends={active.runwayEnds} disabled={preparing} />
            {live?.launch && <LaunchSteps launch={live.launch} from={job.from} />}
            <Gate checks={live?.checks ?? []} hint={t.active.gateHint} />
            {live?.inFlight && live.camera === 16 && (
              <p className="flex items-start gap-2 rounded-xl bg-warn/10 px-3 py-2 text-[12px] text-warn">
                <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
                {t.active.cinematic}
              </p>
            )}
            {ownLoading && <EfbNote active={active} />}
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant={active.stage === "ready" ? "secondary" : "primary"}
                size="lg"
                icon={active.stage === "ready" ? <RefreshCw className="size-4" /> : <Play className="size-4 fill-current" />}
                disabled={!active.aircraft || busy !== null || preparing}
                loading={busy === "launch" || preparing}
                onClick={() => act("launch", () => careerApi.launch(start))}
              >
                {preparing ? t.active.preparing : active.stage === "ready" ? t.active.prepareAgain : live?.launch?.step === "manual" ? t.active.restart : t.active.start}
              </Button>
              {live?.inFlight && (
                <Button variant="secondary" size="lg" icon={<Navigation className="size-4" />} loading={busy === "repo"} onClick={() => act("repo", careerApi.reposition)}>
                  {t.active.reposition}
                </Button>
              )}
            </div>
          </div>

          {/* Brifing: harita, plan, koşullar */}
          <div className="border-t border-line">
            <div className="px-6 pb-3 pt-4 text-[12px] font-semibold text-fg-2">{t.active.briefing}</div>
            {map(2.8, "aspect-[2.8/1]")}
            <dl className="grid grid-cols-4 divide-x divide-line border-y border-line">
              <PlanCell label={t.jobs.class} value={clsName(job.class, view.classes)} />
              <PlanCell label={t.active.payload} value={job.pax ? t.jobs.pax(job.pax) : job.cargoKg ? t.jobs.kg(kg(job.cargoKg)) : "—"} hint={t.cargo[job.cargo] ?? job.cargo} />
              <PlanCell label={t.active.fuel} value={`${kg(job.plan.fuelKg)} kg`} hint={`${kg(job.plan.fuelKg * 2.20462)} lb`} />
              <PlanCell label={t.active.cruise} value={`${num(job.plan.cruiseAltFt)} ft`} />
            </dl>
            <div className="px-6 py-5">
              <ConditionsBlock job={job} sim={view.link.sim} />
            </div>
          </div>
        </>
      )}

      {/* İkincil eylemler */}
      <footer className="flex flex-wrap items-center gap-2 border-t border-line bg-surface-2/40 px-6 py-3">
        {flying && !parked && flight?.invalid && (
          <Button variant="primary" icon={<Flag className="size-4" />} loading={busy === "finish"} onClick={finish}>
            {t.active.finish}
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          icon={<ExternalLink className="size-3.5" />}
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
        <Button variant="ghost" size="sm" icon={<FileText className="size-3.5" />} onClick={() => careerApi.revealPlan().catch(notifyError)}>
          {t.active.pln}
        </Button>
        <span className="flex-1" />
        <Button variant="ghost" size="sm" className="text-muted hover:text-danger" onClick={() => setConfirm(flying ? "abandon" : "cancel")}>
          {flying ? t.active.abandon : t.active.cancel}
        </Button>
      </footer>

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

function PlanCell({ label, value, hint }: { label: string; value: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="min-w-0 px-6 py-3.5">
      <dt className="truncate text-[11.5px] text-muted">{label}</dt>
      <dd className="tabular mt-1.5 truncate text-[14.5px] font-semibold text-fg">{value}</dd>
      {hint && <dd className="mt-0.5 truncate text-[11px] text-muted">{hint}</dd>}
    </div>
  );
}

function StageIcon({ stage }: { stage: ActiveView["stage"] }) {
  if (stage === "flying") return <Plane className="size-3" />;
  if (stage === "interrupted") return <TriangleAlert className="size-3" />;
  if (stage === "launching") return <Spinner className="size-3 text-current" />;
  if (stage === "ready") return <CircleCheck className="size-3" />;
  return <CircleDashed className="size-3" />;
}

function StageLine({ active, live }: { active: ActiveView; live: Live | null }) {
  const t = useCareerT();
  const tone = STAGE_TONE[active.stage];
  return (
    <div className="flex items-center gap-2.5">
      <span className={clsx("flex size-7 shrink-0 items-center justify-center rounded-full", tone === "neutral" ? "bg-surface-2 text-muted" : `${TONE_BG_SOFT[tone]} ${TONE_FG[tone]}`)}>
        <StageIcon stage={active.stage} />
      </span>
      <span className="text-[14px] font-semibold text-fg">{t.active.stage[active.stage]}</span>
      {live?.paused && (
        <StatusTag tone="warn" icon={<Pause className="size-3" />}>
          {t.live.paused}
        </StatusTag>
      )}
    </div>
  );
}

const TONE_BG_SOFT: Record<GaugeTone, string> = { accent: "accent-soft", ok: "bg-ok/12", warn: "bg-warn/12", danger: "bg-danger/12", info: "bg-info/12", muted: "bg-surface-2" };

const STEPS = ["waiting_sim", "fetching_airport", "loading", "positioning", "done"] as const;

/** Uçuşun simde nerede başlayacağı: park yerinde soğuk ya da pist başında motorlar çalışır. */
function StartChoice({ value, onChange, ends, disabled }: { value: StartAt; onChange: (v: StartAt) => void; ends: string[]; disabled?: boolean }) {
  const t = useCareerT();
  const option = (runway: boolean, icon: React.ReactNode, title: string, hint: string) => {
    const on = value.runway === runway;
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange({ ...value, runway })}
        aria-pressed={on}
        className={clsx(
          "flex min-w-0 flex-1 items-center gap-3 rounded-[14px] border px-3.5 py-3 text-left transition-colors disabled:opacity-60",
          on ? "border-[color-mix(in_oklab,var(--accent)_60%,transparent)] bg-[color-mix(in_oklab,var(--accent)_8%,transparent)]" : "border-line hover:bg-surface-2/60",
        )}
      >
        <span className={clsx("flex size-9 shrink-0 items-center justify-center rounded-xl", on ? "accent-surface" : "bg-surface-2 text-muted")}>{icon}</span>
        <span className="min-w-0">
          <span className="block text-[13px] font-semibold text-fg">{title}</span>
          <span className="block truncate text-[11.5px] text-muted">{hint}</span>
        </span>
      </button>
    );
  };
  return (
    <div>
      <div className="mb-2 text-[12px] font-semibold text-fg-2">{t.active.startAt}</div>
      <div className="flex gap-2">
        {option(false, <SquareParking className="size-4" />, t.active.atParking, t.active.atParkingHint)}
        {option(true, <PlaneTakeoff className="size-4" />, t.active.atRunway, t.active.atRunwayHint)}
      </div>
      {value.runway && ends.length > 0 && (
        <label className="mt-2.5 flex items-center gap-2">
          <span className="text-[11.5px] text-muted">{t.active.runwayEnd}</span>
          <select
            value={value.end ?? ""}
            disabled={disabled}
            onChange={(e) => onChange({ runway: true, end: e.target.value || null })}
            className="h-8 rounded-full border border-line-strong bg-surface-2 px-3 font-mono text-[12px] text-fg outline-none focus:border-accent"
          >
            <option value="">{t.active.autoEnd}</option>
            {ends.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}

function LaunchSteps({ launch, from }: { launch: NonNullable<Live["launch"]>; from: string }) {
  const t = useCareerT();
  const manual = launch.step === "manual";
  const idx = manual ? -1 : STEPS.indexOf(launch.step as (typeof STEPS)[number]);
  return (
    <div className="rounded-[14px] border border-line bg-surface-2/40 p-3.5">
      {!manual && (
        <ol className="mb-2.5 flex items-center gap-1.5">
          {STEPS.map((s, i) => {
            const done = i < idx || launch.step === "done";
            return (
              <li key={s} className="flex flex-1 items-center gap-1.5">
                <span
                  className={clsx(
                    "flex size-5 shrink-0 items-center justify-center rounded-full font-mono text-[10px] font-bold",
                    done ? "bg-ok text-[var(--surface)]" : i === idx ? "accent-surface" : "bg-surface-3 text-muted",
                  )}
                >
                  {done ? "✓" : i + 1}
                </span>
                <span className={clsx("truncate text-[11.5px]", i === idx ? "font-semibold text-fg" : "text-muted")}>{t.launch[s]}</span>
                {i < STEPS.length - 1 && <span className={clsx("h-px flex-1", done ? "bg-ok/50" : "bg-line-strong")} />}
              </li>
            );
          })}
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
  const done = checks.filter((c) => c.ok || !c.required).length;
  return (
    <div className="rounded-[14px] border border-line">
      <div className="flex items-center gap-3 border-b border-line px-3.5 py-2.5">
        <span className="text-[11.5px] text-muted">{t.active.gate}</span>
        <span className="tabular font-mono text-[11px] font-semibold text-fg-2">
          {done}/{checks.length}
        </span>
        <span className="min-w-0 flex-1 truncate text-right text-[11px] text-muted" title={hint}>
          {hint}
        </span>
      </div>
      <div className="grid grid-cols-2">
        {checks.map((c, i) => (
          <div key={c.id} className={clsx("flex items-center gap-2.5 border-line px-3.5 py-2.5", i % 2 === 1 && "border-l", i >= 2 && "border-t")}>
            {c.ok ? <CircleCheck className="size-4 shrink-0 text-ok" /> : c.required ? <CircleDashed className="size-4 shrink-0 text-muted" /> : <TriangleAlert className="size-4 shrink-0 text-warn" />}
            <span className="min-w-0 flex-1">
              <span className={clsx("block truncate text-[12.5px] font-medium", c.ok ? "text-fg" : "text-fg-2")}>
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
  const total = flight.flownNm + flight.remainingNm;
  return (
    <div className="flex flex-col gap-4">
      {flight.invalid && (
        <div className="flex items-center gap-2 rounded-xl bg-danger/10 px-3 py-2 text-[12.5px] font-semibold text-danger">
          <TriangleAlert className="size-4" />
          {t.live.invalid}: {t.events[flight.invalid] ?? flight.invalid}
        </div>
      )}
      <ol className="flex items-start gap-1">
        {TIMELINE.map((s, i) => (
          <li key={s.id} className="flex flex-1 flex-col gap-1.5">
            <span className={clsx("h-1.5 rounded-full", i < at ? "bg-accent/55" : i === at ? "bg-accent" : "bg-surface-3")} />
            <span className={clsx("truncate text-center text-[11px]", i === at ? "font-semibold text-fg" : "text-muted")}>{t.phases[s.id]}</span>
          </li>
        ))}
      </ol>
      <div className="grid grid-cols-[minmax(0,1fr)_148px] overflow-hidden rounded-[14px] border border-line">
        <div className="grid grid-cols-3">
          <Gauge label={t.live.altitude} value={tele ? num(tele.altFt) : "—"} unit="ft" hint={tele && !tele.onGround ? `AGL ${num(tele.aglFt)}` : undefined} />
          <Gauge label={t.live.speed} value={tele ? num(tele.gsKt) : "—"} unit="kt" hint={tele ? `IAS ${num(tele.iasKt)}` : undefined} className="border-l" />
          <Gauge label={t.live.vs} value={tele ? `${tele.vsFpm > 0 ? "+" : ""}${num(tele.vsFpm)}` : "—"} unit="fpm" className="border-l" />
          <Gauge label={t.live.remaining} value={num(flight.remainingNm, 1)} unit="nm" hint={`${t.logbook.flown} ${num(flight.flownNm, 1)} nm`} className="border-t" bar={total > 0 ? flight.flownNm / total : undefined} />
          <Gauge label={t.live.fuelUsed} value={num(flight.fuelUsedLb)} unit="lb" hint={tele ? `${num(tele.fuelLb)} lb` : undefined} className="border-l border-t" />
          <Gauge label={t.live.elapsed} value={clock(flight.elapsedS)} hint={tele && tele.simRate !== 1 ? `${tele.simRate}×` : undefined} className="border-l border-t" />
        </div>
        <div className="flex flex-col items-center justify-center gap-1.5 border-l border-line bg-surface-2/40 px-2 py-3">
          <ScoreRing score={flight.scoreNow} size={92} stroke={7} />
          <span className="inline-flex items-center gap-1 text-[11.5px] text-muted">
            {t.live.score}
            <Hint text={t.guide.scoreHint} />
          </span>
        </div>
      </div>
      <SimRate live={live} />
      {flight.landing && (
        <div className="flex items-center gap-3 rounded-[14px] border border-line px-3.5 py-2.5">
          <span className="text-[11.5px] text-muted">{t.live.landing}</span>
          <StatusTag tone={landingTone(flight.landing.label) === "neutral" ? "neutral" : landingTone(flight.landing.label)}>{t.landing[flight.landing.label]}</StatusTag>
          <span className="tabular font-mono text-[12.5px] text-fg-2">
            {num(flight.landing.fpm)} fpm · {num(flight.landing.g, 2)} G · {num(flight.landing.bank, 1)}°
          </span>
        </div>
      )}
      <div>
        <div className="mb-1.5 text-[12px] font-semibold text-fg-2">{t.live.events}</div>
        <Events events={flight.events} />
      </div>
    </div>
  );
}

const RATES = [1, 2, 4, 8, 16];

/** Zaman hızlandırma: seyirde 2×–16×; Modstead'in açtığı hız varışa yaklaşınca kendiliğinden 1×'e döner. */
function SimRate({ live }: { live: Live }) {
  const t = useCareerT();
  const [busy, setBusy] = useState(false);
  const rate = live.rate;
  if (!rate) return null;
  const now = live.telemetry?.simRate ?? 1;
  const set = async (r: number) => {
    setBusy(true);
    try {
      await careerApi.simRate(r);
    } catch (e) {
      notifyError(e);
    } finally {
      setBusy(false);
    }
  };
  // Seçili gösterilen: Modstead'in hedefi; pilot simin tuşlarıyla değiştirdiyse simin hızı.
  const shown = rate.managed ? rate.target : Math.round(now);
  const status = rate.returned ? t.live.rate.returned[rate.returned] : rate.hold ? t.live.rate.hold[rate.hold] : null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[14px] border border-line px-3.5 py-2.5">
      <span className="inline-flex items-center gap-1 text-[11.5px] text-muted">
        {t.live.rate.label}
        <Hint text={t.live.rate.hint} />
      </span>
      <div className="flex rounded-full border border-line-strong p-0.5">
        {RATES.map((r) => {
          const off = busy || (r > 1 && !!rate.hold);
          return (
            <button
              key={r}
              type="button"
              disabled={off || r === shown}
              onClick={() => void set(r)}
              className={clsx(
                "tabular h-7 min-w-[40px] rounded-full px-2 font-mono text-[12px] font-bold transition-colors",
                r === shown ? "bg-accent text-accent-ink" : off ? "cursor-default text-muted/50" : "text-fg-2 hover:bg-surface-2 hover:text-fg",
              )}
            >
              {r}×
            </button>
          );
        })}
      </div>
      {Math.abs(now - shown) > 0.05 && <span className="tabular font-mono text-[11.5px] text-muted">{t.live.rate.sim(num(now, 2))}</span>}
      {status && <span className={clsx("text-[12px]", rate.returned ? "font-semibold text-warn" : "text-muted")}>{status}</span>}
    </div>
  );
}

function Gauge({ label, value, unit, hint, className, bar }: { label: string; value: string; unit?: string; hint?: string; className?: string; bar?: number }) {
  return (
    <div className={clsx("relative min-w-0 border-line px-4 py-3", className)}>
      <div className="truncate text-[11.5px] text-muted">{label}</div>
      <div className="mt-1.5 flex items-baseline gap-1">
        <span className="num truncate text-[22px] text-fg">{value}</span>
        {unit && <span className="font-mono text-[11px] font-semibold text-muted">{unit}</span>}
      </div>
      {hint && <div className="tabular mt-0.5 truncate font-mono text-[10.5px] text-muted">{hint}</div>}
      {bar !== undefined && (
        <span className="absolute inset-x-0 bottom-0 h-[3px] bg-surface-3">
          <span className="block h-full bg-accent" style={{ width: `${Math.max(0, Math.min(100, bar * 100))}%` }} />
        </span>
      )}
    </div>
  );
}

export function Events({ events, empty }: { events: FlightEvent[]; empty?: boolean }) {
  const t = useCareerT();
  if (events.length === 0) return empty === false ? null : <p className="text-[12px] text-muted">{t.live.noEvents}</p>;
  return (
    <ul className="flex flex-col divide-y divide-line">
      {events.map((e, i) => (
        <li key={`${e.t}-${e.code}-${i}`} className="flex items-center gap-2.5 py-1.5 text-[12px]">
          <span className="tabular w-[52px] shrink-0 font-mono text-[11px] text-muted">{clock(e.t)}</span>
          {e.severity === "fatal" ? (
            <TriangleAlert className="size-3.5 shrink-0 text-danger" />
          ) : e.penalty > 0 ? (
            <CircleAlert className="size-3.5 shrink-0 text-warn" />
          ) : (
            <CircleCheck className="size-3.5 shrink-0 text-muted" />
          )}
          <span className={clsx("min-w-0 flex-1 truncate", e.severity === "fatal" ? "font-semibold text-danger" : "text-fg-2")}>
            {t.events[e.code] ?? e.code}
            {e.value ? <span className="tabular text-muted"> · {num(e.value, 1)}</span> : null}
          </span>
          {e.penalty > 0 && <span className="tabular shrink-0 font-mono font-semibold text-warn">−{e.penalty}</span>}
        </li>
      ))}
    </ul>
  );
}

/** Hazırlığın üç adımı (uçak, başlangıç yeri, başlat); yapılanlar işaretli. */
function PrepSteps({ done }: { done: boolean[] }) {
  const t = useCareerT();
  return (
    <ol className="flex items-center gap-2">
      {t.guide.prepSteps.map((s, i) => (
        <li key={s} className="flex items-center gap-2">
          <span className={clsx("tabular flex size-5 shrink-0 items-center justify-center rounded-full font-mono text-[10.5px] font-bold", done[i] ? "bg-ok text-[var(--surface)]" : "bg-surface-3 text-fg")}>
            {done[i] ? "✓" : i + 1}
          </span>
          <span className={clsx("text-[12.5px]", done[i] ? "text-muted" : "font-semibold text-fg")}>{s}</span>
          {i < t.guide.prepSteps.length - 1 && <span className="mx-1 h-px w-6 bg-line-strong" />}
        </li>
      ))}
    </ol>
  );
}

/** Kendi EFB'si olan uçak (Fenix, PMDG…): Modstead yük yazmaz; pilot plandaki değerleri uçağın tabletine girer. */
function EfbNote({ active }: { active: ActiveView }) {
  const t = useCareerT();
  const a = useAircraftT();
  const job = active.job;
  const fuel = active.dispatch?.fuel.blockKg ?? job.plan.fuelKg;
  const items = [job.pax ? t.jobs.pax(job.pax) : "", job.cargoKg ? t.jobs.kg(kg(job.cargoKg)) : "", fuel > 0 ? `${t.active.fuel} ${kg(fuel)} kg` : ""].filter(Boolean);
  return (
    <div className="flex items-start gap-2.5 rounded-xl bg-info/10 px-3 py-2.5 text-[12px] leading-relaxed text-info">
      <ClipboardList className="mt-0.5 size-3.5 shrink-0" />
      <div className="min-w-0">
        <div>{a.efbNote}</div>
        {items.length > 0 && (
          <div className="tabular mt-1 font-semibold">
            {a.efbPlan}: {items.join(" · ")}
          </div>
        )}
      </div>
    </div>
  );
}
