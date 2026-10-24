// Ortak güvenlik raporu görünümü. Her oyunun kurulum incelemesi bunu kullanır; oyun kendi
// planını yanına koyar. Rapor çekirdekte üretilir (crates/core/src/security).

import type { ReactNode } from "react";
import { AlertOctagon, AlertTriangle, BadgeCheck, Ban, Bug, ExternalLink, FileCode2, Fingerprint, Globe, Info, ShieldAlert, ShieldCheck, ShieldQuestion } from "lucide-react";
import clsx from "clsx";
import { useT } from "@/lib/i18n";
import { bytes, shortHash } from "@/lib/format";
import { invoke } from "@/lib/ipc";
import type { EngineResult, Finding, SecurityReport, Severity } from "@/lib/types";
import { Badge, type Tone } from "./display";

const verdictTone: Record<SecurityReport["verdict"], { icon: ReactNode; ring: string; color: string }> = {
  safe: { icon: <ShieldCheck className="size-5" />, ring: "border-ok/25 bg-ok/[0.07]", color: "text-ok bg-ok/10" },
  caution: { icon: <ShieldAlert className="size-5" />, ring: "border-warn/30 bg-warn/[0.07]", color: "text-warn bg-warn/10" },
  danger: { icon: <AlertOctagon className="size-5" />, ring: "border-danger/30 bg-danger/[0.08]", color: "text-danger bg-danger/10" },
};

const severityIcon: Record<Severity, ReactNode> = {
  critical: <AlertOctagon className="size-4 text-danger" />,
  high: <AlertTriangle className="size-4 text-warn" />,
  medium: <AlertTriangle className="size-4 text-warn/80" />,
  low: <Info className="size-4 text-info" />,
  info: <Info className="size-4 text-muted" />,
};

function engineTone(e: EngineResult): Tone {
  switch (e.status) {
    case "clean":
      return "ok";
    case "threat":
      return "danger";
    case "error":
    case "unavailable":
      return "warn";
    default:
      return "neutral";
  }
}

function openVt(sha256: string) {
  void invoke("open_url", { url: `https://www.virustotal.com/gui/file/${sha256}` }).catch(() => {});
}

function Fact({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="well flex min-w-0 items-start gap-3 px-3.5 py-3">
      <div className="mt-0.5 text-muted">{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="text-[11.5px] font-medium text-muted">{label}</div>
        <div className="mt-0.5 min-w-0 text-[12.5px] text-fg">{children}</div>
      </div>
    </div>
  );
}

function FindingRow({ f }: { f: Finding }) {
  return (
    <li className="flex items-start gap-3 px-4 py-2.5">
      <div className="mt-0.5">{severityIcon[f.severity]}</div>
      <div className="min-w-0 flex-1">
        <div className="text-[12.5px] font-medium text-fg">{f.title}</div>
        <div className="text-[12px] text-fg-2">{f.detail}</div>
        {f.path && <div className="mt-0.5 truncate font-mono text-[11px] text-muted" data-selectable>{f.path}</div>}
      </div>
    </li>
  );
}

export function SecurityPanel({ report, compact }: { report: SecurityReport; compact?: boolean }) {
  const t = useT();
  const v = verdictTone[report.verdict];
  const findings = report.findings.filter((f) => !compact || f.severity !== "info");
  return (
    <div className="flex flex-col gap-3">
      <div className={clsx("flex items-center gap-3.5 rounded-2xl border px-4 py-3.5", v.ring)}>
        <div className={clsx("flex size-10 items-center justify-center rounded-xl", v.color)}>{v.icon}</div>
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-semibold text-fg">{t.security.verdict[report.verdict]}</div>
          <div className="text-[12.5px] text-fg-2">{t.security.verdictHint[report.verdict]}</div>
        </div>
        <div className="text-right">
          <div className="tabular text-[20px] font-semibold leading-none text-fg">{report.score}</div>
          <div className="mt-1 text-[10.5px] text-muted">{t.security.score}</div>
        </div>
      </div>

      {report.blocked && (
        <div className="flex items-start gap-2.5 rounded-xl border border-danger/30 bg-danger/[0.08] px-3.5 py-2.5 text-[12.5px] text-danger">
          <Ban className="mt-0.5 size-4 shrink-0" />
          <div>
            <div className="font-semibold">{t.security.blocked}</div>
            <div className="text-danger/90">{report.blocked}</div>
          </div>
        </div>
      )}
      {!report.blocked && report.needsOverride && (
        <div className="flex items-start gap-2.5 rounded-xl border border-warn/30 bg-warn/[0.08] px-3.5 py-2.5 text-[12.5px] text-warn">
          <ShieldQuestion className="mt-0.5 size-4 shrink-0" />
          <div>
            <div className="font-semibold">{t.security.needsOverride}</div>
            <div className="text-fg-2">{report.needsOverride}</div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Fact icon={<Globe className="size-4" />} label={t.security.source}>
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate">{report.source.label}</span>
            <Badge tone={report.source.trust === "trusted" ? "ok" : report.source.trust === "unknown" ? "warn" : "neutral"}>{t.security.trust[report.source.trust]}</Badge>
          </div>
        </Fact>
        <Fact icon={<Fingerprint className="size-4" />} label={t.security.verification}>
          <div className="flex items-center gap-2">
            <Badge
              tone={report.verification.status === "verified" ? "ok" : report.verification.status === "mismatch" ? "danger" : report.verification.status === "unverified" ? "warn" : "neutral"}
              icon={report.verification.status === "verified" ? <BadgeCheck className="size-3" /> : undefined}
            >
              {t.security.verificationStatus[report.verification.status]}
            </Badge>
            <span className="truncate text-fg-2">{report.verification.method}</span>
          </div>
          {!compact && <div className="mt-1 text-[11.5px] text-muted">{report.verification.detail}</div>}
        </Fact>
        <Fact icon={<Bug className="size-4" />} label={t.security.defender}>
          <div className="flex items-center gap-2">
            <Badge tone={engineTone(report.defender)}>{t.security.engineStatus[report.defender.status]}</Badge>
            <span className="truncate text-fg-2">{report.defender.engine}</span>
          </div>
          {!compact && report.defender.status !== "clean" && report.defender.detail && <div className="mt-1 text-[11.5px] text-muted">{report.defender.detail}</div>}
        </Fact>
        <Fact icon={<ShieldCheck className="size-4" />} label={report.virustotal ? "VirusTotal" : t.security.nexusScan}>
          {report.virustotal ? (
            <div className="flex items-center gap-2">
              <Badge tone={engineTone(report.virustotal)}>{t.security.engineStatus[report.virustotal.status]}</Badge>
              <span className="truncate text-fg-2">{report.virustotal.detail}</span>
            </div>
          ) : (
            <span className={clsx(report.nexusScan ? "text-fg" : "text-muted")}>{report.nexusScan ?? "—"}</span>
          )}
        </Fact>
      </div>

      {report.archive && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-[11.5px] text-muted">
          <span className="text-fg-2">{report.archive.name}</span>
          <span>{report.archive.kind}</span>
          <span>{bytes(report.archive.size)}</span>
          <span>{t.security.files(report.scannedFiles)}</span>
          <button className="font-mono hover:text-fg" title={report.archive.sha256} onClick={() => openVt(report.archive!.sha256)}>
            SHA-256 {shortHash(report.archive.sha256)}
          </button>
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="border-b border-line px-4 py-2.5 text-[12px] font-semibold text-fg">{t.security.findings}</div>
        {findings.length === 0 ? (
          <div className="px-4 py-3 text-[12.5px] text-fg-2">{t.security.noFindings}</div>
        ) : (
          <ul className="divide-y divide-[var(--line)]">
            {findings.map((f, i) => (
              <FindingRow key={`${f.code}-${i}`} f={f} />
            ))}
          </ul>
        )}
      </div>

      {report.codeFiles.length > 0 && !compact && (
        <div className="card overflow-hidden">
          <div className="border-b border-line px-4 py-2.5 text-[12px] font-semibold text-fg">{t.security.codeFiles}</div>
          <ul className="max-h-56 divide-y divide-[var(--line)] overflow-y-auto">
            {report.codeFiles.map((f) => (
              <li key={f.path} className="flex items-center gap-3 px-4 py-2">
                <FileCode2 className="size-4 shrink-0 text-muted" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-mono text-[11.5px] text-fg" data-selectable>{f.path}</div>
                  <div className="text-[11px] text-muted">
                    {bytes(f.size)} · {shortHash(f.sha256)}
                  </div>
                </div>
                <Badge tone={f.expected ? "neutral" : "warn"}>{f.expected ? t.security.expected : t.security.unexpected}</Badge>
                {f.sha256 && (
                  <button className="flex items-center gap-1 text-[11.5px] text-muted hover:text-fg" onClick={() => openVt(f.sha256)}>
                    <ExternalLink className="size-3.5" />
                    {t.security.lookup}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
