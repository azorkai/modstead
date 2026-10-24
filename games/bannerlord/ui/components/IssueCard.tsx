import type { ReactNode } from "react";
import { AlertTriangle, ArrowDownUp, Info, Power, PowerOff, Search, ShieldOff, Archive, XOctagon } from "lucide-react";
import clsx from "clsx";
import type { Fix, Issue } from "../types";
import { useApp } from "../store";
import { Button } from "./kit";
import { useT } from "../i18n";

const FIX_ICON: Record<Fix["type"], ReactNode> = {
  enable: <Power className="size-3.5" />,
  disable: <PowerOff className="size-3.5" />,
  sort: <ArrowDownUp className="size-3.5" />,
  unblock: <ShieldOff className="size-3.5" />,
  search: <Search className="size-3.5" />,
  retireCopy: <Archive className="size-3.5" />,
};

// Sorun başlığı ve ayrıntısı arka uçtan yerelleştirilmiş gelir; burada yalnızca düğme etiketi çevrilir.
export function IssueCard({ issue, compact, onSelect }: { issue: Issue; compact?: boolean; onSelect?: (id: string) => void }) {
  const t = useT();
  const applyFix = useApp((s) => s.applyFix);
  const tone =
    issue.severity === "error" ? "text-danger" : issue.severity === "warning" ? "text-warn" : "text-info";
  const Icon = issue.severity === "error" ? XOctagon : issue.severity === "warning" ? AlertTriangle : Info;
  const fix = issue.fix ? { label: t.issues.fix[issue.fix.type], icon: FIX_ICON[issue.fix.type] } : null;
  return (
    <div
      className={clsx(
        "group rounded-xl border bg-surface-2/50 p-3 transition-colors",
        issue.severity === "error" ? "border-danger/20" : issue.severity === "warning" ? "border-warn/20" : "border-line",
      )}
    >
      <div className="flex gap-2.5">
        <Icon className={clsx("mt-0.5 size-4 shrink-0", tone)} />
        <div className="min-w-0 flex-1">
          <button
            className="text-left text-[12.5px] font-semibold leading-snug text-fg hover:underline disabled:no-underline"
            disabled={!onSelect}
            onClick={() => onSelect?.(issue.moduleId)}
          >
            {issue.title}
          </button>
          {!compact && <p className="mt-0.5 whitespace-pre-line text-[12px] leading-relaxed text-fg-2">{issue.detail}</p>}
          {issue.fix && fix && (
            <Button
              size="sm"
              variant={issue.severity === "error" ? "subtle" : "secondary"}
              className="mt-2"
              icon={fix.icon}
              onClick={() => applyFix(issue.fix!)}
            >
              {fix.label}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
