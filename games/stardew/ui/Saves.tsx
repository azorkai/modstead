// Kayıtlar: çiftlik özeti, zip yedekleri, geri yükleme (önce mevcut hal yedeklenir) ve oyun öncesi yedekleme.

import { useState } from "react";
import { ChevronDown, FolderOpen, HardDriveDownload, History, RotateCcw, Sprout, Trash2 } from "lucide-react";
import clsx from "clsx";
import { ago, bytes, hueOf, locale } from "@/lib/format";
import { notifyError } from "@/shell/actions";
import { Badge, Button, ConfirmDialog, EmptyState, IconButton, PageHeader, Skeleton, Switch } from "@/ui";
import { api } from "./api";
import { useS } from "./i18n";
import { PixelCoin, PixelLandscape } from "./Pixel";
import { useAction, useSaves, useStardewSettings, useStardewSync } from "./queries";
import { Page } from "./shared";
import type { SaveBackup, SaveInfo } from "./types";

function dateTime(ms: number): string {
  return new Date(ms).toLocaleString(locale(), { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function Saves() {
  useStardewSync();
  const t = useS();
  const { data: saves, isLoading } = useSaves();
  const { data: settings } = useStardewSettings();
  const toggleAuto = useAction((v: boolean) => api.updateSettings({ ...settings!, backupSavesOnLaunch: v }), { success: (st) => (st.backupSavesOnLaunch ? t.saves.autoOn : t.saves.autoOff) });

  return (
    <Page>
      <PageHeader
        title={t.saves.title}
        subtitle={t.saves.subtitle}
        actions={
          <Button icon={<FolderOpen className="size-4" />} onClick={() => api.openPath("saves").catch(notifyError)}>
            {t.saves.folder}
          </Button>
        }
      />

      <section className="card mb-6 flex items-center gap-4 px-5 py-4">
        <div className="accent-soft flex size-10 shrink-0 items-center justify-center rounded-xl">
          <History className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] font-medium text-fg">{t.saves.autoTitle}</div>
          <div className="text-[12.5px] text-muted">{t.saves.autoHint(settings?.saveBackupsKeep ?? 10)}</div>
        </div>
        <Switch checked={settings?.backupSavesOnLaunch ?? true} disabled={!settings || toggleAuto.isPending} onChange={(v) => toggleAuto.mutate(v)} label={t.saves.autoTitle} />
      </section>

      {isLoading ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-[236px] rounded-[18px]" />
          ))}
        </div>
      ) : !saves?.length ? (
        <div className="card">
          <EmptyState icon={<Sprout className="size-6" />} title={t.saves.emptyTitle}>
            {t.saves.emptyBody}
          </EmptyState>
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {saves.map((s) => (
            <SaveCard key={s.folder} save={s} />
          ))}
        </div>
      )}
    </Page>
  );
}

function SaveCard({ save: s }: { save: SaveInfo }) {
  const t = useS();
  const [open, setOpen] = useState(false);
  const [restoring, setRestoring] = useState<SaveBackup | null>(null);
  const name = s.farm ?? s.folder;
  const backup = useAction(() => api.backupSave(s.folder), { success: () => t.saves.backedUp(name) });
  const restore = useAction((file: string) => api.restoreSave(s.folder, file), { success: () => t.saves.restored });
  const del = useAction((file: string) => api.deleteSaveBackup(s.folder, file), { success: () => t.saves.deleted });
  const played = s.playedMs != null ? t.saves.hours(Math.floor(s.playedMs / 3_600_000), Math.floor((s.playedMs % 3_600_000) / 60_000)) : null;

  return (
    <section className="card overflow-hidden">
      <div className="relative h-28 overflow-hidden">
        {/* Görsel alan iki temada da koyu kalır; üstündeki yazı beyaz. */}
        <div className="size-full" style={{ filter: `hue-rotate(${(hueOf(s.folder) % 120) - 60}deg)` }}>
          <PixelLandscape className="size-full" />
        </div>
        <div className="absolute inset-0" style={{ background: "linear-gradient(0deg, rgb(8 9 12 / 0.7) 0%, rgb(8 9 12 / 0.15) 60%, transparent 100%)" }} />
        <div className="absolute bottom-2.5 left-5 right-5 truncate text-[19px] font-semibold text-white [text-shadow:0_1px_2px_rgb(0_0_0/0.6)]">{t.saves.farm(name)}</div>
      </div>
      <div className="px-5 pb-5 pt-3.5">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[12.5px] text-fg-2">
          {s.farmer && (
            <span>
              <span className="text-muted">{t.saves.farmer}:</span> {s.farmer}
            </span>
          )}
          {s.year != null && s.day != null && <span>{t.saves.date(s.year, t.saves.seasons[s.season ?? 0] ?? "", s.day)}</span>}
          {s.money != null && (
            <span className="tabular flex items-center gap-1.5">
              <PixelCoin size={13} /> {s.money.toLocaleString(locale())}g
            </span>
          )}
          {played && (
            <span>
              <span className="text-muted">{t.saves.played}:</span> {played}
            </span>
          )}
        </div>
        <div className="mt-1 truncate text-[11.5px] text-muted">
          {t.saves.lastPlayed(ago(s.modified))} · {bytes(s.size)} · <span className="font-mono">{s.folder}</span>
        </div>
        <div className="mt-4 flex items-center gap-2">
          <Button variant="subtle" size="sm" loading={backup.isPending} icon={<HardDriveDownload className="size-3.5" />} onClick={() => backup.mutate(undefined)}>
            {t.saves.backupNow}
          </Button>
          <Button size="sm" variant="ghost" icon={<FolderOpen className="size-3.5" />} onClick={() => api.openPath("saves", s.folder).catch(notifyError)}>
            {t.saves.open}
          </Button>
          <button onClick={() => setOpen(!open)} className="ml-auto flex items-center gap-1 text-[12.5px] text-fg-2 transition-colors hover:text-fg">
            {t.saves.backups(s.backups.length)} <ChevronDown className={clsx("size-4 transition-transform", open && "rotate-180")} />
          </button>
        </div>
        {open && (
          <div className="mt-3 space-y-1.5 border-t border-line pt-3">
            {s.backups.length === 0 && <p className="text-[12.5px] text-muted">{t.saves.noBackups}</p>}
            {s.backups.map((b) => (
              <div key={b.file} className="well flex items-center gap-3 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="text-[12.5px] text-fg">{dateTime(b.created)}</div>
                  <div className="text-[11px] text-muted">{bytes(b.size)}</div>
                </div>
                <Badge tone={b.reason === "elle" ? "accent" : "neutral"}>{t.saves.reason[b.reason] ?? b.reason}</Badge>
                <Button size="sm" variant="ghost" icon={<RotateCcw className="size-3.5" />} onClick={() => setRestoring(b)}>
                  {t.saves.restore}
                </Button>
                <IconButton label={t.saves.deleteBackup} size="sm" onClick={() => del.mutate(b.file)}>
                  <Trash2 className="size-3.5" />
                </IconButton>
              </div>
            ))}
          </div>
        )}
      </div>
      <ConfirmDialog
        open={restoring !== null}
        onClose={() => setRestoring(null)}
        title={t.saves.restoreTitle}
        confirmLabel={t.saves.restore}
        loading={restore.isPending}
        onConfirm={() => restoring && restore.mutate(restoring.file, { onSuccess: () => setRestoring(null) })}
      >
        {restoring && t.saves.restoreBody(name, dateTime(restoring.created))}
      </ConfirmDialog>
    </section>
  );
}
