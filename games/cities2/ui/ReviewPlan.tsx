// Kurulum incelemesinde Cities: Skylines II'nin planı (güvenlik raporu ortak `SecurityPanel`'de, kabuk çizer):
// her öğe nereye gideceği (Mods / Saves / Maps), yeni mi güncelleme mi, BepInEx ve çift kopya uyarılarıyla.
// BepInEx öğeleri varsayılan olarak seçilmez.

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Archive, Code2, FolderInput, Map as MapIcon, PackagePlus, Save, TriangleAlert } from "lucide-react";
import clsx from "clsx";
import { bytes } from "@/lib/format";
import { isTauri } from "@/lib/ipc";
import type { JobSnapshot } from "@/lib/types";
import { Badge, Checkbox, type Tone } from "@/ui";
import { useS } from "./i18n";
import { SAMPLE_PLAN } from "./mock";
import { GAME } from "./queries";
import type { InstallOptions, InstallPlan, PlanItem } from "./types";

const ACTION_TONE: Record<PlanItem["action"], Tone> = { install: "ok", update: "accent", reinstall: "neutral", downgrade: "warn" };

function planOf(job: JobSnapshot): InstallPlan | null {
  const p = job.plan as InstallPlan | null;
  if (p && p.kind === "cities2") return p;
  // Önizleme kipinde kabuğun örnek görevinin planı yok; örnek planla göster.
  return isTauri ? null : SAMPLE_PLAN;
}

export function ReviewPlan({ job, onOptions }: { job: JobSnapshot; onOptions: (o: unknown) => void }) {
  const plan = planOf(job);
  if (!plan) return null;
  return <PlanView plan={plan} onOptions={onOptions} />;
}

function KindIcon({ kind }: { kind: PlanItem["kind"] }) {
  const cls = "size-5";
  return (
    <div className="grid size-10 shrink-0 place-items-center rounded-[10px] border border-line bg-surface-2 text-accent">
      {kind === "code" ? <Code2 className={cls} /> : kind === "save" ? <Save className={cls} /> : <MapIcon className={cls} />}
    </div>
  );
}

function PlanView({ plan, onOptions }: { plan: InstallPlan; onOptions: (o: unknown) => void }) {
  const t = useS();
  const [keys, setKeys] = useState<string[]>(() => plan.items.filter((i) => !i.bepinex).map((i) => i.key));
  const options = useMemo<InstallOptions>(() => ({ keys }), [keys]);
  useEffect(() => onOptions(options), [options, onOptions]);
  const multi = plan.items.length > 1 || plan.items.some((i) => i.bepinex);
  const anyCode = plan.items.some((i) => i.kind === "code" && keys.includes(i.key));

  return (
    <div className="flex flex-col gap-3" data-game={GAME}>
      <div className="flex items-center gap-2 text-[12px] text-muted">
        <PackagePlus className="size-3.5" />
        <span className="truncate font-mono text-[11.5px]">{plan.sourceName}</span>
        <span className="ml-auto shrink-0">{t.review.summary(plan.items.length, bytes(plan.totalSize), plan.fileCount)}</span>
      </div>

      <div className="card overflow-hidden">
        {plan.items.map((i) => {
          const on = keys.includes(i.key);
          return (
            <div key={i.key} className={clsx("flex items-start gap-3 border-b border-line px-4 py-3 last:border-b-0", multi && !on && "opacity-55")}>
              {multi && (
                <div className="pt-2.5">
                  <Checkbox checked={on} onChange={(v) => setKeys(v ? [...keys, i.key] : keys.filter((k) => k !== i.key))} label={i.name} />
                </div>
              )}
              <KindIcon kind={i.kind} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-[13.5px] font-semibold text-fg">{i.name}</span>
                  <Badge tone={ACTION_TONE[i.action]}>{t.review.action[i.action]}</Badge>
                  {i.bepinex && <Badge tone="warn">BepInEx</Badge>}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[12px] text-fg-2">
                  <span>{t.kind[i.kind]}</span>
                  {i.existingVersion && i.version && i.action !== "install" ? (
                    <span className="inline-flex items-center gap-1 font-mono text-[11.5px]">
                      · {i.existingVersion}
                      <ArrowRight className="size-3 text-muted" />
                      <span className={clsx(i.action === "update" && "text-accent")}>{i.version}</span>
                    </span>
                  ) : (
                    i.version && <span className="font-mono text-[11.5px]">· {i.version}</span>
                  )}
                  {i.kind === "code" && <span className="text-muted">· {t.review.dlls(i.dlls.length)}</span>}
                  {i.hasUi && <span className="text-muted">· {t.review.ui}</span>}
                  <span className="text-muted">· {bytes(i.size)}</span>
                </div>
                {i.detail && i.kind !== "code" && <div className="mt-0.5 text-[12px] text-muted">{i.detail}</div>}
                <div className="mt-1 inline-flex items-center gap-1 font-mono text-[11px] text-muted">
                  <FolderInput className="size-3" />
                  {t.review.target[i.kind]}
                  {i.kind === "save" && plan.savesFolder && `\\${plan.savesFolder}`}\{i.targetName}
                </div>
                {i.action !== "install" && i.kind === "code" && (
                  <div className="mt-1 text-[11.5px] text-muted">{i.existingEnabled === false ? t.review.keepsDisabled : t.review.replaces}</div>
                )}
                {i.kind === "save" && !plan.savesFolder && <div className="mt-1 text-[11.5px] text-warn">{t.review.savesUnknown}</div>}
                {i.warnings.map((w) => (
                  <div key={w} className="mt-1.5 flex items-start gap-1.5 text-[11.5px] text-warn">
                    <TriangleAlert className="mt-0.5 size-3 shrink-0" />
                    {w}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {plan.warnings.map((w) => (
        <div key={w} className="flex items-start gap-2 rounded-[12px] border border-warn/30 bg-warn/5 px-3.5 py-2.5 text-[12px] text-fg-2">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-warn" />
          {w}
        </div>
      ))}
      {plan.backupFirst && anyCode && (
        <div className="flex items-center gap-2 text-[12px] text-fg-2">
          <Archive className="size-3.5 text-accent" />
          {t.review.backupFirst}
        </div>
      )}
    </div>
  );
}
