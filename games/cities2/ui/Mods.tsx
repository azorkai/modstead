// Modlar: Paradox Mods abonelikleri (oyunun önbelleği; oyun yönetir, katalog bilgisiyle zenginleşir) ve
// yerel modlar (aç/kapat, çöpe taşı, klasör). Uyumluluk, bekleyen güncelleme, eski sürüm birikintisi,
// BepInEx ve bilinen kötü amaçlı sürüm rozetleri; altta çöp kutusu.

import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { ArrowUpCircle, Boxes, ExternalLink, FolderOpen, PackagePlus, RefreshCw, RotateCcw, Search, ShieldAlert, Trash2, TriangleAlert, UserRound, X } from "lucide-react";
import clsx from "clsx";
import { toast } from "sonner";
import { ago, bytes } from "@/lib/format";
import { isTauri } from "@/lib/ipc";
import { notifyError, openUrl } from "@/shell/actions";
import { Badge, Button, ConfirmDialog, EmptyState, IconButton, Input, PageHeader, Segmented, Skeleton, Switch } from "@/ui";
import { api } from "./api";
import { useS } from "./i18n";
import { openPdxMod } from "./paradox";
import { goPage, modCompat, norm, pendingUpdate, pickAndInstall, refreshAll, removeLocal, toggleLocal, useCitiesSettings, useCitiesSync, useEnv, useModIndex, useTrash } from "./queries";
import { CompatBadge, ModThumb, Page } from "./shared";
import type { ModEntry } from "./types";

type Filter = "all" | "paradox" | "local" | "disabled" | "problems";

function isProblem(m: ModEntry, game: string | null | undefined) {
  const c = modCompat({ kind: m.kind, tags: m.meta?.tags, requiredVersion: m.meta?.requiredVersion }, game);
  return !!m.knownBad || m.bepinex || c === "outdated" || c === "newer";
}

export default function Mods() {
  useCitiesSync();
  const t = useS();
  const { data: env } = useEnv();
  const { mods, snapshot, isLoading } = useModIndex();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const game = snapshot?.gameVersion ?? env?.version;

  const counts = useMemo(
    () => ({
      all: mods.length,
      paradox: mods.filter((m) => m.source === "paradox").length,
      local: mods.filter((m) => m.source === "local").length,
      disabled: mods.filter((m) => !m.enabled).length,
      problems: mods.filter((m) => isProblem(m, game)).length,
    }),
    [mods, game],
  );

  const shown = useMemo(() => {
    const q = norm(query.trim());
    return mods
      .filter((m) =>
        filter === "all" ? true : filter === "paradox" ? m.source === "paradox" : filter === "local" ? m.source === "local" : filter === "disabled" ? !m.enabled : isProblem(m, game),
      )
      .filter((m) => !q || norm([m.name, m.meta?.author ?? "", m.folder, ...m.dlls].join(" ")).includes(q))
      .sort((a, b) => Number(isProblem(b, game)) - Number(isProblem(a, game)) || Number(b.enabled) - Number(a.enabled) || a.name.localeCompare(b.name));
  }, [mods, filter, query, game]);

  const refreshCatalog = async () => {
    setRefreshing(true);
    try {
      const n = await api.pdxRefresh(true);
      refreshAll();
      toast.success(t.mods.refreshed(n));
    } catch (e) {
      notifyError(e);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <Page className="pb-12">
      <PageHeader
        title={t.mods.title}
        subtitle={snapshot ? t.mods.subtitle(mods.length, bytes(snapshot.counts.size)) : undefined}
        actions={
          <>
            <Button variant="ghost" icon={<FolderOpen className="size-4" />} onClick={() => api.openPath("mods").catch(notifyError)}>
              {t.mods.openFolder}
            </Button>
            {counts.paradox > 0 && (
              <IconButton label={t.mods.refreshCatalog} onClick={refreshCatalog}>
                <RefreshCw className={clsx("size-4", refreshing && "animate-spin")} />
              </IconButton>
            )}
            <Button variant="primary" icon={<PackagePlus className="size-4" />} onClick={pickAndInstall} disabled={!isTauri}>
              {t.mods.install}
            </Button>
          </>
        }
      />

      {env?.account.loggedIn === false && counts.paradox > 0 && (
        <div className="mb-4 flex items-center gap-3 rounded-[14px] border border-warn/30 bg-warn/5 px-4 py-3">
          <UserRound className="size-4 shrink-0 text-warn" />
          <div className="min-w-0 flex-1 text-[12.5px] text-fg-2">
            <span className="font-medium text-fg">{t.mods.loginTitle} · </span>
            {t.mods.loginBody}
          </div>
        </div>
      )}
      {env?.running && (
        <div className="mb-4 flex items-center gap-3 rounded-[14px] border border-line bg-surface-2/50 px-4 py-3 text-[12.5px] text-fg-2">
          <TriangleAlert className="size-4 shrink-0 text-warn" />
          {t.mods.gameRunning}
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Segmented<Filter>
          id="cs2-mods-filter"
          value={filter}
          onChange={setFilter}
          options={(["all", "paradox", "local", "disabled", "problems"] as Filter[]).filter((f) => f === "all" || counts[f] > 0 || filter === f).map((f) => ({ value: f, label: t.mods.filters[f], count: counts[f] }))}
        />
        <Input
          className="ml-auto h-9 w-[300px]"
          icon={<Search className="size-4" />}
          value={query}
          placeholder={t.mods.search}
          onChange={(e) => setQuery(e.target.value)}
          trailing={
            query && (
              <IconButton label={t.mods.clear} size="sm" className="-mr-1.5" onClick={() => setQuery("")}>
                <X className="size-3.5" />
              </IconButton>
            )
          }
        />
      </div>

      {isLoading ? (
        <div className="card divide-y divide-[var(--line)]">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3">
              <Skeleton className="h-11 w-[70px] rounded-[10px]" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-72" />
              </div>
            </div>
          ))}
        </div>
      ) : mods.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Boxes className="size-6" />}
            title={t.mods.noModsTitle}
            action={
              <Button variant="primary" icon={<Search className="size-4" />} onClick={() => goPage("discover")}>
                {t.overview.findMods}
              </Button>
            }
          >
            {t.mods.noModsBody}
          </EmptyState>
        </div>
      ) : shown.length === 0 ? (
        <div className="card">
          <EmptyState icon={<Search className="size-6" />} title={t.mods.noResults} />
        </div>
      ) : (
        <div className="card overflow-hidden">
          {shown.map((m) => (
            <ModRow key={m.key} mod={m} game={game} running={!!env?.running} />
          ))}
        </div>
      )}

      <TrashSection />
    </Page>
  );
}

function ModRow({ mod: m, game, running }: { mod: ModEntry; game: string | null | undefined; running: boolean }) {
  const t = useS();
  const [confirm, setConfirm] = useState(false);
  const pending = pendingUpdate(m);
  const state = modCompat({ kind: m.kind, tags: m.meta?.tags, requiredVersion: m.meta?.requiredVersion }, game);
  const pdx = m.source === "paradox";
  const openDetail = () => pdx && m.modId && openPdxMod(m.modId);

  return (
    <motion.div layout="position" className={clsx("group flex items-center gap-3.5 border-b border-line px-4 py-3 last:border-b-0", !m.enabled && "opacity-60", pdx && "cursor-pointer hover:bg-surface-2/60")} onClick={openDetail}>
      <ModThumb mod={m} size={40} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="truncate text-[13.5px] font-semibold text-fg">{m.name}</span>
          {m.knownBad && (
            <Badge tone="danger" icon={<ShieldAlert className="size-3" />}>
              {t.mods.knownBad}
            </Badge>
          )}
          {m.bepinex && <Badge tone="warn">{t.mods.bepinex}</Badge>}
          <CompatBadge state={state} title={m.meta?.requiredVersion && game ? t.compat.detail(m.meta.requiredVersion, game) : undefined} />
          {pending && (
            <span title={t.mods.updatePendingHint(pending)}>
              <Badge tone="accent" icon={<ArrowUpCircle className="size-3" />}>
                {t.mods.updatePending}
              </Badge>
            </span>
          )}
          {m.stale.length > 0 && <Badge>{t.mods.stale(m.stale.length)}</Badge>}
          {!m.enabled && <Badge>{t.mods.disabled}</Badge>}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[12px] text-muted">
          <span className={clsx(pdx ? "text-accent" : "text-fg-2")}>{t.source[m.source]}</span>
          {m.meta?.author && <span>· {m.meta.author}</span>}
          <span>· {t.kind[m.kind]}</span>
          {m.hasUi && <span>· {t.mods.ui}</span>}
          {(m.meta?.userVersion || m.version) && <span className="font-mono text-[11.5px]">· {pdx ? (m.meta?.userVersion ?? t.mods.pdxVersion(m.version!)) : m.version}</span>}
          <span>· {bytes(m.size)}</span>
          <span title={new Date(m.modified * 1000).toLocaleString()}>· {ago(m.modified)}</span>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1" onClick={(e) => e.stopPropagation()}>
        {pdx ? (
          <>
            <span className="mr-1 hidden text-[11.5px] text-muted group-hover:inline" title={t.mods.managedHint}>
              {t.mods.managedByGame}
            </span>
            {m.meta?.url && (
              <IconButton label={t.mods.openOnParadox} onClick={() => openUrl(m.meta!.url)}>
                <ExternalLink className="size-4" />
              </IconButton>
            )}
            <IconButton label={t.common.openFolder} onClick={() => api.openPath("pdx", m.folder).catch(notifyError)}>
              <FolderOpen className="size-4" />
            </IconButton>
          </>
        ) : (
          <>
            <IconButton label={t.common.openFolder} onClick={() => api.openPath("mods", m.folder).catch(notifyError)}>
              <FolderOpen className="size-4" />
            </IconButton>
            <IconButton label={t.mods.remove} disabled={running} onClick={() => setConfirm(true)}>
              <Trash2 className="size-4" />
            </IconButton>
            <Switch checked={m.enabled} disabled={running} label={m.enabled ? t.mods.disable : t.mods.enable} onChange={(v) => toggleLocal(m, v)} />
          </>
        )}
      </div>
      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={() => {
          setConfirm(false);
          void removeLocal(m);
        }}
        title={t.mods.removeConfirmTitle(m.name)}
        confirmLabel={t.mods.remove}
        danger
      >
        {t.mods.removeConfirmBody}
      </ConfirmDialog>
    </motion.div>
  );
}

function TrashSection() {
  const t = useS();
  const { data: trash } = useTrash();
  const { data: settings } = useCitiesSettings();
  if (!trash?.length) return null;
  const restore = async (id: string, name: string) => {
    try {
      await api.restoreTrash(id);
      refreshAll();
      toast.success(t.mods.restored(name));
    } catch (e) {
      notifyError(e);
    }
  };
  const remove = async (id: string | null) => {
    try {
      await api.deleteTrash(id);
      refreshAll();
    } catch (e) {
      notifyError(e);
    }
  };
  return (
    <section className="mt-8">
      <div className="mb-2 flex items-end justify-between gap-3">
        <div>
          <h3 className="text-[13.5px] font-semibold text-fg">{t.mods.trash}</h3>
          {settings && <p className="text-[12px] text-muted">{t.mods.trashHint(settings.trashRetentionDays)}</p>}
        </div>
        <Button size="sm" variant="ghost" icon={<Trash2 className="size-3.5" />} onClick={() => remove(null)}>
          {t.mods.emptyTrash}
        </Button>
      </div>
      <div className="card overflow-hidden">
        {trash.map((x) => (
          <div key={x.id} className="flex items-center gap-3 border-b border-line px-4 py-2.5 last:border-b-0">
            <Trash2 className="size-4 shrink-0 text-muted" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] text-fg">{x.name}</div>
              <div className="truncate text-[11.5px] text-muted">
                {ago(x.time)} · {bytes(x.size)} · <span className="font-mono">{x.original}</span>
              </div>
            </div>
            <Button size="sm" variant="subtle" icon={<RotateCcw className="size-3.5" />} onClick={() => restore(x.id, x.name)}>
              {t.common.restore}
            </Button>
            <IconButton label={t.mods.deleteForever} onClick={() => remove(x.id)}>
              <X className="size-4" />
            </IconButton>
          </div>
        ))}
      </div>
    </section>
  );
}
