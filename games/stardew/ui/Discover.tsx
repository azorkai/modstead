// Mod bul: Nexus'ta arama, kategoriler, sıralama; kartta kurulu/güncelleme durumu ve tek tıkla alma.
// Nexus bağlantısı ya da numarası yapıştırılırsa doğrudan mod sayfası açılır. İndirme yolu
// (Premium/ücretsiz/anahtar yok) `nexus.ts` → `getFromNexus`'ta.

import { useEffect, useMemo } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { motion } from "motion/react";
import { ArrowRight, ArrowUpCircle, BadgeCheck, Compass, Download, KeyRound, Link2, RefreshCw, Search, Wrench, X } from "lucide-react";
import clsx from "clsx";
import { create } from "zustand";
import { ago, locale, num } from "@/lib/format";
import { errorMessage } from "@/lib/ipc";
import { useNexus, useNxmStatus } from "@/lib/queries";
import { useUi } from "@/lib/store";
import { Button, EmptyState, IconButton, Input, PageHeader, Segmented, Skeleton, Spinner } from "@/ui";
import { api } from "./api";
import { useS } from "./i18n";
import { categoryLabel, compact, decodeEntities, getFromNexus, openNexusMod, registerNxm, useModJob } from "./nexus";
import { PixelCover } from "./Pixel";
import { GAME, installSmapi, useEnv, useModIndex, useStardewSync } from "./queries";
import { Page } from "./shared";
import type { ModInfo, NexusMod } from "./types";

type Sort = "downloads" | "updated" | "endorsements" | "new";

/** Sayfadan çıkıp dönünce arama ve filtre yerinde kalsın. */
interface DiscoverState {
  input: string;
  query: string;
  sort: Sort;
  category: string | null;
  /** Filtresiz aramanın toplamı ("Tümü" ve alt başlık). */
  allTotal: number | null;
}

const useDiscover = create<DiscoverState & { set: (p: Partial<DiscoverState>) => void }>((set) => ({
  input: "",
  query: "",
  sort: "downloads",
  category: null,
  allTotal: null,
  set: (p) => set(p),
}));

/** "nexusmods.com/stardewvalley/mods/1915", "#1915" ya da "1915" → mod numarası. */
function parseModRef(text: string): number | null {
  const url = text.match(/nexusmods\.com\/stardewvalley\/mods\/(\d+)/i);
  if (url) return Number(url[1]);
  const id = text.match(/^#?(\d{1,7})$/);
  return id ? Number(id[1]) : null;
}

export default function Discover() {
  useStardewSync();
  const t = useS();
  const { input, query, sort, category, set } = useDiscover();
  const { data: env } = useEnv();
  const { byNexus, updateOf } = useModIndex();
  const cats = useQuery({ queryKey: [GAME, "nexus-categories"], queryFn: api.nexusCategories, staleTime: 3600_000 });
  const search = useInfiniteQuery({
    queryKey: [GAME, "nexus-search", query, sort, category],
    queryFn: ({ pageParam }) => api.nexusSearch(query, sort, category, pageParam),
    initialPageParam: 0,
    getNextPageParam: (last, all) => {
      const loaded = all.reduce((n, p) => n + p.mods.length, 0);
      return last.mods.length > 0 && loaded < last.total ? loaded : undefined;
    },
    staleTime: 5 * 60_000,
  });
  const mods = useMemo(() => {
    // Sayfalar arasında kayan sonuçlar aynı modu iki kez getirebilir.
    const seen = new Set<number>();
    return (search.data?.pages ?? []).flatMap((p) => p.mods).filter((m) => !seen.has(m.modId) && seen.add(m.modId));
  }, [search.data]);
  const total = search.data?.pages[0]?.total ?? 0;
  const allTotal = useDiscover((x) => x.allTotal);
  useEffect(() => {
    if (!query && !category && search.data) set({ allTotal: total });
  }, [query, category, search.data, total, set]);
  const allCount = allTotal ?? undefined;

  const submit = (raw: string) => {
    const text = raw.trim();
    if (/^nxm:\/\//i.test(text)) {
      useUi.getState().pushNxm({ url: text, game: GAME });
      set({ input: "" });
      return;
    }
    const ref = parseModRef(text);
    if (ref !== null) {
      openNexusMod(ref);
      return;
    }
    set({ query: text });
  };

  const noSmapi = env !== undefined && !!env.gamePath && !env.smapi.installed;

  return (
    <Page>
      <PageHeader title={t.discover.title} subtitle={allCount ? t.discover.subtitle(num(allCount)) : t.discover.subtitleShort} />

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit(input);
        }}
      >
        <Input
          className="h-11 flex-1 rounded-[12px]"
          inputClassName="text-[14px]"
          icon={<Search className="size-4" />}
          value={input}
          placeholder={t.discover.placeholder}
          onChange={(e) => set({ input: e.target.value })}
          onPaste={(e) => {
            // Nexus bağlantısı yapıştırılınca Enter beklemeden sayfasını aç.
            const text = e.clipboardData.getData("text");
            if (parseModRef(text.trim()) !== null && /nexusmods\.com/i.test(text)) {
              e.preventDefault();
              submit(text);
            }
          }}
          trailing={
            input && (
              <IconButton
                label={t.mods.clear}
                size="sm"
                className="-mr-1.5"
                onClick={() => set({ input: "", query: "" })}
              >
                <X className="size-3.5" />
              </IconButton>
            )
          }
        />
        <Button type="submit" variant="primary" size="lg" icon={<ArrowRight className="size-4" />}>
          {t.discover.search}
        </Button>
      </form>

      <AccessBanner />
      {noSmapi && (
        <div className="card mt-4 flex items-center gap-4 border-warn/30 px-5 py-3.5">
          <Wrench className="size-5 shrink-0 text-warn" />
          <p className="flex-1 text-[12.5px] text-fg-2">{t.discover.smapiMissing}</p>
          <Button size="sm" variant="primary" icon={<Wrench className="size-3.5" />} onClick={installSmapi}>
            {t.mods.installSmapi}
          </Button>
        </div>
      )}

      <div className="mt-5 flex gap-1.5 overflow-x-auto pb-1 pr-8 [mask-image:linear-gradient(to_right,black_94%,transparent)] [scrollbar-width:none]">
        <Chip active={category === null} onClick={() => set({ category: null })} label={t.discover.allCategories} count={allCount} />
        {cats.isLoading && Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-8 w-24 shrink-0 rounded-full" />)}
        {cats.data?.map((c) => (
          <Chip key={c.name} active={category === c.name} onClick={() => set({ category: category === c.name ? null : c.name })} label={categoryLabel(t, c.name)} count={c.count} />
        ))}
      </div>

      <div className="mb-4 mt-3 flex flex-wrap items-center gap-3">
        <Segmented<Sort>
          id="sdv-discover-sort"
          value={sort}
          onChange={(v) => set({ sort: v })}
          options={[
            { value: "downloads", label: query ? t.discover.sortRelevant : t.discover.sortPopular },
            { value: "updated", label: t.discover.sortUpdated },
            { value: "endorsements", label: t.discover.sortEndorsed },
            { value: "new", label: t.discover.sortNew },
          ]}
        />
        {search.data && <span className="tabular text-[12px] text-muted">{t.discover.results(num(total), query)}</span>}
        {query && (
          <button className="text-[12px] text-accent hover:underline" onClick={() => set({ input: "", query: "" })}>
            {t.discover.clearSearch}
          </button>
        )}
      </div>

      {search.isLoading ? (
        <Grid>
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-[268px] rounded-[18px]" />
          ))}
        </Grid>
      ) : search.isError ? (
        <div className="card">
          <EmptyState
            icon={<Compass className="size-6" />}
            title={t.discover.errorTitle}
            action={
              <Button icon={<RefreshCw className="size-4" />} onClick={() => search.refetch()}>
                {t.discover.retry}
              </Button>
            }
          >
            {errorMessage(search.error)}
          </EmptyState>
        </div>
      ) : mods.length === 0 ? (
        <div className="card">
          <EmptyState icon={<Search className="size-6" />} title={t.discover.noResultsTitle}>
            {t.discover.noResultsBody}
          </EmptyState>
        </div>
      ) : (
        <div className="pb-16">
          <Grid>
            {mods.map((m) => {
              const installed = byNexus.get(m.modId);
              return <ModCard key={m.modId} mod={m} installed={installed} hasUpdate={!!(installed && updateOf(installed)?.hasUpdate)} />;
            })}
          </Grid>
          {search.hasNextPage && (
            <div className="mt-6 flex justify-center">
              <Button loading={search.isFetchingNextPage} onClick={() => search.fetchNextPage()}>
                {t.discover.showMore}
              </Button>
            </div>
          )}
        </div>
      )}
    </Page>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-[repeat(auto-fill,minmax(232px,1fr))] gap-4">{children}</div>;
}

function Chip({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count?: number }) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        "flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-medium transition-colors",
        active ? "accent-soft border-[color-mix(in_oklab,var(--accent)_40%,transparent)] text-fg" : "border-line bg-surface-2/60 text-fg-2 hover:border-line-strong hover:text-fg",
      )}
    >
      {label}
      {count !== undefined && <span className={clsx("tabular text-[11px]", active ? "text-fg-2" : "text-muted")}>{num(count)}</span>}
    </button>
  );
}

/** Nexus hesabının durumuna göre tek satırlık yönlendirme (Premium'da gizli). */
function AccessBanner() {
  const t = useS();
  const { data: nexus } = useNexus();
  const { data: nxm } = useNxmStatus();
  if (!nexus || !nxm) return null;
  const goSettings = () => useUi.getState().go({ kind: "settings" });
  if (nexus.hasKey && nexus.user?.isPremium) return null;
  const [title, body, action] = !nexus.hasKey
    ? [t.discover.noKeyTitle, t.discover.noKeyBody, <Button key="k" size="sm" variant="subtle" icon={<KeyRound className="size-3.5" />} onClick={goSettings}>{t.discover.addKey}</Button>]
    : !nxm.registered
      ? [t.discover.connectTitle, t.discover.connectBody, <Button key="c" size="sm" variant="primary" icon={<Link2 className="size-3.5" />} onClick={() => void registerNxm()}>{t.discover.connectAction}</Button>]
      : [null, t.discover.freeBody, null];
  return (
    <div className="mt-4 flex items-center gap-3 rounded-[14px] border border-line bg-surface-2/50 px-4 py-3">
      <KeyRound className="size-4 shrink-0 text-accent" />
      <div className="min-w-0 flex-1 text-[12.5px] text-fg-2">
        {title && <span className="font-medium text-fg">{title} · </span>}
        {body}
      </div>
      {action}
    </div>
  );
}

function ModCard({ mod: m, installed, hasUpdate }: { mod: NexusMod; installed: ModInfo | undefined; hasUpdate: boolean }) {
  const t = useS();
  const job = useModJob(m.modId);
  const busy = !!job && !["done", "failed", "cancelled", "review"].includes(job.stage);
  return (
    <motion.div
      layout="position"
      role="button"
      tabIndex={0}
      onClick={() => openNexusMod(m.modId)}
      onKeyDown={(e) => e.key === "Enter" && openNexusMod(m.modId)}
      className="group relative flex cursor-pointer flex-col overflow-hidden rounded-[18px] border border-line bg-surface outline-none transition-[transform,border-color] duration-200 hover:-translate-y-0.5 hover:border-line-strong focus-visible:ring-2 focus-visible:ring-accent/50"
    >
      <div className="relative aspect-[16/9] overflow-hidden bg-surface-2">
        {m.thumbnailUrl ? (
          <img src={m.thumbnailUrl} alt="" loading="lazy" draggable={false} className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.05]" />
        ) : (
          <PixelCover seed={String(m.modId)} kind="smapi" className="size-full" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/5 to-transparent" />
        <div className="absolute left-2 top-2 flex gap-1">
          {hasUpdate ? (
            <ImageTag icon={<ArrowUpCircle className="size-3 text-accent" />}>{t.discover.updateBadge}</ImageTag>
          ) : (
            installed && <ImageTag icon={<BadgeCheck className="size-3 text-ok" />}>{t.discover.installed}</ImageTag>
          )}
        </div>
        <span className="absolute right-2 top-2">
          <ImageTag mono>{m.version}</ImageTag>
        </span>
        <div className="absolute inset-x-3 bottom-2 line-clamp-2 text-[15px] font-semibold leading-tight text-white [text-shadow:0_1px_2px_rgb(0_0_0/0.6)]">{decodeEntities(m.name)}</div>
      </div>
      <div className="flex flex-1 flex-col px-3 pb-3 pt-2.5">
        <div className="truncate text-[12px] text-muted">
          {m.author}
          {m.category && <span> · {categoryLabel(t, m.category)}</span>}
        </div>
        <p className="mt-1.5 line-clamp-2 flex-1 text-[12.5px] leading-relaxed text-fg-2">{decodeEntities(m.summary)}</p>
        <div className="mt-2.5 flex items-center gap-3 text-[11.5px] text-muted">
          <span className="tabular flex items-center gap-1" title={`${t.discover.downloads(num(m.downloads))} · ${t.discover.endorsements(num(m.endorsements))}`}>
            <Download className="size-3.5" />
            {compact(m.downloads)}
          </span>
          <span className="truncate" title={t.discover.updatedAgo(ago(Date.parse(m.updatedAt)))}>
            {monthYear(m.updatedAt)}
          </span>
          <div className="ml-auto" onClick={(e) => e.stopPropagation()}>
            {busy ? (
              <Spinner className="size-4" />
            ) : (
              <IconButton
                label={hasUpdate ? t.discover.update : installed ? t.discover.reinstall : t.discover.get}
                size="sm"
                className={clsx("transition-opacity", hasUpdate ? "text-accent" : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100")}
                onClick={() => getFromNexus(m.modId, { name: m.name })}
              >
                {hasUpdate ? <ArrowUpCircle className="size-4" /> : <Download className="size-4" />}
              </IconButton>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/** Görselin üstündeki etiket: iki temada da koyu perde + beyaz yazı. */
function ImageTag({ icon, mono, children }: { icon?: React.ReactNode; mono?: boolean; children: React.ReactNode }) {
  return (
    <span className={clsx("inline-flex h-5 items-center gap-1 rounded-md border border-white/15 bg-black/65 px-1.5 text-[11px] font-medium text-white backdrop-blur-md", mono && "font-mono")}>
      {icon}
      {children}
    </span>
  );
}

/** "2026-03-14T…" → "Mar 2026" (kartta dar yer için). */
function monthYear(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString(locale(), { month: "short", year: "numeric" });
}
