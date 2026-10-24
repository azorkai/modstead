import type { ReactNode } from "react";
import { ArrowRight, ArrowUpCircle, BadgeCheck, Download, ExternalLink, Link2, Lock, TriangleAlert, Users, X } from "lucide-react";
import { toast } from "sonner";
import { SteamIcon } from "../components/icons";
import { api, errorText } from "../api";
import type { WorkshopCollection, WorkshopItem } from "../types";
import { fmtBytes, fmtCompact, fmtNumber, fmtRelative } from "../format";
import { parseInput, workshopUrl } from "../links";
import { useApp } from "../store";
import { Badge, Button, EmptyState, Input } from "../components/kit";
import { useT } from "../i18n";

// Keşfet → Steam Workshop. Steam, Workshop dosyalarını yalnızca kendi istemcisiyle indirtir;
// Otağ öğeyi Steam'de açar (steam_open), kullanıcı abone olur, Steam indirir ve Otağ pencereye
// dönüşte yeniden tarar (store/app.ts onWindowFocus). Öğe adı, açıklaması ve etiketleri Steam'den
// olduğu gibi gelir, çevrilmez.

const openPage = (url: string) => api.openUrl(url).catch((e) => toast.error(errorText(e)));

/** Açıklama paneli, Steam kısayolları ve bağlantı/numara girişi. */
export function SteamDoor({ onSubmit }: { onSubmit: (raw: string) => void }) {
  const t = useT();
  const input = useApp((s) => s.steam.input);
  const loading = useApp((s) => s.steam.loading);
  const setInput = useApp((s) => s.setSteamInput);
  const openInSteam = useApp((s) => s.openInSteam);

  return (
    <>
      <div className="mt-5 flex gap-4 rounded-xl border border-info/20 bg-info/[0.05] p-4">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-line bg-surface-2 text-info">
          <SteamIcon className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold text-fg">{t.steam.howTitle}</div>
          <p className="mt-1 text-[12.5px] leading-relaxed text-fg-2">{t.steam.howBody}</p>
          <ol className="mt-2 space-y-1">
            {[t.steam.step1, t.steam.step2, t.steam.step3].map((step, i) => (
              <li key={i} className="flex items-start gap-2 text-[12.5px] text-fg-2">
                <span className="mt-px flex size-[18px] shrink-0 items-center justify-center rounded-full bg-info/15 text-[10.5px] font-semibold text-info tabular">
                  {i + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
          <p className="mt-2.5 flex items-center gap-1.5 text-[11.5px] text-muted">
            <Lock className="size-3.5" />
            {t.steam.noPassword}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-stretch gap-2">
          <Button size="sm" icon={<SteamIcon className="size-3.5" />} onClick={() => openInSteam("workshop")}>
            {t.steam.browse}
          </Button>
          <Button size="sm" variant="ghost" icon={<Download className="size-3.5" />} onClick={() => openInSteam("downloads")}>
            {t.steam.downloads}
          </Button>
        </div>
      </div>

      <form
        className="mt-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(input);
        }}
      >
        <Input
          icon={<Link2 className="size-4" />}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onPaste={(e) => {
            // Bağlantı yapıştırılınca Enter beklemeden bul.
            const text = e.clipboardData.getData("text");
            if (parseInput(text).kind === "steam") {
              e.preventDefault();
              onSubmit(text);
            }
          }}
          placeholder={t.steam.placeholder}
          className="h-11 flex-1 rounded-xl text-[14px]"
          trailing={
            input && (
              <button type="button" className="text-muted hover:text-fg" onClick={() => setInput("")} aria-label={t.common.clear}>
                <X className="size-4" />
              </button>
            )
          }
        />
        <Button type="submit" variant="primary" size="lg" loading={loading} disabled={!input.trim()} icon={<ArrowRight className="size-4" />}>
          {t.steam.lookup}
        </Button>
      </form>
    </>
  );
}

/** Bulunan öğe(ler) ya da koleksiyon. */
export function SteamResults() {
  const t = useT();
  const steam = useApp((s) => s.steam);

  if (steam.loading) {
    return (
      <Grid>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card overflow-hidden">
            <div className="skeleton aspect-[16/9] rounded-none" />
            <div className="space-y-2 p-4">
              <div className="skeleton h-4 w-2/3" />
              <div className="skeleton h-3 w-full" />
            </div>
          </div>
        ))}
      </Grid>
    );
  }

  if (steam.error) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-danger/25 bg-danger/[0.06] px-4 py-3 text-[13px] text-danger">
        <TriangleAlert className="mt-0.5 size-4 shrink-0" />
        <span className="selectable">{steam.error}</span>
      </div>
    );
  }

  if (!steam.result) {
    return (
      <EmptyState icon={<SteamIcon className="size-6" />} title={t.steam.emptyTitle}>
        {t.steam.emptyBody}
      </EmptyState>
    );
  }

  const { collection, items } = steam.result;
  return (
    <>
      {collection && <CollectionHeader collection={collection} items={items} />}
      {items.length === 0 ? (
        <EmptyState icon={<SteamIcon className="size-6" />} title={t.common.noResults}>
          {t.steam.noItems}
        </EmptyState>
      ) : (
        <Grid>
          {items.map((item) => (
            <WorkshopCard key={item.id} item={item} />
          ))}
        </Grid>
      )}
    </>
  );
}

function Grid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-4">{children}</div>;
}

function Preview({ url, iconSize = "size-7" }: { url: string | null; iconSize?: string }) {
  return url ? (
    <img src={url} alt="" loading="lazy" draggable={false} className="size-full object-cover" />
  ) : (
    <div className="flex size-full items-center justify-center text-muted">
      <SteamIcon className={iconSize} />
    </div>
  );
}

function CollectionHeader({ collection, items }: { collection: WorkshopCollection; items: WorkshopItem[] }) {
  const t = useT();
  const openInSteam = useApp((s) => s.openInSteam);
  const installed = items.filter((i) => i.installed).length;
  const pending = items.filter((i) => i.needsUpdate).length;
  return (
    <div className="card mb-5 flex items-center gap-4 p-3 pr-4">
      <div className="h-[72px] w-[128px] shrink-0 overflow-hidden rounded-lg bg-surface-2">
        <Preview url={collection.previewUrl} iconSize="size-6" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">{t.steam.collection}</div>
        <div className="truncate text-[18px] font-semibold leading-tight tracking-tight text-fg" title={collection.title}>
          {collection.title}
        </div>
        <div className="mt-0.5 text-[12px] text-fg-2 tabular">{t.steam.collectionSummary(items.length, installed, pending)}</div>
      </div>
      <Button variant="primary" icon={<SteamIcon className="size-4" />} onClick={() => openInSteam("item", collection.id)}>
        {t.steam.openCollection}
      </Button>
      <Button variant="ghost" icon={<ExternalLink className="size-4" />} onClick={() => openPage(workshopUrl(collection.id))}>
        {t.steam.openPage}
      </Button>
    </div>
  );
}

function WorkshopCard({ item }: { item: WorkshopItem }) {
  const t = useT();
  const openInSteam = useApp((s) => s.openInSteam);

  // Kurulu değil → abone ol; güncelleme bekliyor → Steam indirmeleri; kurulu ve güncel → Steam'de aç.
  const action = !item.installed
    ? { label: t.steam.subscribe, primary: true, run: () => openInSteam("item", item.id) }
    : item.needsUpdate
      ? { label: t.steam.downloads, primary: true, run: () => openInSteam("downloads") }
      : { label: t.steam.openInSteam, primary: false, run: () => openInSteam("item", item.id) };

  return (
    <div className="card flex flex-col overflow-hidden">
      <div className="relative aspect-[16/9] overflow-hidden bg-surface-2">
        <Preview url={item.previewUrl} />
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/60 to-transparent" />
        {(item.installed || item.needsUpdate) && (
          <span className="absolute left-2.5 top-2.5 flex flex-wrap gap-1.5">
            {item.installed && (
              <Badge tone="ok" className="bg-black/75! border-white/15! backdrop-blur-md" icon={<BadgeCheck className="size-3" />}>
                {t.common.installed}
              </Badge>
            )}
            {item.needsUpdate && (
              <Badge tone="accent" className="bg-black/75! border-white/15! backdrop-blur-md" icon={<ArrowUpCircle className="size-3" />}>
                {t.steam.updatePending}
              </Badge>
            )}
          </span>
        )}
        <span className="absolute bottom-2 right-2.5 font-mono text-[11px] text-white/85">{fmtBytes(item.fileSize)}</span>
      </div>
      <div className="flex flex-1 flex-col p-3.5">
        <div className="line-clamp-2 text-[13.5px] font-semibold leading-snug text-fg" title={item.title}>
          {item.title}
        </div>
        {item.description && <p className="mt-1.5 line-clamp-2 text-[12px] leading-relaxed text-fg-2">{item.description}</p>}
        {item.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {item.tags.slice(0, 3).map((tag) => (
              <Badge key={tag}>{tag}</Badge>
            ))}
          </div>
        )}
        <div className="mt-auto flex items-center gap-3 pt-3 text-[11.5px] text-muted tabular">
          <span className="flex items-center gap-1" title={t.steam.subscribers(item.subscriptions, fmtNumber(item.subscriptions))}>
            <Users className="size-3.5" />
            {fmtCompact(item.subscriptions)}
          </span>
          <span className="ml-auto">{t.discover.updatedAgo(fmtRelative(item.timeUpdated))}</span>
        </div>
        <div className="mt-3 flex gap-2">
          <Button
            size="sm"
            variant={action.primary ? "primary" : "secondary"}
            className="flex-1"
            icon={<SteamIcon className="size-3.5" />}
            onClick={action.run}
          >
            {action.label}
          </Button>
          <Button size="sm" variant="ghost" icon={<ExternalLink className="size-3.5" />} onClick={() => openPage(item.url)}>
            {t.steam.openPage}
          </Button>
        </div>
      </div>
    </div>
  );
}
