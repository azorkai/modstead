import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowRight,
  BadgeCheck,
  Download,
  ExternalLink,
  Heart,
  KeyRound,
  Link2,
  Search,
  ShieldAlert,
  ShieldCheck,
  Star,
  X,
} from "lucide-react";
import clsx from "clsx";
import { GithubIcon } from "../components/icons";
import { toast } from "sonner";
import { api, errorText } from "../api";
import type { GhRepo, NexusMod, NexusModPage } from "../types";
import { fmtBytes, fmtCompact, fmtDate, fmtRelative } from "../format";
import { nexusFileUrl, parseInput } from "../links";
import { useApp, type DiscoverSource } from "../store";
import { useNexus, useSettings } from "@/lib/queries";
import { useUi } from "@/lib/store";
import { Badge, Button, EmptyState, IconButton, Input, Segmented, Spinner } from "../components/kit";
import { useT, type Messages } from "../i18n";
import { SteamDoor, SteamResults } from "./DiscoverSteam";

// Nexus/GitHub'dan gelen içerik (mod adı, özet, yazar, dosya açıklaması, tarama durumu) olduğu gibi gösterilir.

type Sort = "downloads" | "updated" | "endorsements" | "new";

export function DiscoverView() {
  const t = useT();
  const discoverQuery = useApp((s) => s.discoverQuery);
  const { data: nexus } = useNexus();
  const { data: settings } = useSettings();
  const source = useApp((s) => s.discoverSource);
  const setSource = useApp((s) => s.setDiscoverSource);
  const lookupSteam = useApp((s) => s.lookupSteam);
  const setSteamInput = useApp((s) => s.setSteamInput);
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("downloads");
  const [mods, setMods] = useState<NexusMod[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [openMod, setOpenMod] = useState<number | null>(null);
  const [repo, setRepo] = useState<string | null>(null);
  const seq = useRef(0);

  const run = useCallback(async (q: string, s: Sort, offset = 0) => {
    const my = ++seq.current;
    setLoading(true);
    try {
      const page = await api.nexusSearch(q, q ? (s === "downloads" ? "relevance" : s) : s, offset);
      if (my !== seq.current) return;
      setTotal(page.total);
      setMods((prev) => (offset === 0 ? page.mods : [...prev, ...page.mods]));
    } catch (e) {
      if (my === seq.current) toast.error(errorText(e));
    } finally {
      if (my === seq.current) setLoading(false);
    }
  }, []);

  /** Her iki kutu da buradan geçer: Steam bağlantısı/8+ haneli numara Steam kapısına, diğerleri Nexus'a. */
  const submit = useCallback(
    (raw: string, from: DiscoverSource = "nexus") => {
      const p = parseInput(raw);
      if (p.kind === "steam") {
        if (from === "nexus") setInput("");
        setSource("steam");
        setSteamInput(p.input);
        void lookupSteam(p.input);
        return;
      }
      if (from === "steam") {
        // Workshop'ta metin araması Steam'de yapılır; Nexus/GitHub/nxm girdileri Nexus tarafına geçer.
        if (p.kind === "search") {
          if (p.query) toast(t.steam.needLink);
          return;
        }
        setSource("nexus");
        setInput(raw.trim());
      }
      if (p.kind === "nexus") setOpenMod(p.modId);
      else if (p.kind === "github") setRepo(p.repo);
      else if (p.kind === "nxm") useUi.getState().pushNxm({ url: p.url, game: "bannerlord" });
      else {
        setQuery(p.query);
        run(p.query, sort);
      }
    },
    [run, sort, t, setSource, setSteamInput, lookupSteam],
  );

  useEffect(() => {
    run(query, sort);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sort]);

  useEffect(() => {
    if (discoverQuery) {
      setInput(discoverQuery.text);
      submit(discoverQuery.text);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [discoverQuery?.nonce]);

  const installedNexus = useInstalledNexusIds();

  return (
    <div className="mx-auto flex max-w-[1180px] flex-col">
      <header className="mb-6">
        <div className="flex items-end gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="text-display text-[26px] font-semibold leading-tight tracking-tight text-fg">{t.nav.discover}</h1>
            <p className="mt-2 text-[13px] text-fg-2">{source === "steam" ? t.steam.intro : t.discover.intro}</p>
          </div>
          <Segmented<DiscoverSource>
            value={source}
            onChange={setSource}
            options={[
              { value: "nexus", label: t.discover.sourceNexus },
              { value: "steam", label: t.discover.sourceSteam },
            ]}
          />
        </div>
        {source === "steam" ? (
          <SteamDoor onSubmit={(raw) => submit(raw, "steam")} />
        ) : (
          <>
            <form
              className="mt-5 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                submit(input);
              }}
            >
              <Input
                icon={<Search className="size-4" />}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onPaste={(e) => {
                  // Steam Workshop bağlantısı yapıştırılınca Enter beklemeden Steam kapısına geç.
                  const text = e.clipboardData.getData("text");
                  if (parseInput(text).kind === "steam") {
                    e.preventDefault();
                    submit(text);
                  }
                }}
                placeholder={t.discover.placeholder}
                className="h-11 flex-1 rounded-xl text-[14px]"
                trailing={
                  input && (
                    <button
                      type="button"
                      className="text-muted hover:text-fg"
                      onClick={() => {
                        setInput("");
                        if (query) {
                          setQuery("");
                          run("", sort);
                        }
                      }}
                      aria-label={t.common.clear}
                    >
                      <X className="size-4" />
                    </button>
                  )
                }
              />
              <Button type="submit" variant="primary" size="lg" icon={<ArrowRight className="size-4" />}>
                {t.discover.search}
              </Button>
            </form>
            <NexusBanner
              hasKey={!!nexus?.hasKey}
              premium={!!nexus?.user?.isPremium}
              nxm={!!settings?.nxmRegistered}
              onSettings={() => useUi.getState().go({ kind: "settings" })}
            />
            <div className="mt-5 flex items-center gap-3">
              <Segmented<Sort>
                value={sort}
                onChange={setSort}
                options={[
                  { value: "downloads", label: query ? t.discover.sortRelevance : t.discover.sortPopular },
                  { value: "updated", label: t.discover.sortUpdated },
                  { value: "endorsements", label: t.discover.sortEndorsed },
                  { value: "new", label: t.discover.sortNew },
                ]}
              />
              <span className="text-[12px] text-muted tabular">{t.discover.results(total, fmtCompact(total), query)}</span>
            </div>
          </>
        )}
      </header>

      <div>
        {source === "steam" ? (
          <SteamResults />
        ) : mods.length === 0 && loading ? (
          <Grid>
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="card overflow-hidden">
                <div className="skeleton aspect-[16/9] rounded-none" />
                <div className="space-y-2 p-4">
                  <div className="skeleton h-4 w-2/3" />
                  <div className="skeleton h-3 w-full" />
                </div>
              </div>
            ))}
          </Grid>
        ) : mods.length === 0 ? (
          <EmptyState icon={<Search className="size-6" />} title={t.common.noResults}>
            {t.discover.noResultsBody}
          </EmptyState>
        ) : (
          <>
            <Grid>
              {mods.map((m) => (
                <ModCard key={m.modId} mod={m} installed={installedNexus.has(m.modId)} onOpen={() => setOpenMod(m.modId)} />
              ))}
            </Grid>
            {mods.length < total && (
              <div className="mt-6 flex justify-center">
                <Button loading={loading} onClick={() => run(query, sort, mods.length)}>
                  {t.discover.showMore}
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      <NexusModSheet modId={openMod} onClose={() => setOpenMod(null)} installed={openMod !== null && installedNexus.has(openMod)} />
      <GithubSheet repo={repo} onClose={() => setRepo(null)} />
    </div>
  );
}

function useInstalledNexusIds() {
  const overview = useApp((s) => s.overview);
  return useMemo(() => {
    const ids = new Set<number>();
    for (const m of overview?.modules ?? []) {
      for (const s of m.updateSources) if (s.provider === "nexus") ids.add(Number(s.value));
    }
    for (const r of Object.values(overview?.installs ?? {})) {
      if (r.source.kind === "nexus") ids.add(r.source.modId);
    }
    return ids;
  }, [overview]);
}

function Grid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-4">{children}</div>;
}

function NexusBanner({ hasKey, premium, nxm, onSettings }: { hasKey: boolean; premium: boolean; nxm: boolean; onSettings: () => void }) {
  const t = useT();
  if (hasKey && (premium || nxm)) return null;
  return (
    <div className="mt-4 flex items-center gap-3 rounded-xl border border-accent/20 bg-accent/[0.06] px-4 py-3">
      <KeyRound className="size-4 shrink-0 text-accent" />
      <p className="flex-1 text-[12.5px] text-fg-2">{!hasKey ? t.discover.bannerNoKey : t.discover.bannerFree}</p>
      <Button size="sm" variant="subtle" onClick={onSettings}>
        {t.nav.settings}
      </Button>
    </div>
  );
}

function ModCard({ mod, installed, onOpen }: { mod: NexusMod; installed: boolean; onOpen: () => void }) {
  const t = useT();
  return (
    <motion.button
      layout="position"
      onClick={onOpen}
      className="card group flex flex-col overflow-hidden text-left transition-[border,transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-md"
    >
      <div className="relative aspect-[16/9] overflow-hidden bg-surface-2">
        {mod.thumbnailUrl ? (
          <img
            src={mod.thumbnailUrl}
            alt=""
            loading="lazy"
            draggable={false}
            className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
          />
        ) : (
          <div className="flex size-full items-center justify-center text-muted">
            <Download className="size-6" />
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/60 to-transparent" />
        {installed && (
          <span className="absolute left-2.5 top-2.5">
            <Badge tone="ok" className="bg-black/75! border-white/15! backdrop-blur-md" icon={<BadgeCheck className="size-3" />}>
              {t.common.installed}
            </Badge>
          </span>
        )}
        <span className="absolute bottom-2 right-2.5 font-mono text-[11px] text-white/85">{mod.version}</span>
      </div>
      <div className="flex flex-1 flex-col p-3.5">
        <div className="line-clamp-1 text-[13.5px] font-semibold text-fg">{mod.name}</div>
        <div className="mt-0.5 text-[11.5px] text-muted">{mod.author}</div>
        <p className="mt-2 line-clamp-2 flex-1 text-[12px] leading-relaxed text-fg-2">{mod.summary}</p>
        <div className="mt-3 flex items-center gap-3 text-[11.5px] text-muted tabular">
          <span className="flex items-center gap-1">
            <Download className="size-3.5" />
            {fmtCompact(mod.downloads)}
          </span>
          <span className="flex items-center gap-1">
            <Heart className="size-3.5" />
            {fmtCompact(mod.endorsements)}
          </span>
          <span className="ml-auto">{fmtRelative(mod.updatedAt)}</span>
        </div>
      </div>
    </motion.button>
  );
}

function Sheet({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 top-11 z-40 bg-black/40 backdrop-blur-[3px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.aside
            className="fixed bottom-0 right-0 top-11 z-40 flex w-[min(620px,92vw)] flex-col border-l border-line-strong bg-surface shadow-lg"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 40 }}
          >
            {children}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

/** Nexus dosya kategorisi; bilinmeyen kategoriler ham haliyle gösterilir. */
function categoryLabel(t: Messages, cat: string): string {
  return (t.discover.categories as Record<string, string | undefined>)[cat] ?? cat;
}

function ScanBadge({ scan }: { scan: string }) {
  const t = useT();
  if (scan === "VERIFIED")
    return (
      <Badge tone="ok" icon={<ShieldCheck className="size-3" />}>
        {t.discover.nexusScanClean}
      </Badge>
    );
  if (!scan) return null;
  return (
    <Badge tone="warn" icon={<ShieldAlert className="size-3" />}>
      {scan.toLowerCase()}
    </Badge>
  );
}

function NexusModSheet({ modId, onClose, installed }: { modId: number | null; onClose: () => void; installed: boolean }) {
  const t = useT();
  const { data: nexus } = useNexus();
  const searchNexus = useApp((s) => s.searchNexus);
  const [page, setPage] = useState<NexusModPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showOld, setShowOld] = useState(false);

  useEffect(() => {
    if (modId === null) return;
    setPage(null);
    setError(null);
    setShowOld(false);
    api
      .nexusMod(modId)
      .then(setPage)
      .catch((e) => setError(errorText(e)));
  }, [modId]);

  const premium = !!nexus?.user?.isPremium;
  const canDirect = !!nexus?.hasKey && premium;

  const download = async (fileId: number) => {
    if (!page) return;
    if (canDirect) {
      try {
        await api.installNexus(page.modId, fileId);
        toast.success(t.common.downloadStarted, { description: t.discover.directStarted });
      } catch (e) {
        toast.error(errorText(e));
      }
    } else {
      await api.openUrl(nexusFileUrl(page.modId, fileId)).catch((e) => toast.error(errorText(e)));
      toast(t.common.nexusOpened, {
        description: nexus?.hasKey ? t.discover.nexusOpenedHint : t.discover.addKeyFirst,
      });
    }
  };

  const groups = useMemo(() => {
    const g = new Map<string, NexusModPage["files"]>();
    for (const f of page?.files ?? []) {
      if (f.category === "OLD_VERSION" && !showOld) continue;
      g.set(f.category, [...(g.get(f.category) ?? []), f]);
    }
    return [...g.entries()];
  }, [page, showOld]);
  const oldCount = page?.files.filter((f) => f.category === "OLD_VERSION").length ?? 0;

  return (
    <Sheet open={modId !== null} onClose={onClose}>
      {!page ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
          {error ? (
            <>
              <p className="text-[13px] text-danger">{error}</p>
              <Button onClick={onClose}>{t.common.close}</Button>
            </>
          ) : (
            <Spinner className="size-6" />
          )}
        </div>
      ) : (
        <>
          <div className="relative h-52 shrink-0 overflow-hidden bg-surface-2">
            {page.pictureUrl && <img src={page.pictureUrl} alt="" className="size-full object-cover" draggable={false} />}
            <div className="absolute inset-0 bg-gradient-to-t from-surface via-surface/40 to-transparent" />
            <IconButton label={t.common.close} onClick={onClose} className="absolute right-3 top-3 bg-black/40 text-white hover:bg-black/60 hover:text-white">
              <X className="size-4" />
            </IconButton>
            <div className="absolute inset-x-6 bottom-4">
              <div className="flex items-center gap-2">
                {installed && <Badge tone="ok">{t.common.installed}</Badge>}
                <Badge className="font-mono">{page.version}</Badge>
                <span className="text-[12px] text-fg-2">{page.author}</span>
              </div>
              <h2 className="mt-1.5 text-[24px] font-semibold leading-tight tracking-tight text-fg">{page.name}</h2>
            </div>
          </div>
          <div className="flex-1 space-y-6 overflow-y-auto px-6 pb-8 pt-4">
            <p className="selectable text-[13px] leading-relaxed text-fg-2">{page.summary}</p>
            <div className="flex flex-wrap gap-2">
              <Badge icon={<Download className="size-3" />}>{t.discover.downloads(page.downloads, fmtCompact(page.downloads))}</Badge>
              <Badge icon={<Heart className="size-3" />}>{t.discover.endorsements(page.endorsements, fmtCompact(page.endorsements))}</Badge>
              <Badge>{t.discover.updatedAgo(fmtRelative(page.updatedAt))}</Badge>
              <Button
                size="sm"
                variant="ghost"
                icon={<ExternalLink className="size-3.5" />}
                onClick={() => api.openUrl(page.url).catch((e) => toast.error(errorText(e)))}
              >
                {t.discover.openOnNexus}
              </Button>
            </div>

            {page.requirements.length > 0 && (
              <section>
                <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">{t.discover.requirements}</h4>
                <div className="flex flex-wrap gap-2">
                  {page.requirements.map((r) => (
                    <Button
                      key={`${r.modId}-${r.name}`}
                      size="sm"
                      variant="secondary"
                      icon={<Link2 className="size-3.5" />}
                      onClick={() => {
                        if (r.modId) searchNexus(String(r.modId));
                        else if (r.url) api.openUrl(r.url).catch(() => {});
                      }}
                    >
                      {r.name}
                    </Button>
                  ))}
                </div>
              </section>
            )}

            {groups.map(([cat, files]) => (
              <section key={cat}>
                <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">{categoryLabel(t, cat)}</h4>
                <div className="space-y-2">
                  {files.map((f) => (
                    <div key={f.fileId} className="rounded-xl border border-line bg-surface-2/50 p-3.5">
                      <div className="flex items-start gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-[13px] font-semibold">{f.name}</span>
                            {f.primary && <Badge tone="accent">{t.discover.recommended}</Badge>}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-muted">
                            <span className="font-mono text-fg-2">{f.version || "—"}</span>
                            <span className="tabular">{fmtBytes(f.size)}</span>
                            <span>{fmtDate(f.date)}</span>
                            <ScanBadge scan={f.scan} />
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant={f.category === "MAIN" ? "primary" : "secondary"}
                          icon={<Download className="size-3.5" />}
                          onClick={() => download(f.fileId)}
                        >
                          {canDirect ? t.common.downloadAndReview : t.discover.downloadFromNexus}
                        </Button>
                      </div>
                      {f.description && (
                        <p className="mt-2 line-clamp-3 text-[12px] leading-relaxed text-fg-2">
                          {f.description.replace(/<[^>]+>|\[\/?[a-z]+[^\]]*\]/gi, " ")}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            ))}
            {oldCount > 0 && !showOld && (
              <Button variant="ghost" size="sm" onClick={() => setShowOld(true)}>
                {t.discover.showOld(oldCount)}
              </Button>
            )}
          </div>
        </>
      )}
    </Sheet>
  );
}

function GithubSheet({ repo, onClose }: { repo: string | null; onClose: () => void }) {
  const t = useT();
  const [data, setData] = useState<GhRepo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!repo) return;
    setData(null);
    setError(null);
    api
      .githubRepo(repo)
      .then(setData)
      .catch((e) => setError(errorText(e)));
  }, [repo]);

  return (
    <Sheet open={repo !== null} onClose={onClose}>
      <div className="flex items-start gap-3 border-b border-line px-6 pb-4 pt-5">
        <div className="flex size-11 items-center justify-center rounded-xl border border-line bg-surface-2">
          <GithubIcon className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[20px] font-semibold tracking-tight text-fg">{repo}</h2>
          {data && (
            <div className="mt-0.5 flex items-center gap-3 text-[12px] text-fg-2">
              <span className="flex items-center gap-1">
                <Star className="size-3.5" /> {fmtCompact(data.stars)}
              </span>
              <span className="truncate">{data.description}</span>
            </div>
          )}
        </div>
        <IconButton label={t.common.close} onClick={onClose}>
          <X className="size-4" />
        </IconButton>
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
        {error && <p className="text-[13px] text-danger">{error}</p>}
        {!data && !error && (
          <div className="flex justify-center py-10">
            <Spinner className="size-6" />
          </div>
        )}
        {data && data.releases.length === 0 && <p className="text-[13px] text-fg-2">{t.discover.noReleases}</p>}
        {data?.releases.map((r, idx) => (
          <section key={r.id} className={clsx("rounded-xl border p-4", idx === 0 ? "border-accent/25 bg-accent/[0.04]" : "border-line bg-surface-2/40")}>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[13px] font-semibold">{r.tag}</span>
              {idx === 0 && !r.prerelease && <Badge tone="accent">{t.discover.latest}</Badge>}
              {r.prerelease && <Badge tone="warn">{t.discover.prerelease}</Badge>}
              <span className="ml-auto text-[11.5px] text-muted">{fmtDate(r.publishedAt)}</span>
            </div>
            <div className="mt-3 space-y-1.5">
              {r.assets.map((a) => (
                <div key={a.id} className="flex items-center gap-3 rounded-lg border border-line bg-surface px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-mono text-[12px]">{a.name}</div>
                    <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted">
                      <span className="tabular">{fmtBytes(a.size)}</span>
                      {a.sha256 ? (
                        <Badge tone="ok" icon={<ShieldCheck className="size-3" />}>
                          {t.discover.shaPublished}
                        </Badge>
                      ) : (
                        <Badge tone="warn">{t.discover.noHash}</Badge>
                      )}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant={idx === 0 ? "primary" : "secondary"}
                    icon={<Download className="size-3.5" />}
                    onClick={() =>
                      api
                        .installGithub(data.repo, a.id, r.id)
                        .then(() => toast.success(t.common.downloadStarted))
                        .catch((e) => toast.error(errorText(e)))
                    }
                  >
                    {t.common.downloadAndReview}
                  </Button>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </Sheet>
  );
}
