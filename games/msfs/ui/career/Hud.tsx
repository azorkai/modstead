// Simin içine kurulan Modstead paketlerinin kartları: araç çubuğu paneli (HUD) ve ana menü kutusu. Kart düzeni uçuş
// ekranı kartıyla aynıdır: önizleme → tek satır açıklama → durum → en altta eylemler. Uzun teknik açıklamalar (i)
// ipucunda. Paketler Modstead'e gömülüdür (games/msfs/hud); kurulum kütüphaneye yazar ve simlere bağlar (sim kapalıyken).

import { useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Clock, Download, LayoutGrid, MonitorUp, RefreshCw, Trash2, TriangleAlert } from "lucide-react";
import { notifyError } from "@/shell/actions";
import { Badge, Button } from "@/ui";
import { careerApi } from "./api";
import { AircraftPhoto } from "./aircraft/AircraftPhoto";
import { useCareerT } from "./i18n";
import { Hint } from "./parts";
import { ck } from "./queries";
import type { HudStatus, MenuStatus } from "./types";

type Kind = "hud" | "menu";

const API: Record<Kind, { get: () => Promise<HudStatus>; install: () => Promise<HudStatus>; remove: () => Promise<HudStatus>; queue: (on: boolean) => Promise<HudStatus> }> = {
  hud: { get: careerApi.hud, install: careerApi.hudInstall, remove: careerApi.hudRemove, queue: careerApi.hudQueue },
  menu: { get: careerApi.menu, install: careerApi.menuInstall, remove: careerApi.menuRemove, queue: careerApi.menuQueue },
};

/** Paketin durumu (kart ve "Uçuş araçları" özeti aynı sorguyu paylaşır). */
export function usePackage(kind: Kind) {
  const api = API[kind];
  // Kurulum sim kapanınca bekliyorsa durumu sık yokla: kurulduğu an kart güncellensin.
  return useQuery({ queryKey: [...ck.all, kind] as const, queryFn: api.get, staleTime: 30_000, refetchInterval: (q) => (q.state.data?.queued ? 4000 : false) });
}

/** Paket işlem bekliyor mu: kurulu değil, güncelleme var ya da hiçbir sime bağlı değil. */
export function packageNeeds(s: HudStatus | undefined): "install" | "update" | "link" | null {
  if (!s) return null;
  if ((s as MenuStatus).blocked) return null;
  if (!s.installed) return "install";
  if (s.version !== s.latest) return "update";
  if (s.sims.length > 0 && !s.sims.some((x) => x.linked)) return "link";
  return null;
}

export function HudCard() {
  return <PackageCard kind="hud" />;
}

export function MenuCard() {
  return <PackageCard kind="menu" />;
}

/** Uçuş aracı kartının ortak iskeleti: başlık (+ ipucu, sağda rozet), sabit yükseklikte önizleme, kısa açıklama,
 *  durum satırı, uyarılar ve en altta eylemler. Üç kart da aynı satırlarda hizalanır. */
export function ToolCard({ icon, title, hint, badge, preview, body, status, notes, actions }: { icon: ReactNode; title: string; hint?: ReactNode; badge?: ReactNode; preview: ReactNode; body: string; status?: ReactNode; notes?: ReactNode; actions: ReactNode }) {
  return (
    <section className="flex h-full min-w-0 flex-col overflow-hidden rounded-2xl border border-line bg-surface">
      <header className="flex h-12 items-center gap-2.5 border-b border-line px-4">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-fg-2 [&_svg]:size-[15px]">{icon}</span>
        <h3 className="title min-w-0 truncate text-[14px] text-fg">{title}</h3>
        {hint && <Hint text={hint} />}
        <span className="flex-1" />
        {badge}
      </header>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="h-[128px] shrink-0">{preview}</div>
        <p className="min-h-[40px] text-pretty text-[12.5px] leading-relaxed text-fg-2">{body}</p>
        {status && <div className="flex min-h-6 flex-wrap items-center gap-1.5">{status}</div>}
        {notes}
      </div>
      <footer className="flex min-h-[56px] flex-wrap items-center gap-2 border-t border-line px-4 py-2.5">{actions}</footer>
    </section>
  );
}

function PackageCard({ kind }: { kind: Kind }) {
  const t = useCareerT();
  const qc = useQueryClient();
  const key = [...ck.all, kind] as const;
  const api = API[kind];
  // Ortak metinler panelinkiyle aynı; ana menü kutusunun kendine özgü olanları üstüne gelir.
  const tx = kind === "menu" ? { ...t.hud, ...t.menuTile } : t.hud;
  const { data: s } = usePackage(kind);
  const [busy, setBusy] = useState<"install" | "remove" | null>(null);
  if (!s) return null;

  const running = s.sims.some((x) => x.running);
  const outdated = s.installed && s.version !== s.latest;
  const menu = kind === "menu" ? (s as MenuStatus) : null;
  const simChanged = !!menu?.installedFor && !!menu.simVersion && menu.installedFor !== menu.simVersion;
  const run = async (what: "install" | "remove") => {
    setBusy(what);
    try {
      const next = what === "install" ? await api.install() : await api.remove();
      qc.setQueryData(key, next);
      toast.success(what === "install" ? tx.installed : tx.removed);
    } catch (e) {
      notifyError(e);
    } finally {
      setBusy(null);
    }
  };
  const queue = (on: boolean) => api.queue(on).then((n) => qc.setQueryData(key, n)).catch(notifyError);
  const pretty = (v: string) => v.replace(/^(store|steam):/, "");
  const hint = (
    <span className="block">
      <span className="block">{tx.body}</span>
      <span className="mt-1.5 block">{tx.how}</span>
      {menu?.installed && menu.installedFor && !simChanged && <span className="mt-1.5 block">{t.menuTile.forVersion(pretty(menu.installedFor))}</span>}
    </span>
  );

  return (
    <ToolCard
      icon={kind === "menu" ? <LayoutGrid /> : <MonitorUp />}
      title={tx.title}
      hint={hint}
      badge={s.installed ? <Badge tone={outdated ? "warn" : "ok"}>{outdated ? tx.newVersion(s.latest) : `v${s.version}`}</Badge> : <Badge>{t.guide.toolsNotInstalled}</Badge>}
      preview={kind === "menu" ? <TilePreview /> : <PanelPreview />}
      body={kind === "menu" ? t.guide.menuShort : t.guide.hudShort}
      status={
        <>
          {s.sims.map((x) => (
            <Badge key={x.id} tone={x.running ? "warn" : x.linked ? "ok" : "neutral"} dot>
              MSFS {x.short} · {x.running ? tx.running : x.linked ? tx.linked : tx.notLinked}
            </Badge>
          ))}
          {menu && <Badge>{t.menuTile.only2024}</Badge>}
        </>
      }
      notes={
        <>
          {simChanged && <Note>{t.menuTile.simChanged(pretty(menu!.installedFor!), pretty(menu!.simVersion!))}</Note>}
          {menu?.blocked && <Note>{menu.blocked}</Note>}
          {!s.library && <Note>{tx.noLibrary}</Note>}
          {s.queued && (
            <p className="text-[12px] text-info">
              {tx.queued}{" "}
              <button type="button" className="font-semibold underline-offset-2 hover:underline" onClick={() => void queue(false)}>
                {tx.cancelQueue}
              </button>
            </p>
          )}
        </>
      }
      actions={
        <>
          {s.library && (!s.installed || outdated) && !running && !menu?.blocked && (
            <Button size="sm" variant="primary" icon={outdated ? <RefreshCw className="size-3.5" /> : <Download className="size-3.5" />} loading={busy === "install"} disabled={busy !== null} onClick={() => void run("install")}>
              {outdated ? tx.update : tx.install}
            </Button>
          )}
          {s.library && (!s.installed || outdated) && running && !s.queued && !menu?.blocked && (
            <Button size="sm" variant="primary" icon={<Clock className="size-3.5" />} onClick={() => void queue(true)}>
              {outdated ? tx.whenClosed : tx.whenClosedInstall}
            </Button>
          )}
          {running && !s.queued && <span className="text-[11.5px] text-muted">{tx.closeSim}</span>}
          <span className="flex-1" />
          {s.installed && (
            <Button size="sm" variant="ghost" icon={<Trash2 className="size-3.5" />} loading={busy === "remove"} disabled={running || busy !== null} onClick={() => void run("remove")}>
              {tx.remove}
            </Button>
          )}
        </>
      }
    />
  );
}

function Note({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-xl bg-warn/10 px-3 py-2 text-[12px] text-warn">
      <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

/** Ana menüdeki kutunun küçük bir kopyası (simin kutularıyla aynı oranda). */
function TilePreview() {
  const t = useCareerT();
  return (
    <div className="flex h-full items-end gap-3" aria-hidden>
      <AircraftPhoto title="C172SP G1000 Passengers" cls="light_piston" className="aspect-[308/284] h-full shrink-0 rounded-xl">
        <span className="absolute left-2.5 top-2 text-[12.5px] font-semibold text-white [text-shadow:0_1px_6px_rgb(0_0_0/0.6)]">Modstead Kariyer</span>
        <span className="absolute bottom-2 right-2 rounded-full bg-[#ff8a3d] px-2 py-0.5 text-[9px] font-bold tracking-[0.08em] text-[#1a1208]">MODSTEAD</span>
      </AircraftPhoto>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 pb-1 text-[10.5px] text-muted">
        <span className="font-mono text-[14px] font-bold text-fg">LTFJ → LTBQ</span>
        <span className="truncate">{t.menuTile.previewSteps}</span>
        <span className="w-fit rounded-md bg-[#ff8a3d] px-2 py-0.5 text-[10px] font-bold text-[#1a1208]">{t.active.start}</span>
      </div>
    </div>
  );
}

/** Panelin simdeki görünümünün küçük bir kopyası (simde her zaman koyu; bkz. ModsteadCareer.css). */
function PanelPreview() {
  const t = useCareerT();
  const p = t.hud.preview;
  return (
    <div className="msfs-sim-panel flex h-full flex-col justify-center rounded-xl px-3.5 text-white" aria-hidden>
      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.06em] text-white/60">
        <span className="size-1.5 rounded-full bg-[#3ecf8e]" />
        <span className="flex-1">{p.status}</span>
        <span className="text-[var(--sim-accent)]">{t.kinds.cargo}</span>
      </div>
      <div className="mt-2 flex items-center gap-2 font-mono text-[16px] font-bold">
        LTBA
        <span className="h-0.5 w-5 bg-[var(--sim-accent)]" />
        LTBU
        <span className="ml-auto rounded-full border border-[var(--sim-accent)]/40 bg-[var(--sim-accent)]/15 px-2 py-0.5 font-sans text-[10.5px] font-semibold text-[var(--sim-accent)]">{p.phase}</span>
      </div>
      <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-white/10">
        <div className="h-full w-[62%] bg-[var(--sim-accent)]" />
      </div>
      <div className="mt-2.5 grid grid-cols-3 gap-2 text-[10px] uppercase tracking-[0.05em] text-white/55">
        {[
          [p.remaining, "16 nm"],
          [p.eta, `9 ${t.units.min}`],
          [p.score, "96"],
        ].map(([l, v]) => (
          <div key={l}>
            {l}
            <div className="mt-0.5 text-[14px] font-bold normal-case tracking-normal text-white">{v}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
