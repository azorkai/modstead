// Bannerlord sayfalarının onay penceresi (useApp().confirm ile açılır). nxm onayı ve dosya bırakma kabukta.

import { AlertTriangle } from "lucide-react";
import { useApp } from "../store";
import { Button, Dialog, DialogHeader } from "./kit";
import { useT } from "../i18n";

/** Uygulama içi onay penceresi (useApp().confirm ile açılır). */
export function ConfirmDialog() {
  const t = useT();
  const req = useApp((s) => s.confirmRequest);
  const close = useApp((s) => s.closeConfirm);
  return (
    <Dialog open={!!req} onClose={() => close(false)} width={460}>
      {req && (
        <>
          <DialogHeader
            plain
            icon={req.danger ? <AlertTriangle className="size-5 text-danger" /> : <AlertTriangle className="size-5 text-accent" />}
            title={req.title}
          />
          <p className="whitespace-pre-line px-6 py-5 text-[13px] leading-relaxed text-fg-2">{req.body}</p>
          <footer className="flex justify-end gap-2 border-t border-line bg-surface-2/40 px-6 py-4">
            <Button variant="ghost" onClick={() => close(false)}>
              {t.common.cancel}
            </Button>
            <Button autoFocus variant={req.danger ? "danger" : "primary"} onClick={() => close(true)}>
              {req.confirmLabel ?? t.common.confirm}
            </Button>
          </footer>
        </>
      )}
    </Dialog>
  );
}
