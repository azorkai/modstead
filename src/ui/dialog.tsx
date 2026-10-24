import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import clsx from "clsx";
import { useT } from "@/lib/i18n";
import { Button, IconButton } from "./controls";

/** Pencere içi iletişim kutusu. Esc ve arka plana tıklama kapatır (`dismissable`). */
export function Dialog({
  open,
  onClose,
  children,
  width = 560,
  dismissable = true,
  game,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  width?: number;
  dismissable?: boolean;
  /** Oyunun kimliğini (vurgu rengi, başlık yazı tipi) pencereye taşır. */
  game?: string | null;
}) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && dismissable) {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    requestAnimationFrame(() => panel.current?.focus());
    return () => {
      window.removeEventListener("keydown", onKey, true);
      prev?.focus?.();
    };
  }, [open, onClose, dismissable]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          data-game={game ?? undefined}
        >
          <div className="absolute inset-0 backdrop-blur-[6px]" style={{ background: "var(--scrim)" }} onClick={() => dismissable && onClose()} />
          <motion.div
            ref={panel}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            className="card-raised relative flex max-h-[calc(100vh-72px)] w-full flex-col overflow-hidden outline-none"
            style={{ maxWidth: width, boxShadow: "var(--shadow-lg)" }}
            initial={{ opacity: 0, y: 14, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 420, damping: 34 }}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/** `plain`: başlık oyunun başlık yazı tipiyle değil düz yazıyla (mod adı, sürüm gibi veriler için).
 *  `media`: simge kutusu yerine olduğu gibi çizilen öğe (ör. oyunun `GameIcon`'u). */
export function DialogHeader({ title, subtitle, icon, media, onClose, plain }: { title: ReactNode; subtitle?: ReactNode; icon?: ReactNode; media?: ReactNode; onClose?: () => void; plain?: boolean }) {
  const t = useT();
  return (
    <div className="flex items-start gap-3 border-b border-line px-6 pb-4 pt-5">
      {media ?? (icon && <div className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl border border-line bg-surface-2 text-accent">{icon}</div>)}
      <div className="min-w-0 flex-1">
        <h2 className={clsx("text-[19px] font-semibold leading-tight text-fg", plain ? "tracking-tight" : "text-display")}>{title}</h2>
        {subtitle && <div className="mt-1 text-[12.5px] text-fg-2">{subtitle}</div>}
      </div>
      {onClose && (
        <IconButton label={t.common.close} onClick={onClose} className="-mr-2 -mt-1">
          <X className="size-4" />
        </IconButton>
      )}
    </div>
  );
}

export function DialogBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx("min-h-0 flex-1 overflow-y-auto px-6 py-5", className)}>{children}</div>;
}

export function DialogFooter({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx("flex items-center justify-end gap-2 border-t border-line bg-surface-2/40 px-6 py-3.5", className)}>{children}</div>;
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  children,
  confirmLabel,
  danger,
  loading,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: ReactNode;
  children?: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  loading?: boolean;
}) {
  const t = useT();
  return (
    <Dialog open={open} onClose={onClose} width={440}>
      <DialogHeader title={title} />
      {children && <DialogBody className="text-[13px] text-fg-2">{children}</DialogBody>}
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>
          {t.common.cancel}
        </Button>
        <Button variant={danger ? "danger" : "primary"} onClick={onConfirm} loading={loading}>
          {confirmLabel}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
