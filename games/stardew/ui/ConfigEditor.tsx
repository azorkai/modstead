// Bir modun config.json dosyasını düzenler. Arka uç kaydetmeden önce JSON'u doğrular ve eskisini yedekler.

import { useEffect, useMemo, useState } from "react";
import { FileCog, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { errorMessage } from "@/lib/ipc";
import { notifyError } from "@/shell/actions";
import { Button, Dialog, DialogBody, DialogFooter, DialogHeader, Spinner } from "@/ui";
import { api } from "./api";
import { useS } from "./i18n";
import type { ModInfo } from "./types";

export function ConfigEditor({ open, onClose, mod }: { open: boolean; onClose: () => void; mod: ModInfo }) {
  const t = useS();
  const [text, setText] = useState<string | null>(null);
  const [original, setOriginal] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setText(null);
    api
      .readConfig(mod.folder)
      .then((v) => {
        if (!alive) return;
        setText(v ?? "{}");
        setOriginal(v ?? "{}");
      })
      .catch((e) => {
        notifyError(e);
        onClose();
      });
    return () => {
      alive = false;
    };
  }, [open, mod.folder, onClose]);

  const error = useMemo(() => {
    if (text == null) return null;
    try {
      const v: unknown = JSON.parse(text);
      return typeof v === "object" && v !== null && !Array.isArray(v) ? null : t.config.invalid;
    } catch (e) {
      return errorMessage(e);
    }
  }, [text, t]);

  const save = async () => {
    if (text == null || error) return;
    setSaving(true);
    try {
      await api.writeConfig(mod.folder, text);
      toast.success(t.config.saved);
      onClose();
    } catch (e) {
      notifyError(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} width={760} game="stardew">
      <DialogHeader plain icon={<FileCog className="size-5" />} title={`${mod.name} · ${t.config.title}`} subtitle={t.config.hint} onClose={onClose} />
      <DialogBody className="py-4">
        {text == null ? (
          <div className="flex justify-center py-12">
            <Spinner />
          </div>
        ) : (
          <textarea
            spellCheck={false}
            value={text}
            data-selectable
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Tab") {
                e.preventDefault();
                const el = e.currentTarget;
                const at = el.selectionStart;
                setText(text.slice(0, at) + "  " + text.slice(el.selectionEnd));
                requestAnimationFrame(() => el.setSelectionRange(at + 2, at + 2));
              }
              if (e.key === "s" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                void save();
              }
            }}
            className="h-[52vh] w-full resize-none rounded-[10px] border border-line-strong bg-surface-2/70 p-3 font-mono text-[12.5px] leading-relaxed text-fg outline-none focus:border-[color-mix(in_oklab,var(--accent)_55%,transparent)]"
          />
        )}
      </DialogBody>
      <DialogFooter>
        <span className={`mr-auto truncate text-[12px] ${error ? "text-danger" : "text-muted"}`}>{error ? `${t.config.invalid}: ${error}` : t.config.valid}</span>
        <Button variant="ghost" icon={<Wand2 className="size-4" />} disabled={!!error || text == null} onClick={() => text && setText(JSON.stringify(JSON.parse(text), null, 2))}>
          {t.config.format}
        </Button>
        <Button variant="primary" onClick={save} loading={saving} disabled={!!error || text === original}>
          {t.common.save}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
