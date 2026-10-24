// Mod listesi: filtre sekmeleri, arama, sıralama, çerçeveye göre gruplama, kart/liste görünümü,
// tek tıkla aç/kapat, toplu işlem ve ayrıntı çekmecesi.

import { useMemo, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { AlertTriangle, ArrowUpCircle, Boxes, CheckCircle2, CircleOff, ClipboardCopy, Cog, Compass, FolderOpen, FolderSearch, LayoutGrid, Leaf, List, Package, Power, PowerOff, Search, ShieldAlert, Trash2, Wrench, X } from "lucide-react";
import clsx from "clsx";
import { toast } from "sonner";
import { bytes } from "@/lib/format";
import { chooseGameFolder, notifyError } from "@/shell/actions";
import { Badge, Button, Checkbox, ConfirmDialog, EmptyState, IconButton, Input, PageHeader, Segmented, Skeleton, Switch } from "@/ui";
import { api } from "./api";
import { useS } from "./i18n";
import { ModDrawer } from "./ModDrawer";
import { PixelCover } from "./Pixel";
import { goPage, installSmapi, nexusUrl, norm, pickAndInstall, useAction, useEnv, useModIndex, useSnapshot, useStardewSync } from "./queries";
import { IssueIcon, Page } from "./shared";
import type { Issue, ModInfo } from "./types";

type Filter = "all" | "enabled" | "disabled" | "updates" | "issues" | "smapi" | "content";
type Sort = "name" | "recent" | "size" | "author";
type Layout = "grid" | "list";

const FILTER_ICONS: Record<Filter, typeof Boxes> = { all: Boxes, enabled: CheckCircle2, disabled: CircleOff, updates: ArrowUpCircle, issues: AlertTriangle, smapi: Cog, content: Leaf };
const LAYOUT_KEY = "modstead.stardew.modLayout";

function storedLayout(): Layout {
  try {
    return localStorage.getItem(LAYOUT_KEY) === "list" ? "list" : "grid";
  } catch {
    return "grid";
  }
}

/** Sayfalar arası paylaşılan filtre isteği (ör. panodaki "Sorunlu modlar" bağlantısı). */
let pendingFilter: Filter | null = null;
export function openModsWith(filter: Filter) {
  pendingFilter = filter;
}

export default function Mods() {
  useStardewSync();
  const t = useS();
  const { isLoading } = useSnapshot();
  const { data: env } = useEnv();
  const { mods, issuesByFolder, updateOf, nameOf, snapshot } = useModIndex();
  const [filter, setFilter] = useState<Filter>(() => {
    const f = pendingFilter ?? "all";
    pendingFilter = null;
    return f;
  });
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("name");
  const [grouped, setGrouped] = useState(false);
  const [layout, setLayoutState] = useState<Layout>(storedLayout);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmRemove, setConfirmRemove] = useState<string[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const setLayout = (l: Layout) => {
    setLayoutState(l);
    try {
      localStorage.setItem(LAYOUT_KEY, l);
    } catch {
      /* depolama kapalıysa yalnızca bu oturum için */
    }
  };

  const toggle = useAction(({ folders, enabled }: { folders: string[]; enabled: boolean }) => api.setEnabled(folders, enabled), { success: (e) => e.title });
  const remove = useAction((folders: string[]) => api.uninstall(folders), { success: (e) => t.mods.removed(e.title) });

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: mods.length, enabled: 0, disabled: 0, updates: 0, issues: 0, smapi: 0, content: 0 };
    for (const m of mods) {
      if (m.enabled) c.enabled++;
      else c.disabled++;
      if (updateOf(m)?.hasUpdate) c.updates++;
      if (issuesByFolder.has(m.folder)) c.issues++;
      if (m.kind === "smapi") c.smapi++;
      if (m.kind === "content") c.content++;
    }
    return c;
  }, [mods, updateOf, issuesByFolder]);

  const visible = useMemo(() => {
    const q = norm(query.trim());
    const pass: Record<Filter, (m: ModInfo) => boolean> = {
      all: () => true,
      enabled: (m) => m.enabled,
      disabled: (m) => !m.enabled,
      updates: (m) => !!updateOf(m)?.hasUpdate,
      issues: (m) => issuesByFolder.has(m.folder),
      smapi: (m) => m.kind === "smapi",
      content: (m) => m.kind === "content",
    };
    const list = mods.filter((m) => pass[filter](m) && (!q || norm(`${m.name} ${m.author ?? ""} ${m.uniqueId ?? ""} ${m.folderName} ${m.description ?? ""}`).includes(q)));
    const by: Record<Sort, (a: ModInfo, b: ModInfo) => number> = {
      name: (a, b) => a.name.localeCompare(b.name, "tr"),
      recent: (a, b) => b.modified - a.modified,
      size: (a, b) => b.size - a.size,
      author: (a, b) => (a.author ?? "").localeCompare(b.author ?? "", "tr") || a.name.localeCompare(b.name, "tr"),
    };
    return [...list].sort(by[sort]);
  }, [mods, filter, query, sort, updateOf, issuesByFolder]);

  const groups = useMemo(() => {
    if (!grouped) return [{ key: "all", title: null as string | null, mods: visible }];
    const map = new Map<string, ModInfo[]>();
    for (const m of visible) {
      const key = m.contentPackFor ? t.mods.groupPack(nameOf(m.contentPackFor.uniqueId)) : m.kind === "smapi" ? t.mods.groupSmapi : t.mods.groupOther;
      map.set(key, [...(map.get(key) ?? []), m]);
    }
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length).map(([title, list]) => ({ key: title, title, mods: list }));
  }, [visible, grouped, nameOf, t]);

  const selectedList = [...selected].filter((f) => mods.some((m) => m.folder === f));
  const allVisibleSelected = visible.length > 0 && visible.every((m) => selected.has(m.folder));
  const select = (folder: string, v: boolean) => {
    const next = new Set(selected);
    if (v) next.add(folder);
    else next.delete(folder);
    setSelected(next);
  };

  const copyList = async () => {
    const lines = mods.filter((m) => m.enabled).map((m) => `- ${m.name} ${m.version ?? ""}${m.nexusId ? ` — ${nexusUrl(m.nexusId)}` : ""}`.trimEnd());
    try {
      await navigator.clipboard.writeText(`${t.mods.listHeader(lines.length)}\n\n${lines.join("\n")}\n`);
      toast.success(t.mods.copied);
    } catch (e) {
      notifyError(e);
    }
  };

  const noGame = env !== undefined && !env.gamePath;
  // SMAPI yoksa ilk iş onu kurmak: kurulan modlar SMAPI olmadan yüklenmez.
  const noSmapi = env !== undefined && !!env.gamePath && !env.smapi.installed;
  const cardProps = (m: ModInfo) => ({
    mod: m,
    selected: selected.has(m.folder),
    onSelect: (v: boolean) => select(m.folder, v),
    onOpen: () => setOpen(m.folder),
    onToggle: (v: boolean) => toggle.mutate({ folders: [m.folder], enabled: v }),
    issues: issuesByFolder.get(m.folder) ?? [],
    latest: updateOf(m)?.hasUpdate ? (updateOf(m)?.latest ?? null) : null,
    frameworkName: m.contentPackFor ? nameOf(m.contentPackFor.uniqueId) : null,
    busy: toggle.isPending && !!toggle.variables?.folders.includes(m.folder),
  });

  return (
    <Page>
      <PageHeader
        title={t.mods.title}
        subtitle={snapshot?.scan.modsPath ? <span className="font-mono text-[11.5px]">{snapshot.scan.modsPath}</span> : noGame ? t.mods.noFolder : undefined}
        actions={
          !noGame && (
            <>
              {mods.length > 0 && (
                <Button variant="ghost" icon={<ClipboardCopy className="size-4" />} onClick={copyList}>
                  {t.mods.copyList}
                </Button>
              )}
              <Button variant="secondary" icon={<FolderOpen className="size-4" />} onClick={() => api.openPath("mods").catch(notifyError)}>
                {t.common.openFolder}
              </Button>
              <Button variant="secondary" icon={<Package className="size-4" />} onClick={pickAndInstall}>
                {t.mods.install}
              </Button>
              {noSmapi ? (
                <Button variant="primary" icon={<Wrench className="size-4" />} onClick={installSmapi}>
                  {t.mods.installSmapi}
                </Button>
              ) : (
                <Button variant="primary" icon={<Compass className="size-4" />} onClick={() => goPage("discover")}>
                  {t.discover.findMods}
                </Button>
              )}
            </>
          )
        }
      />

      {noSmapi && mods.length > 0 && (
        <div className="card mb-5 flex items-center gap-4 border-warn/30 px-5 py-4">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-warn/12 text-warn">
            <Wrench className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-semibold text-fg">{t.mods.smapiMissingTitle}</div>
            <p className="mt-0.5 text-[12.5px] text-fg-2">{t.mods.smapiMissingBody}</p>
          </div>
          <Button variant="primary" icon={<Wrench className="size-4" />} onClick={installSmapi}>
            {t.mods.installSmapi}
          </Button>
        </div>
      )}

      {noGame ? (
        <div className="card">
          <EmptyState
            icon={<FolderSearch className="size-6" />}
            title={t.mods.noGameTitle}
            action={
              <Button variant="primary" icon={<FolderOpen className="size-4" />} onClick={() => chooseGameFolder("stardew")}>
                {t.mods.chooseFolder}
              </Button>
            }
          >
            {t.mods.noGameBody}
          </EmptyState>
        </div>
      ) : (
        <>
          <div className="mb-4 flex items-center gap-1 overflow-x-auto overflow-y-hidden border-b border-line [scrollbar-width:none]">
            {(Object.keys(FILTER_ICONS) as Filter[]).map((f) => {
              const Icon = FILTER_ICONS[f];
              const active = filter === f;
              if (f !== "all" && counts[f] === 0 && !active) return null;
              return (
                <button key={f} onClick={() => setFilter(f)} className={clsx("relative flex h-10 shrink-0 items-center gap-2 px-3 text-[13px] font-medium transition-colors", active ? "text-fg" : "text-muted hover:text-fg-2")}>
                  <Icon className={clsx("size-4", active && "text-accent")} />
                  {t.mods.filters[f]}
                  <span className={clsx("tabular rounded-md px-1.5 text-[11px] font-semibold", active ? "accent-soft" : "bg-surface-3 text-muted")}>{counts[f]}</span>
                  {active && <motion.span layoutId="sdv-mods-tab" className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full bg-accent" />}
                </button>
              );
            })}
          </div>

          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Input
              className="min-w-[260px] flex-1"
              icon={<Search className="size-4" />}
              placeholder={t.mods.search}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              trailing={
                query && (
                  <IconButton label={t.mods.clear} size="sm" className="-mr-1.5" onClick={() => setQuery("")}>
                    <X className="size-3.5" />
                  </IconButton>
                )
              }
            />
            <select
              className="h-9 cursor-pointer rounded-[10px] border border-line-strong bg-surface-2/70 px-3 text-[13px] text-fg outline-none focus:border-[color-mix(in_oklab,var(--accent)_55%,transparent)]"
              value={sort}
              onChange={(e) => setSort(e.target.value as Sort)}
              aria-label={t.mods.sortLabel}
            >
              {(Object.keys(t.mods.sort) as Sort[]).map((k) => (
                <option key={k} value={k}>
                  {t.mods.sort[k]}
                </option>
              ))}
            </select>
            <label className="flex h-9 cursor-pointer items-center gap-2 rounded-[10px] border border-line-strong bg-surface-2/70 px-3 text-[13px] text-fg-2">
              <Checkbox checked={grouped} onChange={setGrouped} label={t.mods.group} />
              {t.mods.group}
            </label>
            <Segmented
              id="sdv-layout"
              value={layout}
              onChange={setLayout}
              options={[
                { value: "grid", label: <LayoutGrid className="size-4" aria-label={t.mods.layoutGrid} /> },
                { value: "list", label: <List className="size-4" aria-label={t.mods.layoutList} /> },
              ]}
            />
          </div>

          {isLoading ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(212px,1fr))] gap-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-[190px] rounded-[18px]" />
              ))}
            </div>
          ) : visible.length === 0 ? (
            <div className="card">
              {mods.length === 0 && noSmapi ? (
                <EmptyState
                  icon={<Wrench className="size-6" />}
                  title={t.mods.smapiMissingTitle}
                  action={
                    <div className="flex items-center gap-2">
                      <Button variant="primary" icon={<Wrench className="size-4" />} onClick={installSmapi}>
                        {t.mods.installSmapi}
                      </Button>
                      <Button variant="ghost" icon={<Package className="size-4" />} onClick={pickAndInstall}>
                        {t.mods.emptyAction}
                      </Button>
                    </div>
                  }
                >
                  {t.mods.smapiMissingBody}
                </EmptyState>
              ) : mods.length === 0 ? (
                <EmptyState
                  icon={<Boxes className="size-6" />}
                  title={t.mods.emptyTitle}
                  action={
                    <div className="flex items-center gap-2">
                      <Button variant="primary" icon={<Compass className="size-4" />} onClick={() => goPage("discover")}>
                        {t.discover.findMods}
                      </Button>
                      <Button variant="ghost" icon={<Package className="size-4" />} onClick={pickAndInstall}>
                        {t.mods.install}
                      </Button>
                    </div>
                  }
                >
                  {t.mods.emptyBody}
                </EmptyState>
              ) : (
                <EmptyState icon={<Search className="size-6" />} title={t.mods.noMatchTitle}>
                  {t.mods.noMatchBody}
                </EmptyState>
              )}
            </div>
          ) : layout === "grid" ? (
            <div className="pb-20">
              {groups.map((g) => (
                <section key={g.key} className="mb-6">
                  {g.title && <GroupTitle title={g.title} count={g.mods.length} />}
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(212px,1fr))] gap-4">
                    {g.mods.map((m) => (
                      <ModCard key={m.folder} {...cardProps(m)} />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <div className="card mb-20 overflow-hidden">
              <div className="flex items-center gap-3 border-b border-line px-4 py-2.5 text-[11.5px] font-medium text-muted">
                <Checkbox
                  checked={allVisibleSelected}
                  indeterminate={!allVisibleSelected && visible.some((m) => selected.has(m.folder))}
                  onChange={(v) => setSelected(v ? new Set(visible.map((m) => m.folder)) : new Set())}
                  label={t.mods.selectAll}
                />
                <span className="flex-1">{t.common.mods(visible.length)}</span>
                <span className="hidden w-28 lg:block">{t.mods.colVersion}</span>
                <span className="hidden w-36 xl:block">{t.mods.colKind}</span>
                <span className="hidden w-20 text-right lg:block">{t.mods.colSize}</span>
                <span className="w-12 text-right">{t.mods.colState}</span>
              </div>
              {groups.map((g) => (
                <div key={g.key}>
                  {g.title && (
                    <div className="border-b border-line bg-surface-2/60 px-4 py-1.5 text-[12px] font-semibold text-fg-2">
                      {g.title} <span className="text-muted">· {g.mods.length}</span>
                    </div>
                  )}
                  {g.mods.map((m) => (
                    <ModRow key={m.folder} {...cardProps(m)} />
                  ))}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <AnimatePresence>
        {selectedList.length > 0 && (
          <motion.div initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 30, opacity: 0 }} className="pointer-events-none sticky bottom-4 z-30 flex justify-center">
            <div className="card-raised pointer-events-auto flex items-center gap-2 px-3 py-2" style={{ boxShadow: "var(--shadow-lg)" }}>
              <span className="tabular px-2 text-[13px] font-medium text-fg">{t.mods.selected(selectedList.length)}</span>
              <Button size="sm" variant="subtle" icon={<Power className="size-3.5" />} onClick={() => toggle.mutate({ folders: selectedList, enabled: true }, { onSuccess: () => setSelected(new Set()) })}>
                {t.mods.bulkEnable}
              </Button>
              <Button size="sm" icon={<PowerOff className="size-3.5" />} onClick={() => toggle.mutate({ folders: selectedList, enabled: false }, { onSuccess: () => setSelected(new Set()) })}>
                {t.mods.bulkDisable}
              </Button>
              <Button size="sm" variant="danger" icon={<Trash2 className="size-3.5" />} onClick={() => setConfirmRemove(selectedList)}>
                {t.common.remove}
              </Button>
              <IconButton label={t.mods.clearSelection} onClick={() => setSelected(new Set())}>
                <X className="size-4" />
              </IconButton>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <ModDrawer folder={open} onClose={() => setOpen(null)} onOpen={setOpen} />
      <ConfirmDialog
        open={confirmRemove !== null}
        onClose={() => setConfirmRemove(null)}
        title={t.mods.removeTitle(confirmRemove?.length ?? 0)}
        confirmLabel={t.common.remove}
        danger
        loading={remove.isPending}
        onConfirm={() =>
          remove.mutate(confirmRemove ?? [], {
            onSuccess: () => {
              setConfirmRemove(null);
              setSelected(new Set());
            },
          })
        }
      >
        {t.mods.removeBody}
      </ConfirmDialog>
    </Page>
  );
}

function GroupTitle({ title, count }: { title: string; count: number }) {
  return (
    <h3 className="mb-3 text-[13px] font-semibold text-fg-2">
      {title} <span className="text-muted">· {count}</span>
    </h3>
  );
}

interface ItemProps {
  mod: ModInfo;
  selected: boolean;
  onSelect: (v: boolean) => void;
  onOpen: () => void;
  onToggle: (v: boolean) => void;
  issues: Issue[];
  latest: string | null;
  frameworkName: string | null;
  busy: boolean;
}

function worstOf(issues: Issue[]): Issue | undefined {
  return issues.find((i) => i.severity === "error") ?? issues.find((i) => i.severity === "warning");
}

function kindLabel(t: ReturnType<typeof useS>, m: ModInfo, framework: string | null): string {
  if (m.isCore) return t.kind.core;
  if (m.kind === "content") return framework ?? t.kind.content;
  return t.kind[m.kind];
}

function Clickable({ onOpen, className, children }: { onOpen: () => void; className: string; children: ReactNode }) {
  return (
    <div role="button" tabIndex={0} onClick={onOpen} onKeyDown={(e) => e.key === "Enter" && onOpen()} className={className}>
      {children}
    </div>
  );
}

function ModCard({ mod: m, selected, onSelect, onOpen, onToggle, issues, latest, frameworkName, busy }: ItemProps) {
  const t = useS();
  const worst = worstOf(issues);
  return (
    <Clickable
      onOpen={onOpen}
      className={clsx(
        "group relative cursor-pointer overflow-hidden rounded-[18px] border bg-surface outline-none transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-accent/50",
        selected ? "border-accent/60 ring-2 ring-accent/25" : "border-line hover:border-line-strong",
      )}
    >
      <div className="relative aspect-[16/9] overflow-hidden">
        <PixelCover seed={m.uniqueId ?? m.folder} kind={m.kind} dim={!m.enabled} className="size-full transition-transform duration-300 group-hover:scale-[1.05]" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/5 to-transparent" />
        <div className={clsx("absolute left-2 top-2 transition-opacity", selected ? "opacity-100" : "opacity-0 group-hover:opacity-100")} onClick={(e) => e.stopPropagation()}>
          <Checkbox checked={selected} onChange={onSelect} label={t.mods.select(m.name)} />
        </div>
        <div className="absolute right-2 top-2 flex gap-1">
          {latest && (
            <Badge tone="accent" className="glass" icon={<ArrowUpCircle className="size-3" />}>
              {latest}
            </Badge>
          )}
          {worst && (
            <Badge tone={worst.severity === "error" ? "danger" : "warn"} className="glass" icon={<IssueIcon severity={worst.severity} className="size-3" />}>
              {t.severity[worst.severity]}
            </Badge>
          )}
          {m.executables.length > 0 && (
            <span title={t.mods.hasExe}>
              <Badge tone="warn" className="glass" icon={<ShieldAlert className="size-3" />}>
                exe
              </Badge>
            </span>
          )}
        </div>
        <div className="absolute inset-x-3 bottom-2 truncate text-[15px] font-semibold leading-tight text-white [text-shadow:0_1px_2px_rgb(0_0_0/0.6)]">{m.name}</div>
      </div>
      <div className="flex items-center gap-2 px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12.5px] text-fg-2">{m.author ?? t.common.unknownAuthor}</div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-muted">
            {m.version && (
              <>
                <span className="font-mono">{m.version}</span>
                <span>·</span>
              </>
            )}
            <span className="truncate">{kindLabel(t, m, frameworkName)}</span>
          </div>
        </div>
        <div onClick={(e) => e.stopPropagation()}>
          <Switch checked={m.enabled} disabled={busy || m.disabledByParent} onChange={onToggle} label={m.enabled ? t.mods.disable : t.mods.enable} />
        </div>
      </div>
    </Clickable>
  );
}

function ModRow({ mod: m, selected, onSelect, onOpen, onToggle, issues, latest, frameworkName, busy }: ItemProps) {
  const t = useS();
  const worst = worstOf(issues);
  return (
    <Clickable
      onOpen={onOpen}
      className={clsx("group flex cursor-pointer items-center gap-3 border-b border-line px-4 py-2.5 outline-none transition-colors last:border-b-0 hover:bg-surface-2/60 focus-visible:bg-surface-2/60", selected && "bg-accent/6")}
    >
      <div onClick={(e) => e.stopPropagation()}>
        <Checkbox checked={selected} onChange={onSelect} label={t.mods.select(m.name)} />
      </div>
      <div className={clsx("size-9 shrink-0 overflow-hidden rounded-[10px]", !m.enabled && "opacity-60")}>
        <PixelCover seed={m.uniqueId ?? m.folder} kind={m.kind} dim={!m.enabled} className="size-full" />
      </div>
      <div className={clsx("min-w-0 flex-1", !m.enabled && "opacity-70")}>
        <div className="flex items-center gap-2">
          <span className="truncate text-[13.5px] font-medium text-fg">{m.name}</span>
          {worst && (
            <span title={issues.map((i) => i.title).join("\n")}>
              <IssueIcon severity={worst.severity} />
            </span>
          )}
          {m.executables.length > 0 && (
            <span title={t.mods.hasExe}>
              <ShieldAlert className="size-4 text-warn" />
            </span>
          )}
        </div>
        <div className="truncate text-[12px] text-muted">
          {m.author ?? t.common.unknownAuthor}
          {m.group && <span> · {m.group}</span>}
          {m.description && <span> · {m.description}</span>}
        </div>
      </div>
      <div className="hidden w-28 items-center gap-1.5 lg:flex">
        {m.version && <span className="font-mono text-[12px] text-fg-2">{m.version}</span>}
        {latest && (
          <span title={t.mods.newVersion(latest)} className="flex items-center gap-0.5 text-[11.5px] font-semibold text-accent">
            <ArrowUpCircle className="size-3.5" />
            {latest}
          </span>
        )}
      </div>
      <div className="hidden w-36 xl:block">
        <Badge tone={m.kind === "smapi" ? "accent" : m.kind === "content" ? "neutral" : "danger"} className="max-w-full truncate">
          {kindLabel(t, m, frameworkName)}
        </Badge>
      </div>
      <span className="tabular hidden w-20 text-right text-[12px] text-muted lg:block">{bytes(m.size)}</span>
      <div className="flex w-12 justify-end" onClick={(e) => e.stopPropagation()}>
        <Switch checked={m.enabled} disabled={busy || m.disabledByParent} onChange={onToggle} label={m.enabled ? t.mods.disable : t.mods.enable} />
      </div>
    </Clickable>
  );
}
