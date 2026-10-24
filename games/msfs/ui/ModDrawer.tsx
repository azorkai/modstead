// Mod ayrıntı çekmecesi: simlerdeki durum, çalışmaya hazırlık, paket bilgisi, güvenlik raporu, notlar.

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import clsx from "clsx";
import { FolderOpen, HardDriveDownload, ScanSearch, ShieldCheck, Star, Trash2, X } from "lucide-react";
import { bytes } from "@/lib/format";
import { useLang } from "@/lib/i18n";
import { notifyError } from "@/shell/actions";
import { Badge, Button, ConfirmDialog, IconButton, SecurityPanel, Spinner } from "@/ui";
import { api } from "./api";
import { SIMS, SIM_COLOR, SIM_SHORT, catLabel, isActive, version } from "./format";
import { useMsfsT } from "./i18n";
import { BuiltForTag, SimToggle, simOf, useModOps } from "./parts";
import { invalidateAll, useSnapshot } from "./queries";
import { ReadinessPanel, worst } from "./ReadinessPanel";
import { useMsfsUi } from "./store";
import { Thumb } from "./Thumb";
import type { ModEntry, ModVerification } from "./types";

export function ModDrawer() {
  const id = useMsfsUi((s) => s.selected);
  const close = () => useMsfsUi.getState().open(null);
  const { data: scan } = useSnapshot();
  const mod = scan?.mods.find((m) => m.id === id);

  useEffect(() => {
    if (!id) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [id]);

  return createPortal(
    <AnimatePresence>
      {mod && (
        <div className="fixed inset-0 z-40" data-game="msfs">
          <motion.div className="absolute inset-0 bg-black/30" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={close} />
          <motion.aside
            key={mod.id}
            initial={{ x: 40, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 40, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
            className="absolute bottom-2 right-2 top-2 flex w-[480px] flex-col overflow-hidden rounded-[20px] border border-line-strong bg-surface shadow-2xl"
            role="dialog"
            aria-label={mod.info.title}
          >
            <DrawerBody mod={mod} onClose={close} />
          </motion.aside>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

function DrawerBody({ mod, onClose }: { mod: ModEntry; onClose: () => void }) {
  const t = useMsfsT();
  const lang = useLang((s) => s.lang);
  const { data: scan } = useSnapshot();
  const ops = useModOps();
  const [confirm, setConfirm] = useState(false);
  const [verification, setVerification] = useState<ModVerification | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [scanning, setScanning] = useState(false);
  const info = mod.info;
  const checks = verification?.id === mod.id ? verification.checks : mod.readiness;
  const issues = mod.issues.filter((i) => i.level !== "info" && !mod.readiness.some((c) => c.code === i.code && c.sim === i.sim));
  const readyState = worst(checks.filter((c) => c.sim));

  const verify = async () => {
    setVerifying(true);
    try {
      const v = await api.verify(mod.id);
      setVerification(v);
      toast.success(t.drawer.verified(v.filesChecked, v.durationMs));
    } catch (e) {
      notifyError(e);
    } finally {
      setVerifying(false);
    }
  };

  const rescanSecurity = async () => {
    setScanning(true);
    try {
      await api.rescanSecurity(mod.id);
      toast.success(t.drawer.scanned);
      invalidateAll();
    } catch (e) {
      notifyError(e);
    } finally {
      setScanning(false);
    }
  };

  const toggleFavorite = async () => {
    try {
      await api.updateMeta(mod.id, { favorite: !mod.meta.favorite });
      invalidateAll();
    } catch (e) {
      notifyError(e);
    }
  };

  return (
    <>
      {/* Kahraman görseli */}
      <div className="relative h-[210px] shrink-0">
        <Thumb mod={mod} className="absolute inset-0" bare />
        <div className="absolute inset-0" style={{ background: "linear-gradient(0deg, rgb(8 9 12 / 0.92) 0%, rgb(8 9 12 / 0.35) 55%, rgb(8 9 12 / 0.15) 100%)" }} />
        <div className="absolute right-3 top-3 flex gap-1.5">
          <IconButton label={t.library.favorite} onClick={toggleFavorite} className="msfs-on-image text-white hover:bg-white/15 hover:text-white">
            <Star className={clsx("size-4", mod.meta.favorite && "fill-current text-warn")} />
          </IconButton>
          <IconButton label={t.common.close} onClick={onClose} className="msfs-on-image text-white hover:bg-white/15 hover:text-white">
            <X className="size-4" />
          </IconButton>
        </div>
        <div className="absolute inset-x-5 bottom-4">
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            <span className="msfs-on-image inline-flex h-5 items-center rounded-md border border-white/15 px-1.5 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-white">{catLabel(info.category, lang)}</span>
            <BuiltForTag year={info.builtFor} onDark />
            {version(info.version) && <span className="msfs-on-image inline-flex h-5 items-center rounded-md border border-white/15 px-1.5 font-mono text-[10.5px] text-white/90">{version(info.version)}</span>}
          </div>
          <h2 className="text-display line-clamp-2 text-[22px] font-semibold leading-tight text-white" data-selectable>
            {info.title}
          </h2>
          {info.creator && <p className="mt-0.5 truncate text-[12.5px] text-white/70">{info.creator}</p>}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-col gap-5 px-5 py-5">
          {/* Simler */}
          <Block title={t.drawer.sims}>
            <div className="well divide-y divide-[var(--line)]">
              {SIMS.map((sim) => {
                const install = simOf(scan, sim);
                const st = mod.sims[sim];
                return (
                  <div key={sim} className="flex items-center gap-3 px-3.5 py-2.5">
                    <span className="size-2 rounded-full" style={{ background: SIM_COLOR[sim] }} />
                    <div className="min-w-0 flex-1">
                      <div className="text-[12.5px] font-medium text-fg">MSFS {SIM_SHORT[sim]}</div>
                      <div className="truncate text-[11.5px] text-muted">
                        {!install?.detected ? t.library.notInSim(SIM_SHORT[sim]) : st ? t.state[st.state] + (st.container && isActive(st.state) ? ` · ${st.container}` : "") : t.state.absent}
                      </div>
                    </div>
                    <SimToggle mod={mod} sim={sim} install={install} />
                  </div>
                );
              })}
            </div>
            {mod.source === "community" && <Note>{t.drawer.community}</Note>}
            {mod.source === "external" && <Note>{t.drawer.external}</Note>}
          </Block>

          {issues.length > 0 && (
            <Block title={t.drawer.issues}>
              <ul className="flex flex-col gap-2">
                {issues.map((i, n) => (
                  <li key={n} className={clsx("well px-3.5 py-2.5", i.level === "error" ? "border-danger/30" : "border-warn/25")}>
                    <div className={clsx("text-[12.5px] font-medium", i.level === "error" ? "text-danger" : "text-warn")}>{i.title}</div>
                    <div className="mt-0.5 text-[12px] leading-relaxed text-fg-2 [overflow-wrap:anywhere]" data-selectable>
                      {i.detail}
                    </div>
                  </li>
                ))}
              </ul>
            </Block>
          )}

          {/* Hazırlık */}
          <Block
            title={t.drawer.readiness}
            subtitle={t.drawer.readinessSub}
            aside={
              <Button size="sm" variant="ghost" icon={verifying ? <Spinner className="size-3.5" /> : <ScanSearch className="size-3.5" />} onClick={verify} disabled={verifying}>
                {verifying ? t.drawer.verifying : t.drawer.verify}
              </Button>
            }
            tone={readyState}
          >
            <ReadinessPanel checks={checks} />
          </Block>

          {/* Paket */}
          <Block title={t.drawer.info}>
            <dl className="well grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 px-3.5 py-3 text-[12.5px]">
              <Fact k={t.drawer.size} v={info.size ? bytes(info.size) : null} />
              <Fact k={t.drawer.files} v={info.fileCount ? String(info.fileCount) : null} />
              <Fact k={t.drawer.builtWith} v={info.builder || t.builtFor(info.builtFor)} />
              <Fact k={t.drawer.minGame} v={info.minGameVersion || null} mono />
              <Fact k={t.drawer.contentType} v={info.contentType || null} mono />
              <Fact k="WASM" v={info.wasmModules ? t.drawer.wasm(info.wasmModules) : null} />
              <Fact k="ICAO" v={info.icaos.length ? info.icaos.join(", ") : null} mono />
              <Fact k={t.drawer.dependencies} v={info.dependencies.length ? info.dependencies.map((d) => d.name).join(", ") : null} mono />
              <Fact k={t.drawer.source} v={mod.meta.sourceLabel} />
              <Fact k={t.drawer.installed} v={mod.meta.installedAt ? new Date(mod.meta.installedAt).toLocaleDateString(lang === "tr" ? "tr-TR" : "en-GB") : null} />
              <Fact k={t.drawer.folder} v={info.path} mono />
            </dl>
          </Block>

          {/* Güvenlik */}
          <Block
            title={t.drawer.security}
            aside={
              <Button size="sm" variant="ghost" icon={scanning ? <Spinner className="size-3.5" /> : <ShieldCheck className="size-3.5" />} onClick={rescanSecurity} disabled={scanning}>
                {t.drawer.scanNow}
              </Button>
            }
          >
            {mod.meta.report ? <SecurityPanel report={mod.meta.report} /> : <Note>{t.drawer.noReport}</Note>}
            {mod.meta.stripped.length > 0 && <Note>{t.drawer.stripped(mod.meta.stripped.length)}</Note>}
          </Block>

          <NotesBlock mod={mod} />
        </div>
      </div>

      <footer className="flex shrink-0 items-center gap-2 border-t border-line px-5 py-3">
        <Button variant="ghost" size="sm" icon={<FolderOpen className="size-3.5" />} onClick={() => api.reveal(`mod:${mod.id}`).catch(notifyError)}>
          {t.common.reveal}
        </Button>
        <div className="flex-1" />
        {mod.source === "community" && (
          <Button variant="primary" size="sm" icon={<HardDriveDownload className="size-3.5" />} loading={ops.busy} onClick={() => ops.importMods([mod.id])}>
            {t.drawer.import}
          </Button>
        )}
        {mod.source === "library" && (
          <Button variant="danger" size="sm" icon={<Trash2 className="size-3.5" />} onClick={() => setConfirm(true)}>
            {t.drawer.uninstall}
          </Button>
        )}
      </footer>
      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={async () => {
          await ops.uninstall([mod.id]);
          setConfirm(false);
          onClose();
        }}
        title={t.library.confirmRemoveTitle(1)}
        confirmLabel={t.common.remove}
        danger
        loading={ops.busy}
      >
        <strong className="text-fg">{mod.info.title}</strong> — {t.library.confirmRemoveBody}
      </ConfirmDialog>
    </>
  );
}

function Block({ title, subtitle, aside, tone, children }: { title: string; subtitle?: string; aside?: ReactNode; tone?: "ok" | "warn" | "error" | "unknown"; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <header className="flex items-end gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="flex items-center gap-2 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-muted">
            {title}
            {tone && tone !== "ok" && <span className={clsx("size-1.5 rounded-full", tone === "error" ? "bg-danger" : tone === "warn" ? "bg-warn" : "bg-muted")} />}
          </h3>
          {subtitle && <p className="mt-0.5 text-[12px] text-fg-2">{subtitle}</p>}
        </div>
        {aside}
      </header>
      {children}
    </section>
  );
}

function Fact({ k, v, mono }: { k: string; v: string | null | undefined; mono?: boolean }) {
  if (!v) return null;
  return (
    <>
      <dt className="whitespace-nowrap text-muted">{k}</dt>
      <dd className={clsx("min-w-0 break-words text-fg", mono && "font-mono text-[11.5px]")} data-selectable>
        {v}
      </dd>
    </>
  );
}

function Note({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-line bg-surface-2/50 px-3.5 py-2.5 text-[12px] leading-relaxed text-fg-2">{children}</p>;
}

function NotesBlock({ mod }: { mod: ModEntry }) {
  const t = useMsfsT();
  const [notes, setNotes] = useState(mod.meta.notes);
  const [tag, setTag] = useState("");
  useEffect(() => setNotes(mod.meta.notes), [mod.id, mod.meta.notes]);
  const save = async (meta: { notes?: string; tags?: string[] }) => {
    try {
      await api.updateMeta(mod.id, meta);
      invalidateAll();
    } catch (e) {
      notifyError(e);
    }
  };
  return (
    <Block title={t.drawer.notes}>
      <div className="flex flex-wrap items-center gap-1.5">
        {mod.meta.tags.map((tg) => (
          <Badge key={tg} tone="accent" className="pr-0.5">
            {tg}
            <button type="button" aria-label={`${t.common.remove}: ${tg}`} className="ml-0.5 rounded px-0.5 hover:bg-black/10" onClick={() => save({ tags: mod.meta.tags.filter((x) => x !== tg) })}>
              <X className="size-3" />
            </button>
          </Badge>
        ))}
        <input
          value={tag}
          onChange={(e) => setTag(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && tag.trim()) {
              void save({ tags: [...mod.meta.tags, tag.trim()] });
              setTag("");
            }
          }}
          placeholder={t.drawer.tagsPlaceholder}
          className="h-6 min-w-[160px] flex-1 bg-transparent text-[12px] text-fg outline-none placeholder:text-muted"
        />
      </div>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        onBlur={() => notes !== mod.meta.notes && save({ notes })}
        placeholder={t.drawer.notesPlaceholder}
        rows={3}
        className="w-full resize-none rounded-xl border border-line bg-surface-2/50 px-3 py-2 text-[12.5px] text-fg outline-none placeholder:text-muted focus:border-[color-mix(in_oklab,var(--accent)_55%,transparent)]"
      />
    </Block>
  );
}
