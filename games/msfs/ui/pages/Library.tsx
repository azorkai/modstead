// Kütüphane: tüm MSFS modları tek yerde. Galeri ya da liste; arama, durum/sim/tür filtreleri; her simde tek
// dokunuşla aç/kapat; toplu işlemler; ayrıntı çekmecesi.

import { useMemo, useState } from "react";
import clsx from "clsx";
import { motion } from "motion/react";
import { AlertTriangle, CheckSquare, FolderOpen, HardDriveDownload, LayoutGrid, List, Plus, RefreshCw, Search, Square, Star, Trash2, X } from "lucide-react";
import { bytes } from "@/lib/format";
import { useLang } from "@/lib/i18n";
import { Button, ConfirmDialog, EmptyState, IconButton, Input, PageHeader, Segmented, Skeleton } from "@/ui";
import { CATEGORIES, CAT_CODE, SIMS, SIM_COLOR, SIM_SHORT, activeAnywhere, catLabel, errorCount, foldText, isActive, version } from "../format";
import { useMsfsT } from "../i18n";
import { ModDrawer } from "../ModDrawer";
import { SimToggle, chooseLibrary, pickArchives, simOf, useModOps } from "../parts";
import { rescan, useMsfsSettings, useSnapshot } from "../queries";
import { useMsfsUi, type StatusFilter } from "../store";
import { Thumb } from "../Thumb";
import type { ModEntry, ScanResult, SimId } from "../types";

function hasProblem(m: ModEntry): boolean {
  return errorCount(m) > 0;
}

export default function Library() {
  const t = useMsfsT();
  const ui = useMsfsUi();
  const { data: scan, isLoading } = useSnapshot();
  const { data: settings } = useMsfsSettings();
  const [refreshing, setRefreshing] = useState(false);

  const mods = scan?.mods ?? [];
  const counts = useMemo(
    () => ({
      all: mods.length,
      active: mods.filter(activeAnywhere).length,
      inactive: mods.filter((m) => m.source === "library" && !activeAnywhere(m)).length,
      problems: mods.filter(hasProblem).length,
      unmanaged: mods.filter((m) => m.source === "community").length,
    }),
    [mods],
  );
  const usedCategories = useMemo(() => CATEGORIES.filter((c) => mods.some((m) => m.info.category === c)), [mods]);

  const shown = useMemo(() => {
    const q = foldText(ui.query.trim());
    const list = mods.filter((m) => {
      if (q) {
        const hay = foldText(`${m.info.title} ${m.info.creator} ${m.info.folder} ${m.meta.tags.join(" ")} ${m.info.icaos.join(" ")}`);
        if (!q.split(/\s+/).every((w) => hay.includes(w))) return false;
      }
      if (ui.category !== "all" && m.info.category !== ui.category) return false;
      if (ui.sim !== "all" && !(m.source === "library" || isActive(m.sims[ui.sim]?.state))) return false;
      switch (ui.status) {
        case "active":
          return ui.sim === "all" ? activeAnywhere(m) : isActive(m.sims[ui.sim]?.state);
        case "inactive":
          return m.source === "library" && (ui.sim === "all" ? !activeAnywhere(m) : !isActive(m.sims[ui.sim]?.state));
        case "problems":
          return hasProblem(m);
        case "unmanaged":
          return m.source === "community";
        default:
          return true;
      }
    });
    const by = ui.sort;
    return list.sort((a, b) => {
      if (a.meta.favorite !== b.meta.favorite) return a.meta.favorite ? -1 : 1;
      if (by === "size") return b.info.size - a.info.size;
      if (by === "recent") return (b.meta.installedAt ?? "").localeCompare(a.meta.installedAt ?? "");
      return a.info.title.localeCompare(b.info.title, undefined, { sensitivity: "base" });
    });
  }, [mods, ui.query, ui.category, ui.sim, ui.status, ui.sort]);

  const refresh = async () => {
    setRefreshing(true);
    await rescan();
    setRefreshing(false);
  };

  const filtered = ui.query || ui.status !== "all" || ui.sim !== "all" || ui.category !== "all";
  const clearFilters = () => ui.set({ query: "", status: "all", sim: "all", category: "all" });

  const header = (
    <PageHeader
      title={t.library.title}
      subtitle={scan ? t.library.subtitle(counts.all, counts.active) : undefined}
      actions={
        <>
          <IconButton label={t.common.rescan} onClick={refresh} disabled={refreshing}>
            <RefreshCw className={clsx("size-4", refreshing && "animate-spin")} />
          </IconButton>
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => pickArchives()} title={t.library.addHint}>
            {t.library.add}
          </Button>
        </>
      }
    />
  );

  if (settings && !settings.libraryPath && !isLoading) {
    return (
      <div className="mx-auto max-w-[1180px]">
        {header}
        <section className="card">
          <EmptyState
            icon={<FolderOpen className="size-6" />}
            title={t.library.noLibraryTitle}
            action={
              <Button variant="primary" icon={<FolderOpen className="size-4" />} onClick={() => chooseLibrary()}>
                {t.library.chooseLibrary}
              </Button>
            }
          >
            {t.library.noLibraryBody}
          </EmptyState>
        </section>
        <UnmanagedList scan={scan} />
        <ModDrawer />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1180px] pb-24">
      {header}

      {/* Araç çubuğu */}
      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <Input
          value={ui.query}
          onChange={(e) => ui.set({ query: e.target.value })}
          placeholder={t.common.search}
          icon={<Search className="size-4" />}
          className="w-[260px]"
          trailing={
            ui.query ? (
              <button type="button" aria-label={t.library.clearFilters} onClick={() => ui.set({ query: "" })} className="text-muted hover:text-fg">
                <X className="size-3.5" />
              </button>
            ) : undefined
          }
        />
        <Segmented<StatusFilter>
          id="msfs-status"
          value={ui.status}
          onChange={(v) => ui.set({ status: v })}
          options={(["all", "active", "inactive", "problems", "unmanaged"] as const)
            .filter((k) => k === "all" || counts[k] > 0 || ui.status === k)
            .map((k) => ({ value: k, label: t.library.filters[k], count: counts[k] }))}
        />
        <div className="flex-1" />
        <Segmented<SimId | "all">
          id="msfs-sim"
          value={ui.sim}
          onChange={(v) => ui.set({ sim: v })}
          options={[{ value: "all", label: t.common.all }, ...SIMS.filter((s) => simOf(scan, s)?.detected).map((s) => ({ value: s, label: <SimLabel sim={s} /> }))]}
        />
        <div className="flex items-center rounded-[10px] border border-line bg-surface-2/50 p-0.5">
          <IconButton size="sm" label={t.library.gallery} active={ui.view === "gallery"} onClick={() => ui.set({ view: "gallery" })}>
            <LayoutGrid className="size-4" />
          </IconButton>
          <IconButton size="sm" label={t.library.list} active={ui.view === "list"} onClick={() => ui.set({ view: "list" })}>
            <List className="size-4" />
          </IconButton>
        </div>
      </div>

      {/* Tür çipleri */}
      {usedCategories.length > 1 && (
        <div className="mb-5 flex flex-wrap gap-1.5">
          <Chip active={ui.category === "all"} onClick={() => ui.set({ category: "all" })}>
            {t.library.allCategories}
          </Chip>
          {usedCategories.map((c) => (
            <Chip key={c} active={ui.category === c} onClick={() => ui.set({ category: ui.category === c ? "all" : c })} count={scan?.stats.byCategory[c]}>
              {catLabel(c)}
            </Chip>
          ))}
        </div>
      )}

      {counts.unmanaged > 0 && ui.status !== "unmanaged" && <UnmanagedBanner count={counts.unmanaged} scan={scan} />}

      {isLoading || !scan ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-[248px] rounded-[18px]" />
          ))}
        </div>
      ) : mods.length === 0 ? (
        <section className="card">
          <EmptyState
            icon={<HardDriveDownload className="size-6" />}
            title={t.library.emptyTitle}
            action={
              <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => pickArchives()}>
                {t.library.add}
              </Button>
            }
          >
            {t.library.emptyBody}
          </EmptyState>
        </section>
      ) : shown.length === 0 ? (
        <section className="card">
          <EmptyState
            icon={<Search className="size-6" />}
            title={t.library.noMatchTitle}
            action={
              filtered ? (
                <Button variant="secondary" onClick={clearFilters}>
                  {t.library.clearFilters}
                </Button>
              ) : undefined
            }
          >
            {t.library.noMatchBody}
          </EmptyState>
        </section>
      ) : ui.view === "gallery" ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-4">
          {shown.map((m, i) => (
            <Card key={m.id} mod={m} scan={scan} index={i} />
          ))}
        </div>
      ) : (
        <ListView mods={shown} scan={scan} />
      )}

      {scan && <BulkBar scan={scan} shown={shown} />}
      <ModDrawer />
    </div>
  );
}

function SimLabel({ sim }: { sim: SimId }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="size-1.5 rounded-full" style={{ background: SIM_COLOR[sim] }} />
      {SIM_SHORT[sim]}
    </span>
  );
}

function Chip({ active, onClick, children, count }: { active: boolean; onClick: () => void; children: React.ReactNode; count?: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "inline-flex h-7 items-center gap-1.5 rounded-full border px-3 text-[12px] font-medium transition-colors",
        active ? "accent-soft border-[color-mix(in_oklab,var(--accent)_35%,transparent)]" : "border-line text-fg-2 hover:border-line-strong hover:text-fg",
      )}
    >
      {children}
      {count !== undefined && <span className="tabular text-[11px] opacity-60">{count}</span>}
    </button>
  );
}

/** Galeri kartı: görsel ağırlıklı, görsel üstünde buzlu etiketler ve sim anahtarları. */
function Card({ mod, scan, index }: { mod: ModEntry; scan: ScanResult; index: number }) {
  const t = useMsfsT();
  const lang = useLang((s) => s.lang);
  const open = useMsfsUi((s) => s.open);
  const picked = useMsfsUi((s) => s.picked.includes(mod.id));
  const anyPicked = useMsfsUi((s) => s.picked.length > 0);
  const togglePick = useMsfsUi((s) => s.togglePick);
  const errors = errorCount(mod);
  const active = activeAnywhere(mod);
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, delay: Math.min(index, 16) * 0.018 }}
      className={clsx(
        "group card relative cursor-pointer overflow-hidden transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-line-strong hover:shadow-lg",
        picked && "border-[color-mix(in_oklab,var(--accent)_60%,transparent)] shadow-[0_0_0_3px_color-mix(in_oklab,var(--accent)_18%,transparent)]",
      )}
      onClick={() => (anyPicked ? togglePick(mod.id) : open(mod.id))}
    >
      <div className="relative aspect-[16/10]">
        <Thumb mod={mod} className={clsx("absolute inset-0 transition-[filter]", !active && mod.source === "library" && "saturate-[0.55]")} imgClassName="transition-transform duration-500 group-hover:scale-[1.03]" />
        <div className="absolute inset-0" style={{ background: "linear-gradient(0deg, rgb(8 9 12 / 0.78) 0%, rgb(8 9 12 / 0.1) 46%, transparent 70%)" }} />
        <div className="absolute left-2.5 top-2.5 flex items-center gap-1.5">
          <button
            type="button"
            aria-label={t.library.selectAll}
            onClick={(e) => {
              e.stopPropagation();
              togglePick(mod.id);
            }}
            className={clsx("msfs-on-image flex size-6 items-center justify-center rounded-md text-white transition-opacity", picked || anyPicked ? "opacity-100" : "opacity-0 group-hover:opacity-100")}
          >
            {picked ? <CheckSquare className="size-3.5" /> : <Square className="size-3.5" />}
          </button>
          <span className="msfs-on-image inline-flex h-6 items-center rounded-md border border-white/15 px-1.5 font-mono text-[10.5px] font-semibold tracking-[0.06em] text-white" title={catLabel(mod.info.category, lang)}>
            {CAT_CODE[mod.info.category]}
          </span>
          {mod.info.builtFor === "2024" && (
            <span className="msfs-on-image inline-flex h-6 items-center gap-1 rounded-md border border-white/15 px-1.5 font-mono text-[10.5px] font-semibold text-white" title={t.builtFor("2024")}>
              <span className="size-1.5 rounded-full" style={{ background: SIM_COLOR.msfs2024 }} />
              FS24
            </span>
          )}
        </div>
        <div className="absolute right-2.5 top-2.5 flex items-center gap-1.5">
          {mod.meta.favorite && <Star className="size-4 fill-warn text-warn drop-shadow" />}
          {errors > 0 && (
            <span className="inline-flex h-6 items-center gap-1 rounded-md bg-danger px-1.5 text-[11px] font-semibold text-white shadow" title={t.library.issues(errors)}>
              <AlertTriangle className="size-3" />
              {errors}
            </span>
          )}
        </div>
        <div className="absolute inset-x-2.5 bottom-2.5 flex items-center gap-1.5">
          {SIMS.map((s) => (
            <SimToggle key={s} mod={mod} sim={s} install={simOf(scan, s)} size="sm" onDark />
          ))}
          {mod.source !== "library" && (
            <span className="msfs-on-image ml-auto inline-flex h-6 items-center rounded-full border border-white/15 px-2 text-[10.5px] font-medium text-white/85">{t.source[mod.source]}</span>
          )}
        </div>
      </div>
      <div className="flex items-start gap-2 px-3.5 pb-3 pt-2.5">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13.5px] font-semibold text-fg" title={mod.info.title}>
            {mod.info.title}
          </div>
          <div className="mt-0.5 truncate text-[11.5px] text-muted">{[mod.info.creator, version(mod.info.version)].filter(Boolean).join(" · ") || mod.info.folder}</div>
        </div>
        {mod.info.size > 0 && <span className="tabular shrink-0 pt-0.5 text-[11.5px] text-muted">{bytes(mod.info.size)}</span>}
      </div>
    </motion.div>
  );
}

function ListView({ mods, scan }: { mods: ModEntry[]; scan: ScanResult }) {
  const t = useMsfsT();
  const lang = useLang((s) => s.lang);
  const open = useMsfsUi((s) => s.open);
  const pickedIds = useMsfsUi((s) => s.picked);
  const togglePick = useMsfsUi((s) => s.togglePick);
  return (
    <section className="card overflow-hidden">
      <ul className="divide-y divide-[var(--line)]">
        {mods.map((m) => {
          const picked = pickedIds.includes(m.id);
          const errors = errorCount(m);
          return (
            <li
              key={m.id}
              onClick={() => open(m.id)}
              className={clsx("group grid cursor-pointer grid-cols-[22px_76px_minmax(0,1fr)_110px_90px_auto] items-center gap-3.5 px-4 py-2.5 transition-colors hover:bg-surface-2/60", picked && "bg-[color-mix(in_oklab,var(--accent)_7%,transparent)]")}
            >
              <button
                type="button"
                aria-label={t.library.selectAll}
                onClick={(e) => {
                  e.stopPropagation();
                  togglePick(m.id);
                }}
                className={clsx("text-muted hover:text-fg", picked ? "text-accent" : "opacity-0 group-hover:opacity-100")}
              >
                {picked ? <CheckSquare className="size-4" /> : <Square className="size-4" />}
              </button>
              <Thumb mod={m} className="h-[44px] w-[76px] rounded-lg" />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  {m.meta.favorite && <Star className="size-3.5 shrink-0 fill-warn text-warn" />}
                  <span className="truncate text-[13px] font-semibold text-fg">{m.info.title}</span>
                  {errors > 0 && (
                    <span className="inline-flex h-5 shrink-0 items-center gap-1 rounded-md bg-danger/12 px-1.5 text-[11px] font-semibold text-danger">
                      <AlertTriangle className="size-3" />
                      {errors}
                    </span>
                  )}
                </div>
                <div className="truncate text-[11.5px] text-muted">{[m.info.creator, version(m.info.version), m.source !== "library" ? t.source[m.source] : null].filter(Boolean).join(" · ")}</div>
              </div>
              <span className="truncate text-[12px] text-fg-2">{catLabel(m.info.category, lang)}</span>
              <span className="tabular text-right text-[12px] text-muted">{m.info.size > 0 ? bytes(m.info.size) : ""}</span>
              <div className="flex items-center justify-end gap-1.5">
                {SIMS.map((s) => (
                  <SimToggle key={s} mod={m} sim={s} install={simOf(scan, s)} size="sm" />
                ))}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function UnmanagedBanner({ count, scan }: { count: number; scan: ScanResult | undefined }) {
  const t = useMsfsT();
  const ops = useModOps();
  const ids = (scan?.mods ?? []).filter((m) => m.source === "community").map((m) => m.id);
  return (
    <div className="mb-5 flex items-center gap-4 rounded-2xl border border-line bg-surface-2/50 px-4 py-3">
      <div className="accent-soft flex size-9 shrink-0 items-center justify-center rounded-xl">
        <HardDriveDownload className="size-4" />
      </div>
      <p className="min-w-0 flex-1 text-[12.5px] text-fg-2">{t.library.unmanagedNote(count)}</p>
      <Button variant="secondary" size="sm" onClick={() => useMsfsUi.getState().set({ status: "unmanaged" })}>
        {t.common.details}
      </Button>
      <Button variant="subtle" size="sm" loading={ops.busy} onClick={() => ops.importMods(ids)}>
        {t.library.importAll}
      </Button>
    </div>
  );
}

/** Kütüphane seçilmeden önce Community'de duran modlar (salt görüntüleme). */
function UnmanagedList({ scan }: { scan: ScanResult | undefined }) {
  const mods = scan?.mods ?? [];
  if (mods.length === 0 || !scan) return null;
  return (
    <div className="mt-6">
      <ListView mods={mods} scan={scan} />
    </div>
  );
}

/** Seçim varken altta beliren toplu işlem çubuğu. */
function BulkBar({ scan, shown }: { scan: ScanResult; shown: ModEntry[] }) {
  const t = useMsfsT();
  const picked = useMsfsUi((s) => s.picked);
  const setPicked = useMsfsUi((s) => s.setPicked);
  const ops = useModOps();
  const [confirm, setConfirm] = useState(false);
  const mods = scan.mods.filter((m) => picked.includes(m.id));
  const library = mods.filter((m) => m.source === "library").map((m) => m.id);
  const community = mods.filter((m) => m.source === "community").map((m) => m.id);
  const usable = SIMS.filter((s) => simOf(scan, s)?.communityPath && simOf(scan, s)?.detected);
  if (picked.length === 0) return null;
  const done = () => setPicked([]);
  return (
    <motion.div
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="card-raised fixed bottom-5 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 px-3 py-2"
      style={{ marginLeft: 162 }}
    >
      <span className="px-2 text-[12.5px] font-semibold text-fg">{t.library.selected(picked.length)}</span>
      <Button size="sm" variant="ghost" onClick={() => setPicked(Array.from(new Set([...picked, ...shown.map((m) => m.id)])))}>
        {t.library.selectAll}
      </Button>
      <span className="h-5 w-px bg-[var(--line-strong)]" />
      {library.length > 0 &&
        usable.map((s) => (
          <div key={s} className="flex items-center gap-1">
            <Button size="sm" variant="secondary" disabled={ops.busy} onClick={() => ops.setEnabled(library, s, true).then(done)}>
              <span className="size-1.5 rounded-full" style={{ background: SIM_COLOR[s] }} />
              {t.library.enableIn(SIM_SHORT[s])}
            </Button>
            <Button size="sm" variant="ghost" disabled={ops.busy} onClick={() => ops.setEnabled(library, s, false).then(done)}>
              {t.library.disableIn(SIM_SHORT[s])}
            </Button>
          </div>
        ))}
      {community.length > 0 && (
        <Button size="sm" variant="subtle" icon={<HardDriveDownload className="size-3.5" />} disabled={ops.busy} onClick={() => ops.importMods(community).then(done)}>
          {t.library.importSel}
        </Button>
      )}
      {library.length > 0 && (
        <Button size="sm" variant="danger" icon={<Trash2 className="size-3.5" />} disabled={ops.busy} onClick={() => setConfirm(true)}>
          {t.library.uninstallSel}
        </Button>
      )}
      <IconButton size="sm" label={t.library.clearSel} onClick={done}>
        <X className="size-4" />
      </IconButton>
      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={async () => {
          await ops.uninstall(library);
          setConfirm(false);
          done();
        }}
        title={t.library.confirmRemoveTitle(library.length)}
        confirmLabel={t.common.remove}
        danger
        loading={ops.busy}
      >
        {t.library.confirmRemoveBody}
      </ConfirmDialog>
    </motion.div>
  );
}
