// Etkinlik: işlem geçmişi (tek tık geri al), çöp kutusu ve SMAPI günlüğü çözümlemesi.

import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { ArrowUpCircle, ChevronDown, ExternalLink, FolderOpen, Gamepad2, History as HistoryIcon, Layers, PackageMinus, PackagePlus, RefreshCw, RotateCcw, ScrollText, ToggleRight, Trash, Trash2, Undo2, Wrench } from "lucide-react";
import clsx from "clsx";
import { ago, bytes, locale } from "@/lib/format";
import { notifyError, openUrl } from "@/shell/actions";
import { Badge, Button, ConfirmDialog, EmptyState, IconButton, PageHeader, Skeleton, Stat } from "@/ui";
import { api } from "./api";
import { useS } from "./i18n";
import { ModDrawer } from "./ModDrawer";
import { Filiz } from "./Pixel";
import { useAction, useJournal, useLog, useModIndex, useStardewSettings, useStardewSync, useTrash } from "./queries";
import { Page } from "./shared";

type Tab = "history" | "trash" | "log";

const KIND: Record<string, { icon: typeof Undo2; tone: string }> = {
  install: { icon: PackagePlus, tone: "text-ok bg-ok/12" },
  update: { icon: ArrowUpCircle, tone: "accent-soft" },
  uninstall: { icon: PackageMinus, tone: "text-danger bg-danger/12" },
  toggle: { icon: ToggleRight, tone: "text-info bg-info/12" },
  profile: { icon: Layers, tone: "accent-soft" },
  restore: { icon: RotateCcw, tone: "text-ok bg-ok/12" },
  "save-restore": { icon: HistoryIcon, tone: "text-ok bg-ok/12" },
  smapi: { icon: Wrench, tone: "text-warn bg-warn/12" },
  launch: { icon: Gamepad2, tone: "text-fg-2 bg-surface-3" },
};

function dateTime(ms: number): string {
  return new Date(ms).toLocaleString(locale(), { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** Panodan "SMAPI günlüğü" gibi bir sekmeyle açmak için. */
let pendingTab: Tab | null = null;
export function openActivityWith(tab: Tab) {
  pendingTab = tab;
}

export default function Activity() {
  useStardewSync();
  const t = useS();
  const [tab, setTab] = useState<Tab>(() => {
    const v = pendingTab ?? "history";
    pendingTab = null;
    return v;
  });
  return (
    <Page>
      <PageHeader title={t.activity.title} subtitle={t.activity.subtitle} />
      <div className="mb-5 flex gap-1 border-b border-line">
        {(Object.keys(t.activity.tabs) as Tab[]).map((k) => (
          <button key={k} onClick={() => setTab(k)} className={clsx("relative h-10 px-4 text-[13px] font-medium transition-colors", tab === k ? "text-fg" : "text-muted hover:text-fg-2")}>
            {t.activity.tabs[k]}
            {tab === k && <motion.span layoutId="sdv-act-tab" className="absolute bottom-0 left-3 right-3 h-[2px] rounded-full bg-accent" />}
          </button>
        ))}
      </div>
      {tab === "history" && <History />}
      {tab === "trash" && <TrashTab />}
      {tab === "log" && <LogTab />}
    </Page>
  );
}

function History() {
  const t = useS();
  const { data, isLoading } = useJournal();
  const undo = useAction((id: string) => api.undo(id), { success: (e) => t.activity.undone(e.title) });
  if (isLoading) return <Skeleton className="h-64 rounded-[18px]" />;
  if (!data?.length)
    return (
      <div className="card">
        <EmptyState icon={<Undo2 className="size-6" />} title={t.activity.historyEmptyTitle}>
          {t.activity.historyEmptyBody}
        </EmptyState>
      </div>
    );
  return (
    <div className="card divide-y divide-[var(--line)]">
      {data.map((j) => {
        const k = KIND[j.kind] ?? { icon: HistoryIcon, tone: "text-fg-2 bg-surface-3" };
        return (
          <div key={j.id} className="flex items-start gap-3 px-5 py-3.5">
            <div className={clsx("flex size-8 shrink-0 items-center justify-center rounded-lg", k.tone)}>
              <k.icon className="size-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className={clsx("text-[13.5px] font-medium", j.undone ? "text-muted line-through" : "text-fg")}>{j.title}</div>
              {j.details.length > 0 && (
                <div className="mt-0.5 text-[12px] text-muted">
                  {j.details.slice(0, 6).join(" · ")}
                  {j.details.length > 6 && ` · ${t.activity.more(j.details.length - 6)}`}
                </div>
              )}
              <div className="mt-0.5 text-[11.5px] text-muted" title={dateTime(j.time)}>
                {ago(j.time)}
              </div>
            </div>
            {j.undone ? (
              <Badge tone="neutral">{t.activity.undoneBadge}</Badge>
            ) : j.legacy ? (
              <span title={t.activity.legacyHint}>
                <Badge tone="neutral">{t.activity.legacy}</Badge>
              </span>
            ) : j.actions.length > 0 ? (
              <Button size="sm" variant="ghost" icon={<Undo2 className="size-3.5" />} loading={undo.isPending && undo.variables === j.id} onClick={() => undo.mutate(j.id)}>
                {t.common.undo}
              </Button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function TrashTab() {
  const t = useS();
  const { data, isLoading } = useTrash();
  const { data: settings } = useStardewSettings();
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const restore = useAction((id: string) => api.restoreTrash(id), { success: (e) => e.title });
  const del = useAction((id: string | null) => api.deleteTrash(id), { success: (n) => t.activity.purged(n) });
  if (isLoading) return <Skeleton className="h-48 rounded-[18px]" />;
  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-4">
        <p className="text-[12.5px] text-muted">{t.activity.trashHint(settings?.trashRetentionDays ?? 30)}</p>
        <div className="flex shrink-0 gap-2">
          <Button size="sm" variant="ghost" icon={<FolderOpen className="size-3.5" />} onClick={() => api.openPath("trash").catch(notifyError)}>
            {t.common.openFolder}
          </Button>
          <Button size="sm" variant="danger" icon={<Trash className="size-3.5" />} disabled={!data?.length} onClick={() => setConfirmEmpty(true)}>
            {t.activity.emptyTrash}
          </Button>
        </div>
      </div>
      {!data?.length ? (
        <div className="card">
          <EmptyState icon={<Trash2 className="size-6" />} title={t.activity.trashEmptyTitle}>
            {t.activity.trashEmptyBody}
          </EmptyState>
        </div>
      ) : (
        <div className="card divide-y divide-[var(--line)]">
          {data.map((item) => (
            <div key={item.id} className="flex items-center gap-3 px-5 py-3">
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13.5px] font-medium text-fg">
                  {item.name} {item.version && <span className="font-mono text-[11.5px] text-muted">{item.version}</span>}
                </div>
                <div className="text-[12px] text-muted">
                  {item.reason} · {ago(item.time)} · {bytes(item.size)}
                </div>
              </div>
              <Button size="sm" variant="subtle" icon={<RotateCcw className="size-3.5" />} loading={restore.isPending && restore.variables === item.id} onClick={() => restore.mutate(item.id)}>
                {t.saves.restore}
              </Button>
              <IconButton label={t.activity.deleteForever} onClick={() => del.mutate(item.id)}>
                <Trash2 className="size-4" />
              </IconButton>
            </div>
          ))}
        </div>
      )}
      <ConfirmDialog
        open={confirmEmpty}
        onClose={() => setConfirmEmpty(false)}
        title={t.activity.emptyTitle}
        danger
        confirmLabel={t.activity.deleteForever}
        loading={del.isPending}
        onConfirm={() => del.mutate(null, { onSuccess: () => setConfirmEmpty(false) })}
      >
        {t.activity.emptyBody(data?.length ?? 0)}
      </ConfirmDialog>
    </>
  );
}

function LogTab() {
  const t = useS();
  const { data: log, isLoading, refetch, isFetching } = useLog();
  const { mods } = useModIndex();
  const [open, setOpen] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<string | null>(null);
  const sources = useMemo(() => Object.entries(log?.bySource ?? {}).sort((a, b) => b[1].errors - a[1].errors || b[1].warnings - a[1].warnings), [log]);
  if (isLoading) return <Skeleton className="h-64 rounded-[18px]" />;
  if (!log?.exists)
    return (
      <div className="card">
        <EmptyState icon={<ScrollText className="size-6" />} title={t.activity.logEmptyTitle}>
          {t.activity.logEmptyBody}
        </EmptyState>
      </div>
    );
  const findMod = (name: string) => mods.find((m) => name.toLowerCase().startsWith(m.name.toLowerCase()));
  return (
    <div className="space-y-5">
      <section className="card flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3.5 text-[12.5px]">
        {log.smapiVersion && (
          <span className="text-fg">
            <span className="text-muted">SMAPI</span> <b className="font-semibold">{log.smapiVersion}</b>
          </span>
        )}
        {log.gameVersion && (
          <span className="text-fg">
            <span className="text-muted">{t.activity.game}</span> <b className="font-semibold">{log.gameVersion}</b>
          </span>
        )}
        {log.os && <span className="text-muted">{log.os}</span>}
        <span className="text-muted">{t.activity.lines(ago(log.modified), log.totalLines)}</span>
        {log.crashed && <Badge tone="danger">{t.activity.crashed}</Badge>}
        <div className="ml-auto flex gap-1.5">
          <IconButton label={t.common.refresh} onClick={() => refetch()}>
            <RefreshCw className={clsx("size-4", isFetching && "animate-spin")} />
          </IconButton>
          <IconButton label={t.common.openFolder} onClick={() => api.openPath("logs").catch(notifyError)}>
            <FolderOpen className="size-4" />
          </IconButton>
          <Button size="sm" variant="subtle" icon={<ExternalLink className="size-3.5" />} onClick={() => openUrl("https://smapi.io/log")}>
            {t.activity.share}
          </Button>
        </div>
      </section>

      <div className="grid grid-cols-3 gap-3">
        <Stat label={t.activity.loaded} value={(log.modsLoaded ?? 0) + (log.contentPacksLoaded ?? 0)} />
        <Stat label={t.activity.skipped} value={log.skipped.length} tone={log.skipped.length ? "warn" : undefined} />
        <Stat label={t.activity.errorLines} value={log.errors.length} tone={log.errors.length ? "danger" : undefined} />
      </div>

      {log.skipped.length > 0 && (
        <section className="card p-5">
          <h3 className="mb-3 text-[14px] font-semibold text-fg">{t.activity.skippedTitle}</h3>
          <div className="space-y-2">
            {log.skipped.map((s) => {
              const m = findMod(s.name);
              return (
                <div key={s.name} className="flex items-start gap-3 rounded-[14px] bg-warn/8 px-3.5 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-medium text-fg">{s.name}</div>
                    <div data-selectable className="text-[12px] text-fg-2">
                      {s.reason}
                    </div>
                  </div>
                  {m && (
                    <Button size="sm" variant="ghost" onClick={() => setDrawer(m.folder)}>
                      {t.activity.openMod}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {sources.length > 0 && (
        <section className="card p-5">
          <h3 className="mb-3 text-[14px] font-semibold text-fg">{t.activity.sources}</h3>
          <div className="space-y-1.5">
            {sources.map(([src, st]) => {
              const entries = [...log.errors, ...log.warnings].filter((e) => e.source === src);
              const isOpen = open === src;
              return (
                <div key={src} className="rounded-[14px] border border-line">
                  <button onClick={() => setOpen(isOpen ? null : src)} className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left">
                    <span className="flex-1 text-[13px] font-medium text-fg">{src}</span>
                    {st.errors > 0 && <Badge tone="danger">{t.activity.errors(st.errors)}</Badge>}
                    {st.warnings > 0 && <Badge tone="warn">{t.activity.warnings(st.warnings)}</Badge>}
                    <ChevronDown className={clsx("size-4 text-muted transition-transform", isOpen && "rotate-180")} />
                  </button>
                  {isOpen && (
                    <div className="space-y-2 border-t border-line p-3">
                      {entries.slice(0, 30).map((e, i) => (
                        <pre key={i} data-selectable className={clsx("overflow-x-auto whitespace-pre-wrap rounded-lg p-2.5 font-mono text-[11px] leading-relaxed text-fg-2", e.level === "WARN" ? "bg-warn/8" : "bg-danger/8")}>
                          <span className="text-muted">[{e.time}]</span> {e.message}
                        </pre>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {sources.length === 0 && log.skipped.length === 0 && (
        <section className="card flex items-center gap-4 p-5">
          <Filiz size={52} />
          <div>
            <div className="text-display text-[18px] font-semibold text-fg">{t.activity.cleanTitle}</div>
            <div className="text-[12.5px] text-fg-2">{t.activity.cleanBody}</div>
          </div>
        </section>
      )}
      <ModDrawer folder={drawer} onClose={() => setDrawer(null)} onOpen={setDrawer} />
    </div>
  );
}
