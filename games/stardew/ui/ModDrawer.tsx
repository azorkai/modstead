// Mod ayrıntı çekmecesi: durum, sorunlar ve düzeltmeler, gereksinimler, bağımlı modlar,
// güncelleme, bilgi, güvenlik (SHA-256 özetleri) ve eylemler.

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUpCircle, Check, CircleSlash, ExternalLink, FileCog, Fingerprint, FolderOpen, Link2, Search, ShieldAlert, ShieldCheck, Trash2, X } from "lucide-react";
import clsx from "clsx";
import { ago, bytes } from "@/lib/format";
import { notifyError, openUrl } from "@/shell/actions";
import { Badge, Button, ConfirmDialog, IconButton, Switch } from "@/ui";
import { api } from "./api";
import { ConfigEditor } from "./ConfigEditor";
import { useS } from "./i18n";
import { PixelCover } from "./Pixel";
import { findDependency, getFromNexus, openNexusMod } from "./nexus";
import { nexusUrl, runFix, useAction, useModIndex } from "./queries";
import { COMPAT_TONE, IssueIcon, Label } from "./shared";
import type { FileHash, ModInfo } from "./types";

export function ModDrawer({ folder, onClose, onOpen }: { folder: string | null; onClose: () => void; onOpen: (folder: string) => void }) {
  const { mods } = useModIndex();
  // Aç/kapat klasör adını değiştirir ("." öneki); son bilinen kimlikle de eşleştir.
  const [lastId, setLastId] = useState<string | null>(null);
  const mod = mods.find((m) => m.folder === folder) ?? (folder && lastId ? mods.find((m) => m.uniqueId === lastId) : undefined);
  useEffect(() => {
    if (mod?.uniqueId) setLastId(mod.uniqueId);
  }, [mod?.uniqueId]);
  useEffect(() => {
    if (!folder) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [folder, onClose]);

  return createPortal(
    <AnimatePresence>
      {folder && mod && (
        <div data-game="stardew">
          <motion.div className="fixed inset-0 top-[54px] z-40" style={{ background: "var(--scrim)" }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.aside
            role="dialog"
            aria-label={mod.name}
            className="card-raised fixed bottom-3 right-3 top-[62px] z-40 flex w-[460px] max-w-[92vw] flex-col overflow-hidden"
            style={{ boxShadow: "var(--shadow-lg)" }}
            initial={{ x: 40, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 40, opacity: 0 }}
            transition={{ type: "spring", stiffness: 420, damping: 36 }}
          >
            <DrawerBody mod={mod} onClose={onClose} onOpen={onOpen} />
          </motion.aside>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

function DrawerBody({ mod: m, onClose, onOpen }: { mod: ModInfo; onClose: () => void; onOpen: (folder: string) => void }) {
  const t = useS();
  const { byId, issuesByFolder, updateOf, nexusOf, mods } = useModIndex();
  const [hashes, setHashes] = useState<FileHash[] | null>(null);
  const [hashing, setHashing] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const toggle = useAction((enabled: boolean) => api.setEnabled([m.folder], enabled), { success: (e) => e.title });
  const remove = useAction(() => api.uninstall([m.folder]), { success: (e) => t.mods.removed(e.title) });
  const update = updateOf(m);
  const issues = issuesByFolder.get(m.folder) ?? [];
  const id = m.uniqueId?.toLowerCase();
  const dependents = id ? mods.filter((x) => x.contentPackFor?.uniqueId.toLowerCase() === id || x.dependencies.some((d) => d.uniqueId.toLowerCase() === id)) : [];
  const activeDependents = dependents.filter((d) => d.enabled).length;
  const nexusId = nexusOf(m);
  const page = nexusId ? nexusUrl(nexusId) : update?.url;
  const compat = update?.compatStatus?.toLowerCase();

  useEffect(() => setHashes(null), [m.folder]);

  const reqs = [
    ...(m.contentPackFor ? [{ uniqueId: m.contentPackFor.uniqueId, minimumVersion: m.contentPackFor.minimumVersion, isRequired: true, framework: true }] : []),
    ...m.dependencies.map((d) => ({ ...d, framework: false })),
  ];

  return (
    <>
      <div className="relative h-[120px] shrink-0 overflow-hidden">
        <PixelCover seed={m.uniqueId ?? m.folder} kind={m.kind} dim={!m.enabled} className="absolute inset-0 size-full" />
        <div className="absolute inset-0" style={{ background: "linear-gradient(0deg, var(--surface) 4%, transparent 75%)" }} />
        <IconButton label={t.common.close} onClick={onClose} className="glass absolute right-3 top-3">
          <X className="size-4" />
        </IconButton>
      </div>
      <div className="relative -mt-8 border-b border-line px-5 pb-4">
        <h2 className="text-[19px] font-semibold leading-tight text-fg">{m.name}</h2>
        <p className="mt-0.5 text-[12.5px] text-fg-2">
          {m.author ?? t.common.unknownAuthor}
          {m.version && (
            <>
              {" · "}
              <span className="font-mono">{m.version}</span>
            </>
          )}
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Badge tone={m.kind === "smapi" ? "accent" : m.kind === "content" ? "neutral" : "danger"}>{t.kind[m.kind]}</Badge>
          {m.isCore && <Badge tone="info">{t.kind.core}</Badge>}
          {compat && t.compat[compat] && <Badge tone={COMPAT_TONE[compat] ?? "neutral"}>{t.compat[compat]}</Badge>}
          {update?.hasUpdate && update.latest && (
            <Badge tone="accent" icon={<ArrowUpCircle className="size-3" />}>
              {t.drawer.newRelease(update.latest)}
            </Badge>
          )}
        </div>
        <div className="well mt-4 flex items-center justify-between px-3.5 py-2.5">
          <div>
            <div className="text-[13px] font-medium text-fg">{m.enabled ? t.drawer.enabled : t.drawer.disabled}</div>
            <div className="text-[12px] text-muted">{m.disabledByParent ? t.drawer.parentOff : m.enabled ? t.drawer.loadsOnLaunch : t.drawer.ignored}</div>
          </div>
          <Switch checked={m.enabled} disabled={toggle.isPending || m.disabledByParent} onChange={(v) => toggle.mutate(v)} label={m.enabled ? t.mods.disable : t.mods.enable} />
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
        {issues.length > 0 && (
          <section className="space-y-2">
            {issues.map((i) => (
              <div key={i.id} className={clsx("rounded-[14px] border p-3", i.severity === "error" ? "border-danger/25 bg-danger/8" : i.severity === "warning" ? "border-warn/25 bg-warn/8" : "border-info/20 bg-info/8")}>
                <div className="flex items-start gap-2">
                  <IssueIcon severity={i.severity} className="mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-medium text-fg">{i.title}</div>
                    <div className="mt-0.5 text-[12.5px] text-fg-2">{i.detail}</div>
                  </div>
                </div>
                {i.fix && (
                  <div className="mt-2 flex justify-end">
                    <Button size="sm" variant="subtle" onClick={() => runFix(i.fix!)}>
                      {i.fix.label}
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </section>
        )}

        {m.description && (
          <p data-selectable className="text-[13px] leading-relaxed text-fg-2">
            {m.description}
          </p>
        )}
        {m.manifestError && <p className="rounded-[14px] bg-danger/10 p-3 font-mono text-[11.5px] text-danger">{m.manifestError}</p>}

        {reqs.length > 0 && (
          <section>
            <Label>{t.drawer.requirements}</Label>
            <div className="space-y-1.5">
              {reqs.map((d) => {
                const found = byId.get(d.uniqueId.toLowerCase());
                const dep = found?.find((x) => x.enabled) ?? found?.[0];
                const state = !dep ? "missing" : !dep.enabled ? "disabled" : "ok";
                const meta = [d.framework ? t.drawer.framework : d.isRequired ? t.drawer.required : t.drawer.optional, d.minimumVersion && t.drawer.atLeast(d.minimumVersion), dep?.version && t.drawer.installedVer(dep.version)].filter(Boolean).join(" · ");
                return (
                  <div key={d.uniqueId} className="well flex items-center gap-2.5 px-3 py-2">
                    {state === "ok" ? <Check className="size-4 text-ok" /> : state === "disabled" ? <CircleSlash className="size-4 text-warn" /> : <X className={clsx("size-4", d.isRequired ? "text-danger" : "text-muted")} />}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[12.5px] font-medium text-fg">{dep?.name ?? d.uniqueId}</div>
                      <div className="text-[11.5px] text-muted">{meta}</div>
                    </div>
                    {state === "missing" && (
                      <Button size="sm" variant="subtle" icon={<Search className="size-3.5" />} onClick={() => findDependency(d.uniqueId)}>
                        {t.drawer.find}
                      </Button>
                    )}
                    {state === "disabled" && dep && !dep.disabledByParent && (
                      <Button size="sm" variant="subtle" onClick={() => runFix({ kind: "enable", label: "", folders: [dep.folder], target: null })}>
                        {t.drawer.turnOn}
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {dependents.length > 0 && (
          <section>
            <Label>{t.drawer.dependents(dependents.length)}</Label>
            <div className="flex flex-wrap gap-1.5">
              {dependents.slice(0, 30).map((d) => (
                <button key={d.folder} onClick={() => onOpen(d.folder)} className="rounded-lg border border-line bg-surface-2/60 px-2 py-1 text-[12px] text-fg-2 transition-colors hover:border-line-strong hover:text-fg">
                  {d.name}
                </button>
              ))}
            </div>
            {m.enabled && activeDependents > 0 && <p className="mt-2 text-[12px] text-muted">{t.drawer.dependentsWarn(activeDependents)}</p>}
          </section>
        )}

        {update && (
          <section>
            <Label>{t.drawer.update}</Label>
            <div className="well p-3 text-[12.5px]">
              <Fact k={t.drawer.installed} v={<span className="font-mono">{m.version}</span>} />
              <Fact k={t.drawer.latest} v={<span className={clsx("font-mono", update.hasUpdate && "font-semibold text-accent")}>{update.latest ?? m.version}</span>} />
              {update.compatSummary && <p className="mt-2 border-t border-line pt-2 text-[12px] text-fg-2">{update.compatSummary}</p>}
              {update.hasUpdate && (
                <div className="mt-2 flex items-center gap-3 border-t border-line pt-2.5">
                  <p className="flex-1 text-[12px] text-muted">{t.drawer.updateHint}</p>
                  {nexusId ? (
                    <Button size="sm" variant="primary" icon={<ArrowUpCircle className="size-3.5" />} onClick={() => getFromNexus(nexusId, { name: m.name })}>
                      {t.drawer.updateNow}
                    </Button>
                  ) : (
                    update.url && (
                      <Button size="sm" variant="subtle" icon={<ExternalLink className="size-3.5" />} onClick={() => openUrl(update.url!)}>
                        {t.updates.download}
                      </Button>
                    )
                  )}
                </div>
              )}
            </div>
          </section>
        )}

        <section>
          <Label>{t.drawer.info}</Label>
          <dl className="grid grid-cols-[130px_1fr] gap-x-3 gap-y-1.5 text-[12.5px]">
            {m.uniqueId && (
              <>
                <dt className="text-muted">{t.drawer.id}</dt>
                <dd data-selectable className="truncate font-mono text-[11.5px] text-fg">
                  {m.uniqueId}
                </dd>
              </>
            )}
            <dt className="text-muted">{t.drawer.folder}</dt>
            <dd data-selectable className="truncate font-mono text-[11.5px] text-fg">
              {m.folder}
            </dd>
            <dt className="text-muted">{t.drawer.size}</dt>
            <dd className="text-fg">
              {bytes(m.size)} · {t.common.files(m.fileCount)}
            </dd>
            <dt className="text-muted">{t.drawer.modified}</dt>
            <dd className="text-fg">{ago(m.modified)}</dd>
            {m.minimumApiVersion && (
              <>
                <dt className="text-muted">{t.drawer.minSmapi}</dt>
                <dd className="font-mono text-[11.5px] text-fg">{m.minimumApiVersion}</dd>
              </>
            )}
            {m.minimumGameVersion && (
              <>
                <dt className="text-muted">{t.drawer.minGame}</dt>
                <dd className="font-mono text-[11.5px] text-fg">{m.minimumGameVersion}</dd>
              </>
            )}
            <dt className="text-muted">{t.drawer.updateKeys}</dt>
            <dd className="truncate font-mono text-[11.5px] text-fg">{m.updateKeys.length ? m.updateKeys.join(", ") : t.drawer.noKeys}</dd>
          </dl>
        </section>

        <section>
          <Label>{t.drawer.security}</Label>
          <div className={clsx("flex items-start gap-2.5 rounded-[14px] p-3 text-[12.5px]", m.executables.length ? "bg-warn/10" : "well")}>
            {m.executables.length ? <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warn" /> : <ShieldCheck className="mt-0.5 size-4 shrink-0 text-ok" />}
            <div className="text-fg-2">
              {m.executables.length ? (
                <>
                  {t.drawer.exeWarn} <span className="font-mono text-warn">{m.executables.join(", ")}</span>. {t.drawer.exeTail}
                </>
              ) : (
                <>
                  {t.drawer.noExe} {m.dlls.length > 0 ? t.drawer.dlls(m.dlls.length) : t.drawer.contentOnly}
                </>
              )}
            </div>
          </div>
          {(m.dlls.length > 0 || m.executables.length > 0) && (
            <div className="mt-2">
              {hashes ? (
                <div className="space-y-1">
                  {hashes.map((h) => (
                    <div key={h.path} className="well flex items-center gap-2 px-2.5 py-1.5">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[12px] text-fg">{h.path}</div>
                        <div data-selectable className="truncate font-mono text-[10.5px] text-muted">
                          {h.sha256}
                        </div>
                      </div>
                      <IconButton label={t.drawer.vt} size="sm" onClick={() => openUrl(`https://www.virustotal.com/gui/file/${h.sha256}`)}>
                        <ExternalLink className="size-3.5" />
                      </IconButton>
                    </div>
                  ))}
                </div>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  loading={hashing}
                  icon={<Fingerprint className="size-3.5" />}
                  onClick={() => {
                    setHashing(true);
                    api
                      .hashFiles(m.folder)
                      .then(setHashes)
                      .catch(notifyError)
                      .finally(() => setHashing(false));
                  }}
                >
                  {t.drawer.hash}
                </Button>
              )}
            </div>
          )}
        </section>
      </div>

      <div className="grid grid-cols-2 gap-2 border-t border-line bg-surface-2/40 p-4">
        <Button icon={<FileCog className="size-4" />} disabled={!m.hasConfig} onClick={() => setConfigOpen(true)} title={m.hasConfig ? t.drawer.configHint : t.drawer.noConfig}>
          {t.drawer.config}
        </Button>
        <Button icon={<FolderOpen className="size-4" />} onClick={() => api.openPath("mods", m.folder).catch(notifyError)}>
          {t.common.openFolder}
        </Button>
        <Button icon={<Link2 className="size-4" />} disabled={!page} onClick={() => (nexusId ? openNexusMod(nexusId) : page && openUrl(page))}>
          {t.drawer.page}
        </Button>
        <Button variant="danger" icon={<Trash2 className="size-4" />} onClick={() => setConfirm(true)}>
          {t.common.remove}
        </Button>
      </div>

      <ConfigEditor open={configOpen} onClose={() => setConfigOpen(false)} mod={m} />
      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title={t.drawer.removeTitle(m.name)}
        confirmLabel={t.common.remove}
        danger
        loading={remove.isPending}
        onConfirm={() =>
          remove.mutate(undefined, {
            onSuccess: () => {
              setConfirm(false);
              onClose();
            },
          })
        }
      >
        {t.drawer.removeBody}
        {activeDependents > 0 && <p className="mt-2 text-warn">{t.drawer.removeDeps(activeDependents)}</p>}
      </ConfirmDialog>
    </>
  );
}

function Fact({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="flex justify-between py-0.5">
      <span className="text-muted">{k}</span>
      <span className="text-fg">{v}</span>
    </div>
  );
}
