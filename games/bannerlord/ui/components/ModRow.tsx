import { memo } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AlertTriangle, GripVertical, Info, ShieldAlert, XOctagon } from "lucide-react";
import clsx from "clsx";
import type { InstallRecord, Issue, ModEntry, ModuleInfo } from "../types";
import { Badge, ModuleAvatar, Switch } from "./kit";
import { useT } from "../i18n";

export interface RowProps {
  entry: ModEntry;
  index: number;
  module: ModuleInfo | undefined;
  issues: Issue[];
  record: InstallRecord | undefined;
  duplicate: boolean;
  selected: boolean;
  draggable: boolean;
  onSelect: (id: string) => void;
  onToggle: (id: string, v: boolean) => void;
}

export const ModRow = memo(function ModRow(props: RowProps) {
  const { entry, draggable } = props;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: entry.id,
    disabled: !draggable,
  });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={clsx("relative", isDragging && "z-10")}
    >
      <RowBody {...props} dragging={isDragging} handle={{ ...attributes, ...listeners }} />
    </div>
  );
});

export function RowBody({
  entry,
  index,
  module: m,
  issues,
  record,
  duplicate,
  selected,
  draggable,
  onSelect,
  onToggle,
  dragging,
  handle,
}: RowProps & { dragging?: boolean; handle?: Record<string, unknown> }) {
  // ModRow memo'lu; dil değişince bu abonelik satırı yeniden çizer.
  const t = useT();
  const worst = issues.find((i) => i.severity === "error") ?? issues.find((i) => i.severity === "warning") ?? issues[0];
  const blocked = m ? m.dlls.filter((d) => d.blocked).length : 0;
  const name = m?.name ?? entry.id;

  return (
    <div
      onClick={() => onSelect(entry.id)}
      className={clsx(
        "group relative flex h-[54px] items-center gap-3 rounded-xl border pl-1.5 pr-3 transition-[background,border,box-shadow,opacity] duration-150",
        dragging
          ? "border-accent/40 bg-surface-3 shadow-lg"
          : selected
            ? "border-line-strong bg-surface-2"
            : "border-transparent hover:border-line hover:bg-surface/80",
        !entry.enabled && !dragging && "opacity-[0.62]",
      )}
    >
      {selected && <span className="absolute -left-px top-3 h-7 w-[3px] rounded-r-full bg-accent" />}
      <button
        {...(handle ?? {})}
        onClick={(e) => e.stopPropagation()}
        aria-label={t.modRow.dragHandle}
        className={clsx(
          "flex h-9 w-5 items-center justify-center rounded-md text-muted transition-colors",
          draggable ? "cursor-grab hover:text-fg-2 active:cursor-grabbing" : "cursor-not-allowed opacity-30",
        )}
      >
        <GripVertical className="size-4" />
      </button>
      <span className="w-6 text-right font-mono text-[11px] text-muted tabular">{String(index + 1).padStart(2, "0")}</span>
      <Switch checked={entry.enabled} onChange={(v) => onToggle(entry.id, v)} label={t.modRow.toggle(name)} size="sm" />
      <ModuleAvatar id={entry.id} name={name} size={30} official={m?.isOfficial} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[13.5px] font-medium text-fg">{name}</span>
          {m?.isOfficial && <Badge tone="accent">{t.modRow.official}</Badge>}
          {m?.location === "workshop" && <Badge tone="info">Workshop</Badge>}
          {record?.source.kind === "nexus" && <Badge>Nexus</Badge>}
          {record?.source.kind === "github" && <Badge>GitHub</Badge>}
          {duplicate && <Badge tone="warn">{t.modRow.twoCopies}</Badge>}
          {blocked > 0 && (
            <Badge tone="danger" icon={<ShieldAlert className="size-3" />}>
              {t.modRow.blockedDlls(blocked)}
            </Badge>
          )}
          {m?.parseError && <Badge tone="danger">{t.modRow.broken}</Badge>}
        </div>
        <div className="truncate font-mono text-[11px] text-muted">{entry.id}</div>
      </div>
      {worst && (
        <span
          title={t.modRow.issuesTitle(issues.length, worst.title)}
          className={clsx(
            "flex h-6 items-center gap-1 rounded-md px-1.5 text-[11px] font-semibold tabular",
            worst.severity === "error" && "bg-danger/12 text-danger",
            worst.severity === "warning" && "bg-warn/12 text-warn",
            worst.severity === "info" && "bg-info/10 text-info",
          )}
        >
          {worst.severity === "error" ? (
            <XOctagon className="size-3.5" />
          ) : worst.severity === "warning" ? (
            <AlertTriangle className="size-3.5" />
          ) : (
            <Info className="size-3.5" />
          )}
          {issues.length > 1 && issues.length}
        </span>
      )}
      <span className="w-[92px] truncate text-right font-mono text-[11.5px] text-fg-2">{m?.version || "—"}</span>
    </div>
  );
}
