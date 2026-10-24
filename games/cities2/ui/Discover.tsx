// Mod bul: Paradox Mods kataloğu (oyunun resmî platformu; arama, etiket, sıralama, mod sayfası çekmecesi)
// ve Nexus Mods (indirilip güvenlik hattından geçerek yerel mod olarak kurulur). Paradox Mods bağlantısı
// ya da "#numara" yapıştırılırsa doğrudan mod sayfası açılır.

import { useEffect, useMemo } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { motion } from "motion/react";
import { ArrowRight, BadgeCheck, Compass, Download, ExternalLink, Info, RefreshCw, Search, TriangleAlert, Users, X } from "lucide-react";
import clsx from "clsx";
import { create } from "zustand";
import { ago, locale, num } from "@/lib/format";
import { errorMessage } from "@/lib/ipc";
import { openUrl } from "@/shell/actions";
import { Button, EmptyState, IconButton, Input, PageHeader, Segmented, Skeleton, Spinner } from "@/ui";
import { api } from "./api";
import { useS } from "./i18n";
import { compact, decodeEntities, getFromNexus, nexusModUrl, useModJob } from "./nexus";
import { openPdxMod, parsePdxRef } from "./paradox";
import { GAME, modCompat, tagLabel, useCitiesSync, useEnv, useModIndex } from "./queries";
import { CompatBadge, ImageTag, Page, Rating } from "./shared";
import type { NexusMod, PdxMeta, PdxSort } from "./types";

const TAGS = ["Code Mod", "Map", "Savegame", "Prefab", "Building", "Prop", "Vehicle", "Attraction", "Park", "Theme", "Tree"];
type Source = "paradox" | "nexus";
type NexusSort = "downloads" | "updated" | "endorsements" | "new";

/** Sayfadan çıkıp dönünce arama ve süzgeç yerinde kalsın. */
interface DiscoverState {
  source: Source;
  input: string;
  query: string;
  sort: PdxSort;
  tag: string | null;
  nexusSort: NexusSort;
  total: number | null;
}

const useDiscover = create<DiscoverState & { set: (p: Partial<DiscoverState>) => void }>((set) => ({
  source: "paradox",
  input: "",
  query: "",
  sort: "best",
  tag: null,
  nexusSort: "downloads",
  total: null,
  set: (p) => set(p),
}));

export default function Discover() {
  useCitiesSync();
  const t = useS();
  const { source, input, total, set } = useDiscover();

  const submit = (raw: string) => {
    const ref = parsePdxRef(raw);
    if (ref && source === "paradox") {
      openPdxMod(ref);
      return;
    }
    set({ query: raw.trim() });
  };

  return (
    <Page className="pb-16">
      <PageHeader title={t.discover.title} subtitle={total ? t.discover.subtitle(num(total)) : t.discover.subtitleShort} />

      <div className="mb-4 flex items-center gap-3">
        <Segmented<Source>
          id="cs2-discover-source"
          value={source}
          onChange={(v) => set({ source: v, input: "", query: "" })}
          options={[
            { value: "paradox", label: t.discover.sources.paradox },
            { value: "nexus", label: t.discover.sources.nexus },
          ]}
        />
      </div>

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
          placeholder={source === "paradox" ? t.discover.placeholder : t.discover.nexusPlaceholder}
          onChange={(e) => set({ input: e.target.value })}
          onPaste={(e) => {
            const text = e.clipboardData.getData("text");
            if (source === "paradox" && parsePdxRef(text)) {
              e.preventDefault();
              submit(text);
            }
          }}
          trailing={
            input && (
              <IconButton label={t.mods.clear} size="sm" className="-mr-1.5" onClick={() => set({ input: "", query: "" })}>
                <X className="size-3.5" />
              </IconButton>
            )
          }
        />
        <Button type="submit" variant="primary" size="lg" icon={<ArrowRight className="size-4" />}>
          {t.discover.search}
        </Button>
      </form>

      {source === "paradox" ? <ParadoxResults /> : <NexusResults />}
    </Page>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">{children}</div>;
}

function Chip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        "flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-medium transition-colors",
        active ? "accent-soft border-[color-mix(in_oklab,var(--accent)_40%,transparent)] text-fg" : "border-line bg-surface-2/60 text-fg-2 hover:border-line-strong hover:text-fg",
      )}
    >
      {label}
    </button>
  );
}

function LoadingGrid() {
  return (
    <Grid>
      {Array.from({ length: 8 }).map((_, i) => (
        <Skeleton key={i} className="h-[268px] rounded-[18px]" />
      ))}
    </Grid>
  );
}

function ErrorCard({ error, retry }: { error: unknown; retry: () => void }) {
  const t = useS();
  return (
    <div className="card">
      <EmptyState
        icon={<Compass className="size-6" />}
        title={t.discover.errorTitle}
        action={
          <Button icon={<RefreshCw className="size-4" />} onClick={retry}>
            {t.common.retry}
          </Button>
        }
      >
        {errorMessage(error)}
      </EmptyState>
    </div>
  );
}

// ───────────── Paradox Mods ─────────────

function ParadoxResults() {
  const t = useS();
  const { query, sort, tag, set } = useDiscover();
  const { data: env } = useEnv();
  const { byPdx } = useModIndex();
  const search = useInfiniteQuery({
    queryKey: [GAME, "pdx-search", query, sort, tag],
    queryFn: ({ pageParam }) => api.pdxSearch(query, sort, tag, pageParam),
    initialPageParam: 0,
    getNextPageParam: (last, all) => {
      const loaded = all.reduce((n, p) => n + p.mods.length, 0);
      return last.mods.length > 0 && loaded < last.total ? last.page + 1 : undefined;
    },
    staleTime: 5 * 60_000,
  });
  const mods = useMemo(() => {
    const seen = new Set<string>();
    return (search.data?.pages ?? []).flatMap((p) => p.mods).filter((m) => !seen.has(m.modId) && seen.add(m.modId));
  }, [search.data]);
  const total = search.data?.pages[0]?.total ?? 0;
  useEffect(() => {
    if (!query && !tag && search.data) set({ total });
  }, [query, tag, search.data, total, set]);
  const signedOut = env?.account.loggedIn === false;

  return (
    <>
      <div className={clsx("mt-4 flex items-start gap-3 rounded-[14px] border px-4 py-3", signedOut ? "border-warn/30 bg-warn/5" : "border-line bg-surface-2/50")}>
        {signedOut ? <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warn" /> : <Info className="mt-0.5 size-4 shrink-0 text-accent" />}
        <div className="min-w-0 flex-1 text-[12.5px] text-fg-2">
          <span className="font-medium text-fg">{t.discover.howTitle} · </span>
          {t.discover.howBody}
          {signedOut && <span className="text-warn"> {t.discover.howSignedOut}</span>}
        </div>
      </div>

      <div className="mt-5 flex gap-1.5 overflow-x-auto pb-1 pr-8 [mask-image:linear-gradient(to_right,black_94%,transparent)] [scrollbar-width:none]">
        <Chip active={tag === null} onClick={() => set({ tag: null })} label={t.discover.allTags} />
        {TAGS.map((x) => (
          <Chip key={x} active={tag === x} onClick={() => set({ tag: tag === x ? null : x })} label={tagLabel(x)} />
        ))}
      </div>

      <div className="mb-4 mt-3 flex flex-wrap items-center gap-3">
        <Segmented<PdxSort>
          id="cs2-pdx-sort"
          value={sort}
          onChange={(v) => set({ sort: v })}
          options={(["best", "popularity", "created", "updated", "rating"] as PdxSort[]).map((v) => ({ value: v, label: t.discover.sort[v] }))}
        />
        {search.data && <span className="tabular text-[12px] text-muted">{t.discover.results(num(total), query)}</span>}
        {query && (
          <button className="text-[12px] text-accent hover:underline" onClick={() => set({ input: "", query: "" })}>
            {t.discover.clearSearch}
          </button>
        )}
      </div>

      {search.isLoading ? (
        <LoadingGrid />
      ) : search.isError ? (
        <ErrorCard error={search.error} retry={() => search.refetch()} />
      ) : mods.length === 0 ? (
        <div className="card">
          <EmptyState icon={<Search className="size-6" />} title={t.discover.noResultsTitle}>
            {t.discover.noResultsBody}
          </EmptyState>
        </div>
      ) : (
        <>
          <Grid>
            {mods.map((m) => (
              <PdxCard key={m.modId} mod={m} installed={byPdx.has(m.modId)} game={env?.version} />
            ))}
          </Grid>
          {search.hasNextPage && (
            <div className="mt-6 flex justify-center">
              <Button loading={search.isFetchingNextPage} onClick={() => search.fetchNextPage()}>
                {t.discover.showMore}
              </Button>
            </div>
          )}
        </>
      )}
    </>
  );
}

function PdxCard({ mod: m, installed, game }: { mod: PdxMeta; installed: boolean; game: string | null | undefined }) {
  const t = useS();
  const state = modCompat({ tags: m.tags, requiredVersion: m.requiredVersion }, game);
  return (
    <motion.div
      layout="position"
      role="button"
      tabIndex={0}
      onClick={() => openPdxMod(m.modId)}
      onKeyDown={(e) => e.key === "Enter" && openPdxMod(m.modId)}
      className="group relative flex cursor-pointer flex-col overflow-hidden rounded-[18px] border border-line bg-surface outline-none transition-[transform,border-color] duration-200 hover:-translate-y-0.5 hover:border-line-strong focus-visible:ring-2 focus-visible:ring-accent/50"
    >
      <div className="relative aspect-[16/9] overflow-hidden bg-surface-2">
        {m.thumbnail && <img src={m.thumbnail} alt="" loading="lazy" draggable={false} className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.05]" />}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/5 to-transparent" />
        <div className="absolute left-2 top-2 flex flex-wrap gap-1">
          {m.tags[0] && <ImageTag>{tagLabel(m.tags[0])}</ImageTag>}
          {installed && <ImageTag icon={<BadgeCheck className="size-3 text-ok" />}>{t.discover.installed}</ImageTag>}
        </div>
        {m.userVersion && (
          <span className="absolute right-2 top-2">
            <ImageTag mono>{m.userVersion.length > 12 ? `${m.userVersion.slice(0, 12)}…` : m.userVersion}</ImageTag>
          </span>
        )}
        <div className="absolute inset-x-3 bottom-2 line-clamp-2 text-[15px] font-semibold leading-tight text-white [text-shadow:0_1px_2px_rgb(0_0_0/0.6)]">{m.name}</div>
      </div>
      <div className="flex flex-1 flex-col px-3 pb-3 pt-2.5">
        <div className="flex items-center gap-1.5 truncate text-[12px] text-muted">
          <span className="truncate">{m.author}</span>
          <CompatBadge state={state} />
        </div>
        <p className="mt-1.5 line-clamp-2 flex-1 text-[12.5px] leading-relaxed text-fg-2">{m.summary}</p>
        <div className="mt-2.5 flex items-center gap-3 text-[11.5px] text-muted">
          <span className="tabular flex items-center gap-1" title={t.discover.subscribers(num(m.subscriptions))}>
            <Users className="size-3.5" />
            {compact(m.subscriptions)}
          </span>
          <Rating value={m.rating} total={m.ratingsTotal} />
          {m.updated && (
            <span className="ml-auto truncate" title={ago(Date.parse(m.updated))}>
              {monthYear(m.updated)}
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ───────────── Nexus Mods ─────────────

function NexusResults() {
  const t = useS();
  const { query, nexusSort, set } = useDiscover();
  const search = useInfiniteQuery({
    queryKey: [GAME, "nexus-search", query, nexusSort],
    queryFn: ({ pageParam }) => api.nexusSearch(query, nexusSort, null, pageParam),
    initialPageParam: 0,
    getNextPageParam: (last, all) => {
      const loaded = all.reduce((n, p) => n + p.mods.length, 0);
      return last.mods.length > 0 && loaded < last.total ? loaded : undefined;
    },
    staleTime: 5 * 60_000,
  });
  const mods = useMemo(() => {
    const seen = new Set<number>();
    return (search.data?.pages ?? []).flatMap((p) => p.mods).filter((m) => !seen.has(m.modId) && seen.add(m.modId));
  }, [search.data]);
  const total = search.data?.pages[0]?.total ?? 0;

  return (
    <>
      <div className="mt-4 flex items-start gap-3 rounded-[14px] border border-line bg-surface-2/50 px-4 py-3">
        <Info className="mt-0.5 size-4 shrink-0 text-accent" />
        <p className="text-[12.5px] text-fg-2">{t.discover.nexusNote}</p>
      </div>
      <div className="mb-4 mt-4 flex flex-wrap items-center gap-3">
        <Segmented<NexusSort>
          id="cs2-nexus-sort"
          value={nexusSort}
          onChange={(v) => set({ nexusSort: v })}
          options={(["downloads", "updated", "endorsements", "new"] as NexusSort[]).map((v) => ({ value: v, label: t.discover.nexusSort[v] }))}
        />
        {search.data && <span className="tabular text-[12px] text-muted">{t.discover.results(num(total), query)}</span>}
      </div>
      {search.isLoading ? (
        <LoadingGrid />
      ) : search.isError ? (
        <ErrorCard error={search.error} retry={() => search.refetch()} />
      ) : mods.length === 0 ? (
        <div className="card">
          <EmptyState icon={<Search className="size-6" />} title={t.discover.noResultsTitle}>
            {t.discover.noResultsBody}
          </EmptyState>
        </div>
      ) : (
        <>
          <Grid>
            {mods.map((m) => (
              <NexusCard key={m.modId} mod={m} />
            ))}
          </Grid>
          {search.hasNextPage && (
            <div className="mt-6 flex justify-center">
              <Button loading={search.isFetchingNextPage} onClick={() => search.fetchNextPage()}>
                {t.discover.showMore}
              </Button>
            </div>
          )}
        </>
      )}
    </>
  );
}

function NexusCard({ mod: m }: { mod: NexusMod }) {
  const t = useS();
  const job = useModJob(m.modId);
  const busy = !!job && !["done", "failed", "cancelled", "review"].includes(job.stage);
  const name = decodeEntities(m.name);
  return (
    <div className="group relative flex flex-col overflow-hidden rounded-[18px] border border-line bg-surface transition-[transform,border-color] duration-200 hover:-translate-y-0.5 hover:border-line-strong">
      <button className="relative aspect-[16/9] overflow-hidden bg-surface-2 text-left" onClick={() => openUrl(nexusModUrl(m.modId))}>
        {m.thumbnailUrl && <img src={m.thumbnailUrl} alt="" loading="lazy" draggable={false} className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.05]" />}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/5 to-transparent" />
        {m.category && (
          <span className="absolute left-2 top-2">
            <ImageTag>{m.category}</ImageTag>
          </span>
        )}
        <span className="absolute right-2 top-2">
          <ImageTag mono>{m.version}</ImageTag>
        </span>
        <div className="absolute inset-x-3 bottom-2 line-clamp-2 text-[15px] font-semibold leading-tight text-white [text-shadow:0_1px_2px_rgb(0_0_0/0.6)]">{name}</div>
      </button>
      <div className="flex flex-1 flex-col px-3 pb-3 pt-2.5">
        <div className="truncate text-[12px] text-muted">{m.author}</div>
        <p className="mt-1.5 line-clamp-2 flex-1 text-[12.5px] leading-relaxed text-fg-2">{decodeEntities(m.summary)}</p>
        <div className="mt-2.5 flex items-center gap-2 text-[11.5px] text-muted">
          <span className="tabular flex items-center gap-1" title={t.discover.downloads(num(m.downloads))}>
            <Download className="size-3.5" />
            {compact(m.downloads)}
          </span>
          <span className="truncate">{monthYear(m.updatedAt)}</span>
          <div className="ml-auto flex items-center gap-1">
            <IconButton label={t.discover.openOnNexus} size="sm" onClick={() => openUrl(nexusModUrl(m.modId))}>
              <ExternalLink className="size-3.5" />
            </IconButton>
            {busy ? (
              <Spinner className="size-4" />
            ) : (
              <Button size="sm" variant="subtle" icon={<Download className="size-3.5" />} onClick={() => getFromNexus(m.modId, name)}>
                {t.discover.get}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** "2026-03-14T…" → "Mar 2026" (kartta dar yer için). */
function monthYear(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString(locale(), { month: "short", year: "numeric" });
}
