// Genel ayarlar (tüm oyunlar için ortak). Oyuna özel ayarlar oyunun kendi sayfasında.

import { useState, type ReactNode } from "react";
import { BadgeCheck, Bug, FolderOpen, Gamepad2, GitBranch, KeyRound, Languages, Link2, MonitorCog, Palette, ShieldCheck, ShieldHalf, Sparkles, Wind } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { invoke } from "@/lib/ipc";
import { keys, updateSettings, useAppInfo, useNexus, useNxmStatus, useSecrets, useSettings } from "@/lib/queries";
import type { NexusStatus, NxmStatus, SecretsStatus, Settings as SettingsT } from "@/lib/types";
import { Badge, Button, Input, PageHeader, Row, Section, Segmented, Switch } from "@/ui";
import { GAMES } from "@/games/registry";
import { notifyError } from "./actions";
import { GameIcon } from "./GameIcon";
import { LogoTile } from "./Logo";

function useSet() {
  return async (patch: Partial<SettingsT>) => {
    try {
      await updateSettings(patch);
    } catch (e) {
      notifyError(e);
    }
  };
}

function KeyInput({ placeholder, onSave, busy }: { placeholder: string; onSave: (v: string) => Promise<void>; busy?: boolean }) {
  const t = useT();
  const [value, setValue] = useState("");
  return (
    <form
      className="flex w-[340px] items-center gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!value.trim()) return;
        await onSave(value.trim());
        setValue("");
      }}
    >
      <Input type="password" value={value} onChange={(e) => setValue(e.target.value)} placeholder={placeholder} className="flex-1" />
      <Button type="submit" variant="secondary" loading={busy} disabled={!value.trim()}>
        {t.common.save}
      </Button>
    </form>
  );
}

function NexusRow() {
  const t = useT();
  const qc = useQueryClient();
  const { data: nexus } = useNexus();
  const [busy, setBusy] = useState(false);
  const save = async (key: string) => {
    setBusy(true);
    try {
      const s = await invoke<NexusStatus>("nexus_set_key", { key });
      qc.setQueryData(keys.nexus, s);
      toast.success(t.settings.saved);
    } catch (e) {
      notifyError(e);
    } finally {
      setBusy(false);
    }
  };
  const clear = async () => {
    try {
      await invoke("nexus_clear_key");
      qc.setQueryData<NexusStatus>(keys.nexus, { hasKey: false, user: null, rateLimit: null, error: null });
    } catch (e) {
      notifyError(e);
    }
  };
  return (
    <Row
      icon={<KeyRound className="size-4" />}
      title={
        <span className="flex items-center gap-2">
          {t.settings.nexusKey}
          {nexus?.user && (
            <Badge tone="ok" icon={<BadgeCheck className="size-3" />}>
              {nexus.user.name}
            </Badge>
          )}
          {nexus?.user?.isPremium && <Badge tone="accent">{t.settings.nexusPremium}</Badge>}
        </span>
      }
      description={nexus?.error ?? t.settings.nexusKeyHint}
    >
      {nexus?.hasKey ? (
        <Button variant="ghost" onClick={clear}>
          {t.settings.disconnect}
        </Button>
      ) : (
        <KeyInput placeholder={t.settings.keyPlaceholder} onSave={save} busy={busy} />
      )}
    </Row>
  );
}

function SecretRow({ kind, icon, title, description }: { kind: "virustotal" | "github"; icon: ReactNode; title: string; description: string }) {
  const t = useT();
  const qc = useQueryClient();
  const { data: secrets } = useSecrets();
  const stored = secrets?.[kind];
  const save = async (value: string) => {
    try {
      qc.setQueryData(keys.secrets, await invoke<SecretsStatus>("secret_set", { kind, value }));
      toast.success(t.settings.saved);
    } catch (e) {
      notifyError(e);
    }
  };
  const clear = async () => {
    try {
      qc.setQueryData(keys.secrets, await invoke<SecretsStatus>("secret_clear", { kind }));
    } catch (e) {
      notifyError(e);
    }
  };
  return (
    <Row
      icon={icon}
      title={
        <span className="flex items-center gap-2">
          {title}
          {stored && <Badge tone="ok">{t.settings.stored}</Badge>}
        </span>
      }
      description={description}
    >
      {stored ? (
        <Button variant="ghost" onClick={clear}>
          {t.common.remove}
        </Button>
      ) : (
        <KeyInput placeholder={t.settings.keyPlaceholder} onSave={save} />
      )}
    </Row>
  );
}

function NxmRow() {
  const t = useT();
  const qc = useQueryClient();
  const { data: nxm } = useNxmStatus();
  const toggle = async () => {
    try {
      const s = await invoke<NxmStatus>(nxm?.registered ? "nxm_unregister" : "nxm_register");
      qc.setQueryData(keys.nxm, s);
      await qc.invalidateQueries({ queryKey: keys.settings });
    } catch (e) {
      notifyError(e);
    }
  };
  return (
    <Row
      icon={<Link2 className="size-4" />}
      title={
        <span className="flex items-center gap-2">
          {t.settings.nxmHandler}
          <Badge tone={nxm?.registered ? "ok" : "neutral"} dot={!!nxm?.registered}>
            {nxm?.registered ? t.home.nxmOurs : nxm?.otherHandler ? t.home.nxmOther : t.home.nxmNone}
          </Badge>
        </span>
      }
      description={t.settings.nxmHandlerHint}
    >
      <Button variant={nxm?.registered ? "ghost" : "secondary"} onClick={toggle}>
        {nxm?.registered ? t.settings.nxmRelease : t.settings.nxmTake}
      </Button>
    </Row>
  );
}

export function Settings() {
  const t = useT();
  const set = useSet();
  const { data: s } = useSettings();
  const { data: info } = useAppInfo();
  if (!s) return null;
  const visible = s.games.length ? s.games : GAMES.map((g) => g.id);
  const toggleGame = (id: string, on: boolean) => {
    const next = on ? GAMES.map((g) => g.id).filter((g) => g === id || visible.includes(g)) : visible.filter((g) => g !== id);
    if (next.length === 0) return;
    void set({ games: next.length === GAMES.length ? [] : next });
  };

  return (
    <div className="mx-auto flex max-w-[880px] flex-col gap-5 pb-10">
      <PageHeader title={t.settings.title} subtitle={t.settings.subtitle} />

      <Section title={t.settings.appearance}>
        <Row icon={<Palette className="size-4" />} title={t.settings.theme}>
          <Segmented
            id="theme"
            value={s.theme}
            onChange={(theme) => set({ theme })}
            options={(["system", "dark", "light"] as const).map((v) => ({ value: v, label: t.settings.themes[v] }))}
          />
        </Row>
        <Row icon={<Languages className="size-4" />} title={t.settings.language}>
          <Segmented
            id="language"
            value={s.language}
            onChange={(language) => set({ language })}
            options={(["auto", "tr", "en"] as const).map((v) => ({ value: v, label: t.settings.languages[v] }))}
          />
        </Row>
        <Row icon={<Wind className="size-4" />} title={t.settings.reduceMotion} description={t.settings.reduceMotionHint}>
          <Switch checked={s.reduceMotion} onChange={(reduceMotion) => set({ reduceMotion })} label={t.settings.reduceMotion} />
        </Row>
      </Section>

      <Section title={t.settings.security} description={t.settings.securityHint}>
        <Row
          icon={<Bug className="size-4" />}
          title={
            <span className="flex items-center gap-2">
              {t.settings.requireScan}
              {info?.defenderAvailable === false && <Badge tone="warn">{t.home.defenderMissing}</Badge>}
            </span>
          }
          description={t.settings.requireScanHint}
        >
          <Switch checked={s.requireScan} onChange={(requireScan) => set({ requireScan })} label={t.settings.requireScan} />
        </Row>
        <Row icon={<ShieldHalf className="size-4" />} title={t.settings.requireVerified} description={t.settings.requireVerifiedHint}>
          <Switch checked={s.requireVerified} onChange={(requireVerified) => set({ requireVerified })} label={t.settings.requireVerified} />
        </Row>
        <Row icon={<ShieldCheck className="size-4" />} title={t.settings.blockDangerous} description={t.settings.blockDangerousHint}>
          <Switch checked={s.blockDangerous} onChange={(blockDangerous) => set({ blockDangerous })} label={t.settings.blockDangerous} />
        </Row>
        <Row icon={<Sparkles className="size-4" />} title={t.settings.virustotal} description={t.settings.virustotalHint}>
          <Switch checked={s.virustotal} onChange={(virustotal) => set({ virustotal })} label={t.settings.virustotal} />
        </Row>
      </Section>

      <Section title={t.settings.accounts} description={t.settings.accountsHint}>
        <NexusRow />
        <SecretRow kind="virustotal" icon={<ShieldCheck className="size-4" />} title={t.settings.vtKey} description={t.settings.virustotalHint} />
        <SecretRow kind="github" icon={<GitBranch className="size-4" />} title={t.settings.githubToken} description={t.settings.githubTokenHint} />
      </Section>

      <Section title={t.settings.links}>
        <NxmRow />
      </Section>

      <Section title={t.settings.games} description={t.settings.gamesHint}>
        {GAMES.map((g) => (
          <div key={g.id} data-game={g.id}>
            <Row
              title={
                <span className="flex items-center gap-4">
                  <GameIcon game={g} size={32} />
                  {g.name}
                </span>
              }
            >
              <Switch checked={visible.includes(g.id)} onChange={(on) => toggleGame(g.id, on)} label={g.name} />
            </Row>
          </div>
        ))}
      </Section>

      <Section title={t.settings.storage}>
        <Row icon={<FolderOpen className="size-4" />} title={t.settings.dataFolder} description={<span className="font-mono text-[11px]">{info?.dataDir}</span>}>
          <Button variant="ghost" onClick={() => invoke("open_app_folder", { kind: "data" }).catch(notifyError)}>
            {t.common.open}
          </Button>
        </Row>
        <Row icon={<MonitorCog className="size-4" />} title={t.settings.logsFolder} description={<span className="font-mono text-[11px]">{info?.localDir}</span>}>
          <Button variant="ghost" onClick={() => invoke("open_app_folder", { kind: "logs" }).catch(notifyError)}>
            {t.common.open}
          </Button>
        </Row>
      </Section>

      <section className="card flex items-center gap-4 px-5 py-4">
        <LogoTile size={44} />
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-semibold text-fg">Modstead</div>
          <div className="text-[12px] text-fg-2">
            {t.app.tagline} · {t.settings.version(info?.version ?? "…")}
          </div>
        </div>
        <Gamepad2 className="size-5 text-muted" />
      </section>
    </div>
  );
}
