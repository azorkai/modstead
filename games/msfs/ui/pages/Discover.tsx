// Keşfet: GitHub kataloğundaki ücretsiz modlar (kurulu sürüm ve güncelleme), mod siteleri (uygulama içi mod
// tarayıcısı, indirmeler yakalanıp taranır), bağlantıdan ve dosyadan kurulum. Hepsi ortak inceleme penceresine düşer.

import { useMemo, useState } from "react";
import { toast } from "sonner";
import clsx from "clsx";
import { ArrowUpCircle, CheckCircle2, Compass, ExternalLink, FileArchive, Globe, Link2, RefreshCw } from "lucide-react";
import { bytes } from "@/lib/format";
import { useLang } from "@/lib/i18n";
import { queryClient, upsertJob } from "@/lib/queries";
import { notifyError, openUrl } from "@/shell/actions";
import { Button, EmptyState, IconButton, Input, PageHeader, Skeleton } from "@/ui";
import { api } from "../api";
import { SIM_COLOR, SIM_SHORT, catLabel } from "../format";
import { useMsfsT } from "../i18n";
import { pickArchives } from "../parts";
import { Poster } from "../Poster";
import { mk, useCatalog, useSnapshot } from "../queries";
import type { CatalogItem, ModEntry, VariantStatus } from "../types";

/** Katalog kartlarının poster sanatı: ICAO tip kodu ve renk tonu. */
const CATALOG_ART: Record<string, { code: string; hue: number; engines?: 2 | 4 }> = {
  "fbw-a32nx": { code: "A20N", hue: 205 },
  "fbw-a380x": { code: "A388", hue: 228, engines: 4 },
  "headwind-a339x": { code: "A339", hue: 22 },
  "salty-747": { code: "B748", hue: 352, engines: 4 },
  "heavy-b78xh": { code: "B78X", hue: 262 },
  "mobiflight-wasm": { code: "MOBI", hue: 150 },
  "pms50-gns530": { code: "G530", hue: 188 },
  "g36-improvement": { code: "BE36", hue: 38 },
};

const SITES = [
  { name: "Flightsim.to", url: "https://flightsim.to", note: { tr: "En büyük ücretsiz MSFS mod sitesi", en: "The largest free MSFS mod site" } },
  { name: "Nexus Mods · MSFS 2020", url: "https://www.nexusmods.com/microsoftflightsimulator", note: { tr: "Nexus'taki MSFS 2020 modları", en: "MSFS 2020 mods on Nexus" } },
  { name: "Nexus Mods · MSFS 2024", url: "https://www.nexusmods.com/microsoftflightsimulator2024", note: { tr: "Nexus'taki MSFS 2024 modları", en: "MSFS 2024 mods on Nexus" } },
  { name: "Fly Away Simulation", url: "https://flyawaysimulation.com/downloads/files/msfs/", note: { tr: "Eski ve köklü indirme arşivi", en: "A long-standing download archive" } },
];

/** Katalog girdisinin bu varyant için kurulu modu: kayıtlı katalog kimliği ya da klasör adı; çok varyantlıda derlemeye göre. */
function installedFor(item: CatalogItem, v: VariantStatus, mods: ModEntry[]): ModEntry | undefined {
  const folders = item.folders.map((f) => f.toLowerCase());
  const mine = mods.filter((m) => m.source === "library" && (m.meta.catalogId === item.id || folders.includes(m.info.folder.toLowerCase())));
  if (item.variantsStatus.length < 2) return mine[0];
  const year = v.sim === "msfs2024" ? "2024" : "2020";
  return mine.find((m) => m.info.builtFor === year) ?? mine.find((m) => m.meta.releaseTag?.startsWith(`v${year}`));
}

export function catalogUpdates(items: CatalogItem[] | undefined, mods: ModEntry[] | undefined): number {
  if (!items || !mods) return 0;
  return items.reduce((n, it) => n + it.variantsStatus.filter((v) => {
    const m = installedFor(it, v, mods);
    return m?.meta.releaseTag && v.latest && m.meta.releaseTag !== v.latest.tag;
  }).length, 0);
}

export default function Discover() {
  const t = useMsfsT();
  const { data: items, isLoading, isError, refetch, isFetching } = useCatalog();
  const { data: scan } = useSnapshot();
  const updates = catalogUpdates(items, scan?.mods);

  const forceRefresh = async () => {
    try {
      const fresh = await api.catalog(true);
      queryClient.setQueryData(mk.catalog, fresh);
    } catch (e) {
      notifyError(e);
    }
  };

  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-5 pb-16">
      <PageHeader
        title={t.discover.title}
        subtitle={t.discover.subtitle}
        actions={
          updates > 0 ? (
            <span className="flex items-center gap-2.5 rounded-full border border-[color-mix(in_oklab,var(--accent)_40%,transparent)] py-1.5 pl-2 pr-4 text-[13px] font-semibold text-accent">
              <ArrowUpCircle className="size-5" />
              {t.discover.updates(updates)}
            </span>
          ) : undefined
        }
      />

      <section className="card overflow-hidden">
        <header className="flex items-center gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0 flex-1">
            <h3 className="title text-[15px] text-fg">{t.discover.catalog}</h3>
            <p className="mt-1 text-[12.5px] text-fg-2">{t.discover.catalogSub}</p>
          </div>
          <IconButton label={t.common.refresh} onClick={forceRefresh} disabled={isFetching}>
            <RefreshCw className={clsx("size-4", isFetching && "animate-spin")} />
          </IconButton>
        </header>
        {isLoading ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4 p-5">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-[300px] rounded-2xl" />
            ))}
          </div>
        ) : isError || !items ? (
          <EmptyState
            icon={<Compass className="size-6" />}
            title={t.discover.catalogError}
            action={
              <Button variant="secondary" onClick={() => refetch()}>
                {t.discover.retry}
              </Button>
            }
          />
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4 p-5">
            {items.map((it) => (
              <CatalogCard key={it.id} item={it} mods={scan?.mods ?? []} />
            ))}
          </div>
        )}
      </section>

      <div className="grid grid-cols-2 gap-5">
        <UrlCard />
        <section className="card flex flex-col gap-3 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="accent-soft flex size-9 items-center justify-center rounded-full">
              <FileArchive className="size-4" />
            </span>
            <h3 className="title text-[15px] text-fg">{t.discover.file}</h3>
          </div>
          <p className="text-[12.5px] leading-relaxed text-fg-2">{t.discover.fileSub}</p>
          <div>
            <Button variant="secondary" onClick={() => pickArchives()}>
              {t.discover.fileGo}
            </Button>
          </div>
        </section>
      </div>

      <Sites />
    </div>
  );
}

function CatalogCard({ item, mods }: { item: CatalogItem; mods: ModEntry[] }) {
  const t = useMsfsT();
  const lang = useLang((s) => s.lang);
  const art = CATALOG_ART[item.id] ?? { code: item.name.slice(0, 4).toUpperCase(), hue: 200 };
  const [busy, setBusy] = useState<string | null>(null);
  const name = lang === "en" ? (item.nameEn ?? item.name) : item.name;
  const desc = lang === "en" ? (item.descriptionEn ?? item.description) : item.description;

  const install = async (v: VariantStatus) => {
    setBusy(v.sim);
    try {
      const job = await api.installCatalog(item.id, v.sim);
      upsertJob(job);
      toast.info(t.discover.started(name));
    } catch (e) {
      notifyError(e);
    } finally {
      setBusy(null);
    }
  };

  return (
    <article className="flex flex-col overflow-hidden rounded-2xl border border-line bg-surface-2/40">
      <div className="relative aspect-[16/8]">
        <Poster code={art.code} hue={art.hue} kind={item.category} engines={art.engines} />
        <span className="on-image eyebrow absolute left-3 top-3 inline-flex h-6 items-center rounded-full px-2.5">{catLabel(item.category, lang)}</span>
      </div>
      <div className="flex flex-1 flex-col px-4 pb-4 pt-3.5">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <h4 className="title truncate text-[15px] text-fg">{name}</h4>
            <p className="mt-0.5 truncate text-[12px] text-muted">{item.author}</p>
          </div>
          <IconButton size="sm" label={t.discover.homepage} onClick={() => openUrl(item.homepage)}>
            <ExternalLink className="size-3.5" />
          </IconButton>
        </div>
        <p className="mt-2 line-clamp-2 min-h-[38px] text-[12.5px] leading-relaxed text-fg-2">{desc}</p>
        {item.error ? (
          <p className="mt-3 text-[11.5px] text-warn">{item.error}</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {item.variantsStatus.map((v) => {
              const installed = installedFor(item, v, mods);
              const tag = installed?.meta.releaseTag ?? null;
              const outdated = !!(tag && v.latest && tag !== v.latest.tag);
              const current = !!(tag && v.latest && tag === v.latest.tag);
              return (
                <li key={v.sim} className="flex items-center gap-2.5 rounded-xl border border-line bg-surface px-3 py-2.5">
                  <span className="size-2 shrink-0 rounded-full" style={{ background: SIM_COLOR[v.sim] }} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12.5px] font-semibold text-fg">{item.variantsStatus.length > 1 ? `MSFS ${SIM_SHORT[v.sim]}` : lang === "en" ? (v.labelEn ?? v.label) : v.label}</div>
                    <div className="truncate font-mono text-[10.5px] text-muted">
                      {v.latest ? `${v.latest.tag} · ${bytes(v.latest.size)}` : t.discover.noAsset}
                      {tag && !current ? ` · ${t.discover.installedTag(tag)}` : ""}
                    </div>
                  </div>
                  {current ? (
                    <span className="inline-flex shrink-0 items-center gap-1 text-[12px] font-semibold text-ok">
                      <CheckCircle2 className="size-3.5" />
                      {t.discover.upToDate}
                    </span>
                  ) : (
                    <Button size="sm" variant={outdated ? "primary" : installed ? "secondary" : "subtle"} disabled={!v.latest || busy !== null} loading={busy === v.sim} onClick={() => install(v)}>
                      {outdated || installed ? t.discover.update : t.discover.install}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </article>
  );
}

function UrlCard() {
  const t = useMsfsT();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const valid = useMemo(() => /^https:\/\/\S+$/i.test(url.trim()), [url]);
  const go = async () => {
    setBusy(true);
    try {
      const job = await api.installUrl(url.trim());
      upsertJob(job);
      toast.info(t.discover.started(job.title));
      setUrl("");
    } catch (e) {
      notifyError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="card flex flex-col gap-3 px-5 py-4">
      <div className="flex items-center gap-3">
        <span className="accent-soft flex size-9 items-center justify-center rounded-full">
          <Link2 className="size-4" />
        </span>
        <h3 className="title text-[15px] text-fg">{t.discover.url}</h3>
      </div>
      <p className="text-[12.5px] leading-relaxed text-fg-2">{t.discover.urlSub}</p>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) void go();
        }}
      >
        <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder={t.discover.urlPlaceholder} className="flex-1" inputClassName="font-mono text-[12px]" />
        <Button type="submit" variant="secondary" disabled={!valid} loading={busy}>
          {t.discover.urlGo}
        </Button>
      </form>
    </section>
  );
}

function Sites() {
  const t = useMsfsT();
  const lang = useLang((s) => s.lang);
  const open = async (url: string) => {
    try {
      await api.openBrowser(url);
    } catch (e) {
      notifyError(e);
    }
  };
  return (
    <section className="card overflow-hidden">
      <header className="border-b border-line px-5 py-4">
        <h3 className="title text-[15px] text-fg">{t.discover.sites}</h3>
        <p className="mt-1 text-[12.5px] text-fg-2">{t.discover.sitesSub}</p>
      </header>
      <ul className="grid grid-cols-2 gap-px bg-[var(--line)]">
        {SITES.map((s) => (
          <li key={s.url} className="flex items-center gap-3 bg-surface px-5 py-3.5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-fg-2">
              <Globe className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13.5px] font-semibold text-fg">{s.name}</div>
              <div className="truncate text-[11.5px] text-muted">{s.note[lang]}</div>
            </div>
            <Button size="sm" variant="secondary" onClick={() => open(s.url)}>
              {t.discover.openBrowser}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
