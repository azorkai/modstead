// İlk açılış: hoş geldin → oyunları bul → güvenlik ve hesap.

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, Bug, Check, FolderOpen, KeyRound, ShieldCheck } from "lucide-react";
import clsx from "clsx";
import { useQueryClient } from "@tanstack/react-query";
import { useLang, useT } from "@/lib/i18n";
import { invoke } from "@/lib/ipc";
import { keys, updateSettings, useAppInfo, useDetect } from "@/lib/queries";
import type { NexusStatus } from "@/lib/types";
import { Badge, Button, Input, Spinner, Switch } from "@/ui";
import { GAMES } from "@/games/registry";
import type { GameModule } from "@/games/types";
import { chooseGameFolder, notifyError } from "./actions";
import { GameIcon } from "./GameIcon";
import { LogoTile } from "./Logo";

function Steps({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-1.5">
      {[0, 1, 2].map((i) => (
        <motion.span key={i} className="h-1.5 rounded-full" animate={{ width: i === step ? 22 : 6, background: i <= step ? "var(--brand)" : "var(--line-strong)" }} transition={{ duration: 0.25 }} />
      ))}
    </div>
  );
}

function GameDetect({ game, chosen, onToggle }: { game: GameModule; chosen: boolean; onToggle: (v: boolean) => void }) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const qc = useQueryClient();
  const { data, isLoading } = useDetect(game.id);
  const found = data?.length ?? 0;
  return (
    <div data-game={game.id} className={clsx("flex items-center gap-4 rounded-2xl border px-4 py-3.5 transition-colors", chosen ? "border-[color-mix(in_oklab,var(--accent)_35%,transparent)] bg-surface" : "border-line bg-surface/60")}>
      <GameIcon game={game} size={46} />
      <div className="min-w-0 flex-1">
        <div className="text-display text-[15px] font-semibold text-fg">{game.name}</div>
        <div className="mt-0.5 truncate text-[12px] text-fg-2">{isLoading ? t.onboarding.searching : found ? data!.map((c) => c.label).join(" · ") : game.tagline[lang]}</div>
      </div>
      {isLoading ? (
        <Spinner />
      ) : found ? (
        <Badge tone="ok" icon={<Check className="size-3" />}>
          {t.onboarding.found(found)}
        </Badge>
      ) : (
        <Button
          size="sm"
          variant="secondary"
          icon={<FolderOpen className="size-3.5" />}
          onClick={async () => {
            if (await chooseGameFolder(game.id)) await qc.invalidateQueries({ queryKey: keys.detect(game.id) });
          }}
        >
          {t.common.chooseFolder}
        </Button>
      )}
      <Switch checked={chosen} onChange={onToggle} label={t.onboarding.manage} />
    </div>
  );
}

export function Onboarding() {
  const t = useT();
  const qc = useQueryClient();
  const { data: info } = useAppInfo();
  const [step, setStep] = useState(0);
  const [chosen, setChosen] = useState<string[]>(GAMES.map((g) => g.id));
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);

  const finish = async () => {
    setBusy(true);
    try {
      if (key.trim()) {
        qc.setQueryData(keys.nexus, await invoke<NexusStatus>("nexus_set_key", { key: key.trim() }));
      }
      await updateSettings({ onboarded: true, games: chosen.length === GAMES.length ? [] : chosen });
    } catch (e) {
      notifyError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div data-tauri-drag-region className="app-backdrop relative flex h-full items-center justify-center p-8">
      <div className="relative z-[1] w-full max-w-[680px]">
        <AnimatePresence mode="wait">
          <motion.div key={step} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25, ease: [0.2, 0.7, 0.2, 1] }}>
            {step === 0 && (
              <div className="flex flex-col items-center text-center">
                <div className="relative">
                  <div className="absolute -inset-16 rounded-full opacity-70 blur-2xl" style={{ background: "radial-gradient(circle, color-mix(in oklab, var(--brand) 32%, transparent), transparent 70%)" }} />
                  <div className="relative">
                    <LogoTile size={84} />
                  </div>
                </div>
                <h1 className="mt-7 text-[34px] font-semibold tracking-tight text-fg">{t.onboarding.welcome}</h1>
                <p className="mt-3 max-w-[520px] text-[15px] leading-relaxed text-fg-2">{t.onboarding.welcomeBody}</p>
                <div className="mt-8 flex items-center gap-3">
                  {GAMES.map((g) => (
                    <GameIcon key={g.id} game={g} size={52} />
                  ))}
                </div>
                <Button variant="brand" size="lg" className="mt-9 px-7" trailing={<ArrowRight className="size-4" />} onClick={() => setStep(1)}>
                  {t.onboarding.start}
                </Button>
              </div>
            )}
            {step === 1 && (
              <div>
                <h2 className="text-[26px] font-semibold tracking-tight text-fg">{t.onboarding.gamesTitle}</h2>
                <p className="mt-2 text-[14px] text-fg-2">{t.onboarding.gamesBody}</p>
                <div className="mt-6 flex flex-col gap-2.5">
                  {GAMES.map((g) => (
                    <GameDetect key={g.id} game={g} chosen={chosen.includes(g.id)} onToggle={(v) => setChosen((c) => (v ? [...new Set([...c, g.id])] : c.filter((x) => x !== g.id)))} />
                  ))}
                </div>
              </div>
            )}
            {step === 2 && (
              <div>
                <h2 className="text-[26px] font-semibold tracking-tight text-fg">{t.onboarding.securityTitle}</h2>
                <p className="mt-2 text-[14px] text-fg-2">{t.onboarding.securityBody}</p>
                <div className="mt-6 flex flex-col gap-2.5">
                  <div className="card flex items-center gap-4 px-4 py-3.5">
                    <span className="flex size-10 items-center justify-center rounded-xl border border-line bg-surface-2 text-fg-2">
                      <Bug className="size-5" />
                    </span>
                    <div className="flex-1 text-[13.5px] font-medium text-fg">{t.home.defender}</div>
                    <Badge tone={info?.defenderAvailable === false ? "warn" : "ok"} dot>
                      {info?.defenderAvailable === false ? t.home.defenderMissing : t.home.defenderOn}
                    </Badge>
                  </div>
                  <div className="card flex items-center gap-4 px-4 py-3.5">
                    <span className="flex size-10 items-center justify-center rounded-xl border border-line bg-surface-2 text-fg-2">
                      <ShieldCheck className="size-5" />
                    </span>
                    <div className="flex-1">
                      <div className="text-[13.5px] font-medium text-fg">{t.settings.blockDangerous}</div>
                      <div className="text-[12px] text-fg-2">{t.settings.blockDangerousHint}</div>
                    </div>
                    <Badge tone="ok">{t.common.on}</Badge>
                  </div>
                  <div className="card px-4 py-3.5">
                    <div className="flex items-center gap-4">
                      <span className="flex size-10 items-center justify-center rounded-xl border border-line bg-surface-2 text-fg-2">
                        <KeyRound className="size-5" />
                      </span>
                      <div className="flex-1">
                        <div className="text-[13.5px] font-medium text-fg">
                          {t.settings.nexusKey} <span className="font-normal text-muted">· {t.common.optional}</span>
                        </div>
                        <div className="text-[12px] text-fg-2">{t.settings.nexusKeyHint}</div>
                      </div>
                    </div>
                    <Input type="password" className="mt-3" value={key} onChange={(e) => setKey(e.target.value)} placeholder={t.settings.keyPlaceholder} />
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        {step > 0 && (
          <div className="mt-8 flex items-center justify-between">
            <Button variant="ghost" onClick={() => setStep(step - 1)}>
              {t.common.back}
            </Button>
            <Steps step={step} />
            {step === 1 ? (
              <Button variant="brand" trailing={<ArrowRight className="size-4" />} onClick={() => setStep(2)} disabled={chosen.length === 0}>
                {t.common.next}
              </Button>
            ) : (
              <Button variant="brand" onClick={finish} loading={busy}>
                {t.onboarding.finish}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
