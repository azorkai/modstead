import { useEffect, useMemo, useState } from "react";
import { ArchiveRestore, FolderOpen, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, errorText } from "../api";
import type { BackupMeta } from "../types";
import { fmtBytes, fmtDateTime } from "../format";
import { useApp } from "../store";
import { Badge, Button, EmptyState, ModuleAvatar, Spinner } from "../components/kit";
import { useT } from "../i18n";

const REASON_TONE: Record<BackupMeta["reason"], "neutral" | "accent" | "danger" | "info"> = {
  update: "accent",
  uninstall: "danger",
  duplicate: "info",
  restore: "neutral",
};

export function BackupsView() {
  const t = useT();
  const applyOverview = useApp((s) => s.applyOverview);
  const confirm = useApp((s) => s.confirm);
  const [items, setItems] = useState<BackupMeta[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const reload = () => api.listBackups().then(setItems).catch((e) => toast.error(errorText(e)));
  useEffect(() => {
    reload();
  }, []);

  const total = useMemo(() => items?.reduce((n, b) => n + b.size, 0) ?? 0, [items]);

  return (
    <div className="mx-auto flex max-w-[1180px] flex-col">
      <header className="flex items-end gap-3 mb-6">
        <div className="flex-1">
          <h1 className="text-display text-[26px] font-semibold leading-tight tracking-tight text-fg">{t.nav.backups}</h1>
          <p className="mt-2 text-[13px] text-fg-2">
            {t.backups.intro}
            {items && items.length > 0 && <span className="text-muted"> · {t.backups.summary(items.length, fmtBytes(total))}</span>}
          </p>
        </div>
        <Button icon={<FolderOpen className="size-4" />} onClick={() => api.openPath("backups").catch((e) => toast.error(errorText(e)))}>
          {t.common.openFolder}
        </Button>
      </header>
      <div>
        {!items ? (
          <div className="flex justify-center py-20">
            <Spinner className="size-6" />
          </div>
        ) : items.length === 0 ? (
          <EmptyState icon={<ArchiveRestore className="size-6" />} title={t.backups.emptyTitle}>
            {t.backups.emptyBody}
          </EmptyState>
        ) : (
          <div className="card overflow-hidden">
            {items.map((b) => (
              <div key={b.id} className="flex items-center gap-4 border-b border-line px-5 py-3 last:border-b-0">
                <ModuleAvatar id={b.moduleId} name={b.name} size={34} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[13.5px] font-medium">{b.name}</span>
                    <Badge tone={REASON_TONE[b.reason] ?? "neutral"}>{t.backups.reasons[b.reason] ?? b.reason}</Badge>
                  </div>
                  <div className="mt-0.5 flex gap-3 text-[11.5px] text-muted">
                    <span className="font-mono">{b.version || "—"}</span>
                    <span>{fmtDateTime(b.created)}</span>
                    <span className="tabular">{fmtBytes(b.size)}</span>
                    <span className="font-mono">Modules\{b.folder}</span>
                  </div>
                </div>
                <Button
                  size="sm"
                  icon={<RotateCcw className="size-3.5" />}
                  loading={busy === b.id}
                  onClick={async () => {
                    const ok = await confirm({
                      title: t.backups.restoreTitle(b.name, b.version),
                      body: t.backups.restoreBody,
                      confirmLabel: t.common.restore,
                    });
                    if (!ok) return;
                    setBusy(b.id);
                    try {
                      applyOverview(await api.restoreBackup(b.id), true);
                      toast.success(t.backups.restored(b.name));
                      reload();
                    } catch (e) {
                      toast.error(errorText(e));
                    } finally {
                      setBusy(null);
                    }
                  }}
                >
                  {t.common.restore}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="hover:!text-danger"
                  icon={<Trash2 className="size-3.5" />}
                  onClick={async () => {
                    const ok = await confirm({
                      title: t.backups.deleteTitle,
                      body: t.backups.deleteBody(b.name, b.version, fmtBytes(b.size)),
                      confirmLabel: t.backups.deleteForever,
                      danger: true,
                    });
                    if (!ok) return;
                    await api.deleteBackup(b.id).catch((e) => toast.error(errorText(e)));
                    reload();
                  }}
                >
                  {t.common.delete}
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
