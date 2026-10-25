// Sim içi panel (HUD) kartı: panelin nasıl göründüğü, hangi simlere bağlı olduğu, kurma/güncelleme/kaldırma.
// Panel paketi Modstead'e gömülüdür (games/msfs/hud); kurulum kütüphaneye yazar ve simlere bağlar (simler kapalıyken).

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CircleCheck, Download, MonitorUp, RefreshCw, Trash2 } from "lucide-react";
import { notifyError } from "@/shell/actions";
import { Badge, Button } from "@/ui";
import { careerApi } from "./api";
import { useCareerT } from "./i18n";
import { ck } from "./queries";
import type { HudStatus } from "./types";

const key = [...ck.all, "hud"] as const;

export function HudCard() {
  const t = useCareerT();
  const qc = useQueryClient();
  const { data: s } = useQuery({ queryKey: key, queryFn: careerApi.hud, staleTime: 30_000 });
  const [busy, setBusy] = useState<"install" | "remove" | null>(null);
  if (!s) return null;

  const running = s.sims.some((x) => x.running);
  const outdated = s.installed && s.version !== s.latest;
  const run = async (what: "install" | "remove") => {
    setBusy(what);
    try {
      const next: HudStatus = what === "install" ? await careerApi.hudInstall() : await careerApi.hudRemove();
      qc.setQueryData(key, next);
      toast.success(what === "install" ? t.hud.installed : t.hud.removed);
    } catch (e) {
      notifyError(e);
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="card overflow-hidden">
      <header className="flex items-center gap-3 border-b border-line px-5 py-3.5">
        <MonitorUp className="size-4 text-fg-2" />
        <h3 className="min-w-0 flex-1 text-[14px] font-semibold text-fg">{t.hud.title}</h3>
        {s.installed && !outdated && (
          <Badge tone="ok" icon={<CircleCheck className="size-3" />}>
            v{s.version}
          </Badge>
        )}
        {outdated && <Badge tone="warn">{t.hud.newVersion(s.latest)}</Badge>}
      </header>
      <div className="flex flex-col gap-3.5 px-5 py-4">
        <PanelPreview />
        <p className="text-[12.5px] leading-relaxed text-fg-2">{t.hud.body}</p>
        <p className="text-[11.5px] leading-relaxed text-muted">{t.hud.how}</p>
        {s.sims.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {s.sims.map((x) => (
              <Badge key={x.id} tone={x.running ? "warn" : x.linked ? "ok" : "neutral"} dot>
                MSFS {x.short} · {x.running ? t.hud.running : x.linked ? t.hud.linked : t.hud.notLinked}
              </Badge>
            ))}
          </div>
        )}
        {!s.library ? (
          <p className="text-[12px] text-warn">{t.hud.noLibrary}</p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {(!s.installed || outdated) && (
              <Button variant="primary" icon={outdated ? <RefreshCw className="size-4" /> : <Download className="size-4" />} loading={busy === "install"} disabled={running || busy !== null} onClick={() => void run("install")}>
                {outdated ? t.hud.update : t.hud.install}
              </Button>
            )}
            {s.installed && (
              <Button variant="ghost" icon={<Trash2 className="size-4" />} loading={busy === "remove"} disabled={running || busy !== null} onClick={() => void run("remove")}>
                {t.hud.remove}
              </Button>
            )}
            {running && <span className="text-[11.5px] text-warn">{t.hud.closeSim}</span>}
          </div>
        )}
      </div>
    </section>
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
