// Filodaki bir uçağın bakım programı (muayene ve ağır bakım) ve gövde sigortası. Her bakım kalemi bir gösterge:
// son bakımdan bu yana geçen saat / bakım aralığı; kalan saat (ve gün) sağda.

import { useState } from "react";
import clsx from "clsx";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { notifyError } from "@/shell/actions";
import { Button, Switch } from "@/ui";
import { careerApi } from "./api";
import { hours, money } from "./format";
import { useCareerT } from "./i18n";
import { Bar, Hint, TONE_FG, type GaugeTone } from "./parts";
import { invalidateCareer } from "./queries";
import { useRealT } from "./real-i18n";
import type { FleetView } from "./types";

/** Uçağın sınıfına göre programın adları (arka uçtaki `maintenance::program` ile aynı). */
function names(cls: FleetView["class"]): { inspection: string; heavy: string } {
  switch (cls) {
    case "light_piston":
    case "piston_twin":
    case "helicopter":
      return { inspection: "100h", heavy: "overhaul" };
    case "turboprop_single":
    case "turboprop_twin":
      return { inspection: "phase", heavy: "overhaul" };
    case "bizjet":
      return { inspection: "inspection", heavy: "heavy" };
    default:
      return { inspection: "a_check", heavy: "c_check" };
  }
}

export function MaintenanceBlock({ f }: { f: FleetView }) {
  const r = useRealT();
  const t = useCareerT();
  const [busy, setBusy] = useState<string | null>(null);
  const due = f.due;
  const n = names(f.class);
  const run = async (name: string, fn: () => Promise<unknown>) => {
    setBusy(name);
    try {
      const v = await fn();
      if (typeof v === "number") toast.success(money(v));
      invalidateCareer();
    } catch (e) {
      notifyError(e);
    } finally {
      setBusy(null);
    }
  };
  const line = (label: string, since: number, leftH: number, days: number | null) => {
    const over = leftH < 0 || (days !== null && days < 0);
    const soon = !over && (leftH < 15 || (days !== null && days < 20));
    const tone: GaugeTone = over ? "danger" : soon ? "warn" : "ok";
    const interval = Math.max(1, since + Math.max(0, leftH));
    return (
      <div className="min-w-0">
        <div className="flex items-baseline justify-between gap-2 text-[11.5px]">
          <span className="min-w-0 truncate text-fg-2">{label}</span>
          <span className={clsx("tabular shrink-0 font-semibold", over || soon ? TONE_FG[tone] : "text-fg")}>{over ? r.maint.overdue : r.maint.left(`${hours(leftH)} ${t.units.h}`, days)}</span>
        </div>
        <Bar className="mt-1.5 h-1" value={over ? 1 : since / interval} tone={over ? "danger" : soon ? "warn" : "info"} />
      </div>
    );
  };
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="flex min-w-0 flex-1 items-center gap-1.5 text-[12px] font-semibold text-fg-2">
          <span className="truncate">{r.maint.title}</span>
          <Hint text={t.guide.maintHint} />
        </span>
        <span className="tabular text-[11.5px] text-muted">{r.maint.cycles(f.cycles ?? 0)}</span>
      </div>
      {line(r.maint.inspection[n.inspection], f.sinceInspectionH ?? 0, due.inspectionLeftH, due.inspectionLeftDays)}
      {line(r.maint.heavy[n.heavy], f.sinceHeavyH ?? 0, due.heavyLeftH, due.heavyLeftDays)}
      {due.grounded && <p className="text-[11.5px] font-semibold text-danger">{r.maint.grounded}</p>}
      {!due.grounded && due.inTolerance && <p className="text-[11.5px] text-warn">{r.maint.tolerance}</p>}
      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" variant={due.grounded || due.inspectionLeftH < 15 ? "subtle" : "secondary"} loading={busy === "i"} onClick={() => run("i", () => careerApi.maintain(f.id, false))}>
          {r.maint.doInspection(money(due.inspectionCost))}
        </Button>
        <Button size="sm" variant="ghost" disabled={!f.heavyHere} title={f.heavyHere ? undefined : r.maint.heavyNotHere} loading={busy === "h"} onClick={() => run("h", () => careerApi.maintain(f.id, true))}>
          {r.maint.doHeavy(money(due.heavyCost))}
        </Button>
      </div>
      <div className="flex items-center gap-2.5 border-t border-line pt-3">
        <ShieldCheck className={clsx("size-4 shrink-0", f.insured ? "text-ok" : "text-muted")} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-semibold text-fg">{r.maint.insurance}</span>
            <Hint text={t.guide.insuranceHint} />
            {f.insured && <span className="text-[11.5px] font-semibold text-ok">{r.maint.insured}</span>}
          </div>
          <div className="truncate text-[11px] text-muted" title={r.maint.premium(money(f.premiumH))}>
            {r.maint.premium(money(f.premiumH))}
          </div>
        </div>
        <Switch checked={f.insured} disabled={busy === "s"} onChange={(on: boolean) => run("s", () => careerApi.insure(f.id, on))} size="sm" />
      </div>
    </div>
  );
}
