// İndirmeler ve kurulumlar paneli (üst çubuktaki düğmeden açılır).

import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CircleCheck, CircleX, Download, ShieldQuestion, X } from "lucide-react";
import { useT } from "@/lib/i18n";
import { bytes, percent } from "@/lib/format";
import { invoke } from "@/lib/ipc";
import { keys, queryClient, removeJob, useJobs } from "@/lib/queries";
import { useUi } from "@/lib/store";
import { FINAL_STAGES, type JobSnapshot } from "@/lib/types";
import { Badge, Button, EmptyState, IconButton, Progress } from "@/ui";
import { gameModule } from "@/games/registry";
import { notifyError } from "./actions";
import { GameIcon } from "./GameIcon";

function JobRow({ job }: { job: JobSnapshot }) {
  const t = useT();
  const setReview = useUi((s) => s.setReview);
  const game = gameModule(job.game);
  const final = FINAL_STAGES.includes(job.stage);
  const dismiss = async () => {
    removeJob(job.id);
    await invoke("job_dismiss", { id: job.id }).catch(notifyError);
  };
  return (
    <li data-game={job.game} className="group px-4 py-3">
      <div className="flex items-start gap-3">
        {/* Oyunun simgesi; köşesinde işin durumu. */}
        <div className="relative mt-0.5 shrink-0">
          {game ? (
            <GameIcon game={game} size={32} />
          ) : (
            <div className="accent-soft flex size-8 items-center justify-center rounded-lg">
              <Download className="size-4" />
            </div>
          )}
          {(job.stage === "done" || job.stage === "failed" || job.stage === "review") && (
            <span className="absolute -bottom-1 -right-1 flex size-[17px] items-center justify-center rounded-full bg-surface ring-2 ring-[var(--surface)]">
              {job.stage === "done" ? (
                <CircleCheck className="size-[15px] text-ok" />
              ) : job.stage === "failed" ? (
                <CircleX className="size-[15px] text-danger" />
              ) : (
                <ShieldQuestion className="size-[15px] text-warn" />
              )}
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-fg">{job.title}</span>
            {final ? (
              <IconButton label={t.jobs.dismiss} size="sm" onClick={dismiss} className="opacity-0 group-hover:opacity-100">
                <X className="size-3.5" />
              </IconButton>
            ) : job.stage !== "review" ? (
              <IconButton label={t.jobs.cancel} size="sm" onClick={() => invoke("job_cancel", { id: job.id }).catch(notifyError)}>
                <X className="size-3.5" />
              </IconButton>
            ) : null}
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-[11.5px] text-muted">
            <span className="text-fg-2">{game?.short}</span>
            <span>·</span>
            <span className="truncate">{job.error ?? (job.stage === "downloading" && job.total ? `${bytes(job.bytes)} / ${bytes(job.total)}` : job.message || t.jobs.stages[job.stage])}</span>
          </div>
          {!final && job.stage !== "review" && (
            <div className="mt-2 flex items-center gap-2">
              <Progress value={job.progress} />
              <span className="tabular w-9 text-right text-[11px] text-muted">{percent(job.progress)}</span>
            </div>
          )}
          {job.stage === "review" && (
            <div className="mt-2 flex items-center gap-2">
              <Button size="sm" variant="primary" onClick={() => setReview(job.id)}>
                {t.jobs.review}
              </Button>
              {job.security && (
                <Badge tone={job.security.verdict === "safe" ? "ok" : job.security.verdict === "caution" ? "warn" : "danger"}>{t.security.verdict[job.security.verdict]}</Badge>
              )}
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

export function JobsDock() {
  const t = useT();
  const open = useUi((s) => s.jobsOpen);
  const setJobs = useUi((s) => s.setJobs);
  const { data: jobs } = useJobs();
  const panel = useRef<HTMLDivElement>(null);
  const list = [...(jobs ?? [])].sort((a, b) => Number(FINAL_STAGES.includes(a.stage)) - Number(FINAL_STAGES.includes(b.stage)) || b.updated - a.updated);
  const active = list.filter((j) => !FINAL_STAGES.includes(j.stage)).length;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!panel.current?.contains(target) && !target.closest("[data-jobs-toggle]")) setJobs(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setJobs(false);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, setJobs]);

  const clear = async () => {
    try {
      queryClient.setQueryData(keys.jobs, await invoke<JobSnapshot[]>("jobs_clear"));
    } catch (e) {
      notifyError(e);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={panel}
          initial={{ opacity: 0, y: -6, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -6, scale: 0.98 }}
          transition={{ duration: 0.16 }}
          className="glass fixed right-4 top-[58px] z-40 flex max-h-[calc(100vh-90px)] w-[420px] origin-top-right flex-col overflow-hidden rounded-2xl border border-line-strong"
          style={{ boxShadow: "var(--shadow-lg)" }}
        >
          <header className="flex items-center justify-between border-b border-line px-4 py-3">
            <div>
              <h3 className="text-[13.5px] font-semibold text-fg">{t.jobs.title}</h3>
              <p className="text-[11.5px] text-muted">{active ? t.jobs.active(active) : t.jobs.empty}</p>
            </div>
            {list.some((j) => FINAL_STAGES.includes(j.stage)) && (
              <Button size="sm" variant="ghost" onClick={clear}>
                {t.jobs.clear}
              </Button>
            )}
          </header>
          {list.length === 0 ? (
            <EmptyState icon={<Download className="size-6" />} title={t.jobs.empty} className="py-10">
              {t.jobs.emptyHint}
            </EmptyState>
          ) : (
            <ul className="min-h-0 flex-1 divide-y divide-[var(--line)] overflow-y-auto">
              {list.map((j) => (
                <JobRow key={j.id} job={j} />
              ))}
            </ul>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
