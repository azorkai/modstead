// Kurulum incelemesinde güvenlik raporunun yanında MSFS planı: hangi paketler, hangi simlerde açılacak,
// hangi dosyalar ayıklanacak. Seçimler `onOptions` ile kabuğun penceresine, oradan `msfs_confirm_job`'a gider.

import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { ArrowRight, Scissors, TriangleAlert } from "lucide-react";
import type { JobSnapshot } from "@/lib/types";
import { bytes } from "@/lib/format";
import { useLang } from "@/lib/i18n";
import { Badge, Checkbox } from "@/ui";
import { SIM_COLOR, catLabel, version } from "./format";
import { useMsfsT } from "./i18n";
import { BuiltForTag } from "./parts";
import { Poster, posterHue } from "./Poster";
import type { ConfirmOptions, InstallPlan, SimId } from "./types";

export function ReviewPlan({ job, onOptions }: { job: JobSnapshot; onOptions: (o: unknown) => void }) {
  const t = useMsfsT();
  const lang = useLang((s) => s.lang);
  const plan = job.plan as InstallPlan | null;
  const [packages, setPackages] = useState<string[]>(() => plan?.packages.map((p) => p.rel) ?? []);
  const [sims, setSims] = useState<SimId[]>(() => plan?.suggestedSims ?? []);

  useEffect(() => {
    const o: ConfirmOptions = { packages, sims };
    onOptions(o);
  }, [packages, sims]);

  const any2024 = useMemo(() => plan?.packages.some((p) => packages.includes(p.rel) && p.builtFor === "2024") ?? false, [plan, packages]);
  if (!plan) return null;
  if (plan.packages.length === 0) {
    return <div className="rounded-xl border border-warn/30 bg-warn/8 px-4 py-3 text-[12.5px] leading-relaxed text-fg">{t.review.noPackages}</div>;
  }

  const togglePkg = (rel: string) => setPackages((v) => (v.includes(rel) ? v.filter((x) => x !== rel) : [...v, rel]));
  const toggleSim = (id: SimId) => setSims((v) => (v.includes(id) ? v.filter((x) => x !== id) : [...v, id]));

  return (
    <div className="flex flex-col gap-4">
      <ul className="well divide-y divide-[var(--line)] overflow-hidden">
        {plan.packages.map((p) => {
          const on = packages.includes(p.rel);
          return (
            <li key={p.rel} className={clsx("flex items-center gap-3 px-3.5 py-3", !on && "opacity-55")}>
              {plan.packages.length > 1 && <Checkbox checked={on} onChange={() => togglePkg(p.rel)} label={p.title} />}
              <div className="h-[42px] w-[64px] shrink-0 overflow-hidden rounded-lg">
                <Poster code={p.folder.slice(0, 4).toUpperCase()} hue={posterHue(p.folder)} kind={p.category} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-[13px] font-semibold text-fg">{p.title}</span>
                  <Badge tone={p.action === "install" ? "accent" : p.action === "update" ? "info" : "neutral"}>{t.review.action[p.action]}</Badge>
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11.5px] text-muted">
                  <span>{catLabel(p.category, lang)}</span>
                  {p.creator && <span>· {p.creator}</span>}
                  {p.size > 0 && <span>· {bytes(p.size)}</span>}
                  {p.action === "update" && p.existingVersion && (
                    <span className="inline-flex items-center gap-1">
                      · {version(p.existingVersion)} <ArrowRight className="size-3" /> {version(p.version) ?? "?"}
                    </span>
                  )}
                  {p.action === "variant" && p.existingBuiltFor && <span>· {t.review.variantNote(p.existingBuiltFor)}</span>}
                </div>
              </div>
              <BuiltForTag year={p.builtFor} />
            </li>
          );
        })}
      </ul>

      <div>
        <div className="mb-2 text-[12px] font-medium text-fg-2">{t.review.enableIn}</div>
        <div className="flex flex-wrap gap-2">
          {plan.sims.map((s) => {
            const on = sims.includes(s.id);
            const disabled = !s.usable;
            const color = SIM_COLOR[s.id];
            return (
              <button
                key={s.id}
                type="button"
                disabled={disabled}
                aria-pressed={on}
                onClick={() => toggleSim(s.id)}
                className={clsx(
                  "flex h-10 items-center gap-2.5 rounded-xl border px-3.5 text-[13px] font-medium transition-colors",
                  on ? "text-fg" : "border-line text-fg-2 hover:border-line-strong",
                  disabled && "cursor-not-allowed opacity-50",
                )}
                style={on ? { borderColor: `color-mix(in oklab, ${color} 60%, transparent)`, background: `color-mix(in oklab, ${color} 13%, transparent)` } : undefined}
              >
                <span className="size-2 rounded-full" style={{ background: on ? color : "var(--muted)" }} />
                MSFS {s.short}
                {plan.suggestedSims.includes(s.id) && <span className="text-[11px] text-muted">· {t.review.suggested}</span>}
                {!s.usable && <span className="text-[11px] text-muted">· {t.review.simMissing}</span>}
                {s.running && <span className="text-[11px] text-warn">· {t.review.simRunning}</span>}
              </button>
            );
          })}
          {sims.length === 0 && <span className="self-center text-[12px] text-muted">{t.review.none}</span>}
        </div>
        {any2024 && sims.includes("msfs2020") && (
          <p className="mt-2 flex items-center gap-1.5 text-[12px] text-warn">
            <TriangleAlert className="size-3.5" />
            {t.review.built2024In2020}
          </p>
        )}
      </div>

      {plan.strip.length > 0 && (
        <p className="flex items-start gap-2 rounded-xl border border-line bg-surface-2/50 px-3.5 py-2.5 text-[12px] leading-relaxed text-fg-2">
          <Scissors className="mt-0.5 size-3.5 shrink-0 text-accent" />
          {plan.stripExecutables ? t.review.strip(plan.strip.length) : t.review.keepExe(plan.strip.length)}
        </p>
      )}
      <p className="truncate font-mono text-[11px] text-muted" title={plan.library}>
        {t.review.target}: {plan.library}
      </p>
    </div>
  );
}
