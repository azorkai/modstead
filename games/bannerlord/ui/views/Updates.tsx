import { useState } from "react";
import { motion } from "motion/react";
import { ArrowUpCircle, CheckCircle2, CircleHelp, Download, ExternalLink, RefreshCw, TriangleAlert } from "lucide-react";
import { GithubIcon, SteamIcon } from "../components/icons";
import { toast } from "sonner";
import clsx from "clsx";
import { api, errorText } from "../api";
import type { UpdateItem } from "../types";
import { nexusFileUrl } from "../links";
import { useApp } from "../store";
import { useNexus } from "@/lib/queries";
import { Badge, Button, EmptyState, ModuleAvatar, Spinner } from "../components/kit";
import { fmtTime } from "../format";
import { useT } from "../i18n";

// u.error arka uçtan yerelleştirilmiş gelir; sürüm ve mod adları çevrilmez.

export function UpdatesView() {
  const t = useT();
  const updates = useApp((s) => s.updates);
  const setUpdates = useApp((s) => s.setUpdates);
  const { data: nexus } = useNexus();
  const openInSteam = useApp((s) => s.openInSteam);
  const [checking, setChecking] = useState(false);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  const check = async () => {
    setChecking(true);
    try {
      setUpdates(await api.checkUpdates());
      setLastChecked(new Date());
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setChecking(false);
    }
  };

  const available = updates?.filter((u) => u.status === "available") ?? [];
  const premium = !!nexus?.user?.isPremium;

  const update = async (u: UpdateItem) => {
    try {
      if (u.provider === "github" && u.githubRepo && u.githubAssetId) {
        await api.installGithub(u.githubRepo, u.githubAssetId, u.githubReleaseId);
        toast.success(t.updates.downloading(u.name));
      } else if (u.provider === "nexus" && u.nexusModId) {
        if (premium && u.nexusFileId) {
          await api.installNexus(u.nexusModId, u.nexusFileId);
          toast.success(t.updates.downloading(u.name));
        } else {
          await api.openUrl(nexusFileUrl(u.nexusModId, u.nexusFileId));
          toast(t.common.nexusOpened, { description: t.updates.nexusOpenedHint });
        }
      } else if (u.sourceUrl) {
        await api.openUrl(u.sourceUrl);
      }
    } catch (e) {
      toast.error(errorText(e));
    }
  };

  return (
    <div className="mx-auto flex max-w-[1180px] flex-col">
      <header className="flex items-end gap-4 mb-6">
        <div className="flex-1">
          <h1 className="text-display text-[26px] font-semibold leading-tight tracking-tight text-fg">{t.nav.updates}</h1>
          <p className="mt-2 text-[13px] text-fg-2">
            {t.updates.intro}
            {lastChecked && <span className="text-muted"> · {t.updates.lastChecked(fmtTime(lastChecked))}</span>}
          </p>
        </div>
        {available.length > 1 && (
          <Button
            variant="primary"
            icon={<Download className="size-4" />}
            onClick={async () => {
              for (const u of available.filter((x) => x.provider === "github" || premium)) await update(u);
            }}
          >
            {t.updates.updateAll}
          </Button>
        )}
        {updates && (
          <Button icon={<RefreshCw className={clsx("size-4", checking && "animate-spin")} />} disabled={checking} onClick={check}>
            {t.updates.recheck}
          </Button>
        )}
      </header>

      <div>
        {!updates ? (
          checking ? (
            <div className="flex justify-center py-20">
              <Spinner className="size-6" />
            </div>
          ) : (
            <EmptyState
              icon={<RefreshCw className="size-6" />}
              title={t.updates.emptyTitle}
              action={
                <Button variant="primary" onClick={check}>
                  {t.updates.checkNow}
                </Button>
              }
            >
              {t.updates.emptyBody}
            </EmptyState>
          )
        ) : (
          <div className="card overflow-hidden">
            {updates.map((u, i) => (
              <motion.div
                key={u.moduleId}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.015, 0.3) }}
                className="flex items-center gap-4 border-b border-line px-5 py-3 last:border-b-0"
              >
                <ModuleAvatar id={u.moduleId} name={u.name} size={34} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[13.5px] font-medium">{u.name}</span>
                    <ProviderBadge provider={u.provider} />
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 font-mono text-[11.5px] text-muted">
                    <span>{u.current || "—"}</span>
                    {u.latest && u.status === "available" && (
                      <>
                        <span>→</span>
                        <span className="text-accent">{u.latest}</span>
                      </>
                    )}
                    {u.error && <span className="truncate font-sans text-danger">{u.error}</span>}
                  </div>
                </div>
                <StatusPill status={u.status} />
                <div className="flex w-[160px] justify-end gap-1.5">
                  {u.status === "available" && (
                    <Button size="sm" variant="subtle" icon={<Download className="size-3.5" />} onClick={() => update(u)}>
                      {t.updates.update}
                    </Button>
                  )}
                  {u.status === "steamPending" && (
                    <Button size="sm" variant="subtle" icon={<SteamIcon className="size-3.5" />} onClick={() => openInSteam("downloads")}>
                      {t.steam.downloads}
                    </Button>
                  )}
                  {u.sourceUrl && u.status !== "available" && u.status !== "steamPending" && (
                    <Button size="sm" variant="ghost" icon={<ExternalLink className="size-3.5" />} onClick={() => api.openUrl(u.sourceUrl!).catch(() => {})}>
                      {t.common.source}
                    </Button>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ProviderBadge({ provider }: { provider: UpdateItem["provider"] }) {
  const t = useT();
  if (provider === "github") return <Badge icon={<GithubIcon className="size-3" />}>GitHub</Badge>;
  if (provider === "nexus") return <Badge>Nexus</Badge>;
  if (provider === "steam") return <Badge tone="info" icon={<SteamIcon className="size-3" />}>Workshop</Badge>;
  return <Badge>{t.updates.noSource}</Badge>;
}

function StatusPill({ status }: { status: UpdateItem["status"] }) {
  const t = useT();
  const map = {
    available: { tone: "accent", icon: <ArrowUpCircle className="size-3.5" /> },
    current: { tone: "ok", icon: <CheckCircle2 className="size-3.5" /> },
    steam: { tone: "info", icon: <SteamIcon className="size-3.5" /> },
    // Steam'de daha yeni sürüm var; Steam indirecek.
    steamPending: { tone: "accent", icon: <SteamIcon className="size-3.5" /> },
    error: { tone: "danger", icon: <TriangleAlert className="size-3.5" /> },
    unknown: { tone: "neutral", icon: <CircleHelp className="size-3.5" /> },
  } as const;
  // Arka uç ileride yeni bir durum eklerse çökme yerine "bilinmiyor" gibi göster.
  const s = map[status] ?? map.unknown;
  return (
    <Badge tone={s.tone} icon={s.icon} className="h-6 px-2">
      {t.updates.status[status] ?? status}
    </Badge>
  );
}
