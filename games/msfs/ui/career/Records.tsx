// Pilot durumu: varsayılan olarak tek satır ("uçuşa engel bir durum yok" ya da dikkat isteyen konular, her biri tek
// cümle ve gerekiyorsa tek düğmeyle). Ayrıntılar (sağlık raporu, neler yapabilirsin, bugünkü uçuş süresi, uçuş
// saatleri) açılır bölümde, gündelik dille.

import { useState } from "react";
import clsx from "clsx";
import { BedDouble, ChevronDown, CircleCheck, HeartPulse, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { locale } from "@/lib/format";
import { notifyError } from "@/shell/actions";
import { Button } from "@/ui";
import { careerApi } from "./api";
import { hours, money, num } from "./format";
import { useCareerT } from "./i18n";
import { Bar, Panel, Segments } from "./parts";
import { invalidateCareer } from "./queries";
import { useRealT } from "./real-i18n";
import type { CareerView } from "./types";

interface Issue {
  id: string;
  title: string;
  hint?: string;
  tone: "warn" | "danger";
  action?: { label: string; run: () => Promise<unknown>; icon?: React.ReactNode };
}

export function RecordsCard({ view }: { view: CareerView }) {
  const r = useRealT();
  const t = useCareerT();
  const h = t.units.h;
  const p = view.pilot!;
  const s = p.status;
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const act = async (name: string, f: () => Promise<unknown>) => {
    setBusy(name);
    try {
      await f();
      invalidateCareer();
    } catch (e) {
      notifyError(e);
    } finally {
      setBusy(null);
    }
  };
  const until = new Date(s.medicalUntil * 1000).toLocaleDateString(locale(), { day: "numeric", month: "long", year: "numeric" });
  const daysLeft = Math.max(0, Math.floor((s.medicalUntil - Date.now() / 1000) / 86400));
  const renew = { label: r.records.renew(money(p.medicalFee)), run: () => careerApi.medical().then((fee) => toast.success(`${r.records.medical} · ${money(fee)}`)) };
  const rest = { label: p.restCost > 0 ? r.records.restHotel(money(p.restCost)) : r.records.rest, run: () => careerApi.rest(), icon: <BedDouble className="size-3.5" /> };
  const left = `${num(Math.max(0, s.dutyLeftH), 1)} ${h}`;

  // Yalnızca dikkat isteyenler.
  const issues: Issue[] = [];
  if (!s.medicalValid) {
    issues.push({ id: "medical", title: s.medicalClass > s.medicalRequired ? r.records.wrongClass(s.medicalRequired) : r.records.medExpired, hint: r.records.medExpiredHint, tone: "danger", action: renew });
  } else if (daysLeft < 30) {
    issues.push({ id: "medical", title: r.records.medExpiring(daysLeft), tone: "warn", action: renew });
  }
  if (!s.passengerCurrent) issues.push({ id: "pax", title: r.records.paxLapsed, hint: r.records.paxHint(s.landings90d), tone: "warn" });
  if (!s.nightCurrent) issues.push({ id: "night", title: r.records.nightLapsed, hint: r.records.nightHint(s.nightLandings90d), tone: "warn" });
  if (p.licenses.includes("ir") && !s.ifrCurrent) issues.push({ id: "ifr", title: r.records.ifrLapsed, hint: r.records.ifrHint(s.approaches6m), tone: "warn" });
  if (s.onDuty && s.dutyLeftH <= 0) issues.push({ id: "duty", title: r.records.dutyOver, hint: r.records.dutyHint, tone: "danger", action: rest });
  else if (s.onDuty && s.dutyLeftH < 3) issues.push({ id: "duty", title: r.records.dutyLow(left), hint: r.records.dutyHint, tone: "warn", action: rest });

  const dutyUsed = s.onDuty ? Math.max(0, s.dutyMaxH - s.dutyLeftH) : 0;
  return (
    <Panel
      title={r.records.statusTitle}
      aside={
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[12px] font-semibold text-fg-2 transition-colors hover:bg-surface-2 hover:text-fg">
          {open ? r.records.hideDetails : r.records.details}
          <ChevronDown className={clsx("size-3.5 transition-transform", open && "rotate-180")} />
        </button>
      }
    >
      {issues.length === 0 ? (
        <div className="flex items-start gap-3 px-6 py-4">
          <CircleCheck className="mt-0.5 size-5 shrink-0 text-ok" />
          <div className="min-w-0">
            <div className="text-[13.5px] font-semibold text-fg">{r.records.allGood}</div>
            <div className="mt-0.5 text-pretty text-[12px] leading-relaxed text-fg-2">{r.records.allGoodBody(until)}</div>
          </div>
        </div>
      ) : (
        <ul className="flex flex-col">
          {issues.map((i) => (
            <li key={i.id} className="flex items-start gap-3 border-t border-line px-6 py-4 first:border-t-0">
              <TriangleAlert className={clsx("mt-0.5 size-4 shrink-0", i.tone === "danger" ? "text-danger" : "text-warn")} />
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-semibold text-fg">{i.title}</div>
                {i.hint && <div className="mt-0.5 text-pretty text-[12px] leading-relaxed text-fg-2">{i.hint}</div>}
                {i.action && (
                  <Button className="mt-2.5" size="sm" variant={i.tone === "danger" ? "primary" : "secondary"} icon={i.action.icon} loading={busy === i.id} onClick={() => act(i.id, i.action!.run)}>
                    {i.action.label}
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {open && (
        <div className="flex flex-col border-t border-line">
          {/* Sağlık raporu */}
          <Section title={r.records.medicalPlain}>
            <div className="flex items-center gap-2.5">
              <HeartPulse className={clsx("size-4 shrink-0", s.medicalValid ? (daysLeft < 30 ? "text-warn" : "text-ok") : "text-danger")} />
              <span className="text-[12.5px] text-fg">
                {r.records.medicalClass(s.medicalClass || s.medicalRequired)} · {s.medicalValid ? r.records.until(until) : r.records.expired}
              </span>
            </div>
          </Section>

          {/* Neler yapabilirsin */}
          <Section title={r.records.canTitle}>
            <div className="flex flex-col gap-2.5">
              <Can label={r.records.canPax} ok={s.passengerCurrent} have={s.landings90d} need={3} hint={r.records.landings90(s.landings90d, 3)} />
              <Can label={r.records.canNight} ok={s.nightCurrent} have={s.nightLandings90d} need={3} hint={r.records.nightLandings90(s.nightLandings90d, 3)} />
              {p.licenses.includes("ir") && <Can label={r.records.canIfr} ok={s.ifrCurrent} have={s.approaches6m} need={6} hint={r.records.approaches6m(s.approaches6m, 6)} />}
            </div>
          </Section>

          {/* Bugünkü uçuş süresi */}
          <Section title={r.records.dutyPlain}>
            <div className="flex items-baseline justify-between gap-2 text-[12.5px]">
              <span className="tabular text-fg">
                <b className="font-semibold">{num(dutyUsed, 1)}</b> / {num(s.dutyMaxH, 1)} {h}
                {s.onDuty && s.dutySectors > 0 && <span className="text-muted"> · {r.records.flightsToday(s.dutySectors)}</span>}
              </span>
              <span className="tabular text-muted">{s.onDuty ? r.records.left(left) : r.records.rested}</span>
            </div>
            <Bar className="mt-2" value={s.dutyMaxH > 0 ? dutyUsed / s.dutyMaxH : 0} tone={s.onDuty && s.dutyLeftH < 3 ? "warn" : "accent"} />
            <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted">{r.records.dutyPlainHint(`${num(s.dutyMaxH, 1)} ${h}`)}</p>
            <div className="mt-3 grid grid-cols-2 gap-4">
              <Limit label={r.records.hours28} value={s.hours28d} max={100} unit={h} />
              <Limit label={r.records.hours12} value={s.hours12m} max={1000} unit={h} />
            </div>
            {s.onDuty && !issues.some((i) => i.id === "duty") && (
              <Button className="mt-3" size="sm" variant="secondary" icon={rest.icon} loading={busy === "rest"} onClick={() => act("rest", rest.run)}>
                {rest.label}
              </Button>
            )}
          </Section>

          {/* Uçuş saatleri */}
          <Section title={r.records.hoursPlain}>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              <Mini label={r.records.nightHours} value={hours(p.stats.nightHours ?? 0)} unit={h} />
              <Mini label={r.records.instrumentHours} value={hours(p.stats.instrumentHours ?? 0)} unit={h} />
              <Mini label={r.records.multiHours} value={hours(p.stats.multiEngineHours ?? 0)} unit={h} />
              <Mini label={r.records.xcHours} value={hours(p.stats.crossCountryHours ?? 0)} unit={h} />
              <Mini label={r.records.nightLandings} value={num(p.stats.nightLandings ?? 0)} />
              <Mini label={r.records.stable} value={num(p.stats.stableApproaches ?? 0)} />
            </div>
          </Section>
          <p className="border-t border-line px-6 py-3 text-[11.5px] leading-relaxed text-muted">{r.records.enforce[p.difficulty]}</p>
        </div>
      )}
    </Panel>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-line px-6 py-4 first:border-t-0">
      <div className="mb-2.5 text-[12px] font-semibold text-fg-2">{title}</div>
      {children}
    </div>
  );
}

function Can({ label, ok, have, need, hint }: { label: string; ok: boolean; have: number; need: number; hint: string }) {
  const r = useRealT();
  return (
    <div className="flex items-center gap-3" title={hint}>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[12.5px] text-fg">{label}</div>
        <div className="tabular truncate text-[11.5px] text-muted">{hint}</div>
      </div>
      <Segments have={Math.min(have, need)} need={need} tone={ok ? "ok" : "warn"} />
      <span className={clsx("w-11 shrink-0 text-right text-[12px] font-semibold", ok ? "text-ok" : "text-warn")}>{ok ? r.records.yes : r.records.no}</span>
    </div>
  );
}

function Limit({ label, value, max, unit }: { label: string; value: number; max: number; unit: string }) {
  const v = Math.max(0, value);
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2 text-[11.5px]">
        <span className="truncate text-muted">{label}</span>
        <span className="tabular shrink-0 text-fg-2">
          {hours(v)} / {num(max)} {unit}
        </span>
      </div>
      <Bar className="mt-1.5 h-1" value={v / max} tone={v / max > 0.9 ? "danger" : v / max > 0.75 ? "warn" : "info"} />
    </div>
  );
}

function Mini({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="min-w-0">
      <div className="truncate text-[11.5px] text-muted">{label}</div>
      <div className="mt-0.5 flex items-baseline gap-1">
        <span className="tabular text-[15px] font-semibold text-fg">{value}</span>
        {unit && <span className="text-[11px] text-muted">{unit}</span>}
      </div>
    </div>
  );
}
