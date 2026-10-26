// Sağlık: simlerin modları gerçekten yükleyip yüklemeyeceği. Sorunlar önem sırasıyla, her birinin yanında
// varsa tek tık düzeltmesi (kırık bağlantı, iç içe paket, 2024 yapımı paket 2020'de, exe.xml / Content.xml);
// ardından aynı simde etkin paketler arasındaki çakışmalar.

import { useMemo, useState } from "react";
import { toast } from "sonner";
import clsx from "clsx";
import { ChevronDown, CircleAlert, CircleCheck, Info, Layers, RefreshCw, TriangleAlert, Wrench } from "lucide-react";
import { notifyError } from "@/shell/actions";
import { Button, ConfirmDialog, EmptyState, IconButton, PageHeader, Skeleton, Stat } from "@/ui";
import { api } from "../api";
import { SIM_COLOR, SIM_SHORT, activeAnywhere } from "../format";
import { useMsfsT } from "../i18n";
import { ModDrawer } from "../ModDrawer";
import { useModOps } from "../parts";
import { invalidateAll, rescan, useConflicts, useSnapshot } from "../queries";
import { worst } from "../ReadinessPanel";
import { useMsfsUi } from "../store";
import { Thumb } from "../Thumb";
import type { Conflict, Issue, ModEntry, ReadinessFix, ScanResult, SimId } from "../types";

type Row = Issue & { mod: ModEntry | null };

function collect(scan: ScanResult): Row[] {
  const byId = new Map(scan.mods.map((m) => [m.id, m]));
  const rows: Row[] = [
    ...scan.issues.map((i) => ({ ...i, mod: i.modId ? (byId.get(i.modId) ?? null) : null })),
    ...scan.mods.flatMap((m) => m.issues.map((i) => ({ ...i, modId: m.id, mod: m }))),
  ];
  const order = { error: 0, warning: 1, info: 2 };
  return rows.sort((a, b) => order[a.level] - order[b.level]);
}

/** Sorunun hazırlık denetimindeki düzeltmesi (exe.xml girdisini aç / Content.xml'de etkinleştir). */
function readinessFix(r: Row): ReadinessFix | null {
  return r.mod?.readiness.find((c) => c.code === r.code && c.sim === r.sim && c.fix)?.fix ?? null;
}

export default function Health() {
  const t = useMsfsT();
  const { data: scan, isLoading } = useSnapshot();
  const { data: conflicts } = useConflicts(!!scan);
  const [refreshing, setRefreshing] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const rows = useMemo(() => (scan ? collect(scan) : []), [scan]);
  const pathRows = rows.filter((r) => r.code === "path-too-long" && r.mod && r.sim);
  const pathSims = Array.from(new Set(pathRows.map((r) => r.sim!)));
  const problems = rows.filter((r) => r.level !== "info" && r.code !== "path-too-long");
  const infos = rows.filter((r) => r.level === "info");
  const errors = rows.filter((r) => r.level === "error").length;
  const warnings = rows.filter((r) => r.level === "warning").length;
  const active = scan?.mods.filter(activeAnywhere) ?? [];
  const ready = active.filter((m) => worst(m.readiness) === "ok").length;

  const refresh = async () => {
    setRefreshing(true);
    await rescan();
    setRefreshing(false);
  };

  return (
    <div className="mx-auto max-w-[1180px] pb-16">
      <PageHeader
        title={t.health.title}
        subtitle={t.health.subtitle}
        actions={
          <Button variant="secondary" icon={<RefreshCw className={clsx("size-4", refreshing && "animate-spin")} />} onClick={refresh} disabled={refreshing}>
            {t.common.rescan}
          </Button>
        }
      />

      {isLoading || !scan ? (
        <div className="grid grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[74px]" />
          ))}
        </div>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-4 gap-3">
            <Stat label={t.health.errors} value={errors} tone={errors ? "danger" : "ok"} icon={<CircleAlert className="size-3.5" />} />
            <Stat label={t.health.warnings} value={warnings} tone={warnings ? "warn" : undefined} icon={<TriangleAlert className="size-3.5" />} />
            <Stat label={t.health.conflicts} value={conflicts?.length ?? "…"} tone={conflicts?.length ? "warn" : undefined} icon={<Layers className="size-3.5" />} />
            <Stat label={t.health.ready} value={`${ready}/${active.length}`} tone={ready === active.length ? "ok" : undefined} icon={<CircleCheck className="size-3.5" />} />
          </div>

          <section className="card mb-5 overflow-hidden">
            <header className="border-b border-line px-5 py-4">
              <h3 className="title text-[15px] text-fg">{t.health.attention}</h3>
              <p className="mt-0.5 text-[12.5px] text-fg-2">{t.health.attentionSub}</p>
            </header>
            {problems.length === 0 && pathSims.length === 0 ? (
              <EmptyState icon={<CircleCheck className="size-6" />} title={t.health.allGoodTitle} className="py-10">
                {t.health.allGoodBody}
              </EmptyState>
            ) : (
              <ul className="divide-y divide-[var(--line)]">
                {pathSims.map((sim) => (
                  <PathGroup key={sim} sim={sim} rows={pathRows.filter((r) => r.sim === sim)} />
                ))}
                {problems.map((r, i) => (
                  <IssueRow key={`${r.modId}-${r.code}-${r.sim}-${i}`} row={r} />
                ))}
              </ul>
            )}
            {infos.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => setShowInfo((v) => !v)}
                  className="flex w-full items-center gap-2 border-t border-line px-5 py-2.5 text-left text-[12.5px] text-fg-2 hover:bg-surface-2/50"
                >
                  <Info className="size-3.5 text-info" />
                  {t.health.infoSub(infos.length)}
                  <ChevronDown className={clsx("ml-auto size-4 transition-transform", showInfo && "rotate-180")} />
                </button>
                {showInfo && (
                  <ul className="divide-y divide-[var(--line)] border-t border-line">
                    {infos.map((r, i) => (
                      <IssueRow key={`i-${i}`} row={r} />
                    ))}
                  </ul>
                )}
              </>
            )}
          </section>

          <ConflictsSection conflicts={conflicts} scan={scan} />
        </>
      )}
      <ModDrawer />
    </div>
  );
}

function SimChip({ sim }: { sim: SimId }) {
  return (
    <span className="inline-flex h-5 items-center gap-1 rounded-md border border-line px-1.5 text-[10.5px] font-semibold text-fg-2">
      <span className="size-1.5 rounded-full" style={{ background: SIM_COLOR[sim] }} />
      {SIM_SHORT[sim]}
    </span>
  );
}

function IssueRow({ row: r }: { row: Row }) {
  const t = useMsfsT();
  const open = useMsfsUi((s) => s.open);
  const ops = useModOps();
  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState<ReadinessFix | null>(null);
  const fix = readinessFix(r);
  const Icon = r.level === "error" ? CircleAlert : r.level === "warning" ? TriangleAlert : Info;
  const tone = r.level === "error" ? "text-danger" : r.level === "warning" ? "text-warn" : "text-info";

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
      invalidateAll();
    } catch (e) {
      notifyError(e);
    } finally {
      setBusy(false);
    }
  };

  let action: { label: string; onClick: () => void } | null = null;
  if (r.code === "broken-link" && r.path) {
    action = { label: t.health.fixRemoveLink, onClick: () => run(async () => (await api.removeBrokenLink(r.path!), void toast.success(t.health.linkRemoved))) };
  } else if (r.code === "nested-package" && r.path) {
    action = { label: t.health.fixNested, onClick: () => run(async () => void toast.success(t.health.nestedFixed((await api.fixNested(r.path!)).length))) };
  } else if (r.code === "built-for-2024-in-2020" && r.modId && r.mod?.source === "library") {
    action = { label: t.health.fixDisable2020, onClick: () => ops.setEnabled([r.modId!], "msfs2020", false) };
  } else if (fix) {
    action = { label: t.readiness.fix, onClick: () => setAsk(fix) };
  }

  const applyFix = async () => {
    if (!ask) return;
    await run(async () => {
      const out = await api.applyFix(ask);
      toast.success(t.readiness.fixed, { description: `${out.message} ${t.readiness.backup(out.backup)}` });
      setAsk(null);
    });
  };

  return (
    <li className="flex items-start gap-3.5 px-5 py-3.5">
      {r.mod ? <Thumb mod={r.mod} className="mt-0.5 h-[38px] w-[60px] shrink-0 rounded-lg" /> : <span className="mt-0.5 flex h-[38px] w-[60px] shrink-0 items-center justify-center rounded-lg bg-surface-2"><Icon className={clsx("size-4", tone)} /></span>}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Icon className={clsx("size-3.5 shrink-0", tone)} />
          <span className="text-[13px] font-medium text-fg">{r.title}</span>
          {r.sim && <SimChip sim={r.sim} />}
        </div>
        {r.mod && (
          <button type="button" onClick={() => open(r.mod!.id)} className="mt-0.5 text-[12px] font-medium text-accent hover:underline">
            {r.mod.info.title}
          </button>
        )}
        <Detail text={r.detail} />
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {action && (
          <Button size="sm" variant="subtle" icon={<Wrench className="size-3.5" />} loading={busy || ops.busy} onClick={action.onClick}>
            {action.label}
          </Button>
        )}
        {r.mod && !action && (
          <Button size="sm" variant="ghost" onClick={() => open(r.mod!.id)}>
            {t.common.details}
          </Button>
        )}
      </div>
      <ConfirmDialog open={!!ask} onClose={() => setAsk(null)} onConfirm={applyFix} title={t.readiness.fixTitle} confirmLabel={t.readiness.fix} loading={busy}>
        {t.readiness.fixAsk}
      </ConfirmDialog>
    </li>
  );
}

/** Kısa açıklama doğrudan, uzun olanı (yollar, dosya listeleri) "Ayrıntılar"ın içinde. */
function Detail({ text }: { text: string }) {
  const t = useMsfsT();
  const [open, setOpen] = useState(false);
  if (!text) return null;
  if (text.length <= 140) {
    return (
      <p className="mt-1 text-[12px] leading-relaxed text-fg-2 [overflow-wrap:anywhere]" data-selectable>
        {text}
      </p>
    );
  }
  return (
    <div className="mt-1">
      <button type="button" onClick={() => setOpen((v) => !v)} className="inline-flex items-center gap-1 text-[12px] font-medium text-fg-2 hover:text-fg">
        {t.health.details}
        <ChevronDown className={clsx("size-3.5 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <p className="mt-1 text-[12px] leading-relaxed text-fg-2 [overflow-wrap:anywhere]" data-selectable>
          {text}
        </p>
      )}
    </div>
  );
}

/** Aynı simde yol sınırını aşan paketler: tek cümlelik özet, etkilenen paketler, ortak çözüm rehberi. */
function PathGroup({ sim, rows }: { sim: SimId; rows: Row[] }) {
  const t = useMsfsT();
  const open = useMsfsUi((s) => s.open);
  const [guide, setGuide] = useState(false);
  const [details, setDetails] = useState(false);
  const counts = rows.map((r) => r.mod!.readiness.find((c) => c.code === "path-too-long" && c.sim === sim)?.count ?? null);
  const total = counts.every((c) => c !== null) ? counts.reduce<number>((a, c) => a + (c ?? 0), 0) : null;
  const short = SIM_SHORT[sim];
  const reveal = (target: string) => api.reveal(target).catch(notifyError);
  return (
    <li className="px-5 py-4">
      <div className="flex items-start gap-3.5">
        <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl bg-danger/10">
          <CircleAlert className="size-5 text-danger" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[13.5px] font-semibold text-fg">{t.health.pathGroup(rows.length)}</span>
            <SimChip sim={sim} />
          </div>
          <p className="mt-0.5 text-[12.5px] text-fg-2">{total !== null ? t.health.pathSummary(total, short) : t.health.pathSummaryNoCount(short)}</p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {rows.map((r, i) => (
              <button
                key={r.mod!.id}
                type="button"
                onClick={() => open(r.mod!.id)}
                className="well flex items-center gap-2.5 py-1.5 pl-1.5 pr-3 text-left transition-colors hover:border-line-strong"
              >
                <Thumb mod={r.mod!} className="h-[28px] w-[44px] shrink-0 rounded-md" />
                <span className="text-[12.5px] font-medium text-fg">{r.mod!.info.title}</span>
                {counts[i] !== null && <span className="text-[11.5px] text-muted">· {t.health.files(counts[i]!)}</span>}
              </button>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <Button size="sm" variant="subtle" icon={<Wrench className="size-3.5" />} onClick={() => setGuide((v) => !v)}>
              {t.health.howToFix}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setDetails((v) => !v)} trailing={<ChevronDown className={clsx("size-3.5 transition-transform", details && "rotate-180")} />}>
              {t.health.details}
            </Button>
          </div>
          {guide && (
            <div className="well mt-3 px-4 py-3">
              <p className="text-[12.5px] leading-relaxed text-fg-2">{t.health.pathWhy}</p>
              <ol className="mt-2.5 space-y-1.5">
                {t.health.pathSteps.map((step, i) => (
                  <li key={i} className="flex gap-2.5 text-[12.5px] text-fg">
                    <span className="accent-soft flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold">{i + 1}</span>
                    <span className="min-w-0 flex-1">
                      {step}
                      {i === 2 && (
                        <button type="button" className="ml-2 text-[12px] font-medium text-accent hover:underline" onClick={() => reveal(`packages:${sim}`)}>
                          {t.health.openPackages}
                        </button>
                      )}
                      {i === 3 && (
                        <button type="button" className="ml-2 text-[12px] font-medium text-accent hover:underline" onClick={() => reveal(`config:${sim}`)}>
                          {t.health.openConfig}
                        </button>
                      )}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          )}
          {details && (
            <ul className="mt-3 space-y-2">
              {rows.map((r) => (
                <li key={r.mod!.id} className="text-[12px] leading-relaxed text-fg-2 [overflow-wrap:anywhere]" data-selectable>
                  <span className="font-medium text-fg">{r.mod!.info.title}: </span>
                  {r.detail}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </li>
  );
}

function ConflictsSection({ conflicts, scan }: { conflicts: Conflict[] | undefined; scan: ScanResult }) {
  const t = useMsfsT();
  return (
    <section className="card overflow-hidden">
      <header className="border-b border-line px-5 py-4">
        <h3 className="title text-[15px] text-fg">{t.health.conflictsTitle}</h3>
        <p className="mt-0.5 text-[12.5px] text-fg-2">{t.health.conflictsSub}</p>
      </header>
      {conflicts === undefined ? (
        <div className="space-y-2 p-5">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      ) : conflicts.length === 0 ? (
        <p className="flex items-center gap-2 px-5 py-4 text-[12.5px] text-fg-2">
          <CircleCheck className="size-4 text-ok" />
          {t.health.noConflicts}
        </p>
      ) : (
        <ul className="divide-y divide-[var(--line)]">
          {conflicts.map((c, i) => (
            <ConflictRow key={i} c={c} scan={scan} />
          ))}
        </ul>
      )}
    </section>
  );
}

function ConflictRow({ c, scan }: { c: Conflict; scan: ScanResult }) {
  const t = useMsfsT();
  const open = useMsfsUi((s) => s.open);
  const ops = useModOps();
  const [expanded, setExpanded] = useState(false);
  const a = scan.mods.find((m) => m.id === c.aId);
  const b = scan.mods.find((m) => m.id === c.bId);
  const canDisable = (m: ModEntry | undefined) => m?.source === "library" && m.sims[c.sim]?.state === "enabled";
  return (
    <li className="px-5 py-3.5">
      <div className="flex items-center gap-3">
        <SimChip sim={c.sim} />
        <span className="text-[13px] font-medium text-fg">{c.kind === "airport" ? t.health.airportConflict(c.icao ?? "") : t.health.filesConflict(c.shared)}</span>
        <div className="flex-1" />
        {c.samples.length > 0 && (
          <IconButton size="sm" label={t.health.samples} onClick={() => setExpanded((v) => !v)}>
            <ChevronDown className={clsx("size-4 transition-transform", expanded && "rotate-180")} />
          </IconButton>
        )}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {[a, b].map((m, i) =>
          m ? (
            <div key={i} className="well flex items-center gap-3 px-3 py-2">
              <Thumb mod={m} className="h-[34px] w-[54px] shrink-0 rounded-md" />
              <button type="button" onClick={() => open(m.id)} className="min-w-0 flex-1 truncate text-left text-[12.5px] font-medium text-fg hover:text-accent">
                {m.info.title}
              </button>
              {canDisable(m) && (
                <Button size="sm" variant="ghost" disabled={ops.busy} onClick={() => ops.setEnabled([m.id], c.sim, false)}>
                  {t.common.disable}
                </Button>
              )}
            </div>
          ) : null,
        )}
      </div>
      {expanded && (
        <ul className="mt-2 space-y-0.5 pl-1">
          {c.samples.map((s) => (
            <li key={s} className="truncate font-mono text-[11px] text-muted" data-selectable>
              {s}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
