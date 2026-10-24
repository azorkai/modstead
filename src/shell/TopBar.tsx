// İçerik sütununun üst çubuğu: konum, komut paleti, indirmeler, pencere düğmeleri.
// Boş alanlar pencereyi sürükler (`data-tauri-drag-region`).

import { useEffect, useState, type ReactNode } from "react";
import { ChevronRight, Download, Minus, Search, Square, X } from "lucide-react";
import clsx from "clsx";
import { useT } from "@/lib/i18n";
import { isTauri } from "@/lib/ipc";
import { useJobs } from "@/lib/queries";
import { useUi } from "@/lib/store";
import { FINAL_STAGES } from "@/lib/types";
import { Kbd } from "@/ui";

function WindowControls() {
  const t = useT();
  const [maximized, setMaximized] = useState(false);
  useEffect(() => {
    if (!isTauri) return;
    let stop: (() => void) | undefined;
    void import("@tauri-apps/api/window").then(async ({ getCurrentWindow }) => {
      const w = getCurrentWindow();
      setMaximized(await w.isMaximized());
      stop = await w.onResized(async () => setMaximized(await w.isMaximized()));
    });
    return () => stop?.();
  }, []);
  if (!isTauri) return null;
  const act = (fn: "minimize" | "toggleMaximize" | "close") => () => void import("@tauri-apps/api/window").then(({ getCurrentWindow }) => getCurrentWindow()[fn]());
  return (
    <div className="-mr-2 ml-1 flex items-center">
      <button className="win-btn" aria-label={t.window.minimize} onClick={act("minimize")}>
        <Minus className="size-4" />
      </button>
      <button className="win-btn" aria-label={t.window.maximize} onClick={act("toggleMaximize")}>
        {maximized ? (
          <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.4">
            <rect x="2.5" y="4.5" width="9" height="9" rx="1.5" />
            <path d="M5 2.5h7a1.5 1.5 0 0 1 1.5 1.5v7" />
          </svg>
        ) : (
          <Square className="size-3.5" />
        )}
      </button>
      <button className="win-btn close" aria-label={t.window.close} onClick={act("close")}>
        <X className="size-4" />
      </button>
    </div>
  );
}

function JobsButton() {
  const t = useT();
  const open = useUi((s) => s.jobsOpen);
  const setJobs = useUi((s) => s.setJobs);
  const { data: jobs } = useJobs();
  const active = (jobs ?? []).filter((j) => !FINAL_STAGES.includes(j.stage));
  const review = active.filter((j) => j.stage === "review").length;
  const progress = active.length ? active.reduce((a, j) => a + (j.progress ?? 0), 0) / active.length : 0;
  return (
    <button
      data-jobs-toggle
      onClick={() => setJobs(!open)}
      title={t.nav.downloads}
      className={clsx(
        "relative flex h-9 items-center gap-2 rounded-[10px] px-2.5 text-[12.5px] text-fg-2 transition-colors hover:bg-surface-2 hover:text-fg",
        open && "bg-surface-2 text-fg",
      )}
    >
      <span className="relative flex size-5 items-center justify-center">
        {active.length > 0 && (
          <svg className="absolute inset-[-3px] -rotate-90" viewBox="0 0 26 26">
            <circle cx="13" cy="13" r="11.5" fill="none" stroke="var(--line-strong)" strokeWidth="2" />
            <circle cx="13" cy="13" r="11.5" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeDasharray={72.3} strokeDashoffset={72.3 - 72.3 * progress} />
          </svg>
        )}
        <Download className="size-[15px]" />
      </span>
      {active.length > 0 && <span className="tabular">{active.length}</span>}
      {review > 0 && <span className="absolute right-1 top-1 size-2 rounded-full bg-warn" />}
    </button>
  );
}

export function TopBar({ crumbs }: { crumbs: ReactNode[] }) {
  const t = useT();
  const setPalette = useUi((s) => s.setPalette);
  return (
    <header data-tauri-drag-region className="relative z-[3] flex h-[54px] shrink-0 items-center gap-3 border-b border-line pl-7 pr-4">
      <div data-tauri-drag-region className="flex min-w-0 items-center gap-1.5 text-[13px]">
        {crumbs.map((c, i) => (
          <span key={i} className="flex min-w-0 items-center gap-1.5">
            {i > 0 && <ChevronRight className="size-3.5 shrink-0 text-muted" />}
            <span className={clsx("truncate", i === crumbs.length - 1 ? "font-medium text-fg" : "text-muted")}>{c}</span>
          </span>
        ))}
      </div>
      <div data-tauri-drag-region className="flex-1" />
      <button
        onClick={() => setPalette(true)}
        className="flex h-9 w-[300px] items-center gap-2.5 rounded-[10px] border border-line bg-surface/70 px-3 text-[12.5px] text-muted transition-colors hover:border-line-strong hover:text-fg-2"
      >
        <Search className="size-4" />
        <span className="flex-1 text-left">{t.nav.searchPlaceholder}</span>
        <Kbd>Ctrl</Kbd>
        <Kbd>K</Kbd>
      </button>
      <JobsButton />
      <WindowControls />
    </header>
  );
}
