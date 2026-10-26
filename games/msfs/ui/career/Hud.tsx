// Simin içine kurulan Modstead paketlerinin kartları: araç çubuğu paneli (HUD) ve ana menü kutusu. Nasıl
// göründükleri, hangi simlere bağlı oldukları, kurma/güncelleme/kaldırma ve "sim kapanınca kur". Paketler Modstead'e
// gömülüdür (games/msfs/hud); kurulum kütüphaneye yazar ve simlere bağlar (simler kapalıyken).

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CircleCheck, Clock, Download, LayoutGrid, MonitorUp, RefreshCw, Trash2, TriangleAlert } from "lucide-react";
import { notifyError } from "@/shell/actions";
import { Badge, Button } from "@/ui";
import { careerApi } from "./api";
import { AircraftPhoto } from "./aircraft/AircraftPhoto";
import { useCareerT } from "./i18n";
import { ck } from "./queries";
import type { HudStatus, MenuStatus } from "./types";

type Kind = "hud" | "menu";

const API: Record<Kind, { get: () => Promise<HudStatus>; install: () => Promise<HudStatus>; remove: () => Promise<HudStatus>; queue: (on: boolean) => Promise<HudStatus> }> = {
  hud: { get: careerApi.hud, install: careerApi.hudInstall, remove: careerApi.hudRemove, queue: careerApi.hudQueue },
  menu: { get: careerApi.menu, install: careerApi.menuInstall, remove: careerApi.menuRemove, queue: careerApi.menuQueue },
};

export function HudCard() {
  return <PackageCard kind="hud" />;
}

export function MenuCard() {
  return <PackageCard kind="menu" />;
}

function PackageCard({ kind }: { kind: Kind }) {
  const t = useCareerT();
  const qc = useQueryClient();
  const key = [...ck.all, kind] as const;
  const api = API[kind];
  // Ortak metinler panelinkiyle aynı; ana menü kutusunun kendine özgü olanları üstüne gelir.
  const tx = kind === "menu" ? { ...t.hud, ...t.menuTile } : t.hud;
  // Kurulum sim kapanınca bekliyorsa durumu sık yokla: kurulduğu an kart güncellensin.
  const { data: s } = useQuery({ queryKey: key, queryFn: api.get, staleTime: 30_000, refetchInterval: (q) => (q.state.data?.queued ? 4000 : false) });
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

  return (
    <section className="card overflow-hidden">
      <header className="flex items-center gap-3 border-b border-line px-5 py-3.5">
        {kind === "menu" ? <LayoutGrid className="size-4 text-fg-2" /> : <MonitorUp className="size-4 text-fg-2" />}
        <h3 className="min-w-0 flex-1 text-[14px] font-semibold text-fg">{tx.title}</h3>
        {s.installed && !outdated && (
          <Badge tone="ok" icon={<CircleCheck className="size-3" />}>
            v{s.version}
          </Badge>
        )}
        {outdated && <Badge tone="warn">{tx.newVersion(s.latest)}</Badge>}
      </header>
      <div className="flex flex-col gap-3.5 px-5 py-4">
        {kind === "menu" ? <TilePreview /> : <PanelPreview />}
        <p className="text-[12.5px] leading-relaxed text-fg-2">{tx.body}</p>
        <p className="text-[11.5px] leading-relaxed text-muted">{tx.how}</p>
        {s.sims.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {s.sims.map((x) => (
              <Badge key={x.id} tone={x.running ? "warn" : x.linked ? "ok" : "neutral"} dot>
                MSFS {x.short} · {x.running ? tx.running : x.linked ? tx.linked : tx.notLinked}
              </Badge>
            ))}
            {menu && <Badge>{t.menuTile.only2024}</Badge>}
          </div>
        )}
        {menu?.installed && menu.installedFor && !simChanged && <p className="text-[11.5px] text-muted">{t.menuTile.forVersion(pretty(menu.installedFor))}</p>}
        {simChanged && (
          <p className="flex items-start gap-2 rounded-xl bg-warn/10 px-3 py-2 text-[12px] text-warn">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
            {t.menuTile.simChanged(pretty(menu!.installedFor!), pretty(menu!.simVersion!))}
          </p>
        )}
        {menu?.blocked && (
          <p className="flex items-start gap-2 rounded-xl bg-warn/10 px-3 py-2 text-[12px] text-warn">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
            {menu.blocked}
          </p>
        )}
        {!s.library ? (
          <p className="text-[12px] text-warn">{tx.noLibrary}</p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {(!s.installed || outdated) && !running && !menu?.blocked && (
              <Button variant="primary" icon={outdated ? <RefreshCw className="size-4" /> : <Download className="size-4" />} loading={busy === "install"} disabled={busy !== null} onClick={() => void run("install")}>
                {outdated ? tx.update : tx.install}
              </Button>
            )}
            {(!s.installed || outdated) && running && !s.queued && !menu?.blocked && (
              <Button variant="primary" icon={<Clock className="size-4" />} onClick={() => void queue(true)}>
                {outdated ? tx.whenClosed : tx.whenClosedInstall}
              </Button>
            )}
            {s.installed && (
              <Button variant="ghost" icon={<Trash2 className="size-4" />} loading={busy === "remove"} disabled={running || busy !== null} onClick={() => void run("remove")}>
                {tx.remove}
              </Button>
            )}
            {s.queued ? (
              <span className="flex items-center gap-2 text-[11.5px] text-info">
                {tx.queued}
                <button type="button" className="font-semibold underline-offset-2 hover:underline" onClick={() => void queue(false)}>
                  {tx.cancelQueue}
                </button>
              </span>
            ) : (
              running && <span className="text-[11.5px] text-muted">{tx.closeSim}</span>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

/** Ana menüdeki kutunun küçük bir kopyası (simin kutularıyla aynı oranda). */
function TilePreview() {
  const t = useCareerT();
  return (
    <div className="flex items-end gap-2" aria-hidden>
      <AircraftPhoto title="C172SP G1000 Passengers" cls="light_piston" className="aspect-[308/284] w-[46%] rounded-lg">
        <span className="absolute left-2.5 top-2 text-[13px] font-semibold text-white [text-shadow:0_1px_6px_rgb(0_0_0/0.6)]">Modstead Kariyer</span>
        <span className="absolute bottom-2 right-2 rounded-full bg-[#ff8a3d] px-2 py-0.5 text-[9px] font-bold tracking-[0.08em] text-[#1a1208]">MODSTEAD</span>
      </AircraftPhoto>
      <div className="flex flex-1 flex-col gap-1.5 pb-1 text-[10.5px] text-muted">
        <span className="font-mono text-[15px] font-bold text-fg">LTFJ → LTBQ</span>
        <span>{t.menuTile.previewSteps}</span>
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
    <div className="msfs-sim-panel rounded-xl px-3.5 py-3 text-white" aria-hidden>
      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.06em] text-white/60">
        <span className="size-1.5 rounded-full bg-[#3ecf8e]" />
        <span className="flex-1">{p.status}</span>
        <span className="text-[var(--sim-accent)]">{t.kinds.cargo}</span>
      </div>
      <div className="mt-2 flex items-center gap-2 font-mono text-[17px] font-bold">
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
