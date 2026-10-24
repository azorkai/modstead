// Kütüphane: oyunun panosu. Üstte oyunun vitrin görseliyle başlatma alanı, altında yükleme sırası
// (sürükle-bırak, aç/kapat, arama/filtre) ve sağda liste sağlığı ya da seçili modülün ayrıntısı.

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { AlertTriangle, CheckCircle2, FilePlus2, FolderSearch, History, PackageOpen, Play, RotateCw, Search, ShieldOff, Undo2, Wand2, X, XOctagon } from "lucide-react";
import { toast } from "sonner";
import clsx from "clsx";
import { useArt } from "@/lib/art";
import { isTauri } from "@/lib/ipc";
import { chooseGameFolder } from "@/shell/actions";
import { communityEnabled, useApp, useDirty } from "../store";
import { api, errorText } from "../api";
import type { Issue } from "../types";
import { Badge, Button, EmptyState, IconButton, Input, Kbd, Segmented, Skeleton, Spinner } from "../components/kit";
import { ModRow } from "../components/ModRow";
import { ModDetails } from "../components/ModDetails";
import { IssueCard } from "../components/IssueCard";
import { rich, useLang, useT } from "../i18n";

type Filter = "all" | "enabled" | "disabled" | "issues";

/** Arşiv seçtirip kurulum görevleri açar (inceleme penceresi kabukta). */
export async function pickAndInstall() {
  if (!isTauri) return;
  const { open } = await import("@tauri-apps/plugin-dialog");
  const picked = await open({ multiple: true, directory: false, filters: [{ name: "Mod", extensions: ["zip", "7z", "rar"] }] });
  const paths = Array.isArray(picked) ? picked : typeof picked === "string" ? [picked] : [];
  if (paths.length === 0) return;
  try {
    await api.installLocal(paths);
  } catch (e) {
    toast.error(errorText(e));
  }
}

export default function Library() {
  const t = useT();
  const lang = useLang();
  const ready = useApp((s) => s.ready);
  const overview = useApp((s) => s.overview);
  const order = useApp((s) => s.order);
  const modules = useApp((s) => s.modules);
  const issues = useApp((s) => s.issues);
  const selectedId = useApp((s) => s.selectedId);
  const select = useApp((s) => s.select);
  const toggle = useApp((s) => s.toggle);
  const move = useApp((s) => s.move);
  const loading = useApp((s) => s.loading);
  const load = useApp((s) => s.load);
  const autoSort = useApp((s) => s.autoSort);
  const sorting = useApp((s) => s.sorting);
  const applyOverview = useApp((s) => s.applyOverview);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    if (!useApp.getState().ready) void load(true);
    const onFocus = () => void useApp.getState().onWindowFocus();
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void useApp.getState().save();
      } else if (e.key === "F5") {
        e.preventDefault();
        void useApp.getState().load(true, true);
      }
    };
    window.addEventListener("focus", onFocus);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("keydown", onKey);
    };
  }, [load]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  const issuesByModule = useMemo(() => {
    const map = new Map<string, Issue[]>();
    for (const i of issues) {
      const k = i.moduleId.toLowerCase();
      map.set(k, [...(map.get(k) ?? []), i]);
    }
    return map;
  }, [issues]);

  const shadowedKeys = useMemo(() => new Set(overview?.shadowed.map((m) => m.id.toLowerCase()) ?? []), [overview?.shadowed]);

  if (!ready || !overview) {
    return (
      <div className="mx-auto flex max-w-[1180px] flex-col gap-5">
        <Skeleton className="h-[188px] w-full rounded-3xl" />
        <Skeleton className="h-9 w-2/3" />
        <div className="space-y-1.5">
          {Array.from({ length: 7 }, (_, i) => (
            <Skeleton key={i} className="h-[52px] w-full rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!overview.game) {
    return (
      <div className="mx-auto max-w-[1180px]">
        <EmptyState
          icon={<FolderSearch className="size-6" />}
          title={t.library.gameNotFound}
          action={
            <Button variant="primary" icon={<FolderSearch className="size-4" />} onClick={() => chooseGameFolder("bannerlord").then((s) => s && load(true))}>
              {t.library.pickGameFolder}
            </Button>
          }
        >
          {t.library.gameNotFoundBody}
        </EmptyState>
      </div>
    );
  }

  const q = query.trim().toLocaleLowerCase(lang);
  const visible = order
    .map((e, index) => ({ e, index }))
    .filter(({ e }) => {
      const m = modules[e.id.toLowerCase()];
      if (q && !`${m?.name ?? ""} ${e.id}`.toLocaleLowerCase(lang).includes(q)) return false;
      if (filter === "enabled") return e.enabled;
      if (filter === "disabled") return !e.enabled;
      if (filter === "issues") return issuesByModule.has(e.id.toLowerCase());
      return true;
    });
  const draggable = !q && filter === "all";
  const onDragEnd = (ev: DragEndEvent) => {
    if (ev.over && ev.active.id !== ev.over.id) move(String(ev.active.id), String(ev.over.id));
  };

  const selected = selectedId ? modules[selectedId.toLowerCase()] : undefined;
  const enabledCount = order.filter((e) => e.enabled).length;
  // Başlıktaki sayım kenar çubuğuyla aynı: resmî modüller ayrı gösterilir.
  const officialTotal = order.filter((e) => modules[e.id.toLowerCase()]?.isOfficial).length;
  const communityTotal = order.length - officialTotal;
  const communityOn = communityEnabled({ order, modules });
  const blockedTotal = Object.values(modules).reduce((n, m) => n + m.dlls.filter((d) => d.blocked).length, 0);
  const issueModules = issuesByModule.size;

  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-5">
      <Hero />

      <div className="flex flex-wrap items-center gap-3">
        <Input
          icon={<Search className="size-4" />}
          placeholder={t.library.searchPlaceholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-[280px]"
          trailing={
            query && (
              <button className="text-muted hover:text-fg" onClick={() => setQuery("")} aria-label={t.common.clear}>
                <X className="size-3.5" />
              </button>
            )
          }
        />
        <Segmented<Filter>
          id="bl-library-filter"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: t.library.filterAll, count: order.length },
            { value: "enabled", label: t.common.enabled, count: enabledCount },
            { value: "disabled", label: t.common.disabled, count: order.length - enabledCount },
            { value: "issues", label: t.library.filterIssues, count: issueModules },
          ]}
        />
        {!draggable && <span className="text-[12px] text-muted">{t.library.dragHint}</span>}
        {/* Elle yeniden tarama logosu olmayan modları da yeniden dener. */}
        <IconButton label={t.library.rescanHint} onClick={() => load(true, true)} className="ml-auto size-9">
          <RotateCw className={clsx("size-4", loading && "animate-spin")} />
        </IconButton>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_360px] items-start gap-5">
        <section className="relative min-w-0">
          <div className="mb-2 flex min-h-7 items-center justify-between gap-3 pl-1 text-[12px] text-muted">
            <span className="min-w-0 truncate">
              {rich(t.library.enabledOf(communityTotal), { n: <span className="tabular font-medium text-fg">{communityOn}</span> })}
              {officialTotal > 0 && <> · {t.library.officialCount(officialTotal)}</>}
            </span>
            <div className="flex items-center gap-1.5">
              {blockedTotal > 0 && (
                <Button
                  size="sm"
                  variant="danger"
                  icon={<ShieldOff className="size-3.5" />}
                  onClick={() =>
                    api
                      .unblockAll()
                      .then((o) => {
                        applyOverview(o, true);
                        toast.success(t.library.allUnblocked);
                      })
                      .catch((e) => toast.error(errorText(e)))
                  }
                >
                  {t.library.unblockN(blockedTotal)}
                </Button>
              )}
              <Button size="sm" variant="ghost" icon={<Wand2 className="size-3.5" />} loading={sorting} onClick={() => autoSort()}>
                {t.actions.autoSort}
              </Button>
              <Button size="sm" variant="ghost" icon={<FilePlus2 className="size-3.5" />} onClick={() => void pickAndInstall()} disabled={!isTauri}>
                {t.actions.installFromArchive}
              </Button>
            </div>
          </div>
          <div className="card p-1.5">
            {visible.length === 0 ? (
              <EmptyState icon={<PackageOpen className="size-6" />} title={t.library.noMatch}>
                {t.library.noMatchBody}
              </EmptyState>
            ) : (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                <SortableContext items={visible.map((v) => v.e.id)} strategy={verticalListSortingStrategy}>
                  <div className="flex flex-col gap-0.5">
                    {visible.map(({ e, index }) => (
                      <ModRow
                        key={e.id}
                        entry={e}
                        index={index}
                        module={modules[e.id.toLowerCase()]}
                        issues={issuesByModule.get(e.id.toLowerCase()) ?? []}
                        record={overview.installs[e.id.toLowerCase()]}
                        duplicate={shadowedKeys.has(e.id.toLowerCase())}
                        selected={selectedId?.toLowerCase() === e.id.toLowerCase()}
                        draggable={draggable}
                        onSelect={select}
                        onToggle={toggle}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}
          </div>
          <UnsavedBar />
        </section>

        <aside className="card sticky top-0 max-h-[calc(100vh-140px)] overflow-hidden">
          {selected ? <ModDetails module={selected} onClose={() => select(null)} /> : <HealthPanel />}
        </aside>
      </div>
    </div>
  );
}

/** Oyunun vitrin görseli, logosu, sürümü ve başlatma düğmeleri. */
function Hero() {
  const t = useT();
  const hero = useArt("bannerlord", "hero");
  const logo = useArt("bannerlord", "logo");
  const overview = useApp((s) => s.overview);
  const order = useApp((s) => s.order);
  const issues = useApp((s) => s.issues);
  const launching = useApp((s) => s.launching);
  const launch = useApp((s) => s.launch);
  const dirty = useDirty();
  const game = overview?.game;
  const running = !!overview?.gameRunning;
  const modules = useApp((s) => s.modules);
  const enabled = communityEnabled({ order, modules });
  const errors = issues.filter((i) => i.severity === "error").length;
  // Görsel üstündeki etiket ve ikincil düğme: koyu buzlu cam, beyaz yazı (iki temada aynı).
  const chip = hero ? "h-6 rounded-md border-white/15! bg-black/45! px-2 text-white/85! backdrop-blur-md" : "h-6 rounded-md px-2";
  return (
    <section className={clsx("relative overflow-hidden rounded-3xl border border-line px-7 py-6", !hero && "hero-surface")} style={{ minHeight: 188 }}>
      {hero && (
        <>
          <img src={hero} alt="" draggable={false} className="absolute inset-0 size-full object-cover" style={{ objectPosition: "65% 30%" }} />
          <div
            className="absolute inset-0"
            style={{
              // Görsel alanı iki temada da koyu kalır (logo ve yazılar okunsun); bkz. docs/TASARIM.md.
              background: "linear-gradient(90deg, rgb(8 9 12 / 0.9) 0%, rgb(8 9 12 / 0.62) 38%, transparent 72%), linear-gradient(0deg, rgb(8 9 12 / 0.55) 0%, transparent 55%)",
            }}
          />
        </>
      )}
      <div className="relative flex h-full flex-col gap-4">
        {logo ? (
          <>
            <h1 className="sr-only">Mount &amp; Blade II: Bannerlord</h1>
            <img src={logo} alt="" draggable={false} className="max-h-[72px] max-w-[320px] object-contain object-left drop-shadow-[0_6px_24px_rgb(0_0_0/0.55)]" />
          </>
        ) : (
          <h1 className={clsx("text-display text-[30px] font-semibold leading-none tracking-tight", hero ? "text-white" : "text-fg")}>{t.nav.library}</h1>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {game?.version && <Badge className={chip}>{game.version}</Badge>}
          <Badge className={chip}>{t.common.modsEnabled(enabled)}</Badge>
          {game?.blse && <Badge className={chip}>BLSE</Badge>}
          {running && (
            <Badge tone="ok" dot>
              {t.sidebar.gameRunning}
            </Badge>
          )}
          {errors > 0 && (
            <Badge tone="danger" className={clsx(hero && "h-6 border-danger/40! bg-black/45! px-2 text-white! backdrop-blur-md")} icon={<XOctagon className="size-3 text-danger" />}>
              {t.library.criticalIssues(errors)}
            </Badge>
          )}
        </div>
        <div className="mt-auto flex items-center gap-2">
          <Button variant="primary" size="lg" icon={<Play className="size-4 fill-current" />} loading={launching} disabled={running} onClick={() => launch()}>
            {dirty ? t.sidebar.saveAndPlay : t.actions.play}
          </Button>
          <Button
            size="lg"
            className={clsx(hero && "border-white/20! bg-black/45! text-white! backdrop-blur-md hover:bg-black/60!")}
            icon={<History className="size-4" />} disabled={running || launching} onClick={() => launch({ continueGame: true })}>
            {t.sidebar.continueGame}
          </Button>
        </div>
      </div>
    </section>
  );
}

function HealthPanel() {
  const t = useT();
  const issues = useApp((s) => s.issues);
  const validating = useApp((s) => s.validating);
  const select = useApp((s) => s.select);
  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");
  const infos = issues.filter((i) => i.severity === "info");
  const state = errors.length ? "error" : warnings.length ? "warning" : "ok";

  return (
    <div className="flex max-h-[calc(100vh-140px)] flex-col">
      <div className="border-b border-line px-5 pb-4 pt-5">
        <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">{t.library.health}</div>
        <div className="mt-3 flex items-center gap-3.5">
          <div
            className={clsx(
              "relative flex size-11 items-center justify-center rounded-2xl border",
              state === "ok" && "border-ok/25 bg-ok/10 text-ok",
              state === "warning" && "border-warn/25 bg-warn/10 text-warn",
              state === "error" && "border-danger/25 bg-danger/10 text-danger",
            )}
          >
            {validating ? <Spinner className="size-5 text-current" /> : state === "ok" ? <CheckCircle2 className="size-6" /> : state === "warning" ? <AlertTriangle className="size-6" /> : <XOctagon className="size-6" />}
          </div>
          <div>
            <div className="text-display text-[19px] font-semibold leading-tight text-fg">
              {state === "ok" ? t.library.ready : state === "warning" ? t.library.attention : t.library.criticalIssues(errors.length)}
            </div>
            <div className="text-[12px] text-fg-2">{t.library.issueCounts(errors.length, warnings.length, infos.length)}</div>
          </div>
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4">
        {issues.length === 0 ? <p className="px-1 py-6 text-center text-[12.5px] text-muted">{t.library.allClear}</p> : issues.map((i) => <IssueCard key={i.id} issue={i} onSelect={select} />)}
      </div>
    </div>
  );
}

function UnsavedBar() {
  const t = useT();
  const dirty = useDirty();
  const save = useApp((s) => s.save);
  const revert = useApp((s) => s.revert);
  const saving = useApp((s) => s.saving);
  return (
    <AnimatePresence>
      {dirty && (
        <motion.div
          initial={{ y: 24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 24, opacity: 0 }}
          transition={{ type: "spring", stiffness: 420, damping: 34 }}
          className="pointer-events-none sticky bottom-4 z-20 mt-3 flex justify-center"
        >
          <div className="glass pointer-events-auto flex items-center gap-3 rounded-2xl border border-line-strong py-2 pl-4 pr-2" style={{ boxShadow: "var(--shadow-lg)" }}>
            <span className="size-2 rounded-full bg-accent" />
            <span className="text-[13px] font-medium text-fg">{t.library.unsaved}</span>
            <Button variant="ghost" size="sm" icon={<Undo2 className="size-3.5" />} onClick={revert}>
              {t.library.revert}
            </Button>
            <Button variant="primary" size="sm" loading={saving} onClick={() => save()}>
              {t.common.save} <Kbd>Ctrl S</Kbd>
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
