// Güvenlik: simler açılırken exe.xml ile başlatılan programlar (kötü niyetli bir kurucu kendini buraya ekleyebilir)
// ve kurulu modların güvenlik raporları.

import { useState } from "react";
import { toast } from "sonner";
import clsx from "clsx";
import { Cpu, FileWarning, Info, ShieldAlert, ShieldCheck, ShieldQuestion } from "lucide-react";
import { useLang } from "@/lib/i18n";
import { notifyError } from "@/shell/actions";
import { Badge, Button, PageHeader, Skeleton } from "@/ui";
import { api } from "../api";
import { SIMS, SIM_COLOR, SIM_SHORT } from "../format";
import { useMsfsT } from "../i18n";
import { ModDrawer } from "../ModDrawer";
import { invalidateAll, useSnapshot, useStartupPrograms } from "../queries";
import { useMsfsUi } from "../store";
import { Thumb } from "../Thumb";

export default function Security() {
  const t = useMsfsT();
  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-5 pb-16">
      <PageHeader title={t.startup.title} subtitle={t.startup.subtitle} />
      <Programs />
      <Reports />
      <ModDrawer />
    </div>
  );
}

function Programs() {
  const t = useMsfsT();
  const { data: entries, isLoading } = useStartupPrograms();
  return (
    <section className="card overflow-hidden">
      <header className="border-b border-line px-5 py-4">
        <h3 className="text-[14px] font-semibold text-fg">{t.startup.programs}</h3>
        <p className="mt-0.5 text-[12.5px] text-fg-2">{t.startup.programsSub}</p>
      </header>
      {isLoading || !entries ? (
        <div className="space-y-2 p-5">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      ) : entries.length === 0 ? (
        <p className="px-5 py-4 text-[12.5px] text-fg-2">{t.startup.none}</p>
      ) : (
        <ul className="divide-y divide-[var(--line)]">
          {SIMS.flatMap((sim) =>
            entries
              .filter((e) => e.sim === sim)
              .map((e, i) => (
                <li key={`${sim}-${i}`} className="flex items-center gap-3.5 px-5 py-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-line bg-surface-2">
                    <Cpu className={clsx("size-4", e.signedHint === "suspicious" ? "text-danger" : "text-fg-2")} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[13px] font-medium text-fg">{e.name || "—"}</span>
                      <span className="inline-flex h-5 items-center gap-1 rounded-md border border-line px-1.5 text-[10.5px] font-semibold text-fg-2">
                        <span className="size-1.5 rounded-full" style={{ background: SIM_COLOR[sim] }} />
                        {SIM_SHORT[sim]}
                      </span>
                      {e.disabled && <Badge>{t.startup.disabled}</Badge>}
                      {!e.exists && <Badge tone="warn">{t.startup.missing}</Badge>}
                      {e.signedHint === "suspicious" && <Badge tone="danger">{t.startup.suspicious}</Badge>}
                    </div>
                    <div className="truncate font-mono text-[11px] text-muted" title={e.path} data-selectable>
                      {e.path}
                    </div>
                    {e.commandLine && (
                      <div className="truncate font-mono text-[11px] text-muted" data-selectable>
                        {t.startup.args}: {e.commandLine}
                      </div>
                    )}
                  </div>
                </li>
              )),
          )}
        </ul>
      )}
    </section>
  );
}

function Reports() {
  const t = useMsfsT();
  const lang = useLang((s) => s.lang);
  const open = useMsfsUi((s) => s.open);
  const { data: scan } = useSnapshot();
  const [progress, setProgress] = useState<[number, number] | null>(null);
  const mods = scan?.mods.filter((m) => m.source === "library") ?? [];
  const withReport = mods.filter((m) => m.meta.report).sort((a, b) => order(b.meta.report!.verdict) - order(a.meta.report!.verdict));
  const without = mods.filter((m) => !m.meta.report);

  const scanAll = async () => {
    for (let i = 0; i < without.length; i++) {
      setProgress([i + 1, without.length]);
      try {
        await api.rescanSecurity(without[i].id);
      } catch (e) {
        notifyError(e);
        break;
      }
    }
    setProgress(null);
    invalidateAll();
    toast.success(t.drawer.scanned);
  };

  return (
    <section className="card overflow-hidden">
      <header className="flex items-end gap-3 border-b border-line px-5 py-4">
        <div className="min-w-0 flex-1">
          <h3 className="text-[14px] font-semibold text-fg">{t.startup.reports}</h3>
          <p className="mt-0.5 text-[12.5px] text-fg-2">{t.startup.reportsSub}</p>
        </div>
        {without.length > 0 && (
          <Button size="sm" variant="secondary" loading={!!progress} onClick={scanAll}>
            {progress ? t.startup.scanning(progress[0], progress[1]) : t.startup.scanAll}
          </Button>
        )}
      </header>
      {withReport.length === 0 ? (
        <p className="px-5 py-4 text-[12.5px] text-fg-2">
          {t.startup.noReports}
          {without.length > 0 && ` ${t.startup.notScanned(without.length)}.`}
        </p>
      ) : (
        <ul className="divide-y divide-[var(--line)]">
          {withReport.map((m) => {
            const r = m.meta.report!;
            const Icon = r.verdict === "safe" ? ShieldCheck : r.verdict === "caution" ? ShieldQuestion : ShieldAlert;
            const tone = r.verdict === "safe" ? "ok" : r.verdict === "caution" ? "warn" : "danger";
            return (
              <li key={m.id}>
                <button type="button" onClick={() => open(m.id)} className="flex w-full items-center gap-3.5 px-5 py-3 text-left hover:bg-surface-2/50">
                  <Thumb mod={m} className="h-[34px] w-[54px] shrink-0 rounded-md" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium text-fg">{m.info.title}</div>
                    <div className="truncate text-[11.5px] text-muted">
                      {r.source.label} · {t.startup.scanned(new Date(r.scannedAt * 1000).toLocaleDateString(lang === "tr" ? "tr-TR" : "en-GB"))}
                    </div>
                  </div>
                  {m.meta.stripped.length > 0 && <FileWarning className="size-4 text-muted" aria-label={t.drawer.stripped(m.meta.stripped.length)} />}
                  <Badge tone={tone} icon={<Icon className="size-3" />}>
                    {t.startup.verdict[r.verdict]}
                  </Badge>
                </button>
              </li>
            );
          })}
          {without.length > 0 && (
            <li className="flex items-center gap-2 px-5 py-2.5 text-[12px] text-muted">
              <Info className="size-3.5" />
              {t.startup.notScanned(without.length)}
            </li>
          )}
        </ul>
      )}
    </section>
  );
}

function order(v: string): number {
  return v === "danger" ? 2 : v === "caution" ? 1 : 0;
}
