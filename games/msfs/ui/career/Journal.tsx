// Teşhis: Modstead'in simle konuşmasının son satırları (games/msfs/src/career/journal.rs). Panelin en altında,
// kapalı başlar; açılınca günlük 3 saniyede bir tazelenir. "Dosyayı göster" ve "Kariyeri sıfırla" her zaman erişilebilir.

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FolderOpen, RotateCcw, Stethoscope } from "lucide-react";
import { toast } from "sonner";
import { queryClient } from "@/lib/queries";
import { notifyError } from "@/shell/actions";
import { Button, ConfirmDialog } from "@/ui";
import { careerApi } from "./api";
import { useCareerT } from "./i18n";
import { Disclosure } from "./parts";
import { ck } from "./queries";

export function DiagnosticsPanel() {
  const t = useCareerT();
  const [open, setOpen] = useState(false);
  const [reset, setReset] = useState(false);
  const [busy, setBusy] = useState(false);
  const { data: lines = [] } = useQuery({ queryKey: [...ck.all, "journal"], queryFn: () => careerApi.journal(120), refetchInterval: open ? 3000 : false, enabled: open });
  const box = useRef<HTMLDivElement>(null);
  // Yeni satır gelince en alta kay (kullanıcı yukarıda okuyorsa dokunma).
  useEffect(() => {
    const el = box.current;
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 60) el.scrollTop = el.scrollHeight;
  }, [lines, open]);

  return (
    <Disclosure
      open={open}
      onToggle={() => setOpen((v) => !v)}
      icon={<Stethoscope />}
      title={t.journal.diagnostics}
      eyebrow={open && lines.length ? `${t.journal.diagnosticsSub} · ${t.journal.lines(lines.length)}` : t.journal.diagnosticsSub}
      aside={
        <>
          <Button variant="ghost" size="sm" icon={<RotateCcw className="size-3.5" />} className="text-muted hover:text-danger" onClick={() => setReset(true)}>
            {t.journal.reset}
          </Button>
          <Button variant="ghost" size="sm" icon={<FolderOpen className="size-3.5" />} onClick={() => careerApi.revealJournal().catch(notifyError)}>
            {t.journal.reveal}
          </Button>
          <ConfirmDialog
            open={reset}
            onClose={() => setReset(false)}
            onConfirm={async () => {
              setBusy(true);
              try {
                await careerApi.reset();
                await queryClient.invalidateQueries({ queryKey: ck.all });
                toast.success(t.journal.resetDone);
                setReset(false);
              } catch (e) {
                notifyError(e);
              } finally {
                setBusy(false);
              }
            }}
            title={t.journal.resetConfirm}
            confirmLabel={t.journal.reset}
            danger
            loading={busy}
          >
            {t.journal.resetBody}
          </ConfirmDialog>
        </>
      }
    >
      <div className="px-5 pb-4 pt-3">
        <p className="mb-2 text-[11.5px] leading-relaxed text-muted">{t.journal.hint}</p>
        <div ref={box} data-selectable className="max-h-[300px] overflow-y-auto rounded-xl border border-line bg-bg/60 px-3 py-2 font-mono text-[10.5px] leading-[1.6] text-fg-2">
          {lines.length === 0 ? (
            <span className="text-muted">{t.journal.empty}</span>
          ) : (
            lines.map((l, i) => {
              // "2026-10-25 16:40:12.345 [alan] ileti" → saat, alan ve ileti ayrı tonlarda.
              const m = /^\S+ (\d\d:\d\d:\d\d)\.\d+ \[([^\]]+)\] (.*)$/.exec(l);
              return m ? (
                <div key={i} className="break-words">
                  <span className="text-muted">{m[1]}</span> <span className="text-accent">{m[2]}</span> {m[3]}
                </div>
              ) : (
                <div key={i} className="break-words">
                  {l}
                </div>
              );
            })
          )}
        </div>
      </div>
    </Disclosure>
  );
}

/** Eski ad (geriye uyum). */
export const JournalCard = DiagnosticsPanel;
