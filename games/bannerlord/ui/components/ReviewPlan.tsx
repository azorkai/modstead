// Kurulum incelemesinde oyuna özel kısım: arşivdeki modüller, neyin güncelleneceği, çalıştırılabilir
// dosyalar ve eksik bağımlılıklar. Güvenlik raporu ve açık onay kabuğun ortak penceresinde
// (SecurityPanel); "Kur" düğmesi `confirmJob` ile seçilen modülleri arka uca iletir.

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, ExternalLink } from "lucide-react";
import clsx from "clsx";
import type { JobSnapshot } from "@/lib/types";
import { api } from "../api";
import type { InstallPlan, PlannedModule } from "../types";
import { fmtBytes } from "../format";
import { virusTotalUrl } from "../links";
import { Badge, Checkbox, ModuleAvatar } from "./kit";
import { useT } from "../i18n";

const ACTION_TONE: Record<PlannedModule["action"], "ok" | "accent" | "warn" | "neutral"> = {
  install: "ok",
  update: "accent",
  downgrade: "warn",
  reinstall: "neutral",
};

export interface ReviewOptions {
  moduleIds: string[];
}

export function ReviewPlan({ job, onOptions }: { job: JobSnapshot; onOptions: (o: unknown) => void }) {
  const t = useT();
  const plan = job.plan as InstallPlan | null;
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (plan) setSelected(new Set(plan.modules.filter((m) => !m.blocked).map((m) => m.id)));
  }, [job.id, plan]);

  useEffect(() => {
    onOptions({ moduleIds: [...selected] } satisfies ReviewOptions);
  }, [selected, onOptions]);

  if (!plan) return null;
  return (
    <div className="space-y-3">
      <div className="text-[12px] text-fg-2">{plan.sourceLabel}</div>
      <div className="space-y-2">
        {plan.modules.map((m) => (
          <ModuleCard
            key={m.id + m.relRoot}
            m={m}
            checked={selected.has(m.id)}
            onChange={(v) =>
              setSelected((s) => {
                const n = new Set(s);
                if (v) n.add(m.id);
                else n.delete(m.id);
                return n;
              })
            }
          />
        ))}
      </div>
      {plan.notes.length > 0 && (
        <div className="space-y-1.5">
          {plan.notes.map((n) => (
            <p key={n} className="flex gap-2 text-[12px] text-fg-2">
              <span className="mt-1.5 size-1 shrink-0 rounded-full bg-muted" />
              {n}
            </p>
          ))}
        </div>
      )}
      <p className="text-[11.5px] text-muted">{t.review.footerNote}</p>
    </div>
  );
}

function ModuleCard({ m, checked, onChange }: { m: PlannedModule; checked: boolean; onChange: (v: boolean) => void }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const a = { label: t.review.actions[m.action], tone: ACTION_TONE[m.action] };
  const dlls = useMemo(() => m.dlls.filter((d) => d.path.toLowerCase().endsWith(".dll") || d.path.toLowerCase().endsWith(".exe")), [m.dlls]);
  return (
    <div className={clsx("rounded-xl border bg-surface-2/40", m.blocked ? "border-danger/25" : "border-line")}>
      <div className="flex items-center gap-3 p-3">
        <Checkbox checked={checked && !m.blocked} disabled={!!m.blocked} onChange={onChange} />
        <ModuleAvatar id={m.id} name={m.name} size={34} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[13.5px] font-semibold">{m.name}</span>
            <Badge tone={a.tone}>{a.label}</Badge>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 text-[11.5px] text-muted">
            <span className="font-mono">
              {m.existing ? (
                <>
                  {m.existing.version} → <span className="text-fg">{m.version}</span>
                </>
              ) : (
                <span className="text-fg-2">{m.version}</span>
              )}
            </span>
            <span className="font-mono">Modules\{m.folder}</span>
            <span className="tabular">
              {fmtBytes(m.size)} · {t.common.files(m.files)}
            </span>
          </div>
        </div>
        {dlls.length > 0 && (
          <button
            onClick={() => setOpen((o) => !o)}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11.5px] text-fg-2 hover:bg-surface-3"
          >
            {t.review.executables(dlls.length)}
            <ChevronDown className={clsx("size-3.5 transition-transform", open && "rotate-180")} />
          </button>
        )}
      </div>
      {m.blocked && <p className="border-t border-danger/20 px-3 py-2 text-[12px] text-danger">{m.blocked}</p>}
      {m.missingDeps.length > 0 && (
        <p className="border-t border-line px-3 py-2 text-[12px] text-warn">
          {t.review.missingDeps} <span className="font-mono">{m.missingDeps.join(", ")}</span>
        </p>
      )}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="max-h-56 overflow-y-auto border-t border-line">
              {dlls.map((d) => (
                <div key={d.path} className="flex items-center gap-3 border-b border-line px-3 py-1.5 last:border-b-0">
                  <span className="selectable min-w-0 flex-1 truncate font-mono text-[11px] text-fg-2">{d.path}</span>
                  <span className="text-[11px] text-muted tabular">{fmtBytes(d.size)}</span>
                  <button
                    title={t.review.openInVirusTotal(d.sha256)}
                    onClick={() => api.openUrl(virusTotalUrl(d.sha256)).catch(() => {})}
                    className="flex items-center gap-1 font-mono text-[10.5px] text-muted hover:text-accent"
                  >
                    {d.sha256.slice(0, 10)}…
                    <ExternalLink className="size-3" />
                  </button>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
