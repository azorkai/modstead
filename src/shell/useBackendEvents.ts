// Arka uç olaylarını arayüze bağlar: görevler, oyun durumu, nxm bağlantıları, dosyalar, bildirimler.

import { useEffect } from "react";
import { toast } from "sonner";
import { t } from "@/lib/i18n";
import { EVENTS, invoke, listen } from "@/lib/ipc";
import { keys, queryClient, upsertJob } from "@/lib/queries";
import { useUi, type NxmRequest } from "@/lib/store";
import type { JobSnapshot, PendingInput, Tone } from "@/lib/types";
import { handleIncomingFiles } from "./DropOverlay";

export function useBackendEvents() {
  useEffect(() => {
    const offs = [
      listen<JobSnapshot>(EVENTS.job, (job) => {
        const prev = queryClient.getQueryData<JobSnapshot[]>(keys.jobs)?.find((j) => j.id === job.id);
        upsertJob(job);
        if (prev?.stage === job.stage) return;
        if (job.stage === "review") {
          toast(t().toast.jobReview(job.title), { action: { label: t().jobs.review, onClick: () => useUi.getState().setReview(job.id) } });
        } else if (job.stage === "done") {
          toast.success(t().toast.jobDone(job.title));
          void queryClient.invalidateQueries({ queryKey: keys.games });
        } else if (job.stage === "failed") {
          toast.error(t().toast.jobFailed(job.title), { description: job.error ?? undefined });
        }
      }),
      listen(EVENTS.gameChanged, () => void queryClient.invalidateQueries({ queryKey: keys.games })),
      listen<NxmRequest>(EVENTS.nxm, (r) => useUi.getState().pushNxm(r)),
      listen<{ paths: string[] }>(EVENTS.files, ({ paths }) => handleIncomingFiles(paths)),
      listen<{ tone: Tone; title: string; detail?: string | null }>(EVENTS.notify, (n) => {
        const opts = { description: n.detail ?? undefined };
        if (n.tone === "danger") toast.error(n.title, opts);
        else if (n.tone === "warn") toast.warning(n.title, opts);
        else if (n.tone === "ok") toast.success(n.title, opts);
        else toast.info(n.title, opts);
      }),
    ];
    // Açılışta ya da ikinci örnekten gelmiş, henüz alınmamış bağlantı ve dosyalar.
    invoke<PendingInput>("pending_take")
      .then((p) => {
        p.nxm.forEach((r) => useUi.getState().pushNxm(r));
        if (p.files.length) handleIncomingFiles(p.files);
      })
      .catch(() => {});
    return () => offs.forEach((off) => off());
  }, []);
}
