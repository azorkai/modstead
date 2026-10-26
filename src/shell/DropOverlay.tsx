// Pencereye arşiv bırakma. Bir oyun açıksa arşivler o oyuna gider; ana sayfadaysa oyun sorulur.

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { FileArchive } from "lucide-react";
import { useT } from "@/lib/i18n";
import { isTauri } from "@/lib/ipc";
import { useGamesStatus } from "@/lib/queries";
import { useUi } from "@/lib/store";
import { Dialog, DialogBody, DialogHeader } from "@/ui";
import { GAMES, gameModule } from "@/games/registry";
import { archivesOnly, installFiles } from "./actions";
import { GameIcon } from "./GameIcon";

/** Dışarıdan gelen dosyalar (bırakma ya da ikinci örnek). */
export function handleIncomingFiles(paths: string[]) {
  const files = archivesOnly(paths);
  if (files.length === 0) return;
  const view = useUi.getState().view;
  if (view.kind === "game") void installFiles(view.game, files);
  else useUi.getState().setPendingFiles(files);
}

export function DropOverlay() {
  const t = useT();
  const view = useUi((s) => s.view);
  const [over, setOver] = useState(false);
  const game = view.kind === "game" ? gameModule(view.game) : undefined;

  useEffect(() => {
    if (!isTauri) return;
    let stop: (() => void) | undefined;
    let cancelled = false;
    void import("@tauri-apps/api/webview").then(async ({ getCurrentWebview }) => {
      const un = await getCurrentWebview().onDragDropEvent((e) => {
        const p = e.payload;
        if (p.type === "enter") setOver(true);
        else if (p.type === "leave") setOver(false);
        else if (p.type === "drop") {
          setOver(false);
          handleIncomingFiles(p.paths);
        }
      });
      if (cancelled) un();
      else stop = un;
    });
    return () => {
      cancelled = true;
      stop?.();
    };
  }, []);

  return (
    <AnimatePresence>
      {over && (
        <motion.div
          data-game={game?.id}
          className="pointer-events-none fixed inset-0 z-[60] flex items-center justify-center p-8"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
          style={{ background: "var(--scrim)" }}
        >
          <motion.div
            initial={{ scale: 0.97 }}
            animate={{ scale: 1 }}
            className="fluted fluted-floor flex h-full w-full flex-col items-center justify-center overflow-hidden rounded-[28px] border-2 border-dashed bg-surface"
            style={{ borderColor: "color-mix(in oklab, var(--accent) 60%, transparent)" }}
          >
            {game ? (
              <GameIcon game={game} size={68} className="mb-5" />
            ) : (
              <div className="brand-surface mb-5 flex size-16 items-center justify-center rounded-full">
                <FileArchive className="size-7" />
              </div>
            )}
            <div className="headline text-[44px] text-fg">{t.drop.title}</div>
            <div className="mt-3 text-[14px] text-fg-2">{game ? t.drop.forGame(game.name) : t.drop.chooseGame}</div>
            <div className="eyebrow mt-2 text-muted">{t.drop.unsupported}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Ana sayfadayken bırakılan dosyalar için oyun seçimi. */
export function FileGamePicker() {
  const t = useT();
  const files = useUi((s) => s.pendingFiles);
  const setPendingFiles = useUi((s) => s.setPendingFiles);
  const { data: statuses } = useGamesStatus();
  const installed = GAMES.filter((g) => statuses?.find((s) => s.id === g.id)?.status.installed);
  const close = () => setPendingFiles([]);
  return (
    <Dialog open={files.length > 0} onClose={close} width={520}>
      <DialogHeader icon={<FileArchive className="size-5" />} title={t.drop.chooseGame} subtitle={files.map((f) => f.split(/[\\/]/).pop()).join(", ")} onClose={close} />
      <DialogBody className="grid grid-cols-1 gap-2">
        {installed.map((g) => (
          <button
            key={g.id}
            data-game={g.id}
            onClick={() => {
              void installFiles(g.id, files);
              close();
            }}
            className="flex items-center gap-3 rounded-2xl border border-line bg-surface-2/50 px-3.5 py-3 text-left transition-colors hover:border-[color-mix(in_oklab,var(--accent)_45%,transparent)] hover:bg-surface-2"
          >
            <GameIcon game={g} size={40} />
            <span className="title text-[15px] text-fg">{g.name}</span>
          </button>
        ))}
      </DialogBody>
    </Dialog>
  );
}
