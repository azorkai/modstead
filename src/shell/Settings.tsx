// Genel ayarlar (tüm oyunlar için ortak). Oyuna özel ayarlar oyunun kendi sayfasında.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { BadgeCheck, Bug, CircleArrowUp, FolderOpen, GitBranch, KeyRound, Languages, Link2, MonitorCog, Palette, ShieldCheck, ShieldHalf, Sparkles, Wind } from "lucide-react";
import clsx from "clsx";
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
import { UpdateSection } from "./Updater";

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
      className="flex w-[360px] items-center gap-2"
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

/** Ayarlar bölümlerinin dizini: tıklayınca bölüme kayar; kaydırırken görünen bölüm vurgulanır. */
function useSectionSpy(ids: string[]) {
  const [active, setActive] = useState(ids[0]);
  useEffect(() => {
    const els = ids.map((id) => document.getElementById(`settings-${id}`)).filter((e): e is HTMLElement => !!e);
    const root = els[0]?.closest("main") ?? null;
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id.replace("settings-", ""));
      },
      { root, rootMargin: "-10% 0px -65% 0px" },
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [ids.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
  return [active, setActive] as const;
}

export function Settings() {
  const t = useT();
  const set = useSet();
  const { data: s } = useSettings();
  const { data: info } = useAppInfo();
  const sections = [
    { id: "appearance", label: t.settings.appearance, icon: <Palette className="size-4" /> },
    { id: "security", label: t.settings.security, icon: <ShieldCheck className="size-4" /> },
    { id: "accounts", label: t.settings.accounts, icon: <KeyRound className="size-4" /> },
    { id: "links", label: t.settings.links, icon: <Link2 className="size-4" /> },
    { id: "games", label: t.settings.games, icon: <MonitorCog className="size-4" /> },
    { id: "storage", label: t.settings.storage, icon: <FolderOpen className="size-4" /> },
    { id: "updates", label: t.update.title, icon: <CircleArrowUp className="size-4" /> },
  ];
  const [active, setActive] = useSectionSpy(sections.map((x) => x.id));
  const nav = useRef<HTMLElement>(null);
  if (!s) return null;
  const visible = s.games.length ? s.games : GAMES.map((g) => g.id);
  const toggleGame = (id: string, on: boolean) => {
    const next = on ? GAMES.map((g) => g.id).filter((g) => g === id || visible.includes(g)) : visible.filter((g) => g !== id);
    if (next.length === 0) return;
    void set({ games: next.length === GAMES.length ? [] : next });
  };
  const jump = (id: string) => {
    setActive(id);
    document.getElementById(`settings-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="mx-auto max-w-[1120px] pb-10">
      <PageHeader eyebrow={`Modstead · ${t.settings.version(info?.version ?? "…")}`} title={t.settings.title} subtitle={t.settings.subtitle} />

      <div className="grid grid-cols-[200px_minmax(0,1fr)] items-start gap-10">
        <nav ref={nav} aria-label={t.settings.title} className="sticky top-0 flex flex-col gap-0.5">
          {sections.map((x) => (
            <button
              key={x.id}
              type="button"
              onClick={() => jump(x.id)}
              aria-current={active === x.id ? "true" : undefined}
              className={clsx(
                "flex h-10 items-center gap-3 rounded-full px-3.5 text-left text-[13.5px] transition-colors",
                active === x.id ? "bg-surface-2 font-semibold text-fg" : "text-fg-2 hover:bg-surface-2/60 hover:text-fg",
              )}
            >
              <span className={active === x.id ? "text-accent" : "text-muted"}>{x.icon}</span>
              {x.label}
            </button>
          ))}
        </nav>

        <div className="flex min-w-0 flex-col gap-6">
      <div id="settings-appearance" className="scroll-mt-2">
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
      </div>

      <div id="settings-security" className="scroll-mt-2">
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
      </div>

      <div id="settings-accounts" className="scroll-mt-2">
      <Section title={t.settings.accounts} description={t.settings.accountsHint}>
        <NexusRow />
        <SecretRow kind="virustotal" icon={<ShieldCheck className="size-4" />} title={t.settings.vtKey} description={t.settings.virustotalHint} />
        <SecretRow kind="github" icon={<GitBranch className="size-4" />} title={t.settings.githubToken} description={t.settings.githubTokenHint} />
      </Section>
      </div>

      <div id="settings-links" className="scroll-mt-2">
      <Section title={t.settings.links}>
        <NxmRow />
      </Section>
      </div>

      <div id="settings-games" className="scroll-mt-2">
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
      </div>

      <div id="settings-storage" className="scroll-mt-2">
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

      </div>

      <div id="settings-updates" className="scroll-mt-2">
        <UpdateSection />
      </div>

      {/* Hakkında: markanın sessiz anı. Koyu ada, ince kobalt ışık çizgileri. */}
      <section data-theme="dark" className="fluted relative overflow-hidden rounded-2xl border border-line bg-ink px-6 py-6 text-fg">
        <div className="flex items-center gap-5">
          <LogoTile size={56} />
          <div className="min-w-0 flex-1">
            <div className="headline text-[26px] text-fg">Modstead</div>
            <div className="mt-1.5 text-[13px] text-fg-2">{t.app.tagline}</div>
          </div>
          <div className="text-right">
            <div className="eyebrow text-muted">{t.settings.about}</div>
            <div className="num mt-1.5 text-[18px] text-fg">{info?.version ?? "…"}</div>
            <div className="eyebrow mt-1 text-muted">GPL-3.0</div>
          </div>
        </div>
      </section>
        </div>
      </div>
    </div>
  );
}
