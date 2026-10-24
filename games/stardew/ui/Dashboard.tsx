// Stardew panosu (genel bakış): oyun vitrini ve "Oyna", özet sayılar, dikkat gerekenler,
// son eklenen modlar, Nexus'ta popüler modlar, son etkinlik, son oturumun SMAPI özeti ve son çiftlik.

import { useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "motion/react";
import { ArrowRight, ArrowUpCircle, Boxes, CheckCircle2, FolderOpen, Gamepad2, Play, ScrollText, Sprout, TriangleAlert, Wrench } from "lucide-react";
import clsx from "clsx";
import { toast } from "sonner";
import { useArt } from "@/lib/art";
import { ago, locale, num } from "@/lib/format";
import { listen } from "@/lib/ipc";
import { useLang } from "@/lib/i18n";
import { gameModule } from "@/games/registry";
import { GameIcon } from "@/shell/GameIcon";
import { chooseGameFolder, notifyError } from "@/shell/actions";
import { Badge, Button, EmptyState, Skeleton, Stat } from "@/ui";
import { openActivityWith } from "./Activity";
import { api } from "./api";
import { useS } from "./i18n";
import { ModDrawer } from "./ModDrawer";
import { SMAPI_NEXUS_ID, compact, decodeEntities, openNexusMod } from "./nexus";
import { Filiz, PixelCover, PixelLandscape } from "./Pixel";
import { GAME, goPage, installSmapi, refreshAll, runFix, useEnv, useJournal, useLog, useModIndex, useSaves, useSnapshot, useStardewSync } from "./queries";
import { IssueIcon, Page } from "./shared";
import type { GameExited } from "./types";

export default function Dashboard() {
  useStardewSync();
  const t = useS();
  const { data: env } = useEnv();
  const { isLoading } = useSnapshot();
  const { mods, snapshot, updateOf } = useModIndex();
  const [open, setOpen] = useState<string | null>(null);

  if (env && !env.gamePath) {
    return (
      <Page>
        <Hero />
        <div className="card mt-5">
          <EmptyState
            icon={<FolderOpen className="size-6" />}
            title={t.dash.nogameTitle}
            action={
              <Button variant="primary" icon={<FolderOpen className="size-4" />} onClick={async () => (await chooseGameFolder("stardew")) && refreshAll()}>
                {t.mods.chooseFolder}
              </Button>
            }
          >
            {t.dash.nogameBody}
          </EmptyState>
        </div>
      </Page>
    );
  }

  const health = snapshot?.health;
  const issues = (health?.issues ?? []).filter((i) => i.severity !== "info");
  const updates = mods.filter((m) => updateOf(m)?.hasUpdate).length;
  const recent = [...mods].sort((a, b) => b.modified - a.modified).slice(0, 6);

  return (
    <Page className="flex flex-col gap-5">
      <Hero />
      <ExitBanner />

      <div className="grid grid-cols-4 gap-3">
        <Stat label={t.dash.mods} value={isLoading ? "…" : num(mods.length)} icon={<Boxes className="size-3.5" />} onClick={() => goPage("mods")} />
        <Stat label={t.dash.enabled} value={isLoading ? "…" : num(mods.filter((m) => m.enabled).length)} icon={<CheckCircle2 className="size-3.5" />} tone="accent" onClick={() => goPage("mods")} />
        <Stat label={t.dash.issues} value={isLoading ? "…" : num((health?.errors ?? 0) + (health?.warnings ?? 0))} icon={<TriangleAlert className="size-3.5" />} tone={health?.errors ? "danger" : health?.warnings ? "warn" : undefined} onClick={() => goPage("health")} />
        <Stat label={t.dash.updates} value={isLoading ? "…" : num(updates)} icon={<ArrowUpCircle className="size-3.5" />} tone={updates ? "accent" : undefined} onClick={() => goPage("updates")} />
      </div>

      <div className="grid grid-cols-[1.45fr_1fr] gap-5">
        <div className="flex min-w-0 flex-col gap-5">
          <Card
            title={t.dash.attention}
            aside={
              issues.length > 3 && (
                <Button size="sm" variant="ghost" trailing={<ArrowRight className="size-3.5" />} onClick={() => goPage("health")}>
                  {t.dash.seeAll(issues.length)}
                </Button>
              )
            }
          >
            {isLoading ? (
              <div className="space-y-2 p-5">
                <Skeleton className="h-12" />
                <Skeleton className="h-12" />
              </div>
            ) : issues.length === 0 ? (
              <div className="flex items-center gap-4 px-5 py-5">
                <Filiz size={48} />
                <div>
                  <div className="text-[13.5px] font-semibold text-fg">{t.dash.allGood}</div>
                  <div className="text-[12.5px] text-fg-2">{t.dash.allGoodBody}</div>
                </div>
              </div>
            ) : (
              <ul className="divide-y divide-[var(--line)]">
                {issues.slice(0, 3).map((i) => (
                  <li key={i.id} className="flex items-center gap-3 px-5 py-3">
                    <IssueIcon severity={i.severity} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-medium text-fg">{i.title}</div>
                      <div className="truncate text-[12px] text-muted">{i.detail}</div>
                    </div>
                    {i.fix && (
                      <Button size="sm" variant={i.kind === "smapi-missing" ? "primary" : "subtle"} onClick={() => runFix(i.fix!)}>
                        {i.fix.label}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {recent.length > 0 && (
            <Card
              title={t.dash.recent}
              aside={
                <Button size="sm" variant="ghost" trailing={<ArrowRight className="size-3.5" />} onClick={() => goPage("mods")}>
                  {t.dash.mods}
                </Button>
              }
            >
              <div className="grid grid-cols-3 gap-3 p-4">
                {recent.map((m) => (
                  <button key={m.folder} onClick={() => setOpen(m.folder)} className="group overflow-hidden rounded-[14px] border border-line bg-surface-2/50 text-left transition-colors hover:border-line-strong">
                    <div className="relative aspect-[16/8] overflow-hidden">
                      <PixelCover seed={m.uniqueId ?? m.folder} kind={m.kind} dim={!m.enabled} className="size-full transition-transform duration-300 group-hover:scale-[1.05]" />
                    </div>
                    <div className="px-2.5 py-2">
                      <div className="truncate text-[12.5px] font-medium text-fg">{m.name}</div>
                      <div className="truncate text-[11px] text-muted">{ago(m.modified)}</div>
                    </div>
                  </button>
                ))}
              </div>
            </Card>
          )}

          <PopularCard />
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <SessionCard />
          <FarmCard />
          <ActivityCard />
        </div>
      </div>
      <ModDrawer folder={open} onClose={() => setOpen(null)} onOpen={setOpen} />
    </Page>
  );
}

function Card({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="card overflow-hidden">
      <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
        <h3 className="text-[13.5px] font-semibold text-fg">{title}</h3>
        {aside}
      </header>
      {children}
    </section>
  );
}

/** Nexus'ta en çok indirilen, henüz kurulu olmayan modlar (Mod bul'a kısa yol). Ağ yoksa görünmez. */
function PopularCard() {
  const t = useS();
  const { byNexus } = useModIndex();
  const { data } = useQuery({ queryKey: [GAME, "nexus-popular"], queryFn: () => api.nexusSearch("", "downloads", null, 0), staleTime: 30 * 60_000, retry: false });
  const picks = (data?.mods ?? []).filter((m) => m.modId !== SMAPI_NEXUS_ID && !byNexus.has(m.modId)).slice(0, 3);
  if (picks.length === 0) return null;
  return (
    <Card
      title={t.dash.popular}
      aside={
        <Button size="sm" variant="ghost" trailing={<ArrowRight className="size-3.5" />} onClick={() => goPage("discover")}>
          {t.discover.findMods}
        </Button>
      }
    >
      <div className="grid grid-cols-3 gap-3 p-4">
        {picks.map((m) => (
          <button key={m.modId} onClick={() => openNexusMod(m.modId)} className="group overflow-hidden rounded-[14px] border border-line bg-surface-2/50 text-left transition-colors hover:border-line-strong">
            <div className="relative aspect-[16/8] overflow-hidden bg-surface-3">
              {m.thumbnailUrl ? (
                <img src={m.thumbnailUrl} alt="" loading="lazy" draggable={false} className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.05]" />
              ) : (
                <PixelCover seed={String(m.modId)} kind="smapi" className="size-full" />
              )}
            </div>
            <div className="px-2.5 py-2">
              <div className="truncate text-[12.5px] font-medium text-fg">{decodeEntities(m.name)}</div>
              <div className="truncate text-[11px] text-muted">{t.discover.downloads(compact(m.downloads))}</div>
            </div>
          </button>
        ))}
      </div>
    </Card>
  );
}

/** Oyun vitrini: Steam kütüphane görseli (yoksa piksel manzara), logo, durum ve "Oyna". İki temada da koyu kalır. */
function Hero() {
  const t = useS();
  const lang = useLang((s) => s.lang);
  const game = gameModule("stardew")!;
  const hero = useArt("stardew", "hero");
  const logo = useArt("stardew", "logo");
  const { data: env } = useEnv();
  const [busy, setBusy] = useState(false);
  const noSmapi = !!env?.gamePath && !env.smapi.installed;

  const play = async (vanilla: boolean) => {
    setBusy(true);
    try {
      const r = await api.launch(vanilla);
      toast.success(t.dash.launched, { description: r.backupError ? `${t.dash.backupFailed}: ${r.backupError}` : r.backedUp ? t.dash.backedUp(r.backedUp) : undefined });
      refreshAll();
    } catch (e) {
      notifyError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="relative min-h-[300px] overflow-hidden rounded-3xl border border-line bg-[#0b0d14]">
      {hero ? (
        <img src={hero} alt="" draggable={false} className="absolute inset-0 size-full object-cover" style={{ objectPosition: "65% 35%" }} />
      ) : (
        <PixelLandscape className="absolute inset-0 size-full" />
      )}
      <div className="absolute inset-0" style={{ background: "linear-gradient(90deg, rgb(8 9 12 / 0.92) 0%, rgb(8 9 12 / 0.62) 40%, rgb(8 9 12 / 0) 75%), linear-gradient(0deg, rgb(8 9 12 / 0.65) 0%, transparent 45%)" }} />
      <div className="relative flex h-full min-h-[300px] max-w-xl flex-col justify-end px-8 pb-7 pt-8">
        <div className="mb-auto flex items-center gap-2">
          <GameIcon game={game} size={40} />
          {env?.running && (
            <Badge tone="ok" dot className="bg-black/40 backdrop-blur-md">
              {t.dash.running}
            </Badge>
          )}
        </div>
        {logo ? (
          <>
            <h1 className="sr-only">{game.name}</h1>
            <img src={logo} alt="" draggable={false} className="mt-6 max-h-[92px] max-w-[360px] object-contain object-left drop-shadow-[0_6px_24px_rgb(0_0_0/0.55)]" />
          </>
        ) : (
          <h1 className="text-display mt-6 text-[34px] font-semibold leading-[1.05] tracking-tight text-white">{game.name}</h1>
        )}
        <p className="mt-2 text-[14px] text-white/75">{game.tagline[lang]}</p>
        <div className="mt-5 flex flex-wrap items-center gap-2">
          {!env ? (
            <Skeleton className="h-11 w-36" />
          ) : noSmapi ? (
            <>
              <Button variant="primary" size="lg" icon={<Wrench className="size-4" />} onClick={installSmapi}>
                {t.mods.installSmapi}
              </Button>
              <Button size="lg" icon={<Gamepad2 className="size-4" />} disabled={env.running || busy} onClick={() => play(true)}>
                {t.dash.playVanilla}
              </Button>
            </>
          ) : (
            <Button variant="primary" size="lg" loading={busy} icon={<Play className="size-4 fill-current" />} disabled={env.running || !env.gamePath} onClick={() => play(false)}>
              {env.running ? t.dash.running : t.dash.play}
            </Button>
          )}
          {env?.gamePath && (
            <>
              {env.store && (
                <span className="inline-flex h-7 items-center rounded-lg border border-white/15 bg-black/40 px-2.5 text-[12px] text-white backdrop-blur-md">
                  {env.store === "steam" ? "Steam" : env.store === "gog" ? "GOG" : env.store === "xbox" ? "Xbox" : env.store}
                  {env.version && <span className="ml-1 text-white/60">· {env.version}</span>}
                </span>
              )}
              <span className={clsx("inline-flex h-7 items-center rounded-lg border border-white/15 bg-black/40 px-2.5 text-[12px] backdrop-blur-md text-white")}>
                {env.smapi.installed ? t.dash.smapiVersion(env.smapi.version ?? "?") : t.dash.noSmapi}
              </span>
            </>
          )}
        </div>
      </div>
    </motion.section>
  );
}

/** Oyun kapanınca son oturumun özeti (SMAPI günlüğüne bağlantıyla). */
function ExitBanner() {
  const t = useS();
  const [exit, setExit] = useState<GameExited | null>(null);
  const { data: log } = useLog();
  useEffect(() => listen<GameExited>("stardew://game-exited", (e) => setExit(e)), []);
  if (!exit) return null;
  const failing = Object.values(log?.bySource ?? {}).filter((s) => s.errors > 0).length;
  return (
    <motion.section initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className={clsx("card flex items-center gap-4 px-5 py-3.5", failing && "border-warn/30")}>
      <Gamepad2 className={clsx("size-5 shrink-0", failing ? "text-warn" : "text-ok")} />
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-medium text-fg">{t.dash.exited(Math.max(1, Math.round(exit.durationMs / 60_000)))}</div>
        {failing > 0 && <div className="text-[12.5px] text-fg-2">{t.dash.exitedErrors(failing)}</div>}
      </div>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => {
          openActivityWith("log");
          goPage("activity");
        }}
      >
        {t.dash.seeLog}
      </Button>
    </motion.section>
  );
}

function SessionCard() {
  const t = useS();
  const { data: log } = useLog();
  return (
    <Card
      title={t.dash.lastSession}
      aside={
        log?.exists && (
          <Button
            size="sm"
            variant="ghost"
            icon={<ScrollText className="size-3.5" />}
            onClick={() => {
              openActivityWith("log");
              goPage("activity");
            }}
          >
            {t.dash.openLog}
          </Button>
        )
      }
    >
      {!log ? (
        <div className="p-5">
          <Skeleton className="h-10" />
        </div>
      ) : !log.exists ? (
        <p className="px-5 py-4 text-[12.5px] text-fg-2">{t.dash.noLog}</p>
      ) : (
        <div className="flex items-center gap-4 px-5 py-4">
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-medium text-fg">{t.dash.loadedSkipped((log.modsLoaded ?? 0) + (log.contentPacksLoaded ?? 0), log.skipped.length)}</div>
            <div className="text-[12px] text-muted">{ago(log.modified)}</div>
          </div>
          <Badge tone={log.errors.length ? "danger" : "ok"}>{t.dash.sessionErrors(log.errors.length)}</Badge>
        </div>
      )}
    </Card>
  );
}

function FarmCard() {
  const t = useS();
  const { data: saves } = useSaves();
  const s = saves?.[0];
  return (
    <Card
      title={t.dash.farm}
      aside={
        s && (
          <Button size="sm" variant="ghost" trailing={<ArrowRight className="size-3.5" />} onClick={() => goPage("saves")}>
            {t.saves.title}
          </Button>
        )
      }
    >
      {!saves ? (
        <div className="p-5">
          <Skeleton className="h-10" />
        </div>
      ) : !s ? (
        <p className="px-5 py-4 text-[12.5px] text-fg-2">{t.dash.noSaves}</p>
      ) : (
        <div className="flex items-center gap-3 px-5 py-4">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-ok/12 text-ok">
            <Sprout className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-medium text-fg">
              {t.saves.farm(s.farm ?? s.folder)}
              {s.farmer && <span className="font-normal text-muted"> · {s.farmer}</span>}
            </div>
            <div className="truncate text-[12px] text-muted">
              {s.year != null && s.day != null && `${t.saves.date(s.year, t.saves.seasons[s.season ?? 0] ?? "", s.day)} · `}
              {s.money != null && `${s.money.toLocaleString(locale())}g · `}
              {s.backups[0] ? t.dash.lastBackup(ago(s.backups[0].created)) : t.dash.noBackup}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

function ActivityCard() {
  const t = useS();
  const { data: journal } = useJournal();
  return (
    <Card
      title={t.dash.activity}
      aside={
        !!journal?.length && (
          <Button size="sm" variant="ghost" trailing={<ArrowRight className="size-3.5" />} onClick={() => goPage("activity")}>
            {t.activity.title}
          </Button>
        )
      }
    >
      {!journal ? (
        <div className="space-y-2 p-5">
          <Skeleton className="h-8" />
          <Skeleton className="h-8" />
        </div>
      ) : journal.length === 0 ? (
        <p className="px-5 py-4 text-[12.5px] text-fg-2">{t.dash.noActivity}</p>
      ) : (
        <ul className="divide-y divide-[var(--line)]">
          {journal.slice(0, 4).map((j) => (
            <li key={j.id} className="px-5 py-2.5">
              <div className={clsx("truncate text-[12.5px]", j.undone ? "text-muted line-through" : "text-fg")}>{j.title}</div>
              <div className="text-[11.5px] text-muted">{ago(j.time)}</div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
