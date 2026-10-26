// Filodaki bir uçağın bakım programı (muayene ve ağır bakım) ve gövde sigortası.

import { useState } from "react";
import clsx from "clsx";
import { ShieldCheck, Wrench } from "lucide-react";
import { toast } from "sonner";
import { notifyError } from "@/shell/actions";
import { Badge, Button, Switch } from "@/ui";
import { careerApi } from "./api";
import { hours, money } from "./format";
import { useCareerT } from "./i18n";
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
  const line = (label: string, leftH: number, days: number | null) => {
    const over = leftH < 0 || (days !== null && days < 0);
    return (
      <div className="flex items-baseline justify-between gap-2 text-[11.5px]">
        <span className="min-w-0 truncate text-fg-2">{label}</span>
        <span className={clsx("tabular shrink-0", over ? "font-semibold text-danger" : leftH < 15 || (days !== null && days < 20) ? "text-warn" : "text-fg")}>
          {over ? r.maint.overdue : r.maint.left(`${hours(leftH)} ${t.units.h}`, days)}
        </span>
      </div>
    );
  };
  return (
    <div className="mt-3 rounded-xl border border-line px-3 py-2.5">
      <div className="mb-1.5 flex items-center gap-2">
        <Wrench className="size-3.5 text-muted" />
        <span className="text-[11.5px] font-semibold text-fg">{r.maint.title}</span>
        <span className="flex-1" />
        <span className="text-[11px] text-muted">{r.maint.cycles(f.cycles ?? 0)}</span>
      </div>
      {line(r.maint.inspection[n.inspection], due.inspectionLeftH, due.inspectionLeftDays)}
      {line(r.maint.heavy[n.heavy], due.heavyLeftH, due.heavyLeftDays)}
      {due.grounded && <p className="mt-1.5 text-[11.5px] font-medium text-danger">{r.maint.grounded}</p>}
      {!due.grounded && due.inTolerance && <p className="mt-1.5 text-[11.5px] text-warn">{r.maint.tolerance}</p>}
      <div className="mt-2 flex flex-wrap gap-1.5">
        <Button size="sm" variant={due.grounded || due.inspectionLeftH < 15 ? "primary" : "secondary"} loading={busy === "i"} onClick={() => run("i", () => careerApi.maintain(f.id, false))}>
          {r.maint.doInspection(money(due.inspectionCost))}
        </Button>
        <Button size="sm" variant="ghost" disabled={!f.heavyHere} loading={busy === "h"} onClick={() => run("h", () => careerApi.maintain(f.id, true))}>
          {r.maint.doHeavy(money(due.heavyCost))}
        </Button>
      </div>
      {!f.heavyHere && <p className="mt-1 text-[11px] text-muted">{r.maint.heavyNotHere}</p>}
      <div className="mt-2.5 flex items-center gap-2 border-t border-line pt-2.5">
        <ShieldCheck className={clsx("size-3.5", f.insured ? "text-ok" : "text-muted")} />
        <span className="text-[11.5px] font-semibold text-fg">{r.maint.insurance}</span>
        {f.insured && <Badge tone="ok">{r.maint.insured}</Badge>}
        <span className="flex-1" />
        <Switch checked={f.insured} disabled={busy === "s"} onChange={(on: boolean) => run("s", () => careerApi.insure(f.id, on))} size="sm" />
      </div>
      <p className="mt-1 text-[11px] text-muted">
        {r.maint.premium(money(f.premiumH))} · {r.maint.value} {money(f.value)}
      </p>
    </div>
  );
}
