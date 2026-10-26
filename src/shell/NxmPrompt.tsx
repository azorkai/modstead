// Nexus'taki "Mod Manager Download" düğmesinden gelen bağlantı: indirmeden önce onay.

import { useEffect, useState } from "react";
import { DownloadCloud } from "lucide-react";
import { useT } from "@/lib/i18n";
import { invoke } from "@/lib/ipc";
import { upsertJob } from "@/lib/queries";
import { useUi } from "@/lib/store";
import type { JobSnapshot } from "@/lib/types";
import { Button, Dialog, DialogBody, DialogFooter, DialogHeader } from "@/ui";
import { gameModule } from "@/games/registry";
import { notifyError } from "./actions";

function parts(url: string): { mod: string; file: string } {
  const m = url.match(/mods\/(\d+)\/files\/(\d+)/i);
  return { mod: m?.[1] ?? "?", file: m?.[2] ?? "?" };
}

export function NxmPrompt() {
  const t = useT();
  const request = useUi((s) => s.nxmQueue[0]);
  const shift = useUi((s) => s.shiftNxm);
  const setJobs = useUi((s) => s.setJobs);
  const [busy, setBusy] = useState(false);
  const game = gameModule(request?.game);
  const { mod, file } = request ? parts(request.url) : { mod: "", file: "" };

  // Arayüzde gizli bir oyunun bağlantısı sorulmadan bırakılır (bkz. games/registry.ts → HIDDEN).
  useEffect(() => {
    if (request && !game) shift();
  }, [request, game, shift]);

  const download = async () => {
    if (!request) return;
    setBusy(true);
    try {
      upsertJob(await invoke<JobSnapshot>("nxm_open", { url: request.url }));
      shift();
      setJobs(true);
    } catch (e) {
      notifyError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={!!request && !!game} onClose={shift} width={460} game={request?.game}>
      {request && (
        <>
          <DialogHeader icon={game ? <game.Icon className="size-5" /> : <DownloadCloud className="size-5" />} title={t.nxm.title} onClose={shift} />
          <DialogBody className="text-[13px] text-fg-2">{game ? t.nxm.body(game.name, mod, file) : t.nxm.unknownGame}</DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={shift}>
              {t.common.cancel}
            </Button>
            <Button variant="primary" onClick={download} disabled={!game} loading={busy}>
              {t.nxm.download}
            </Button>
          </DialogFooter>
        </>
      )}
    </Dialog>
  );
}
