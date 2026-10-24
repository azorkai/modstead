// Profiller: hangi kütüphane modunun hangi simde açık olduğunu kaydeder; uygulayınca bağlantılar buna göre
// açılır/kapanır. Community'deki fiziksel paketlere ve başka araçların bağlantılarına dokunulmaz.

import { useState } from "react";
import { toast } from "sonner";
import { Layers, Plus, RefreshCcw, Trash2 } from "lucide-react";
import { useLang } from "@/lib/i18n";
import { queryClient } from "@/lib/queries";
import { notifyError } from "@/shell/actions";
import { Button, ConfirmDialog, Dialog, DialogBody, DialogFooter, DialogHeader, EmptyState, Input, PageHeader, Skeleton } from "@/ui";
import { api } from "../api";
import { SIMS, SIM_COLOR, SIM_SHORT } from "../format";
import { useMsfsT } from "../i18n";
import { invalidateAll, mk, useProfiles, useSnapshot } from "../queries";
import type { Profile, SimId } from "../types";

export default function Profiles() {
  const t = useMsfsT();
  const { data: profiles, isLoading } = useProfiles();
  const [creating, setCreating] = useState(false);

  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-5 pb-16">
      <PageHeader
        title={t.profiles.title}
        subtitle={t.profiles.subtitle}
        actions={
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
            {t.profiles.saveCurrent}
          </Button>
        }
      />
      {isLoading || !profiles ? (
        <Skeleton className="h-32" />
      ) : profiles.length === 0 ? (
        <section className="card">
          <EmptyState
            icon={<Layers className="size-6" />}
            title={t.profiles.emptyTitle}
            action={
              <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
                {t.profiles.saveCurrent}
              </Button>
            }
          >
            {t.profiles.emptyBody}
          </EmptyState>
        </section>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {profiles.map((p) => (
            <ProfileCard key={p.id} profile={p} />
          ))}
        </div>
      )}
      <SaveDialog open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}

function SaveDialog({ open, onClose, profile }: { open: boolean; onClose: () => void; profile?: Profile }) {
  const t = useMsfsT();
  const [name, setName] = useState(profile?.name ?? "");
  const [desc, setDesc] = useState(profile?.description ?? "");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await api.saveProfile(name, desc, profile?.id);
      await queryClient.invalidateQueries({ queryKey: mk.profiles });
      toast.success(t.profiles.saved);
      onClose();
      if (!profile) {
        setName("");
        setDesc("");
      }
    } catch (e) {
      notifyError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onClose={onClose} width={480} game="msfs">
      <DialogHeader icon={<Layers className="size-5" />} title={profile ? t.profiles.overwrite : t.profiles.saveCurrent} onClose={onClose} />
      <DialogBody className="flex flex-col gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] font-medium text-fg-2">{t.profiles.name}</span>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t.profiles.namePlaceholder} autoFocus />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] font-medium text-fg-2">{t.profiles.description}</span>
          <Input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder={t.profiles.descriptionPlaceholder} />
        </label>
      </DialogBody>
      <DialogFooter className="justify-end">
        <Button variant="ghost" onClick={onClose}>
          {t.common.cancel}
        </Button>
        <Button variant="primary" disabled={!name.trim()} loading={busy} onClick={save}>
          {t.common.save}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

function ProfileCard({ profile: p }: { profile: Profile }) {
  const t = useMsfsT();
  const lang = useLang((s) => s.lang);
  const { data: scan } = useSnapshot();
  const [busy, setBusy] = useState(false);
  const [del, setDel] = useState(false);
  const [edit, setEdit] = useState(false);
  const known = new Set(scan?.mods.map((m) => m.id) ?? []);
  const missing = new Set(Object.values(p.sims).flat().filter((id) => id && !known.has(id))).size;
  const sims = SIMS.filter((s) => p.sims[s] !== undefined);

  const apply = async (sim?: SimId) => {
    setBusy(true);
    try {
      const rep = await api.applyProfile(p.id, sim);
      if (rep.failed.length) toast.error(t.profiles.applyFailed, { description: rep.failed.slice(0, 3).map(([, e]) => e).join(" · ") });
      else toast.success(t.profiles.applied(rep.ok.length));
      invalidateAll();
    } catch (e) {
      notifyError(e);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    try {
      await api.deleteProfile(p.id);
      await queryClient.invalidateQueries({ queryKey: mk.profiles });
      setDel(false);
    } catch (e) {
      notifyError(e);
    }
  };

  return (
    <article className="card flex flex-col gap-3 px-5 py-4">
      <div className="flex items-start gap-3">
        <span className="accent-soft flex size-10 shrink-0 items-center justify-center rounded-xl">
          <Layers className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[14.5px] font-semibold text-fg">{p.name}</h3>
          {p.description && <p className="mt-0.5 line-clamp-2 text-[12.5px] text-fg-2">{p.description}</p>}
          <p className="mt-0.5 text-[11px] text-muted">{t.profiles.updated(new Date(p.updatedAt).toLocaleDateString(lang === "tr" ? "tr-TR" : "en-GB"))}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {sims.map((s) => (
          <span key={s} className="inline-flex h-6 items-center gap-1.5 rounded-full border border-line px-2.5 text-[11.5px] text-fg-2">
            <span className="size-1.5 rounded-full" style={{ background: SIM_COLOR[s] }} />
            MSFS {SIM_SHORT[s]} · {t.profiles.count(p.sims[s]?.length ?? 0)}
          </span>
        ))}
        {missing > 0 && <span className="inline-flex h-6 items-center rounded-full bg-warn/10 px-2.5 text-[11.5px] text-warn">{t.profiles.missing(missing)}</span>}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <Button size="sm" variant="primary" loading={busy} onClick={() => apply()}>
          {t.profiles.apply}
        </Button>
        {sims.length > 1 &&
          sims.map((s) => (
            <Button key={s} size="sm" variant="ghost" disabled={busy} onClick={() => apply(s)}>
              {t.profiles.applyIn(SIM_SHORT[s])}
            </Button>
          ))}
        <div className="flex-1" />
        <Button size="sm" variant="ghost" icon={<RefreshCcw className="size-3.5" />} onClick={() => setEdit(true)}>
          {t.profiles.overwrite}
        </Button>
        <Button size="sm" variant="ghost" icon={<Trash2 className="size-3.5" />} onClick={() => setDel(true)} aria-label={t.profiles.delete} />
      </div>
      <ConfirmDialog open={del} onClose={() => setDel(false)} onConfirm={remove} title={t.profiles.deleteTitle} confirmLabel={t.profiles.delete} danger>
        <strong className="text-fg">{p.name}</strong> — {t.profiles.deleteBody}
      </ConfirmDialog>
      <SaveDialog open={edit} onClose={() => setEdit(false)} profile={p} />
    </article>
  );
}
