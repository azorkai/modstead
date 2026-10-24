// Kurulum incelemesi: ortak güvenlik raporu + oyunun planı + açık onay. Oyun `ReviewPlan` ve
// `confirmJob` vermiyorsa (taşıma sürüyor) yalnızca rapor gösterilir ve kurulum düğmesi kapalıdır.

import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { useT } from "@/lib/i18n";
import { useJobs } from "@/lib/queries";
import { useUi } from "@/lib/store";
import { Button, Checkbox, Dialog, DialogBody, DialogFooter, DialogHeader, SecurityPanel } from "@/ui";
import { gameModule } from "@/games/registry";
import { notifyError } from "./actions";
import { GameIcon } from "./GameIcon";

export function ReviewDialog() {
  const t = useT();
  const id = useUi((s) => s.reviewJobId);
  const setReview = useUi((s) => s.setReview);
  const { data: jobs } = useJobs();
  const job = jobs?.find((j) => j.id === id && j.stage === "review");
  const game = gameModule(job?.game);
  const [accept, setAccept] = useState(false);
  const [options, setOptions] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const close = () => {
    setReview(null);
    setAccept(false);
    setOptions(null);
  };
  const report = job?.security;
  const needsAccept = !!report?.needsOverride && !report?.blocked;
  const canInstall = !!job && !!game?.confirmJob && !report?.blocked && (!needsAccept || accept);

  const install = async () => {
    if (!job || !game?.confirmJob) return;
    setBusy(true);
    try {
      await game.confirmJob(job, { acceptRisk: accept, options });
      close();
    } catch (e) {
      notifyError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={!!job} onClose={close} width={760} game={job?.game}>
      {job && (
        <>
          <DialogHeader
            plain
            media={game ? <GameIcon game={game} size={40} className="mt-0.5" /> : undefined}
            icon={<ShieldCheck className="size-5" />}
            title={job.title}
            subtitle={`${game?.name ?? job.game} · ${t.security.title}`}
            onClose={close}
          />
          <DialogBody className="flex flex-col gap-5">
            {report && <SecurityPanel report={report} />}
            <div>
              <h4 className="mb-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">{t.security.plan}</h4>
              {game?.ReviewPlan ? <game.ReviewPlan job={job} onOptions={setOptions} /> : <div className="well px-4 py-3 text-[12.5px] text-fg-2">{t.security.planFallback}</div>}
            </div>
          </DialogBody>
          <DialogFooter className="justify-between">
            <div className="flex items-center gap-2.5">
              {needsAccept && (
                <>
                  <Checkbox checked={accept} onChange={setAccept} label={t.security.accept} />
                  <span className="text-[12.5px] text-fg-2">{t.security.accept}</span>
                </>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={close}>
                {t.common.cancel}
              </Button>
              <Button variant="primary" onClick={install} disabled={!canInstall} loading={busy}>
                {t.security.install}
              </Button>
            </div>
          </DialogFooter>
        </>
      )}
    </Dialog>
  );
}
