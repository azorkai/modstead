// Kayıtlar: her şehir oyunun kendi önizlemesiyle (kayıt dosyasının içinden), nüfus, para, harita ve oyun
// tarihiyle. Ayrıntıda kaydedilirken açık olan modlar, seçenekler ve yedekler (yedekle / geri yükle / sil).

import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { Archive, CalendarDays, FolderOpen, History, Map as MapIcon, Palette, RotateCcw, Save, Trash2, Users, Wallet } from "lucide-react";
import clsx from "clsx";
import { toast } from "sonner";
import { ago, bytes, locale, num } from "@/lib/format";
import { notifyError } from "@/shell/actions";
import { Badge, Button, ConfirmDialog, Dialog, DialogBody, DialogFooter, EmptyState, IconButton, PageHeader, Skeleton } from "@/ui";
import { CitiesArt } from "./Art";
import { api } from "./api";
import { useS } from "./i18n";
import { GAME, money, refreshAll, useBackups, useCitiesSync, useEnv, usePreview, useSaves } from "./queries";
import { ImageTag, Label, Page } from "./shared";
import type { SaveBackup, SaveInfo, SimDate } from "./types";

export function simDate(d: SimDate | null): string | null {
  if (!d || !d.year) return null;
  // Oyun ayı 0'dan başlar (0 = Ocak).
  return new Date(d.year, Math.max(0, Math.min(11, d.month)), 1).toLocaleDateString(locale(), { month: "long", year: "numeric" });
}

export default function Saves() {
  useCitiesSync();
  const t = useS();
  const { data: saves, isLoading } = useSaves();
  const [open, setOpen] = useState<string | null>(null);
  const total = useMemo(() => (saves ?? []).reduce((n, s) => n + s.size, 0), [saves]);
  const current = saves?.find((s) => s.id === open) ?? null;

  return (
    <Page className="pb-12">
      <PageHeader
        title={t.saves.title}
        subtitle={saves ? t.saves.subtitle(saves.length, bytes(total)) : undefined}
        actions={
          <>
            <Button variant="ghost" icon={<Archive className="size-4" />} onClick={() => api.openPath("save-backups").catch(notifyError)}>
              {t.saves.backupLocation}
            </Button>
            <Button icon={<FolderOpen className="size-4" />} onClick={() => api.openPath("saves").catch(notifyError)}>
              {t.saves.openFolder}
            </Button>
          </>
        }
      />
      {isLoading ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-[250px] rounded-[18px]" />
          ))}
        </div>
      ) : !saves?.length ? (
        <div className="card">
          <EmptyState icon={<Save className="size-6" />} title={t.saves.emptyTitle}>
            {t.saves.emptyBody}
          </EmptyState>
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4">
          {saves.map((s) => (
            <SaveCard key={s.id} save={s} onOpen={() => setOpen(s.id)} />
          ))}
        </div>
      )}
      <SaveDialog save={current} onClose={() => setOpen(null)} />
    </Page>
  );
}

function SaveCard({ save: s, onOpen }: { save: SaveInfo; onOpen: () => void }) {
  const t = useS();
  const { data: img, isLoading } = usePreview(s.hasPreview ? s.id : null, s.modified);
  return (
    <motion.button
      layout="position"
      onClick={onOpen}
      className="group flex flex-col overflow-hidden rounded-[18px] border border-line bg-surface text-left outline-none transition-[transform,border-color] duration-200 hover:-translate-y-0.5 hover:border-line-strong focus-visible:ring-2 focus-visible:ring-accent/50"
    >
      <div className="relative aspect-[16/9] overflow-hidden bg-[#0a0e14]">
        {img ? (
          <img src={img} alt="" draggable={false} className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.04]" />
        ) : isLoading && s.hasPreview ? (
          <Skeleton className="size-full rounded-none" />
        ) : (
          <div className="hero-surface size-full">
            <CitiesArt className="size-full text-accent" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-transparent" />
        <div className="absolute left-2 top-2 flex gap-1">
          {s.autoSave && <ImageTag>{t.saves.autoSave}</ImageTag>}
          {s.backups > 0 && <ImageTag icon={<History className="size-3" />}>{t.saves.backups(s.backups)}</ImageTag>}
        </div>
        <span className="absolute right-2 top-2" title={new Date(s.modified * 1000).toLocaleString(locale())}>
          <ImageTag>{ago(s.modified)}</ImageTag>
        </span>
        <div className="absolute inset-x-3 bottom-2">
          <div className="text-display truncate text-[18px] font-bold text-white [text-shadow:0_1px_3px_rgb(0_0_0/0.6)]">{s.cityName ?? s.name}</div>
          {s.cityName && s.cityName !== s.name && <div className="truncate font-mono text-[11px] text-white/65">{s.file}</div>}
        </div>
      </div>
      <div className="flex items-center gap-x-3 overflow-hidden px-3.5 py-2.5 text-[12px] text-fg-2">
        {s.error ? (
          <span className="text-warn">{t.saves.unreadable}</span>
        ) : (
          <>
            <span className="tabular inline-flex items-center gap-1">
              <Users className="size-3.5 text-muted" />
              {num(s.population)}
            </span>
            <span className="tabular inline-flex items-center gap-1">
              <Wallet className="size-3.5 text-muted" />
              {money(s.money, num)}
            </span>
            {s.mapName && (
              <span className="inline-flex min-w-0 items-center gap-1 truncate">
                <MapIcon className="size-3.5 shrink-0 text-muted" />
                <span className="truncate">{s.mapName}</span>
              </span>
            )}
          </>
        )}
      </div>
    </motion.button>
  );
}

function SaveDialog({ save: s, onClose }: { save: SaveInfo | null; onClose: () => void }) {
  const t = useS();
  const { data: env } = useEnv();
  const { data: backups } = useBackups();
  const { data: img } = usePreview(s?.hasPreview ? s.id : null, s?.modified, true);
  const [busy, setBusy] = useState(false);
  const [restoring, setRestoring] = useState<SaveBackup | null>(null);
  const mine = (backups ?? []).filter((b) => b.saveId === s?.id);

  const backup = async () => {
    if (!s) return;
    setBusy(true);
    try {
      await api.backupSave(s.id);
      refreshAll();
      toast.success(t.saves.backedUp(s.cityName ?? s.name));
    } catch (e) {
      notifyError(e);
    } finally {
      setBusy(false);
    }
  };
  const restore = async (b: SaveBackup) => {
    if (!s) return;
    setRestoring(null);
    try {
      await api.restoreSave(s.id, b.id);
      refreshAll();
      toast.success(t.saves.restored);
    } catch (e) {
      notifyError(e);
    }
  };
  const remove = async (b: SaveBackup) => {
    try {
      await api.deleteSaveBackup(b.id);
      refreshAll();
    } catch (e) {
      notifyError(e);
    }
  };

  return (
    <Dialog open={!!s} onClose={onClose} width={760} game={GAME}>
      {s && (
        <>
          <div className="relative aspect-[16/7] overflow-hidden rounded-t-[inherit] bg-[#0a0e14]">
            {img ? (
              <img src={img} alt="" draggable={false} className="size-full object-cover" />
            ) : (
              <div className="hero-surface size-full">
                <CitiesArt className="size-full text-accent" />
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />
            <div className="absolute inset-x-6 bottom-4">
              <div className="text-display text-[30px] font-bold leading-tight text-white [text-shadow:0_2px_8px_rgb(0_0_0/0.6)]">{s.cityName ?? s.name}</div>
              <div className="mt-0.5 font-mono text-[11.5px] text-white/65">{s.id}</div>
            </div>
          </div>
          <DialogBody className="flex flex-col gap-5">
            <div className="grid grid-cols-4 gap-2">
              <Fact icon={<Users className="size-3.5" />} label={t.saves.population} value={num(s.population)} />
              <Fact icon={<Wallet className="size-3.5" />} label={t.saves.money} value={money(s.money, num)} />
              <Fact icon={<MapIcon className="size-3.5" />} label={t.saves.map} value={s.mapName ?? "—"} />
              <Fact icon={<CalendarDays className="size-3.5" />} label={t.saves.date} value={simDate(s.simDate) ?? "—"} />
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {s.theme && (
                <Badge icon={<Palette className="size-3" />}>
                  {t.saves.theme}: {s.theme}
                </Badge>
              )}
              {s.autoSave && <Badge>{t.saves.autoSave}</Badge>}
              {s.options.map((o) => (
                <Badge key={o} tone="info">
                  {t.saves.options[o] ?? o}
                </Badge>
              ))}
              <Badge tone={s.modsEnabled.length ? "accent" : "neutral"}>{t.saves.modsUsed(s.modsEnabled.length)}</Badge>
              <span className="ml-auto text-[12px] text-muted">
                {bytes(s.size)} · {ago(s.modified)}
              </span>
            </div>
            {s.modsEnabled.length > 0 && (
              <section>
                <Label>{t.saves.mods}</Label>
                <div className="flex max-h-[120px] flex-wrap gap-1.5 overflow-y-auto">
                  {s.modsEnabled.map((m) => (
                    <span key={m} className="rounded-md border border-line bg-surface-2/60 px-2 py-0.5 text-[12px] text-fg-2">
                      {m}
                    </span>
                  ))}
                </div>
              </section>
            )}
            <section>
              <Label>{t.saves.backupsTitle}</Label>
              {mine.length === 0 ? (
                <p className="text-[12.5px] text-muted">{t.saves.noBackups}</p>
              ) : (
                <div className="overflow-hidden rounded-[12px] border border-line">
                  {mine.map((b) => (
                    <div key={b.id} className="flex items-center gap-3 border-b border-line px-3.5 py-2 last:border-b-0">
                      <History className="size-4 shrink-0 text-muted" />
                      <div className="min-w-0 flex-1">
                        <div className="text-[12.5px] text-fg">{new Date(b.created * 1000).toLocaleString(locale(), { dateStyle: "medium", timeStyle: "short" })}</div>
                        <div className="text-[11.5px] text-muted">
                          {t.saves.reasons[b.reason] ?? b.reason} · {bytes(b.size)}
                        </div>
                      </div>
                      <Button size="sm" variant="subtle" icon={<RotateCcw className="size-3.5" />} disabled={env?.running} onClick={() => setRestoring(b)}>
                        {t.saves.restore}
                      </Button>
                      <IconButton label={t.saves.deleteBackup} onClick={() => remove(b)}>
                        <Trash2 className="size-4" />
                      </IconButton>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={onClose}>
              {t.common.close}
            </Button>
            <Button variant="primary" loading={busy} icon={<Archive className="size-4" />} onClick={backup}>
              {t.saves.backup}
            </Button>
          </DialogFooter>
          <ConfirmDialog
            open={!!restoring}
            onClose={() => setRestoring(null)}
            onConfirm={() => restoring && restore(restoring)}
            title={t.saves.restoreTitle(s.cityName ?? s.name)}
            confirmLabel={t.saves.restore}
          >
            {restoring && t.saves.restoreBody(new Date(restoring.created * 1000).toLocaleString(locale(), { dateStyle: "medium", timeStyle: "short" }))}
          </ConfirmDialog>
        </>
      )}
    </Dialog>
  );
}

function Fact({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className={clsx("rounded-[12px] border border-line bg-surface-2/40 px-3 py-2")}>
      <div className="flex items-center gap-1.5 text-[11px] text-muted">
        {icon}
        {label}
      </div>
      <div className="tabular mt-0.5 truncate text-[13.5px] font-semibold text-fg">{value}</div>
    </div>
  );
}
