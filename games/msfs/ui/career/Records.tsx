// Pilot sicili: sağlık sertifikası, yeterlilik (yolcu, gece, aletli), görev süresi ve uçuş defteri sütunları.

import { useState } from "react";
import clsx from "clsx";
import { BedDouble, CircleCheck, CircleX, ClipboardList, HeartPulse, Timer } from "lucide-react";
import { notifyError } from "@/shell/actions";
import { toast } from "sonner";
import { Badge, Button, Progress } from "@/ui";
import { careerApi } from "./api";
import { hours, money, num } from "./format";
import { useCareerT } from "./i18n";
import { invalidateCareer } from "./queries";
import { useRealT } from "./real-i18n";
import type { CareerView } from "./types";

export function RecordsCard({ view }: { view: CareerView }) {
  const r = useRealT();
  const t = useCareerT();
  const h = t.units.h;
  const p = view.pilot!;
  const s = p.status;
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
  const until = new Date(s.medicalUntil * 1000).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  const daysLeft = Math.floor((s.medicalUntil - Date.now() / 1000) / 86400);
  const dutyUsed = s.onDuty ? Math.max(0, s.dutyMaxH - s.dutyLeftH) : 0;
  return (
    <section className="card overflow-hidden">
      <header className="flex items-center gap-2 border-b border-line px-5 py-3.5">
        <ClipboardList className="size-4 text-accent" />
        <h3 className="min-w-0 flex-1 text-[14px] font-semibold text-fg">{r.records.title}</h3>
      </header>
      <div className="flex flex-col gap-3 p-4">
        {/* Sağlık */}
        <div className="well px-3 py-2.5">
          <div className="flex items-center gap-2">
            <HeartPulse className={clsx("size-4", s.medicalValid ? "text-ok" : "text-danger")} />
            <span className="text-[12.5px] font-semibold text-fg">{r.records.medical}</span>
            <Badge tone={s.medicalValid ? (daysLeft < 30 ? "warn" : "ok") : "danger"}>{r.records.medicalClass(s.medicalClass || s.medicalRequired)}</Badge>
            <span className="flex-1" />
          </div>
          <div className="mt-1 text-[11.5px] text-fg-2">
            {!s.medicalValid && s.medicalClass > s.medicalRequired ? r.records.wrongClass(s.medicalRequired) : s.medicalValid ? r.records.until(until) : r.records.expired}
          </div>
          {(!s.medicalValid || daysLeft < 30) && (
            <Button
              className="mt-2"
              size="sm"
              variant={s.medicalValid ? "secondary" : "primary"}
              loading={busy === "medical"}
              onClick={() => act("medical", () => careerApi.medical().then((fee) => toast.success(`${r.records.medical} · ${money(fee)}`)))}
            >
              {r.records.renew(money(p.medicalFee))}
            </Button>
          )}
        </div>

        {/* Yeterlilik */}
        <div>
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.07em] text-muted">{r.records.currency}</div>
          <div className="flex flex-col gap-1">
            <Cur ok={s.passengerCurrent} label={r.records.pax} hint={r.records.paxRule(s.landings90d)} />
            <Cur ok={s.nightCurrent} label={r.records.night} hint={r.records.nightRule(s.nightLandings90d)} />
            {p.licenses.includes("ir") && <Cur ok={s.ifrCurrent} label={r.records.ifr} hint={r.records.ifrRule(s.approaches6m)} />}
          </div>
        </div>

        {/* Görev süresi */}
        <div className="well px-3 py-2.5">
          <div className="flex items-center gap-2">
            <Timer className="size-4 text-accent" />
            <span className="text-[12.5px] font-semibold text-fg">{r.records.duty}</span>
            <span className="flex-1" />
            <span className="tabular text-[11.5px] text-muted">{r.records.maxFdp(`${num(s.dutyMaxH, 1)} ${h}`)}</span>
          </div>
          <div className="mt-1 text-[11.5px] text-fg-2">{s.onDuty ? r.records.onDuty(s.dutySectors, `${num(s.dutyLeftH, 1)} ${h}`) : r.records.offDuty}</div>
          {s.onDuty && <Progress className="mt-2" value={Math.min(1, dutyUsed / s.dutyMaxH)} tone={s.dutyLeftH < 1.5 ? "danger" : "accent"} />}
          <div className="tabular mt-2 grid grid-cols-2 gap-2 text-[11.5px]">
            <span className="text-muted">
              {r.records.hours28} <b className="font-semibold text-fg">{hours(s.hours28d)} {h}</b>
            </span>
            <span className="text-muted">
              {r.records.hours12} <b className="font-semibold text-fg">{hours(s.hours12m)} {h}</b>
            </span>
          </div>
          {s.onDuty && (
            <Button
              className="mt-2"
              size="sm"
              variant="secondary"
              icon={<BedDouble className="size-3.5" />}
              loading={busy === "rest"}
              onClick={() => act("rest", () => careerApi.rest())}
            >
              {p.restCost > 0 ? r.records.restHotel(money(p.restCost)) : r.records.rest}
            </Button>
          )}
        </div>

        {/* Defter sütunları */}
        <div className="grid grid-cols-3 gap-1.5">
          <Mini label={r.records.nightHours} value={`${hours(p.stats.nightHours ?? 0)} ${h}`} />
          <Mini label={r.records.instrumentHours} value={`${hours(p.stats.instrumentHours ?? 0)} ${h}`} />
          <Mini label={r.records.multiHours} value={`${hours(p.stats.multiEngineHours ?? 0)} ${h}`} />
          <Mini label={r.records.xcHours} value={`${hours(p.stats.crossCountryHours ?? 0)} ${h}`} />
          <Mini label={r.records.nightLandings} value={num(p.stats.nightLandings ?? 0)} />
          <Mini label={r.records.stable} value={num(p.stats.stableApproaches ?? 0)} />
        </div>
        <p className="text-[11px] text-muted">{r.records.enforce[p.difficulty]}</p>
      </div>
    </section>
  );
}

function Cur({ ok, label, hint }: { ok: boolean; label: string; hint: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg px-1 py-0.5 text-[12px]">
      {ok ? <CircleCheck className="size-3.5 shrink-0 text-ok" /> : <CircleX className="size-3.5 shrink-0 text-warn" />}
      <span className="font-medium text-fg">{label}</span>
      <span className="min-w-0 flex-1 truncate text-right text-[11.5px] text-muted">{hint}</span>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-surface-2/60 px-2 py-1.5">
      <div className="truncate text-[10.5px] text-muted">{label}</div>
      <div className="tabular text-[12.5px] font-semibold text-fg">{value}</div>
    </div>
  );
}
