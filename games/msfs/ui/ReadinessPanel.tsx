// "Bu mod gerçekten yüklenip çalışacak mı?" denetimleri: sim tanıması (Content.xml), yardımcı programlar
// (exe.xml), paket yapısı ve yol uzunluğu. Düzeltmeler yalnızca açık onayla ve yedek alınarak uygulanır.

import { useState } from "react";
import { toast } from "sonner";
import clsx from "clsx";
import { CircleAlert, CircleCheck, CircleHelp, ExternalLink, TriangleAlert, Wrench } from "lucide-react";
import { notifyError, openUrl } from "@/shell/actions";
import { Button, ConfirmDialog } from "@/ui";
import { api } from "./api";
import { SIM_COLOR, SIM_SHORT } from "./format";
import { useMsfsT } from "./i18n";
import { invalidateAll } from "./queries";
import type { CheckStatus, ReadinessCheck, ReadinessFix, SimId } from "./types";

const ICON: Record<CheckStatus, typeof CircleCheck> = { ok: CircleCheck, warn: TriangleAlert, error: CircleAlert, unknown: CircleHelp };
const TONE: Record<CheckStatus, string> = { ok: "text-ok", warn: "text-warn", error: "text-danger", unknown: "text-muted" };

export function worst(checks: ReadinessCheck[]): CheckStatus {
  const rank = { ok: 0, unknown: 1, warn: 2, error: 3 } as const;
  return checks.filter((c) => !c.optional).reduce<CheckStatus>((w, c) => (rank[c.status] > rank[w] ? c.status : w), "ok");
}

export function ReadinessPanel({ checks, compact }: { checks: ReadinessCheck[]; compact?: boolean }) {
  const t = useMsfsT();
  const [ask, setAsk] = useState<ReadinessFix | null>(null);
  const [busy, setBusy] = useState(false);
  const simChecks = checks.filter((c) => c.sim);
  if (simChecks.length === 0) return <p className="px-1 text-[12.5px] text-fg-2">{t.readiness.notActive}</p>;

  // Önce sorunlar, sonra tamamlar; paket denetimleri simden bağımsız olduğu için en sonda.
  const order = { error: 0, warn: 1, unknown: 2, ok: 3 } as const;
  const sims = Array.from(new Set(simChecks.map((c) => c.sim!))) as SimId[];
  const packageChecks = checks.filter((c) => !c.sim && c.status !== "ok");

  const apply = async () => {
    if (!ask) return;
    setBusy(true);
    try {
      const out = await api.applyFix(ask);
      toast.success(t.readiness.fixed, { description: `${out.message} ${t.readiness.backup(out.backup)}` });
      invalidateAll();
      setAsk(null);
    } catch (e) {
      notifyError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {sims.map((sim) => {
        const list = simChecks.filter((c) => c.sim === sim).sort((a, b) => order[a.status] - order[b.status]);
        const w = worst(list);
        return (
          <div key={sim} className="well overflow-hidden">
            <div className="flex items-center gap-2 border-b border-line px-3.5 py-2">
              <span className="size-2 rounded-full" style={{ background: SIM_COLOR[sim] }} />
              <span className="text-[12.5px] font-semibold text-fg">MSFS {SIM_SHORT[sim]}</span>
              <span className={clsx("ml-auto text-[11.5px] font-medium", TONE[w])}>{w === "ok" ? t.readiness.allGood : t.readiness.status[w]}</span>
            </div>
            <ul className="divide-y divide-[var(--line)]">
              {list.map((c) => (
                <CheckRow key={c.id} check={c} compact={compact} onFix={setAsk} />
              ))}
            </ul>
          </div>
        );
      })}
      {packageChecks.length > 0 && (
        <ul className="well divide-y divide-[var(--line)] overflow-hidden">
          {packageChecks.map((c) => (
            <CheckRow key={c.id} check={c} compact={compact} onFix={setAsk} />
          ))}
        </ul>
      )}
      <ConfirmDialog open={!!ask} onClose={() => setAsk(null)} onConfirm={apply} title={t.readiness.fixTitle} confirmLabel={t.readiness.fix} loading={busy}>
        {t.readiness.fixAsk}
      </ConfirmDialog>
    </div>
  );
}

function CheckRow({ check: c, compact, onFix }: { check: ReadinessCheck; compact?: boolean; onFix: (f: ReadinessFix) => void }) {
  const t = useMsfsT();
  const Icon = ICON[c.status];
  const [open, setOpen] = useState(c.status === "error");
  const quiet = c.status === "ok";
  return (
    <li className="px-3.5 py-2.5">
      <div className="flex items-start gap-2.5">
        <Icon className={clsx("mt-px size-4 shrink-0", TONE[c.status], c.optional && c.status !== "ok" && "opacity-70")} />
        <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          <div className={clsx("text-[12.5px] leading-snug", quiet ? "text-fg-2" : "font-medium text-fg")}>
            {c.title}
            {c.optional && <span className="ml-1.5 text-[11px] font-normal text-muted">· {t.readiness.optional}</span>}
          </div>
          {open && !compact && <p className="mt-1 text-[12px] leading-relaxed text-fg-2 [overflow-wrap:anywhere]" data-selectable>{c.detail}</p>}
        </button>
        {c.fix && (
          <Button size="sm" variant="subtle" icon={<Wrench className="size-3.5" />} onClick={() => onFix(c.fix!)}>
            {t.readiness.fix}
          </Button>
        )}
      </div>
      {open && !compact && (c.hint || c.source) && (
        <div className="ml-[26px] mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px]">
          {c.hint && <span className="text-fg [overflow-wrap:anywhere]">{c.hint}</span>}
          {c.source && (
            <button type="button" className="inline-flex items-center gap-1 text-accent hover:underline" onClick={() => openUrl(c.source!)}>
              {t.readiness.source} <ExternalLink className="size-3" />
            </button>
          )}
        </div>
      )}
    </li>
  );
}
