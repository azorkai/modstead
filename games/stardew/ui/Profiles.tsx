// Profiller: etkin mod düzenlerini kaydet, fark önizlemesiyle uygula, paylaş ve içe aktar.

import { useMemo, useState } from "react";
import { Check, ClipboardCopy, ClipboardPaste, Layers, Pencil, Plus, Save, Trash2 } from "lucide-react";
import clsx from "clsx";
import { toast } from "sonner";
import { ago } from "@/lib/format";
import { notifyError } from "@/shell/actions";
import { Badge, Button, ConfirmDialog, Dialog, DialogBody, DialogFooter, DialogHeader, EmptyState, IconButton, Input, PageHeader, Skeleton, Spinner, type Tone } from "@/ui";
import { api } from "./api";
import { useS } from "./i18n";
import { PixelStar } from "./Pixel";
import { useAction, useModIndex, useProfiles, useStardewSettings, useStardewSync } from "./queries";
import { Page } from "./shared";
import type { ModInfo, Profile, ProfileDiff } from "./types";

interface Draft {
  id: string | null;
  name: string;
  description: string;
  capture: boolean;
}

function modKey(m: ModInfo): string {
  return m.uniqueId ? m.uniqueId.toLowerCase() : `folder:${m.folderName.toLowerCase()}`;
}

export default function Profiles() {
  useStardewSync();
  const t = useS();
  const { data: profiles, isLoading } = useProfiles();
  const { data: settings } = useStardewSettings();
  const { mods } = useModIndex();
  const [editing, setEditing] = useState<Draft | null>(null);
  const [importing, setImporting] = useState(false);
  const [importText, setImportText] = useState("");
  const [preview, setPreview] = useState<{ profile: Profile; diff: ProfileDiff | null } | null>(null);
  const [deleting, setDeleting] = useState<Profile | null>(null);

  const currentKeys = useMemo(() => new Set(mods.filter((m) => m.enabled).map(modKey)), [mods]);
  const allKeys = useMemo(() => new Set(mods.map(modKey)), [mods]);
  const matches = (p: Profile) => p.mods.length === currentKeys.size && p.mods.every((k) => currentKeys.has(k));

  const save = useAction((d: Draft) => api.saveProfile({ id: d.id, name: d.name, description: d.description.trim() || null, capture: d.capture }), { success: (p) => t.profiles.saved(p.name) });
  const apply = useAction((id: string) => api.applyProfile(id), { success: (e) => e.title });
  const remove = useAction((id: string) => api.deleteProfile(id), { success: () => t.profiles.deleted });
  const doImport = useAction((json: string) => api.importProfile(json), { success: (p) => t.profiles.imported(p.name) });

  const openPreview = async (p: Profile) => {
    setPreview({ profile: p, diff: null });
    try {
      setPreview({ profile: p, diff: await api.previewProfile(p.id) });
    } catch (e) {
      notifyError(e);
      setPreview(null);
    }
  };

  const share = async (p: Profile) => {
    try {
      await navigator.clipboard.writeText(JSON.stringify({ name: p.name, description: p.description, mods: p.mods }, null, 2));
      toast.success(t.profiles.shared);
    } catch (e) {
      notifyError(e);
    }
  };

  return (
    <Page>
      <PageHeader
        title={t.profiles.title}
        subtitle={t.profiles.subtitle}
        actions={
          <>
            <Button variant="ghost" icon={<ClipboardPaste className="size-4" />} onClick={() => setImporting(true)}>
              {t.profiles.import}
            </Button>
            {!!profiles?.length && (
              <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setEditing({ id: null, name: "", description: "", capture: true })}>
                {t.profiles.saveCurrent}
              </Button>
            )}
          </>
        }
      />

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-[178px] rounded-[18px]" />
          ))}
        </div>
      ) : !profiles?.length ? (
        <div className="card">
          <EmptyState
            icon={<Layers className="size-6" />}
            title={t.profiles.emptyTitle}
            action={
              <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setEditing({ id: null, name: t.profiles.firstName, description: "", capture: true })}>
                {t.profiles.emptyAction}
              </Button>
            }
          >
            {t.profiles.emptyBody}
          </EmptyState>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {profiles.map((p) => {
            const active = settings?.activeProfile === p.id;
            const same = matches(p);
            const missing = p.mods.filter((k) => !allKeys.has(k)).length;
            return (
              <section key={p.id} className={clsx("card flex flex-col p-5", active && "border-[color-mix(in_oklab,var(--accent)_40%,transparent)]")}>
                <div className="flex items-start gap-3">
                  <div className={clsx("flex size-11 shrink-0 items-center justify-center rounded-xl", active ? "accent-soft" : "bg-surface-3")}>
                    <PixelStar size={18} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate text-[15px] font-semibold text-fg">{p.name}</h3>
                      {active && <Badge tone="accent">{t.profiles.active}</Badge>}
                    </div>
                    <p className="truncate text-[12.5px] text-muted">{p.description || t.profiles.updatedAgo(ago(p.updatedAt))}</p>
                  </div>
                  <IconButton label={t.profiles.edit} onClick={() => setEditing({ id: p.id, name: p.name, description: p.description ?? "", capture: false })}>
                    <Pencil className="size-4" />
                  </IconButton>
                </div>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  <Badge tone="neutral">{t.profiles.mods(p.mods.length)}</Badge>
                  {same ? (
                    <Badge tone="ok" icon={<Check className="size-3" />}>
                      {t.profiles.same}
                    </Badge>
                  ) : (
                    <Badge tone="warn">{t.profiles.differs}</Badge>
                  )}
                  {missing > 0 && <Badge tone="danger">{t.profiles.missing(missing)}</Badge>}
                </div>
                <div className="mt-auto flex items-center gap-1.5 pt-5">
                  <Button variant={same ? "secondary" : "subtle"} disabled={same} onClick={() => openPreview(p)} className="flex-1">
                    {same ? t.profiles.applied : t.profiles.apply}
                  </Button>
                  <IconButton label={t.profiles.overwrite} onClick={() => save.mutate({ id: p.id, name: p.name, description: p.description ?? "", capture: true })}>
                    <Save className="size-4" />
                  </IconButton>
                  <IconButton label={t.profiles.share} onClick={() => share(p)}>
                    <ClipboardCopy className="size-4" />
                  </IconButton>
                  <IconButton label={t.profiles.delete} onClick={() => setDeleting(p)}>
                    <Trash2 className="size-4" />
                  </IconButton>
                </div>
              </section>
            );
          })}
        </div>
      )}

      <Dialog open={editing !== null} onClose={() => setEditing(null)} width={480} game="stardew">
        <DialogHeader icon={<Layers className="size-5" />} title={editing?.id ? t.profiles.editTitle : t.profiles.newTitle} subtitle={editing?.capture ? t.profiles.captureHint(currentKeys.size) : undefined} onClose={() => setEditing(null)} />
        {editing && (
          <DialogBody className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-[12px] font-medium text-fg-2">{t.profiles.name}</span>
              <Input autoFocus value={editing.name} maxLength={60} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder={t.profiles.namePh} />
            </label>
            <label className="block">
              <span className="mb-1 block text-[12px] font-medium text-fg-2">{t.profiles.description}</span>
              <Input value={editing.description} maxLength={140} onChange={(e) => setEditing({ ...editing, description: e.target.value })} placeholder={t.profiles.descriptionPh} />
            </label>
          </DialogBody>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => setEditing(null)}>
            {t.common.cancel}
          </Button>
          <Button variant="primary" loading={save.isPending} disabled={!editing?.name.trim()} onClick={() => editing && save.mutate(editing, { onSuccess: () => setEditing(null) })}>
            {t.common.save}
          </Button>
        </DialogFooter>
      </Dialog>

      <Dialog open={importing} onClose={() => setImporting(false)} game="stardew">
        <DialogHeader icon={<ClipboardPaste className="size-5" />} title={t.profiles.importTitle} subtitle={t.profiles.importHint} onClose={() => setImporting(false)} />
        <DialogBody>
          <textarea
            data-selectable
            spellCheck={false}
            className="h-56 w-full resize-none rounded-[10px] border border-line-strong bg-surface-2/70 p-3 font-mono text-[12px] text-fg outline-none focus:border-[color-mix(in_oklab,var(--accent)_55%,transparent)]"
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder='{ "name": "…", "mods": ["pathoschild.contentpatcher", …] }'
          />
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setImporting(false)}>
            {t.common.cancel}
          </Button>
          <Button
            variant="primary"
            loading={doImport.isPending}
            disabled={!importText.trim()}
            onClick={() =>
              doImport.mutate(importText, {
                onSuccess: () => {
                  setImporting(false);
                  setImportText("");
                },
              })
            }
          >
            {t.profiles.import}
          </Button>
        </DialogFooter>
      </Dialog>

      <Dialog open={preview !== null} onClose={() => setPreview(null)} width={620} game="stardew">
        <DialogHeader plain icon={<Layers className="size-5" />} title={t.profiles.applyTitle(preview?.profile.name ?? "")} subtitle={t.profiles.applyHint} onClose={() => setPreview(null)} />
        <DialogBody>
          {!preview?.diff ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : (
            <div className="space-y-4">
              <DiffList title={t.profiles.willEnable} tone="ok" items={preview.diff.enable.map((i) => i.name)} />
              <DiffList title={t.profiles.willDisable} tone="warn" items={preview.diff.disable.map((i) => i.name)} />
              <DiffList title={t.profiles.willSkip} tone="danger" items={preview.diff.missing} />
              <p className="text-[12.5px] text-muted">{t.profiles.unchanged(preview.diff.unchanged)}</p>
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setPreview(null)}>
            {t.common.cancel}
          </Button>
          <Button variant="primary" loading={apply.isPending} disabled={!preview?.diff} onClick={() => preview && apply.mutate(preview.profile.id, { onSuccess: () => setPreview(null) })}>
            {t.profiles.apply}
          </Button>
        </DialogFooter>
      </Dialog>

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title={t.profiles.deleteTitle(deleting?.name ?? "")}
        danger
        confirmLabel={t.profiles.delete}
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting.id, { onSuccess: () => setDeleting(null) })}
      >
        {t.profiles.deleteBody}
      </ConfirmDialog>
    </Page>
  );
}

function DiffList({ title, items, tone }: { title: string; items: string[]; tone: Tone }) {
  if (!items.length) return null;
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-2 text-[12.5px] font-semibold text-fg">
        {title} <Badge tone={tone}>{items.length}</Badge>
      </div>
      <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
        {items.map((n) => (
          <span key={n} className="rounded-md bg-surface-2 px-2 py-0.5 text-[12px] text-fg-2">
            {n}
          </span>
        ))}
      </div>
    </div>
  );
}
