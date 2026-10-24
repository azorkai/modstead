// Cities: Skylines II panosu: oyun vitrini ve "Oyna", kaldığınız şehir (oyunun kendi önizlemesiyle),
// özet sayılar, dikkat gerekenler, son oturum ve disk, Paradox Mods'ta öne çıkanlar.

import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "motion/react";
import { ArrowRight, Boxes, Cpu, FolderOpen, HardDrive, HeartPulse, Map as MapIcon, Play, Save, ScrollText, ShieldCheck, TriangleAlert, UserRound, Users, Wallet } from "lucide-react";
import clsx from "clsx";
import { toast } from "sonner";
import { useArt } from "@/lib/art";
import { ago, bytes, num } from "@/lib/format";
import { useLang } from "@/lib/i18n";
import { gameModule } from "@/games/registry";
import { GameIcon } from "@/shell/GameIcon";
import { chooseGameFolder, notifyError } from "@/shell/actions";
import { Badge, Button, EmptyState, Skeleton, Stat } from "@/ui";
import { CitiesArt } from "./Art";
import { api } from "./api";
import { useS } from "./i18n";
import { compact } from "./nexus";
import { openPdxMod } from "./paradox";
import { GAME, goPage, money, refreshAll, runFix, tagLabel, useCitiesSettings, useCitiesSync, useEnv, useHealth, useModIndex, usePreview, useSaves } from "./queries";
import { Card, ImageTag, IssueIcon, Page } from "./shared";
import type { SaveInfo } from "./types";

export default function Overview() {
  useCitiesSync();
  const t = useS();
  const { data: env } = useEnv();
  const { snapshot, isLoading } = useModIndex();
  const { data: health, isLoading: healthLoading } = useHealth();
  const { data: saves } = useSaves();

  if (env && !env.gamePath && !env.userDirExists) {
    return (
      <Page>
        <Hero />
        <div className="card mt-5">
          <EmptyState
            icon={<FolderOpen className="size-6" />}
            title={t.overview.nogameTitle}
            action={
              <Button variant="primary" icon={<FolderOpen className="size-4" />} onClick={async () => (await chooseGameFolder(GAME)) && refreshAll()}>
                {t.overview.chooseFolder}
              </Button>
            }
          >
            {t.overview.nogameBody}
          </EmptyState>
        </div>
      </Page>
    );
  }

  const issues = (health?.issues ?? []).filter((i) => i.severity !== "info");
  const shown = (health?.issues ?? []).slice(0, 4);
  const counts = snapshot?.counts;
  const latest = saves?.[0];

  return (
    <Page className="flex flex-col gap-5 pb-10">
      <Hero />

      <div className="grid grid-cols-4 gap-3">
        <Stat label={t.overview.paradoxMods} value={isLoading ? "…" : num(counts?.paradox ?? 0)} icon={<Boxes className="size-3.5" />} tone="accent" onClick={() => goPage("mods")} />
        <Stat label={t.overview.localMods} value={isLoading ? "…" : num(counts?.local ?? 0)} icon={<FolderOpen className="size-3.5" />} onClick={() => goPage("mods")} />
        <Stat label={t.overview.saves} value={saves ? num(saves.length) : "…"} icon={<Save className="size-3.5" />} onClick={() => goPage("saves")} />
        <Stat
          label={t.overview.health}
          value={health ? num(health.score) : "…"}
          icon={<HeartPulse className="size-3.5" />}
          tone={!health ? undefined : health.issues.some((i) => i.severity === "danger") ? "danger" : issues.length ? "warn" : "ok"}
          onClick={() => goPage("health")}
        />
      </div>

      <div className="grid grid-cols-[1.45fr_1fr] gap-5">
        <div className="flex min-w-0 flex-col gap-5">
          {latest ? <ContinueCard save={latest} /> : saves === undefined ? <Skeleton className="h-[300px] rounded-[18px]" /> : null}

          <Card
            title={t.overview.attention}
            aside={
              (health?.issues.length ?? 0) > shown.length && (
                <Button size="sm" variant="ghost" trailing={<ArrowRight className="size-3.5" />} onClick={() => goPage("health")}>
                  {t.overview.seeAll(health!.issues.length)}
                </Button>
              )
            }
          >
            {healthLoading ? (
              <div className="space-y-2 p-5">
                <Skeleton className="h-12" />
                <Skeleton className="h-12" />
              </div>
            ) : shown.length === 0 ? (
              <div className="flex items-center gap-4 px-5 py-5">
                <div className="grid size-11 place-items-center rounded-full bg-ok/12 text-ok">
                  <ShieldCheck className="size-5" />
                </div>
                <div>
                  <div className="text-[13.5px] font-semibold text-fg">{t.overview.allGood}</div>
                  <div className="text-[12.5px] text-fg-2">{t.overview.allGoodBody}</div>
                </div>
              </div>
            ) : (
              <ul className="divide-y divide-[var(--line)]">
                {shown.map((i) => (
                  <li key={i.id} className="flex items-center gap-3 px-5 py-3">
                    <IssueIcon severity={i.severity} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-medium text-fg">{i.title}</div>
                      <div className="line-clamp-1 text-[12px] text-muted">{i.detail}</div>
                    </div>
                    {i.fix && (
                      <Button size="sm" variant={i.severity === "danger" ? "primary" : "subtle"} onClick={() => runFix(i.fix!)}>
                        {i.fix.label}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <SessionCard />
          <DiskCard />
        </div>
      </div>

      <FeaturedCard />
    </Page>
  );
}

function Hero() {
  const t = useS();
  const lang = useLang((s) => s.lang);
  const game = gameModule(GAME)!;
  const hero = useArt(GAME, "hero");
  const logo = useArt(GAME, "logo");
  const { data: env } = useEnv();
  const { data: settings } = useCitiesSettings();
  const [busy, setBusy] = useState(false);
  const devOn = !!env?.launch.supportsOptions && !!settings && (settings.developerMode || settings.uiDeveloperMode);

  const play = async () => {
    setBusy(true);
    try {
      await api.launch();
      toast.success(t.overview.launched);
      setTimeout(refreshAll, 4000);
    } catch (e) {
      notifyError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="relative min-h-[300px] overflow-hidden rounded-3xl border border-line bg-[#0a0e14]">
      {hero ? (
        <img src={hero} alt="" draggable={false} className="absolute inset-0 size-full object-cover" style={{ objectPosition: "60% 40%" }} />
      ) : (
        <div className="hero-surface absolute inset-0">
          <CitiesArt className="absolute bottom-0 right-0 h-[88%] text-accent" />
        </div>
      )}
      <div className="absolute inset-0" style={{ background: "linear-gradient(90deg, rgb(8 9 12 / 0.9) 0%, rgb(8 9 12 / 0.6) 40%, rgb(8 9 12 / 0) 76%), linear-gradient(0deg, rgb(8 9 12 / 0.65) 0%, transparent 45%)" }} />
      <div className="relative flex h-full min-h-[300px] max-w-xl flex-col justify-end px-8 pb-7 pt-8">
        <div className="mb-auto flex items-center gap-2">
          <GameIcon game={game} size={40} />
          {env?.running && (
            <Badge tone="ok" dot className="bg-black/40 backdrop-blur-md">
              {t.overview.running}
            </Badge>
          )}
        </div>
        {logo ? (
          <>
            <h1 className="sr-only">{game.name}</h1>
            <img src={logo} alt="" draggable={false} className="mt-6 max-h-[96px] max-w-[380px] object-contain object-left drop-shadow-[0_6px_24px_rgb(0_0_0/0.55)]" />
          </>
        ) : (
          <h1 lang="en" className="text-display mt-6 text-[34px] font-bold uppercase leading-[1.02] tracking-tight text-white">{game.name}</h1>
        )}
        <p className="mt-2 text-[14px] text-white/75">{game.tagline[lang]}</p>
        <div className="mt-5 flex flex-wrap items-center gap-2">
          {!env ? (
            <Skeleton className="h-11 w-36" />
          ) : (
            <Button variant="primary" size="lg" loading={busy} icon={<Play className="size-4 fill-current" />} disabled={env.running || !env.gamePath} onClick={play}>
              {env.running ? t.overview.running : t.overview.play}
            </Button>
          )}
          {env?.store && (
            <Chip>
              {t.store[env.store] ?? env.store}
              {env.version && <span className="ml-1 text-white/60">· {env.version}</span>}
            </Chip>
          )}
          {env && env.account.loggedIn !== null && (
            <Chip tone={env.account.loggedIn ? undefined : "warn"} onClick={env.account.loggedIn ? undefined : () => goPage("health")}>
              <UserRound className="mr-1 size-3.5" />
              {env.account.loggedIn ? t.overview.signedIn : t.overview.signedOut}
            </Chip>
          )}
          {devOn && <Chip>{settings!.developerMode ? t.overview.devMode : t.overview.uiDevMode}</Chip>}
        </div>
      </div>
    </motion.section>
  );
}

function Chip({ children, tone, onClick }: { children: ReactNode; tone?: "warn"; onClick?: () => void }) {
  const cls = clsx(
    "inline-flex h-7 items-center rounded-lg border bg-black/40 px-2.5 text-[12px] text-white backdrop-blur-md",
    tone === "warn" ? "border-[color-mix(in_oklab,var(--warn)_55%,transparent)]" : "border-white/15",
    onClick && "hover:bg-black/60",
  );
  return onClick ? (
    <button className={cls} onClick={onClick}>
      {children}
    </button>
  ) : (
    <span className={cls}>{children}</span>
  );
}

/** Kaldığınız şehir: en son kaydın oyundaki önizlemesi, nüfus, para, harita. */
function ContinueCard({ save }: { save: SaveInfo }) {
  const t = useS();
  const { data: img } = usePreview(save.id, save.modified, true);
  return (
    <button onClick={() => goPage("saves")} className="group relative block min-h-[300px] overflow-hidden rounded-[18px] border border-line bg-[#0a0e14] text-left">
      {img ? (
        <img src={img} alt="" draggable={false} className="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
      ) : (
        <div className="hero-surface absolute inset-0">
          <CitiesArt className="absolute bottom-0 right-0 h-[80%] text-accent" />
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-black/10" />
      <div className="absolute left-4 top-4 flex gap-1.5">
        <ImageTag icon={<Save className="size-3" />}>{t.overview.continueTitle}</ImageTag>
        {save.autoSave && <ImageTag>{t.saves.autoSave}</ImageTag>}
      </div>
      <div className="absolute inset-x-5 bottom-4">
        <div className="text-display text-[28px] font-bold leading-tight text-white [text-shadow:0_2px_8px_rgb(0_0_0/0.6)]">{save.cityName ?? save.name}</div>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-white/85">
          <span className="inline-flex items-center gap-1.5">
            <Users className="size-3.5 text-white/60" />
            <span className="tabular font-medium">{num(save.population)}</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Wallet className="size-3.5 text-white/60" />
            <span className="tabular font-medium">{money(save.money, num)}</span>
          </span>
          {save.mapName && (
            <span className="inline-flex items-center gap-1.5">
              <MapIcon className="size-3.5 text-white/60" />
              {save.mapName}
            </span>
          )}
          <span className="text-white/60">{t.overview.saved(ago(save.modified))}</span>
        </div>
      </div>
    </button>
  );
}

function SessionCard() {
  const t = useS();
  const { data: health } = useHealth();
  const logs = health?.logs;
  const errors = logs?.lines.length ?? 0;
  return (
    <Card
      title={t.overview.session}
      aside={
        <Button size="sm" variant="ghost" icon={<ScrollText className="size-3.5" />} onClick={() => goPage("health")}>
          {t.overview.openLogs}
        </Button>
      }
    >
      {!logs ? (
        <div className="space-y-2 p-5">
          <Skeleton className="h-5" />
          <Skeleton className="h-5" />
          <Skeleton className="h-5" />
        </div>
      ) : (
        <dl className="divide-y divide-[var(--line)] text-[12.5px]">
          <Row icon={<Boxes className="size-3.5" />} label={t.overview.version} value={<span className="font-mono">{logs.gameVersion ?? health?.gameVersion ?? "—"}</span>} />
          <Row icon={<Cpu className="size-3.5" />} label={t.overview.gpu} value={logs.gpu ?? "—"} />
          <Row icon={<ShieldCheck className="size-3.5" />} label={t.overview.runtime} value={logs.moddingRuntime ?? "—"} />
          <Row
            icon={<TriangleAlert className={clsx("size-3.5", logs.crashes ? "text-warn" : undefined)} />}
            label={t.overview.crashes(logs.crashes)}
            value={errors ? <Badge tone="warn">{t.overview.logErrors(errors)}</Badge> : null}
          />
        </dl>
      )}
    </Card>
  );
}

function Row({ icon, label, value }: { icon: ReactNode; label: string; value: ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-5 py-2.5">
      <span className="text-muted">{icon}</span>
      <dt className="min-w-0 flex-1 truncate text-fg-2">{label}</dt>
      <dd className="max-w-[60%] truncate text-right font-medium text-fg">{value}</dd>
    </div>
  );
}

function DiskCard() {
  const t = useS();
  const { data: env } = useEnv();
  if (!env?.disks.length) return null;
  return (
    <Card title={t.overview.disks}>
      <div className="flex flex-col gap-3 px-5 py-4">
        {env.disks.map((d) => (
          <div key={d.path} className="flex items-center gap-3">
            <HardDrive className={clsx("size-4 shrink-0", d.low ? "text-warn" : "text-muted")} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[12.5px] text-fg">{d.label}</div>
              <div className="truncate font-mono text-[11px] text-muted" title={d.path}>
                {d.path}
              </div>
            </div>
            <span className={clsx("tabular shrink-0 text-[12.5px] font-medium", d.low ? "text-warn" : "text-fg-2")}>{t.overview.free(bytes(d.free))}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

/** Paradox Mods'ta öne çıkan, henüz kurulu olmayan modlar. Ağ yoksa görünmez. */
function FeaturedCard() {
  const t = useS();
  const { byPdx } = useModIndex();
  const { data } = useQuery({ queryKey: [GAME, "pdx-featured"], queryFn: () => api.pdxSearch("", "best", "Code Mod", 0), staleTime: 30 * 60_000, retry: false });
  const picks = (data?.mods ?? []).filter((m) => !byPdx.has(m.modId)).slice(0, 4);
  if (picks.length === 0) return null;
  return (
    <Card
      title={t.overview.featured}
      aside={
        <Button size="sm" variant="ghost" trailing={<ArrowRight className="size-3.5" />} onClick={() => goPage("discover")}>
          {t.overview.findMods}
        </Button>
      }
    >
      <div className="grid grid-cols-4 gap-3 p-4">
        {picks.map((m) => (
          <button key={m.modId} onClick={() => openPdxMod(m.modId)} className="group overflow-hidden rounded-[14px] border border-line bg-surface-2/50 text-left transition-colors hover:border-line-strong">
            <div className="relative aspect-[16/9] overflow-hidden bg-surface-3">
              {m.thumbnail && <img src={m.thumbnail} alt="" loading="lazy" draggable={false} className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.05]" />}
              <span className="absolute left-2 top-2">
                <ImageTag>{tagLabel(m.tags[0] ?? "Code Mod")}</ImageTag>
              </span>
            </div>
            <div className="px-2.5 py-2">
              <div className="truncate text-[12.5px] font-medium text-fg">{m.name}</div>
              <div className="truncate text-[11px] text-muted">
                {m.author} · {t.discover.subscribers(compact(m.subscriptions))}
              </div>
            </div>
          </button>
        ))}
      </div>
    </Card>
  );
}
