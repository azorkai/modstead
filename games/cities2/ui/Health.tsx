// Sağlık: puan, bulgular (tek tık çözümleriyle), kurulu modların güvenlik taraması ve son oturumun
// günlük özeti (hatalar mümkünse bir modla eşlenir; günlük uygulama içinde görüntülenir).

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ExternalLink, FileText, FolderOpen, RefreshCw, ScrollText, ShieldAlert, ShieldCheck, ShieldQuestion } from "lucide-react";
import clsx from "clsx";
import { ago, bytes } from "@/lib/format";
import { queryClient } from "@/lib/queries";
import { notifyError, openUrl } from "@/shell/actions";
import { Badge, Button, Dialog, DialogBody, DialogHeader, EmptyState, PageHeader, ScoreRing, Skeleton, Spinner } from "@/ui";
import { api } from "./api";
import { useS } from "./i18n";
import { GAME, qk, runFix, useCitiesSync, useHealth, useModIndex } from "./queries";
import { Card, IssueIcon, ModThumb, Page } from "./shared";
import type { Issue, SecurityScan } from "./types";

export default function Health() {
  useCitiesSync();
  const t = useS();
  const { data: health, isLoading, refetch, isFetching } = useHealth();
  const [log, setLog] = useState<string | null>(null);
  const score = health?.score ?? 0;
  const label = score >= 85 ? t.health.scoreGreat : score >= 60 ? t.health.scoreOk : t.health.scoreBad;

  return (
    <Page className="flex flex-col gap-5 pb-12">
      <PageHeader
        title={t.health.title}
        subtitle={t.health.subtitle}
        actions={
          <Button icon={<RefreshCw className={clsx("size-4", isFetching && "animate-spin")} />} onClick={() => refetch()}>
            {t.health.recheck}
          </Button>
        }
      />

      <div className="grid grid-cols-[280px_1fr] gap-5">
        <div className="card flex flex-col items-center justify-center gap-3 px-6 py-7">
          {isLoading ? <Skeleton className="size-[120px] rounded-full" /> : <ScoreRing score={score} size={120} stroke={10} label={label} />}
          {health && <div className="text-center text-[12px] text-muted">{ago(health.checkedAt)}</div>}
        </div>
        <SecurityCard />
      </div>

      {isLoading ? (
        <div className="card space-y-2 p-5">
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
        </div>
      ) : !health?.issues.length ? (
        <div className="card">
          <EmptyState icon={<ShieldCheck className="size-6" />} title={t.health.noIssuesTitle}>
            {t.health.noIssuesBody}
          </EmptyState>
        </div>
      ) : (
        <div className="card overflow-hidden">
          {health.issues.map((i) => (
            <IssueRow key={i.id} issue={i} />
          ))}
        </div>
      )}

      <LogsCard onOpen={setLog} />
      <LogViewer name={log} onClose={() => setLog(null)} />
    </Page>
  );
}

function IssueRow({ issue: i }: { issue: Issue }) {
  const t = useS();
  const { byKey } = useModIndex();
  const fix = useMutation({ mutationFn: () => runFix(i.fix!) });
  const mods = i.mods.map((k) => byKey.get(k)).filter((m) => !!m);
  return (
    <div className="flex items-start gap-3.5 border-b border-line px-5 py-4 last:border-b-0">
      <IssueIcon severity={i.severity} className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13.5px] font-semibold text-fg">{i.title}</span>
          <Badge tone={i.severity === "danger" ? "danger" : i.severity === "warn" ? "warn" : "info"}>{t.health.severity[i.severity]}</Badge>
        </div>
        <p className="mt-1 text-[12.5px] leading-relaxed text-fg-2">{i.detail}</p>
        {mods.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {mods.slice(0, 8).map((m) => (
              <span key={m.key} className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface-2/60 py-0.5 pl-0.5 pr-2 text-[12px] text-fg-2">
                <ModThumb mod={m} size={18} className="rounded-[5px]" />
                {m.name}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {i.link && (
          <Button size="sm" variant="ghost" icon={<ExternalLink className="size-3.5" />} onClick={() => openUrl(i.link!)}>
            {t.health.openLink}
          </Button>
        )}
        {i.fix && (
          <Button size="sm" variant={i.severity === "danger" ? "primary" : "subtle"} loading={fix.isPending} onClick={() => fix.mutate()}>
            {i.fix.label}
          </Button>
        )}
      </div>
    </div>
  );
}

function SecurityCard() {
  const t = useS();
  // Sonuç sorgu önbelleğinde durur: sayfadan çıkıp dönünce son tarama görünür.
  const { data: last } = useQuery<SecurityScan | null>({ queryKey: [GAME, "security-scan"], queryFn: () => null, staleTime: Infinity, enabled: false });
  const run = useMutation({ mutationFn: api.securityScan, onSuccess: (r) => queryClient.setQueryData([GAME, "security-scan"], r), onError: notifyError });
  const r = last ?? null;
  const unavailable = !!r && r.defender.length > 0 && r.defender.every((d) => d.status === "unavailable" || d.status === "error");
  return (
    <div className="card flex flex-col gap-3 px-6 py-5">
      <div className="flex items-start gap-3">
        <div
          className={clsx(
            "grid size-10 shrink-0 place-items-center rounded-xl",
            !r ? "accent-soft text-accent" : r.threat ? "bg-danger/12 text-danger" : unavailable ? "bg-warn/12 text-warn" : "bg-ok/12 text-ok",
          )}
        >
          {!r ? <ShieldCheck className="size-5" /> : r.threat ? <ShieldAlert className="size-5" /> : unavailable ? <ShieldQuestion className="size-5" /> : <ShieldCheck className="size-5" />}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-[14px] font-semibold text-fg">{t.health.securityTitle}</h3>
          <p className="mt-0.5 text-[12.5px] leading-relaxed text-fg-2">{t.health.securityBody}</p>
        </div>
        <Button variant="primary" loading={run.isPending} icon={<ShieldCheck className="size-4" />} onClick={() => run.mutate()}>
          {run.isPending ? t.health.scanning : t.health.scan}
        </Button>
      </div>
      {r && (
        <div className="rounded-[12px] border border-line bg-surface-2/50 px-4 py-3 text-[12.5px]">
          <div className={clsx("font-medium", r.threat ? "text-danger" : unavailable ? "text-warn" : "text-ok")}>
            {r.threat ? t.health.scanThreat : unavailable ? t.health.scanUnavailable : t.health.scanClean(r.dlls)}
          </div>
          {r.knownBad.map((p) => (
            <div key={p} className="mt-1 truncate font-mono text-[11.5px] text-danger" title={p}>
              {p}
            </div>
          ))}
          {r.defender
            .filter((d) => d.status !== "clean")
            .map((d, i) => (
              <div key={i} className="mt-1 whitespace-pre-line text-[12px] text-fg-2">
                {d.detail}
              </div>
            ))}
          <div className="mt-1 text-[11.5px] text-muted">{t.health.lastScan(ago(r.scannedAt))}</div>
        </div>
      )}
      <div className="mt-auto flex flex-wrap items-center gap-1.5 border-t border-line pt-3">
        {t.health.scope.map((x) => (
          <Badge key={x}>{x}</Badge>
        ))}
        {!r && <span className="ml-auto text-[11.5px] text-muted">{t.health.neverScanned}</span>}
      </div>
    </div>
  );
}

function LogsCard({ onOpen }: { onOpen: (name: string) => void }) {
  const t = useS();
  const { data: health } = useHealth();
  const { byKey } = useModIndex();
  const logs = health?.logs;
  return (
    <Card
      title={t.health.logsTitle}
      aside={
        <Button size="sm" variant="ghost" icon={<FolderOpen className="size-3.5" />} onClick={() => api.openPath("logs").catch(notifyError)}>
          {t.health.openLogs}
        </Button>
      }
    >
      {!logs ? (
        <div className="p-5">
          <Spinner className="size-5" />
        </div>
      ) : (
        <div className="grid grid-cols-[1fr_300px]">
          <div className="min-w-0 border-r border-line">
            {logs.lines.length === 0 ? (
              <p className="px-5 py-5 text-[12.5px] text-muted">{t.health.logsEmpty}</p>
            ) : (
              <ul className="max-h-[420px] overflow-y-auto">
                {logs.lines.map((l, i) => {
                  const mod = l.modKey ? byKey.get(l.modKey) : undefined;
                  return (
                    <li key={i} className="border-b border-line px-5 py-2.5 last:border-b-0">
                      <div className="flex items-center gap-2 text-[11.5px] text-muted">
                        <span className={clsx("inline-block size-1.5 rounded-full", l.level === "error" ? "bg-danger" : "bg-warn")} />
                        <span className="font-mono">{l.file}</span>
                        {l.count > 1 && <span className="tabular">{t.health.repeat(l.count)}</span>}
                        {mod && <Badge tone="accent">{t.health.linkedTo(mod.name)}</Badge>}
                      </div>
                      <div className="mt-1 line-clamp-2 break-all font-mono text-[11.5px] text-fg-2" data-selectable>
                        {l.text}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <div className="flex flex-col">
            {logs.crashes > 0 && <div className="border-b border-line px-4 py-2.5 text-[12px] font-medium text-warn">{t.health.crashes(logs.crashes)}</div>}
            <ul className="max-h-[420px] overflow-y-auto">
              {logs.files.map((f) => (
                <li key={f.name}>
                  <button onClick={() => onOpen(f.name)} className="flex w-full items-center gap-2.5 border-b border-line px-4 py-2 text-left last:border-b-0 hover:bg-surface-2/60">
                    <FileText className={clsx("size-4 shrink-0", f.errors ? "text-danger" : f.warnings ? "text-warn" : "text-muted")} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-mono text-[12px] text-fg">{f.name}</div>
                      <div className="text-[11px] text-muted">
                        {t.health.errorsWarnings(f.errors, f.warnings)} · {bytes(f.size)} · {ago(f.modified)}
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </Card>
  );
}

function LogViewer({ name, onClose }: { name: string | null; onClose: () => void }) {
  const t = useS();
  const { data, isLoading, error } = useQuery({ queryKey: [...qk.logs, name], queryFn: () => api.readLog(name!), enabled: !!name, staleTime: 5_000 });
  return (
    <Dialog open={!!name} onClose={onClose} width={960} game={GAME}>
      <DialogHeader title={`${t.health.logViewer} · ${name ?? ""}`} icon={<ScrollText className="size-5" />} onClose={onClose} />
      <DialogBody className="p-0">
        {isLoading ? (
          <div className="p-6">
            <Spinner className="size-5" />
          </div>
        ) : error ? (
          <p className="p-6 text-[13px] text-danger">{String((error as { message?: string }).message ?? error)}</p>
        ) : (
          <pre className="max-h-[64vh] overflow-auto whitespace-pre-wrap break-all px-5 py-4 font-mono text-[11.5px] leading-relaxed text-fg-2" data-selectable>
            {(data ?? "").split("\n").map((line, i) => (
              <div key={i} className={clsx(/\[ERROR\]|Exception/.test(line) ? "text-danger" : /\[WARN\]/.test(line) ? "text-warn" : undefined)}>
                {line || " "}
              </div>
            ))}
          </pre>
        )}
      </DialogBody>
    </Dialog>
  );
}
