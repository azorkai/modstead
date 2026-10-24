// Güncellemeler: smapi.io denetimi, SMAPI güncellemesi, yeni sürümü olan modlar, uyumluluk notları
// ve güncelleme anahtarı olmayan modlar.

import { useState } from "react";
import { ArrowRight, ArrowUpCircle, ExternalLink, KeyRound, RefreshCw, ShieldAlert, Sparkles, Wrench } from "lucide-react";
import clsx from "clsx";
import { toast } from "sonner";
import { ago } from "@/lib/format";
import { useNexus, useNxmStatus } from "@/lib/queries";
import { useUi } from "@/lib/store";
import { openUrl } from "@/shell/actions";
import { Badge, Button, EmptyState, PageHeader, Skeleton } from "@/ui";
import { api } from "./api";
import { useS } from "./i18n";
import { ModDrawer } from "./ModDrawer";
import { getFromNexus, registerNxm } from "./nexus";
import { Filiz, PixelCover } from "./Pixel";
import { installSmapi, useAction, useEnv, useModIndex, useSnapshot, useStardewSync } from "./queries";
import { COMPAT_TONE, Page } from "./shared";

const COMPAT_NOTE = ["broken", "obsolete", "abandoned", "workaround", "unofficial"];

export default function Updates() {
  useStardewSync();
  const t = useS();
  const { isLoading } = useSnapshot();
  const { mods, updateOf, nexusOf, snapshot } = useModIndex();
  const { data: env } = useEnv();
  const { data: nxm } = useNxmStatus();
  const { data: nexus } = useNexus();
  const [updatingAll, setUpdatingAll] = useState(false);
  const premium = !!nexus?.hasKey && !!nexus.user?.isPremium;
  const [showNoKeys, setShowNoKeys] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const check = useAction(() => api.checkUpdates(), { success: (r) => t.updates.found(r.entries.filter((e) => e.hasUpdate).length) });

  const cache = snapshot?.updates;
  const updatable = mods.filter((m) => updateOf(m)?.hasUpdate);
  const problems = mods.filter((m) => m.enabled && COMPAT_NOTE.includes(updateOf(m)?.compatStatus?.toLowerCase() ?? ""));
  const noKeys = mods.filter((m) => !m.isCore && m.updateKeys.length === 0 && !m.manifestError);
  const smapi = cache?.smapi;
  const viaNexus = updatable.filter((m) => nexusOf(m));

  // Premium: hepsi uygulama içinden indirilir; her biri taranıp sırayla onaya gelir.
  const updateAll = async () => {
    setUpdatingAll(true);
    toast(t.discover.updatingAll(viaNexus.length));
    for (const m of viaNexus) await getFromNexus(nexusOf(m)!, { name: m.name, quiet: true });
    setUpdatingAll(false);
  };

  return (
    <Page>
      <PageHeader
        title={t.updates.title}
        subtitle={cache ? t.updates.checkedAgo(ago(cache.checkedAt)) : t.updates.never}
        actions={
          cache && (
            <Button variant="primary" loading={check.isPending} icon={<RefreshCw className="size-4" />} onClick={() => check.mutate(undefined)}>
              {t.updates.check}
            </Button>
          )
        }
      />

      {smapi?.hasUpdate && smapi.latest && (
        <section className="card mb-6 flex items-center gap-4 border-[color-mix(in_oklab,var(--accent)_30%,transparent)] px-5 py-4">
          <div className="accent-soft flex size-11 shrink-0 items-center justify-center rounded-xl">
            <Wrench className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-semibold text-fg">{t.updates.smapiOut(smapi.latest)}</div>
            <div className="text-[12.5px] text-fg-2">{t.updates.smapiOutBody(env?.smapi.version ?? smapi.installed ?? "?")}</div>
          </div>
          <Button variant="subtle" icon={<Wrench className="size-4" />} onClick={installSmapi}>
            {t.updates.smapiUpdate}
          </Button>
        </section>
      )}

      {isLoading ? (
        <Skeleton className="h-64 rounded-[18px]" />
      ) : !cache ? (
        <div className="card">
          <EmptyState
            icon={<ArrowUpCircle className="size-6" />}
            title={t.updates.emptyTitle}
            action={
              <Button variant="primary" loading={check.isPending} icon={<RefreshCw className="size-4" />} onClick={() => check.mutate(undefined)}>
                {t.updates.emptyAction}
              </Button>
            }
          >
            {t.updates.emptyBody}
          </EmptyState>
        </div>
      ) : (
        <div className="space-y-6">
          <section className="card overflow-hidden">
            <header className="flex items-center justify-between gap-4 border-b border-line px-5 py-3.5">
              <h3 className="text-[14px] font-semibold text-fg">
                {t.updates.available} <span className="text-muted">· {updatable.length}</span>
              </h3>
              {updatable.length > 0 && (
                <div className="flex items-center gap-3">
                  <span className="hidden text-[12px] text-muted lg:block">{t.updates.dropHint}</span>
                  {premium && viaNexus.length > 1 && (
                    <Button size="sm" variant="primary" loading={updatingAll} icon={<ArrowUpCircle className="size-3.5" />} onClick={updateAll}>
                      {t.discover.updateAll(viaNexus.length)}
                    </Button>
                  )}
                </div>
              )}
            </header>
            {updatable.length === 0 ? (
              <div className="flex items-center gap-4 px-5 py-7">
                <Filiz size={56} />
                <div>
                  <div className="text-display text-[18px] font-semibold text-fg">{t.updates.allGood}</div>
                  <div className="text-[12.5px] text-fg-2">{t.updates.allGoodBody}</div>
                </div>
              </div>
            ) : (
              updatable.map((m) => {
                const u = updateOf(m)!;
                const compat = u.compatStatus?.toLowerCase();
                return (
                  <div key={m.folder} className="flex items-center gap-4 border-b border-line px-5 py-3 transition-colors last:border-0 hover:bg-surface-2/60">
                    <div className="size-10 shrink-0 overflow-hidden rounded-[10px]">
                      <PixelCover seed={m.uniqueId ?? m.folder} kind={m.kind} className="size-full" />
                    </div>
                    <button className="min-w-0 flex-1 text-left" onClick={() => setOpen(m.folder)}>
                      <div className="truncate text-[13.5px] font-medium text-fg">{m.name}</div>
                      <div className="truncate text-[12px] text-muted">{m.author ?? t.common.unknownAuthor}</div>
                    </button>
                    <div className="flex items-center gap-2 font-mono text-[12.5px]">
                      <span className="text-muted">{m.version}</span>
                      <ArrowRight className="size-3.5 text-muted" />
                      <span className="font-semibold text-accent">{u.latest}</span>
                    </div>
                    {compat && t.compat[compat] && <Badge tone={COMPAT_TONE[compat] ?? "neutral"}>{t.compat[compat]}</Badge>}
                    {nexusOf(m) ? (
                      <Button size="sm" variant="subtle" icon={<ArrowUpCircle className="size-3.5" />} onClick={() => getFromNexus(nexusOf(m)!, { name: m.name })}>
                        {t.updates.update}
                      </Button>
                    ) : (
                      <Button size="sm" variant="subtle" icon={<ExternalLink className="size-3.5" />} disabled={!u.url} onClick={() => u.url && openUrl(u.url)}>
                        {t.updates.download}
                      </Button>
                    )}
                  </div>
                );
              })
            )}
          </section>

          {nexus && nxm && !premium && (!nexus.hasKey || !nxm.registered) && viaNexus.length > 0 && (
            <section className="card flex items-center gap-4 px-5 py-4">
              <KeyRound className="size-5 shrink-0 text-accent" />
              <p className="flex-1 text-[12.5px] text-fg-2">{nexus.hasKey ? t.discover.connectBody : t.discover.noKeyBody}</p>
              {nexus.hasKey ? (
                <Button size="sm" variant="primary" onClick={() => void registerNxm()}>
                  {t.discover.connectAction}
                </Button>
              ) : (
                <Button size="sm" variant="ghost" onClick={() => useUi.getState().go({ kind: "settings" })}>
                  {t.updates.settings}
                </Button>
              )}
            </section>
          )}

          {problems.length > 0 && (
            <section>
              <div className="mb-3 flex items-baseline gap-3">
                <h3 className="text-[11.5px] font-medium uppercase tracking-[0.08em] text-muted">{t.updates.compatTitle}</h3>
                <span className="text-[12px] text-muted">{t.updates.compatHint}</span>
              </div>
              <div className="grid gap-3 lg:grid-cols-2">
                {problems.map((m) => {
                  const u = updateOf(m)!;
                  const compat = u.compatStatus!.toLowerCase();
                  const tone = COMPAT_TONE[compat] ?? "neutral";
                  return (
                    <button key={m.folder} onClick={() => setOpen(m.folder)} className="card flex gap-3 p-4 text-left transition-colors hover:border-line-strong">
                      <ShieldAlert className={clsx("mt-0.5 size-5 shrink-0", tone === "danger" ? "text-danger" : tone === "warn" ? "text-warn" : "text-muted")} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-[13.5px] font-medium text-fg">{m.name}</span>
                          <Badge tone={tone}>{t.compat[compat] ?? u.compatStatus}</Badge>
                        </div>
                        {u.compatSummary && <p className="mt-1 text-[12.5px] text-fg-2">{u.compatSummary}</p>}
                        {u.brokeIn && <p className="mt-1 text-[12px] text-muted">{t.updates.brokeIn(u.brokeIn)}</p>}
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {noKeys.length > 0 && (
            <section className="card px-5 py-4">
              <button className="flex w-full items-center gap-3 text-left" onClick={() => setShowNoKeys(!showNoKeys)}>
                <Sparkles className="size-4 text-muted" />
                <span className="flex-1 text-[13px] text-fg">
                  {t.updates.noKeys(noKeys.length)} <span className="text-muted">· {t.updates.noKeysHint}</span>
                </span>
                <span className="text-[12px] text-accent">{showNoKeys ? t.updates.hide : t.updates.show}</span>
              </button>
              {showNoKeys && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {noKeys.map((m) => (
                    <button key={m.folder} onClick={() => setOpen(m.folder)} className="rounded-lg border border-line bg-surface-2 px-2 py-1 text-[12px] text-fg-2 hover:border-line-strong hover:text-fg">
                      {m.name}
                    </button>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      )}
      <ModDrawer folder={open} onClose={() => setOpen(null)} onOpen={setOpen} />
    </Page>
  );
}
