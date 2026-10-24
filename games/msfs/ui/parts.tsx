// MSFS sayfalarının ortak parçaları: sim anahtarı, rozetler ve mod işlemleri.

import { useState } from "react";
import { toast } from "sonner";
import clsx from "clsx";
import { Lock } from "lucide-react";
import { errorMessage, isTauri } from "@/lib/ipc";
import { queryClient } from "@/lib/queries";
import { notifyError } from "@/shell/actions";
import { api } from "./api";
import { SIM_COLOR, SIM_SHORT, isActive } from "./format";
import { useMsfsT } from "./i18n";
import { mk, reportOp } from "./queries";
import type { ModEntry, ScanResult, SimId, SimInstall } from "./types";

/** Bir simdeki durum için tek dokunuşluk anahtar: "2020" / "2024" hapı. */
export function SimToggle({
  mod,
  sim,
  install,
  size = "md",
  onDark,
}: {
  mod: ModEntry;
  sim: SimId;
  install: SimInstall | undefined;
  size?: "sm" | "md";
  /** Görsel üstünde (buzlu zemin). */
  onDark?: boolean;
}) {
  const t = useMsfsT();
  const [busy, setBusy] = useState(false);
  const st = mod.sims[sim]?.state;
  const on = isActive(st);
  const usable = !!install?.detected && !!install.communityPath;
  const short = SIM_SHORT[sim];
  const locked = st === "physical" || st === "foreign" || mod.source !== "library";
  const disabled = !usable || busy || locked || !!install?.running;
  const title = !usable
    ? t.library.notInSim(short)
    : install?.running
      ? t.library.simLocked(short)
      : st === "foreign"
        ? t.library.managedElsewhere
        : locked
          ? t.library.importFirst
          : `MSFS ${short} · ${on ? t.state.enabled : t.state.disabled}`;
  const color = SIM_COLOR[sim];

  const toggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (disabled) return;
    setBusy(true);
    try {
      const rep = await api.setEnabled([mod.id], sim, !on);
      reportOp(rep, t.library.toggled, t.library.toggleFailed);
    } catch (err) {
      notifyError(err);
    } finally {
      setBusy(false);
    }
  };

  if (!usable && !on) return null;
  return (
    <button
      type="button"
      onClick={toggle}
      title={title}
      aria-pressed={on}
      aria-label={title}
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full border font-semibold tabular transition-[background,border-color,opacity]",
        size === "sm" ? "h-6 px-2 text-[11px]" : "h-7 px-2.5 text-[11.5px]",
        on ? "text-fg" : onDark ? "text-white/70" : "text-muted",
        onDark && !on && "msfs-on-image",
        !onDark && !on && "border-line bg-surface-2/60 hover:border-line-strong",
        disabled ? "cursor-default" : "cursor-pointer",
        busy && "opacity-60",
      )}
      style={
        on
          ? {
              background: `color-mix(in oklab, ${color} ${onDark ? 34 : 16}%, ${onDark ? "rgb(10 12 16 / 0.55)" : "transparent"})`,
              borderColor: `color-mix(in oklab, ${color} 55%, transparent)`,
              color: onDark ? "white" : undefined,
            }
          : undefined
      }
    >
      <span
        className={clsx("size-1.5 rounded-full", busy && "pulse-dot")}
        style={{ background: on ? color : "transparent", boxShadow: on ? `0 0 8px ${color}` : `inset 0 0 0 1.5px ${onDark ? "rgb(255 255 255 / 0.5)" : "var(--muted)"}` }}
      />
      {short}
      {locked && on && <Lock className="size-2.5 opacity-70" />}
    </button>
  );
}

/** "2020 yapımı" / "2024 yapımı" etiketi (simin rengiyle). */
export function BuiltForTag({ year, onDark, className }: { year: "2020" | "2024"; onDark?: boolean; className?: string }) {
  const t = useMsfsT();
  const color = year === "2024" ? SIM_COLOR.msfs2024 : SIM_COLOR.msfs2020;
  return (
    <span
      className={clsx("inline-flex h-5 items-center rounded-md border px-1.5 text-[10.5px] font-semibold uppercase tracking-[0.06em]", onDark ? "msfs-on-image text-white" : "text-fg-2", className)}
      style={onDark ? undefined : { borderColor: `color-mix(in oklab, ${color} 35%, transparent)`, background: `color-mix(in oklab, ${color} 10%, transparent)` }}
      title={t.builtFor(year)}
    >
      <span className="mr-1 size-1.5 rounded-full" style={{ background: color }} />
      {year}
    </span>
  );
}

/** Kütüphane klasörü seçtirir ve kaydeder. Döndürür: kaydedildi mi. */
export async function chooseLibrary(suggested?: string | null): Promise<boolean> {
  if (!isTauri) {
    toast.info("Önizleme kipi: klasör seçici yalnızca uygulamada çalışır.");
    return false;
  }
  const { open } = await import("@tauri-apps/plugin-dialog");
  const picked = await open({ directory: true, multiple: false, defaultPath: suggested ?? undefined });
  if (typeof picked !== "string") return false;
  try {
    const s = await api.saveSettings({ libraryPath: picked });
    queryClient.setQueryData(mk.settings, s);
    await queryClient.invalidateQueries({ queryKey: mk.all });
    return true;
  } catch (e) {
    toast.error(errorMessage(e));
    return false;
  }
}

/** Arşiv seçtirip kuruluma gönderir (ortak inceleme penceresine düşer). */
export async function pickArchives() {
  if (!isTauri) {
    toast.info("Önizleme kipi: dosya seçici yalnızca uygulamada çalışır.");
    return;
  }
  const { open } = await import("@tauri-apps/plugin-dialog");
  const picked = await open({ multiple: true, filters: [{ name: "Mod", extensions: ["zip", "7z", "rar"] }] });
  const paths = Array.isArray(picked) ? picked : typeof picked === "string" ? [picked] : [];
  if (paths.length === 0) return;
  const { installFiles } = await import("@/shell/actions");
  await installFiles("msfs", paths);
}

/** Toplu işlemler (kütüphane seçimi ve çekmece kullanır). */
export function useModOps() {
  const t = useMsfsT();
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      notifyError(e);
    } finally {
      setBusy(false);
    }
  };
  return {
    busy,
    setEnabled: (ids: string[], sim: SimId, enabled: boolean) => run(async () => reportOp(await api.setEnabled(ids, sim, enabled), t.library.toggled, t.library.toggleFailed)),
    importMods: (ids: string[]) => run(async () => reportOp(await api.importMods(ids), t.library.imported, t.common.failed)),
    uninstall: (ids: string[]) => run(async () => reportOp(await api.uninstall(ids), t.library.removed, t.common.failed)),
  };
}

export function simOf(scan: ScanResult | undefined, sim: SimId): SimInstall | undefined {
  return scan?.sims.find((s) => s.id === sim);
}
