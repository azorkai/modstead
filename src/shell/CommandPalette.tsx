// Komut paleti (Ctrl+K): sayfalar, oyunlar, komutlar. Oyunlar ileride kendi komutlarını ekler.

import { useEffect } from "react";
import { Command } from "cmdk";
import { AnimatePresence, motion } from "motion/react";
import { Download, Home, MoonStar, Play, Search, Settings2 } from "lucide-react";
import { useLang, useT } from "@/lib/i18n";
import { updateSettings, useGamesStatus, useSettings } from "@/lib/queries";
import { useUi } from "@/lib/store";
import { Kbd } from "@/ui";
import { GAMES } from "@/games/registry";
import { launchGame } from "./actions";
import { GameIcon } from "./GameIcon";

function Item({ onSelect, icon, children, hint, value }: { onSelect: () => void; icon: React.ReactNode; children: React.ReactNode; hint?: React.ReactNode; value: string }) {
  return (
    <Command.Item
      value={value}
      onSelect={onSelect}
      className="flex h-10 cursor-default items-center gap-3 rounded-[10px] px-3 text-[13px] text-fg-2 data-[selected=true]:bg-surface-3 data-[selected=true]:text-fg"
    >
      <span className="flex size-[22px] items-center justify-center text-muted">{icon}</span>
      <span className="flex-1 truncate">{children}</span>
      {hint && <span className="text-[11.5px] text-muted">{hint}</span>}
    </Command.Item>
  );
}

export function CommandPalette() {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const open = useUi((s) => s.paletteOpen);
  const setPalette = useUi((s) => s.setPalette);
  const go = useUi((s) => s.go);
  const setJobs = useUi((s) => s.setJobs);
  const { data: statuses } = useGamesStatus();
  const { data: settings } = useSettings();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette(!useUi.getState().paletteOpen);
      } else if ((e.ctrlKey || e.metaKey) && e.key === ",") {
        e.preventDefault();
        go({ kind: "settings" });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setPalette, go]);

  const run = (fn: () => void) => () => {
    setPalette(false);
    fn();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}>
          <div className="absolute inset-0 backdrop-blur-[3px]" style={{ background: "var(--scrim)" }} onClick={() => setPalette(false)} />
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 520, damping: 38 }}
            className="card-raised relative w-[620px] overflow-hidden"
            style={{ boxShadow: "var(--shadow-lg)" }}
          >
            <Command loop onKeyDown={(e) => e.key === "Escape" && setPalette(false)}>
              <div className="flex items-center gap-3 border-b border-line px-4">
                <Search className="size-4 text-muted" />
                <Command.Input autoFocus placeholder={t.palette.placeholder} className="h-[52px] flex-1 bg-transparent text-[14px] text-fg outline-none placeholder:text-muted" />
                <Kbd>Esc</Kbd>
              </div>
              <Command.List className="max-h-[380px] overflow-y-auto p-2">
                <Command.Empty className="px-3 py-6 text-center text-[13px] text-muted">{t.palette.empty}</Command.Empty>
                <Command.Group heading={t.palette.go} className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.08em] [&_[cmdk-group-heading]]:text-muted">
                  <Item value="home ana sayfa" icon={<Home className="size-4" />} onSelect={run(() => go({ kind: "home" }))}>
                    {t.nav.home}
                  </Item>
                  {GAMES.flatMap((g) =>
                    g.routes.map((r, i) => (
                      <Item key={`${g.id}-${r.id}`} value={`${g.name} ${g.short} ${r.label.tr} ${r.label.en}`} icon={i === 0 ? <GameIcon game={g} size={22} /> : <r.icon className="size-4" />} hint={g.short} onSelect={run(() => go({ kind: "game", game: g.id, page: r.id }))}>
                        {r.id === "overview" ? g.name : `${g.short} · ${r.label[lang]}`}
                      </Item>
                    )),
                  )}
                  <Item value="settings ayarlar" icon={<Settings2 className="size-4" />} hint="Ctrl ," onSelect={run(() => go({ kind: "settings" }))}>
                    {t.nav.settings}
                  </Item>
                </Command.Group>
                <Command.Group heading={t.palette.actions} className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.08em] [&_[cmdk-group-heading]]:text-muted">
                  {GAMES.filter((g) => statuses?.find((s) => s.id === g.id)?.status.installed).map((g) => (
                    <Item key={`play-${g.id}`} value={`play oyna ${g.name} ${g.short}`} icon={<GameIcon game={g} size={22} />} hint={<Play className="size-3.5 fill-current" />} onSelect={run(() => launchGame(g.id))}>
                      {t.palette.playGame(g.short)}
                    </Item>
                  ))}
                  <Item value="downloads indirmeler jobs" icon={<Download className="size-4" />} onSelect={run(() => setJobs(true))}>
                    {t.nav.downloads}
                  </Item>
                  <Item
                    value="theme tema dark light koyu açık"
                    icon={<MoonStar className="size-4" />}
                    onSelect={run(() => void updateSettings({ theme: document.documentElement.dataset.theme === "dark" ? "light" : "dark" }))}
                    hint={settings ? t.settings.themes[settings.theme] : undefined}
                  >
                    {t.palette.toggleTheme}
                  </Item>
                </Command.Group>
              </Command.List>
            </Command>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
