import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { ClipboardCopy, ClipboardPaste, Layers, Pencil, Play, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, errorText } from "../api";
import type { Profile } from "../types";
import { fmtRelative } from "../format";
import { useApp } from "../store";
import { Button, Dialog, DialogHeader, EmptyState, IconButton, Input, ModuleAvatar } from "../components/kit";
import { useT } from "../i18n";

export function ProfilesView() {
  const t = useT();
  const order = useApp((s) => s.order);
  const modules = useApp((s) => s.modules);
  const setOrder = useApp((s) => s.setOrder);
  const setView = useApp((s) => s.setView);
  const confirm = useApp((s) => s.confirm);
  const [profiles, setProfiles] = useState<Profile[] | null>(null);
  const [naming, setNaming] = useState<{ id?: string; name: string } | null>(null);
  const [importing, setImporting] = useState(false);
  const [importText, setImportText] = useState("");

  const reload = () => api.listProfiles().then(setProfiles).catch((e) => toast.error(errorText(e)));
  useEffect(() => {
    reload();
  }, []);

  const saveCurrent = async (name: string, id?: string) => {
    try {
      await api.saveProfile(name, order, id);
      toast.success(id ? t.profiles.updated : t.profiles.saved);
      setNaming(null);
      reload();
    } catch (e) {
      toast.error(errorText(e));
    }
  };

  const apply = async (p: Profile) => {
    try {
      const r = await api.applyProfile(p.id);
      setOrder(r.order);
      setView("library");
      if (r.missing.length) {
        toast.warning(t.profiles.missingMods(r.missing.length), { description: r.missing.slice(0, 5).join(", ") });
      } else {
        toast.success(t.profiles.applied(p.name), { description: t.profiles.appliedBody });
      }
    } catch (e) {
      toast.error(errorText(e));
    }
  };

  const enabledNow = order.filter((e) => e.enabled).length;

  return (
    <div className="mx-auto flex max-w-[1180px] flex-col">
      <header className="flex items-end gap-3 mb-6">
        <div className="flex-1">
          <h1 className="text-display text-[26px] font-semibold leading-tight tracking-tight text-fg">{t.nav.profiles}</h1>
          <p className="mt-2 text-[13px] text-fg-2">{t.profiles.intro}</p>
        </div>
        <Button icon={<ClipboardPaste className="size-4" />} onClick={() => setImporting(true)}>
          {t.common.import}
        </Button>
        <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setNaming({ name: "" })}>
          {t.profiles.saveCurrent}
        </Button>
      </header>

      <div>
        {profiles && profiles.length === 0 ? (
          <EmptyState
            icon={<Layers className="size-6" />}
            title={t.profiles.emptyTitle}
            action={
              <Button variant="primary" onClick={() => setNaming({ name: "" })}>
                {t.profiles.saveCurrentEnabled(enabledNow)}
              </Button>
            }
          >
            {t.profiles.emptyBody}
          </EmptyState>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4">
            {profiles?.map((p, i) => {
              const enabled = p.modules.filter((m) => m.enabled);
              const missing = enabled.filter((m) => !modules[m.id.toLowerCase()]).length;
              return (
                <motion.div
                  key={p.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className="card flex flex-col p-4"
                >
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[16px] font-semibold tracking-tight text-fg">{p.name}</div>
                      <div className="text-[12px] text-muted">
                        {t.profiles.enabledMods(enabled.length)} · {fmtRelative(p.updated)}
                        {missing > 0 && <span className="text-warn"> · {t.profiles.missing(missing)}</span>}
                      </div>
                    </div>
                    <IconButton label={t.profiles.rename} onClick={() => setNaming({ id: p.id, name: p.name })}>
                      <Pencil className="size-3.5" />
                    </IconButton>
                    <IconButton
                      label={t.profiles.copyToClipboard}
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(await api.exportProfile(p.id));
                          toast.success(t.profiles.copied);
                        } catch (e) {
                          toast.error(errorText(e));
                        }
                      }}
                    >
                      <ClipboardCopy className="size-3.5" />
                    </IconButton>
                    <IconButton
                      label={t.common.delete}
                      className="hover:!text-danger"
                      onClick={async () => {
                        if (
                          !(await confirm({
                            title: t.profiles.deleteTitle(p.name),
                            body: t.profiles.deleteBody,
                            confirmLabel: t.common.delete,
                            danger: true,
                          }))
                        )
                          return;
                        await api.deleteProfile(p.id).catch((e) => toast.error(errorText(e)));
                        reload();
                      }}
                    >
                      <Trash2 className="size-3.5" />
                    </IconButton>
                  </div>
                  <div className="mt-4 flex -space-x-1.5">
                    {enabled.slice(0, 9).map((m) => (
                      <div key={m.id} className="rounded-[10px] ring-2 ring-surface">
                        <ModuleAvatar id={m.id} name={modules[m.id.toLowerCase()]?.name ?? m.id} size={28} official={modules[m.id.toLowerCase()]?.isOfficial} />
                      </div>
                    ))}
                    {enabled.length > 9 && (
                      <div className="flex size-7 items-center justify-center rounded-[9px] bg-surface-3 text-[11px] font-semibold text-fg-2 ring-2 ring-surface">
                        +{enabled.length - 9}
                      </div>
                    )}
                  </div>
                  <div className="mt-4 flex gap-2">
                    <Button variant="subtle" size="sm" className="flex-1" icon={<Play className="size-3.5" />} onClick={() => apply(p)}>
                      {t.profiles.apply}
                    </Button>
                    <Button size="sm" icon={<Save className="size-3.5" />} onClick={() => saveCurrent(p.name, p.id)}>
                      {t.profiles.updateWithCurrent}
                    </Button>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={!!naming} onClose={() => setNaming(null)} width={440}>
        <DialogHeader title={naming?.id ? t.profiles.renameTitle : t.profiles.saveAsTitle} onClose={() => setNaming(null)} />
        <form
          className="space-y-4 px-6 py-5"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!naming) return;
            if (naming.id) {
              await api.renameProfile(naming.id, naming.name).catch((err) => toast.error(errorText(err)));
              setNaming(null);
              reload();
            } else {
              saveCurrent(naming.name);
            }
          }}
        >
          <Input
            autoFocus
            placeholder={t.profiles.namePlaceholder}
            value={naming?.name ?? ""}
            onChange={(e) => setNaming((n) => n && { ...n, name: e.target.value })}
            maxLength={60}
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setNaming(null)}>
              {t.common.cancel}
            </Button>
            <Button type="submit" variant="primary" disabled={!naming?.name.trim()}>
              {t.common.save}
            </Button>
          </div>
        </form>
      </Dialog>

      <Dialog open={importing} onClose={() => setImporting(false)} width={520}>
        <DialogHeader title={t.profiles.importTitle} subtitle={t.profiles.importSubtitle} onClose={() => setImporting(false)} />
        <div className="space-y-4 px-6 py-5">
          <textarea
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            spellCheck={false}
            placeholder='{ "otagProfile": 1, ... }'
            className="h-48 w-full resize-none rounded-xl border border-line-strong bg-surface-2/70 p-3 font-mono text-[12px] text-fg outline-none focus:border-accent/50"
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setImporting(false)}>
              {t.common.cancel}
            </Button>
            <Button
              variant="primary"
              disabled={!importText.trim()}
              onClick={async () => {
                try {
                  const p = await api.importProfile(importText);
                  toast.success(t.profiles.imported(p.name));
                  setImporting(false);
                  setImportText("");
                  reload();
                } catch (e) {
                  toast.error(errorText(e));
                }
              }}
            >
              {t.common.import}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
