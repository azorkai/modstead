// MSFS'in ana sayfa katkısı: vitrinde her sim için başlat düğmesi (`HomeActions`) ve vitrinin altında giriş
// kutucukları (`HomePanel`): kütüphane, kariyer, keşfet, sağlık. Hepsi gerçek veriyle; ağ isteği başlatmaz
// (katalog yalnızca önbellekteyse okunur).

import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import clsx from "clsx";
import { ArrowUpRight, Compass, HeartPulse, Library as LibraryIcon, Play, PlaneTakeoff } from "lucide-react";
import { locale } from "@/lib/format";
import { useUi } from "@/lib/store";
import { notifyError } from "@/shell/actions";
import { Button, Skeleton } from "@/ui";
import { api } from "./api";
import { useCareer } from "./career/queries";
import { catalogUpdates } from "./pages/Discover";
import { CATEGORIES, SIM_COLOR, catLabel, errorCount } from "./format";
import { useMsfsT } from "./i18n";
import { invalidateAll, mk, useSnapshot } from "./queries";
import type { CatalogItem, Category, SimInstall } from "./types";

const go = (page: string) => useUi.getState().openGame("msfs", page);

function usd(n: number): string {
  return new Intl.NumberFormat(locale(), { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

async function launch(sim: SimInstall, label: string) {
  try {
    await api.launch(sim.id);
    toast.success(label);
    setTimeout(invalidateAll, 5000);
  } catch (e) {
    notifyError(e);
  }
}

/** Vitrindeki başlat düğmeleri: 2024 önde (birincil), 2020 yanında. */
export function HomeActions() {
  const t = useMsfsT();
  const { data: scan } = useSnapshot();
  if (!scan) return <Skeleton className="h-11 w-48 rounded-full" />;
  const sims = scan.sims.filter((s) => s.detected && (s.edition === "steam" || s.edition === "store"));
  const ordered = [...sims].sort((a, b) => (a.id === "msfs2024" ? -1 : b.id === "msfs2024" ? 1 : 0));
  return (
    <>
      {ordered.map((s, i) => (
        <Button
          key={s.id}
          size="lg"
          variant={i === 0 ? "primary" : "secondary"}
          title={t.home.playHint(s.short, t.common.edition[s.edition] ?? s.edition)}
          icon={i === 0 ? <Play className="size-4 fill-current" /> : <span className="size-2 rounded-full" style={{ background: SIM_COLOR[s.id] }} />}
          disabled={s.running}
          onClick={() => launch(s, t.overview.launched(s.short))}
        >
          {s.running ? t.overview.running(s.short) : t.home.play(s.short)}
        </Button>
      ))}
    </>
  );
}

function Tile({ icon, label, onClick, children, foot }: { icon: ReactNode; label: string; onClick: () => void; children: ReactNode; foot?: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex min-h-[172px] min-w-0 flex-col rounded-2xl border border-line bg-surface p-5 text-left transition-[border-color,background-color] duration-200 hover:border-[color-mix(in_oklab,var(--accent)_50%,var(--line-strong))] hover:bg-surface-2/50"
    >
      <span className="eyebrow flex w-full items-center gap-2 text-muted">
        <span className="text-accent [&_svg]:size-3.5">{icon}</span>
        <span className="flex-1">{label}</span>
        <ArrowUpRight className="size-4 text-muted transition-[color,transform] duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-accent" />
      </span>
      <span className="mt-auto block min-w-0 pt-5">{children}</span>
      {foot && <span className="mt-3 block min-w-0">{foot}</span>}
    </button>
  );
}

/** Kütüphanenin türlere göre dağılımı: ince, bölümlü bir şerit (gerçek veri, süs değil). */
function CategoryStrip({ byCategory, total }: { byCategory: Partial<Record<Category, number>>; total: number }) {
  const cats = CATEGORIES.map((c) => ({ c, n: byCategory[c] ?? 0 })).filter((x) => x.n > 0);
  if (total === 0 || cats.length === 0) return null;
  return (
    <span className="flex h-1.5 w-full gap-[3px] overflow-hidden rounded-full" aria-hidden>
      {cats.map(({ c, n }, i) => (
        <span key={c} title={`${catLabel(c)} · ${n}`} className="h-full rounded-full bg-accent" style={{ flexGrow: n, opacity: 1 - (i / cats.length) * 0.7 }} />
      ))}
    </span>
  );
}

export function HomePanel() {
  const t = useMsfsT();
  const { data: scan } = useSnapshot();
  const { data: career } = useCareer();
  // Katalog yalnızca önbellekteyse (Keşfet açıldıysa) okunur; ana sayfa ağ isteği başlatmaz.
  const { data: catalog } = useQuery<CatalogItem[]>({ queryKey: mk.catalog, queryFn: () => api.catalog(false), enabled: false });
  const updates = catalogUpdates(catalog, scan?.mods);
  const problems = scan ? scan.mods.reduce((a, m) => a + errorCount(m), 0) : 0;
  const pilot = career?.pilot;
  const active = career?.active;

  return (
    <div className="grid grid-cols-4 gap-4">
      <Tile icon={<LibraryIcon />} label={t.home.library} onClick={() => go("library")} foot={scan ? <CategoryStrip byCategory={scan.stats.byCategory} total={scan.stats.total} /> : undefined}>
        {scan ? (
          <>
            <span className="num block text-[40px] text-fg">{scan.stats.total}</span>
            <span className="mt-2 block truncate text-[12.5px] text-fg-2">
              {scan.libraryPath ? t.home.libraryLine(scan.stats.enabled.msfs2020 ?? 0, scan.stats.enabled.msfs2024 ?? 0) : t.home.noLibrary}
            </span>
          </>
        ) : (
          <Skeleton className="h-12 w-2/3" />
        )}
      </Tile>

      <Tile icon={<PlaneTakeoff />} label={t.home.career} onClick={() => go("career")}>
        {career === undefined ? (
          <Skeleton className="h-12 w-3/4" />
        ) : pilot ? (
          <>
            <span className="title block truncate text-[20px] leading-tight text-fg">{pilot.name}</span>
            <span className="mt-1 block truncate text-[12.5px] text-fg-2">
              {[pilot.title, t.home.level(pilot.level), usd(pilot.money)].filter(Boolean).join(" · ")}
            </span>
            <span className="mt-3 flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2 text-[12px]">
              {active ? (
                <>
                  <span className="eyebrow text-muted">{t.home.activeJob}</span>
                  <span className="num ml-auto text-[14px] text-fg">
                    {active.job.from} <span className="text-accent">→</span> {active.job.to}
                  </span>
                </>
              ) : (
                <span className="truncate text-fg-2">{t.home.noJob(career?.location?.icao ?? pilot.location)}</span>
              )}
            </span>
          </>
        ) : (
          <>
            <span className="title block text-[20px] leading-tight text-fg">{t.home.careerStart}</span>
            <span className="mt-1 block text-[12.5px] text-fg-2">{t.home.careerStartHint}</span>
          </>
        )}
      </Tile>

      <Tile icon={<Compass />} label={t.home.discover} onClick={() => go("discover")}>
        {updates > 0 ? (
          <>
            <span className="num block text-[40px] text-accent">{updates}</span>
            <span className="mt-2 block text-[12.5px] text-fg-2">{t.home.updates(updates)}</span>
          </>
        ) : (
          <>
            <span className="title block text-[20px] leading-tight text-fg">{t.home.discoverTitle}</span>
            <span className="mt-1 block text-[12.5px] text-fg-2">{t.home.discoverHint}</span>
          </>
        )}
      </Tile>

      <Tile icon={<HeartPulse />} label={t.home.health} onClick={() => go("health")}>
        {scan ? (
          <>
            <span className={clsx("num block text-[40px]", problems ? "text-danger" : "text-ok")}>{problems}</span>
            <span className="mt-2 block text-[12.5px] text-fg-2">{problems ? t.home.healthBad(problems) : t.home.healthOk}</span>
          </>
        ) : (
          <Skeleton className="h-12 w-1/2" />
        )}
      </Tile>
    </div>
  );
}

