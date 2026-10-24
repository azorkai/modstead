// Sayfaların ortak küçük parçaları.

import type { ReactNode } from "react";
import { AlertOctagon, AlertTriangle, Info } from "lucide-react";
import clsx from "clsx";
import type { Tone } from "@/ui";
import { NexusSheet } from "./NexusSheet";
import type { Severity } from "./types";

export function IssueIcon({ severity, className }: { severity: Severity; className?: string }) {
  if (severity === "error") return <AlertOctagon className={clsx("size-4 shrink-0 text-danger", className)} />;
  if (severity === "warning") return <AlertTriangle className={clsx("size-4 shrink-0 text-warn", className)} />;
  return <Info className={clsx("size-4 shrink-0 text-info", className)} />;
}

export const COMPAT_TONE: Record<string, Tone> = {
  ok: "ok",
  optional: "ok",
  workaround: "warn",
  unofficial: "info",
  broken: "danger",
  obsolete: "warn",
  abandoned: "neutral",
};

/** Sayfa içeriğinin standart genişliği. Nexus mod sayfası çekmecesi her sayfada açılabilir. */
export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={clsx("mx-auto max-w-[1180px]", className)}>
      {children}
      <NexusSheet />
    </div>
  );
}

/** Küçük bölüm etiketi (çekmece ve kartlarda). */
export function Label({ children, className }: { children: ReactNode; className?: string }) {
  return <h4 className={clsx("mb-2 text-[11.5px] font-medium uppercase tracking-[0.08em] text-muted", className)}>{children}</h4>;
}
