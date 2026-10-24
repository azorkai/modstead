// Kurulum incelemesinde Stardew'in planı (güvenlik raporu ortak `SecurityPanel`'de, solunda kabuk çizer).
// İki tür plan var: arşivdeki modlar ("mods") ve SMAPI kurulumu ("smapi").

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Download, FileCog, FolderTree, ListChecks, PackagePlus, Puzzle, ShieldCheck, TriangleAlert, Wrench } from "lucide-react";
import clsx from "clsx";
import { bytes } from "@/lib/format";
import { isTauri } from "@/lib/ipc";
import type { JobSnapshot } from "@/lib/types";
import { openUrl } from "@/shell/actions";
import { Badge, Button, Checkbox, type Tone } from "@/ui";
import { useS } from "./i18n";
import { SAMPLE_PLANS } from "./mock";
import { PixelCover } from "./Pixel";
import { findDependency, getFromNexus, useLookup } from "./nexus";
import type { InstallPlan, ModsOptions, ModsPlan, SmapiPlan, StagedMod } from "./types";

const ACTION_TONE: Record<StagedMod["action"], Tone> = { install: "ok", update: "accent", reinstall: "neutral", downgrade: "warn" };

function planOf(job: JobSnapshot): InstallPlan | null {
  const p = job.plan as InstallPlan | null;
  if (p && (p.kind === "mods" || p.kind === "smapi")) return p;
  // Önizleme kipinde kabuğun örnek görevinin planı yok; örnek planla göster.
  return isTauri ? null : job.kind === "smapi" ? SAMPLE_PLANS.smapi : SAMPLE_PLANS.mods;
}

export function ReviewPlan({ job, onOptions }: { job: JobSnapshot; onOptions: (o: unknown) => void }) {
  const plan = planOf(job);
  if (!plan) return null;
  return plan.kind === "smapi" ? <SmapiPlanView plan={plan} /> : <ModsPlanView plan={plan} onOptions={onOptions} />;
}

function ModsPlanView({ plan, onOptions }: { plan: ModsPlan; onOptions: (o: unknown) => void }) {
  const t = useS();
  const [keys, setKeys] = useState<string[]>(() => plan.mods.filter((m) => !m.manifestError).map((m) => m.key));
  const [removeSource, setRemoveSource] = useState(plan.sourceInMods);
  const options = useMemo<ModsOptions>(() => ({ keys, removeSource }), [keys, removeSource]);
  useEffect(() => onOptions(options), [options, onOptions]);
  const multi = plan.mods.length > 1;
  const missing = [...new Set(plan.mods.filter((m) => keys.includes(m.key)).flatMap((m) => m.missingDeps))];
  const found = useLookup(missing);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 text-[12px] text-muted">
        <PackagePlus className="size-3.5" />
        <span className="truncate font-mono text-[11.5px]">{plan.sourceName}</span>
        <span className="ml-auto shrink-0">{t.review.summary(plan.mods.length, bytes(plan.totalSize), plan.fileCount)}</span>
      </div>

      <div className="card overflow-hidden" data-game="stardew">
        {plan.mods.map((m) => {
          const on = keys.includes(m.key);
          return (
            <div key={m.key} className={clsx("flex items-start gap-3 border-b border-line px-4 py-3 last:border-b-0", multi && !on && "opacity-55")}>
              {multi && (
                <div className="pt-2.5">
                  <Checkbox checked={on} disabled={!!m.manifestError} onChange={(v) => setKeys(v ? [...keys, m.key] : keys.filter((k) => k !== m.key))} label={m.name} />
                </div>
              )}
              <div className="size-10 shrink-0 overflow-hidden rounded-[10px]">
                <PixelCover seed={m.uniqueId ?? m.folderName} kind={m.kind} className="size-full" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-[13.5px] font-semibold text-fg">{m.name}</span>
                  <Badge tone={ACTION_TONE[m.action]}>{t.review.action[m.action]}</Badge>
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[12px] text-fg-2">
                  <span>{m.author ?? t.common.unknownAuthor}</span>
                  {(m.existingVersion || m.version) && <span className="text-muted">·</span>}
                  {m.existingVersion && m.version && m.action !== "install" ? (
                    <span className="inline-flex items-center gap-1 font-mono text-[11.5px]">
                      {m.existingVersion}
                      <ArrowRight className="size-3 text-muted" />
                      <span className={clsx(m.action === "update" && "text-accent")}>{m.version}</span>
                    </span>
                  ) : (
                    m.version && <span className="font-mono text-[11.5px]">{m.version}</span>
                  )}
                  <span className="text-muted">·</span>
                  <span className="text-muted">{t.kind[m.kind]}</span>
                </div>
                {m.action !== "install" && (
                  <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11.5px] text-muted">
                    {m.keepsConfig && (
                      <span className="inline-flex items-center gap-1 text-ok">
                        <FileCog className="size-3" />
                        {t.review.keepsConfig}
                      </span>
                    )}
                    <span>{t.review.oldToTrash}</span>
                  </div>
                )}
                {(m.manifestError || m.warnings.length > 0) && (
                  <ul className="mt-1.5 space-y-0.5 text-[11.5px] text-warn">
                    {m.manifestError && <li className="text-danger">{m.manifestError}</li>}
                    {m.warnings.map((w) => (
                      <li key={w} className="flex gap-1.5">
                        <TriangleAlert className="mt-0.5 size-3 shrink-0" />
                        {w}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <span className="tabular shrink-0 pt-0.5 text-[11.5px] text-muted">{bytes(m.size)}</span>
            </div>
          );
        })}
      </div>

      {plan.warnings.map((w) => (
        <div key={w} className="flex gap-2 rounded-[14px] border border-warn/25 bg-warn/8 px-3.5 py-2.5 text-[12px] text-fg-2">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-warn" />
          {w}
        </div>
      ))}

      {missing.length > 0 && (
        <div className="rounded-[14px] border border-warn/25 bg-warn/8 px-3.5 py-3">
          <div className="flex items-center gap-2 text-[12.5px] font-medium text-fg">
            <Puzzle className="size-3.5 text-warn" />
            {t.review.missingDeps}
          </div>
          <p className="mt-0.5 text-[12px] text-fg-2">{t.review.missingHint}</p>
          <div className="mt-2 space-y-1.5">
            {missing.map((id) => {
              const r = found.get(id.toLowerCase());
              return (
                <div key={id} className="flex items-center gap-2.5 rounded-[10px] bg-surface/70 px-2.5 py-1.5">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12.5px] font-medium text-fg">{r?.name ?? id}</div>
                    {r?.name && <div className="truncate font-mono text-[11px] text-muted">{id}</div>}
                  </div>
                  <Button size="sm" variant="secondary" icon={<Download className="size-3.5" />} onClick={() => (r?.nexusId ? getFromNexus(r.nexusId, { name: r.name }) : findDependency(id))}>
                    {t.review.get}
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {plan.sourceInMods && (
        <label className="flex cursor-pointer items-center gap-2.5 px-1 text-[12.5px] text-fg-2">
          <Checkbox checked={removeSource} onChange={setRemoveSource} label={t.review.removeSource} />
          {t.review.removeSource}
        </label>
      )}
      {multi && keys.length === 0 && <p className="px-1 text-[12px] text-danger">{t.review.noneSelected}</p>}
    </div>
  );
}

function SmapiPlanView({ plan }: { plan: SmapiPlan }) {
  const t = useS();
  const steps = [
    t.review.smapiStep1,
    t.review.smapiStep2(plan.files),
    t.review.smapiStep3,
    ...(plan.bundledMods.length ? [t.review.smapiStep4(plan.bundledMods.join(", "))] : []),
    ...(plan.keepsUserConfig ? [t.review.smapiKeeps] : []),
  ];
  return (
    <div className="flex flex-col gap-3" data-game="stardew">
      <div className="card flex items-center gap-4 px-4 py-3.5">
        <div className="accent-surface flex size-11 shrink-0 items-center justify-center rounded-xl">
          <Wrench className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-semibold text-fg">{t.review.smapiTitle(plan.version)}</div>
          <div className="text-[12.5px] text-fg-2">{plan.installedVersion ? t.review.smapiUpdate(plan.installedVersion, plan.version) : t.review.smapiFresh}</div>
        </div>
        {plan.releaseUrl && (
          <Button size="sm" variant="ghost" onClick={() => openUrl(plan.releaseUrl!)}>
            {t.review.release}
          </Button>
        )}
      </div>
      <div className="well px-4 py-3">
        <div className="mb-2 flex items-center gap-2 text-[12px] font-medium text-fg">
          <ListChecks className="size-3.5 text-accent" />
          {t.review.smapiSteps}
        </div>
        <ol className="space-y-1.5 text-[12.5px] text-fg-2">
          {steps.map((s, i) => (
            <li key={s} className="flex gap-2.5">
              <span className="tabular mt-px flex size-4 shrink-0 items-center justify-center rounded-full bg-surface-3 text-[10px] font-semibold text-fg-2">{i + 1}</span>
              {s}
            </li>
          ))}
        </ol>
      </div>
      <div className="flex flex-col gap-1.5 px-1 text-[12px] text-muted">
        <span className="flex items-center gap-2">
          <ShieldCheck className="size-3.5 text-ok" />
          {t.review.smapiNoRun}
        </span>
        {plan.gameDir && (
          <span className="flex min-w-0 items-center gap-2">
            <FolderTree className="size-3.5 shrink-0" />
            <span className="shrink-0">{t.review.gameDir}:</span>
            <span className="truncate font-mono text-[11px]" title={plan.gameDir}>
              {plan.gameDir}
            </span>
          </span>
        )}
      </div>
    </div>
  );
}
