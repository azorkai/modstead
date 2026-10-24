// Nexus mod sayfası çekmecesi: büyük görsel, özet, kurulu/güncelleme durumu, gereksinimler (kurulu mu?),
// ana dosya için tek düğme, tüm dosyalar ve Nexus'un tarama sonucu. Her Stardew sayfasında `Page` açar;
// `openNexusMod(id)` ile her yerden çağrılır.

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, ArrowUpCircle, Check, ChevronRight, Download, ExternalLink, Heart, Link2, PackageCheck, ShieldAlert, ShieldCheck, X } from "lucide-react";
import clsx from "clsx";
import { ago, bytes } from "@/lib/format";
import { errorMessage } from "@/lib/ipc";
import { useNexus } from "@/lib/queries";
import { useUi } from "@/lib/store";
import { openUrl } from "@/shell/actions";
import { Badge, Button, IconButton, Progress, Spinner } from "@/ui";
import { api } from "./api";
import { useS } from "./i18n";
import { SMAPI_NEXUS_ID, categoryLabel, compact, decodeEntities, getFromNexus, modPageKey, useModJob, useNexusSheet } from "./nexus";
import { useEnv, useModIndex } from "./queries";
import { Label } from "./shared";
import type { NexusFile, NexusModPage } from "./types";

const FILE_ORDER = ["MAIN", "UPDATE", "OPTIONAL", "MISCELLANEOUS", "OLD_VERSION"];

export function NexusSheet() {
  const modId = useNexusSheet((s) => s.modId);
  const close = useNexusSheet((s) => s.close);
  useEffect(() => {
    if (modId === null) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [modId, close]);

  return createPortal(
    <AnimatePresence>
      {modId !== null && (
        <div data-game="stardew">
          <motion.div className="fixed inset-0 top-[54px] z-40" style={{ background: "var(--scrim)" }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={close} />
          <motion.aside
            role="dialog"
            className="card-raised fixed bottom-3 right-3 top-[62px] z-40 flex w-[540px] max-w-[94vw] flex-col overflow-hidden"
            style={{ boxShadow: "var(--shadow-lg)" }}
            initial={{ x: 40, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 40, opacity: 0 }}
            transition={{ type: "spring", stiffness: 420, damping: 36 }}
          >
            <SheetBody key={modId} modId={modId} onClose={close} />
          </motion.aside>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

function SheetBody({ modId, onClose }: { modId: number; onClose: () => void }) {
  const t = useS();
  const { data: page, error, isLoading } = useQuery({ queryKey: modPageKey(modId), queryFn: () => api.nexusMod(modId), staleTime: 5 * 60_000 });

  if (isLoading || !page) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
        <IconButton label={t.common.close} onClick={onClose} className="absolute right-3 top-3">
          <X className="size-4" />
        </IconButton>
        {error ? <p className="text-[13px] text-danger">{errorMessage(error)}</p> : <Spinner className="size-6" />}
      </div>
    );
  }
  return <Loaded page={page} onClose={onClose} />;
}

function Loaded({ page, onClose }: { page: NexusModPage; onClose: () => void }) {
  const t = useS();
  const { data: env } = useEnv();
  const { data: nexus } = useNexus();
  const { byNexus, updateOf } = useModIndex();
  const [showOld, setShowOld] = useState(false);
  const job = useModJob(page.modId);
  const canBack = useNexusSheet((x) => x.history.length > 0);
  const isSmapi = page.modId === SMAPI_NEXUS_ID;
  const installed = isSmapi ? null : byNexus.get(page.modId);
  const update = installed ? updateOf(installed) : undefined;
  const hasUpdate = isSmapi ? false : !!update?.hasUpdate;
  const direct = !!nexus?.hasKey && !!nexus.user?.isPremium;
  const main = page.files.find((f) => f.fileId === page.mainFileId) ?? null;

  const reqs = page.requirements.map((r) => {
    const sameGame = r.modId !== null && !r.external;
    const have = r.modId === SMAPI_NEXUS_ID ? !!env?.smapi.installed : sameGame && byNexus.has(r.modId!);
    return { ...r, sameGame, have };
  });
  const missing = reqs.filter((r) => r.sameGame && !r.have);

  const groups = useMemo(() => {
    const g = new Map<string, NexusFile[]>();
    for (const f of page.files) {
      if (f.category === "OLD_VERSION" && !showOld) continue;
      g.set(f.category, [...(g.get(f.category) ?? []), f]);
    }
    return [...g.entries()].sort((a, b) => order(a[0]) - order(b[0]));
  }, [page.files, showOld]);
  const oldCount = page.files.filter((f) => f.category === "OLD_VERSION").length;

  const busy = !!job && !["done", "failed", "cancelled", "review"].includes(job.stage);
  const mainLabel = isSmapi ? (env?.smapi.installed ? t.settings.reinstall : t.mods.installSmapi) : hasUpdate ? t.discover.updateTo(update?.latest ?? page.version) : installed ? t.discover.reinstall : direct ? t.discover.install : t.discover.download;

  return (
    <>
      <div className="relative h-[210px] shrink-0 overflow-hidden bg-surface-2">
        {page.pictureUrl && <img src={page.pictureUrl} alt="" draggable={false} className="absolute inset-0 size-full object-cover" />}
        <div className="absolute inset-0" style={{ background: "linear-gradient(0deg, var(--surface) 2%, transparent 70%)" }} />
        {canBack && (
          <IconButton label={t.discover.back} onClick={() => useNexusSheet.getState().back()} className="glass absolute left-3 top-3">
            <ArrowLeft className="size-4" />
          </IconButton>
        )}
        <IconButton label={t.common.close} onClick={onClose} className="glass absolute right-3 top-3">
          <X className="size-4" />
        </IconButton>
      </div>
      <div className="relative -mt-12 px-5 pb-4">
        <div className="flex flex-wrap items-center gap-1.5">
          {hasUpdate ? (
            <Badge tone="accent" icon={<ArrowUpCircle className="size-3" />}>
              {t.discover.updateBadge}
            </Badge>
          ) : (
            installed && (
              <Badge tone="ok" icon={<Check className="size-3" />}>
                {t.discover.installedAs(installed.version ?? "?")}
              </Badge>
            )
          )}
          <Badge className="font-mono">{page.version}</Badge>
          {page.category && <Badge>{categoryLabel(t, page.category)}</Badge>}
          {page.adult && <Badge tone="warn">{t.discover.adult}</Badge>}
        </div>
        <h2 className="mt-2 text-[21px] font-semibold leading-tight text-fg">{decodeEntities(page.name)}</h2>
        <p className="mt-0.5 text-[12.5px] text-fg-2">{page.author}</p>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-muted">
          <span className="tabular flex items-center gap-1">
            <Download className="size-3.5" />
            {t.discover.downloads(compact(page.downloads))}
          </span>
          <span className="tabular flex items-center gap-1">
            <Heart className="size-3.5" />
            {t.discover.endorsements(compact(page.endorsements))}
          </span>
          <span>{t.discover.updatedAgo(ago(Date.parse(page.updatedAt)))}</span>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 pb-5">
        <p data-selectable className="text-[13px] leading-relaxed text-fg-2">
          {decodeEntities(page.summary)}
        </p>

        <section className="well p-3.5">
          {job && job.stage !== "done" && job.stage !== "failed" && job.stage !== "cancelled" ? (
            <JobState jobId={job.id} stage={job.stage} message={job.message} progress={job.progress} />
          ) : (
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                {isSmapi ? (
                  <div className="text-[12.5px] text-fg-2">{t.discover.smapiNote}</div>
                ) : main ? (
                  <>
                    <div className="truncate text-[13px] font-medium text-fg">{main.name}</div>
                    <div className="mt-0.5 flex items-center gap-2 text-[11.5px] text-muted">
                      <span className="font-mono text-fg-2">{main.version || page.version}</span>
                      <span className="tabular">{bytes(main.size)}</span>
                      <ScanBadge scan={main.scan} />
                    </div>
                  </>
                ) : (
                  <div className="text-[12.5px] text-fg-2">{t.discover.chooseBelow}</div>
                )}
                {job?.stage === "done" && <div className="mt-1 flex items-center gap-1 text-[12px] text-ok"><PackageCheck className="size-3.5" />{t.discover.done}</div>}
                {job?.stage === "failed" && <div className="mt-1 text-[12px] text-danger">{job.error}</div>}
              </div>
              {(isSmapi || main) && (
                <Button
                  variant="primary"
                  size="lg"
                  loading={busy}
                  icon={hasUpdate ? <ArrowUpCircle className="size-4" /> : <Download className="size-4" />}
                  onClick={() => getFromNexus(page.modId, { fileId: main?.fileId ?? null, name: page.name })}
                >
                  {mainLabel}
                </Button>
              )}
            </div>
          )}
          {!isSmapi && main && !job && <p className="mt-2 text-[11.5px] text-muted">{direct ? t.discover.directHint : t.discover.freeHint}</p>}
        </section>

        {reqs.length > 0 && (
          <section>
            <div className="mb-2 flex items-center justify-between">
              <Label className="mb-0">{t.discover.requirements}</Label>
              {missing.length > 1 && direct && (
                <Button size="sm" variant="subtle" icon={<Download className="size-3.5" />} onClick={() => missing.forEach((r) => getFromNexus(r.modId!, { name: r.name }))}>
                  {t.discover.getMissing(missing.length)}
                </Button>
              )}
            </div>
            <div className="space-y-1.5">
              {reqs.map((r) => (
                <div key={`${r.modId}-${r.name}`} className="well flex items-center gap-2.5 px-3 py-2">
                  {r.have ? <Check className="size-4 shrink-0 text-ok" /> : r.sameGame ? <X className="size-4 shrink-0 text-danger" /> : <Link2 className="size-4 shrink-0 text-muted" />}
                  <button
                    className="group/req min-w-0 flex-1 text-left disabled:cursor-default"
                    disabled={!r.sameGame}
                    title={r.sameGame ? t.discover.view : undefined}
                    onClick={() => useNexusSheet.getState().open(r.modId!)}
                  >
                    <div className="flex items-center gap-1 truncate text-[12.5px] font-medium text-fg">
                      <span className="truncate group-enabled/req:group-hover/req:underline">{decodeEntities(r.name)}</span>
                      {r.sameGame && <ChevronRight className="size-3.5 shrink-0 text-muted" />}
                    </div>
                    <div className="text-[11.5px] text-muted">{r.have ? t.discover.reqInstalled : r.sameGame ? t.discover.reqMissing : t.discover.reqExternal}</div>
                  </button>
                  {r.sameGame && !r.have && (
                    <Button size="sm" variant="subtle" icon={<Download className="size-3.5" />} onClick={() => getFromNexus(r.modId!, { name: r.name })}>
                      {t.discover.get}
                    </Button>
                  )}
                  {!r.sameGame && r.url && (
                    <IconButton label={t.discover.openOnNexus} size="sm" onClick={() => openUrl(r.url!)}>
                      <ExternalLink className="size-3.5" />
                    </IconButton>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {groups.map(([cat, files]) => (
          <section key={cat}>
            <Label>{t.discover.fileCategories[cat] ?? cat}</Label>
            <div className="space-y-2">
              {files.map((f) => (
                <div key={f.fileId} className={clsx("rounded-[14px] border p-3", f.fileId === page.mainFileId ? "border-[color-mix(in_oklab,var(--accent)_35%,transparent)] bg-accent/[0.04]" : "border-line bg-surface-2/40")}>
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-[13px] font-medium text-fg">{f.name}</span>
                        {f.primary && <Badge tone="accent">{t.discover.recommended}</Badge>}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-muted">
                        <span className="font-mono text-fg-2">{f.version || "—"}</span>
                        <span className="tabular">{bytes(f.size)}</span>
                        <span>{ago(f.date)}</span>
                        <ScanBadge scan={f.scan} />
                      </div>
                    </div>
                    <Button size="sm" variant={f.category === "MAIN" ? "subtle" : "secondary"} icon={<Download className="size-3.5" />} disabled={busy} onClick={() => getFromNexus(page.modId, { fileId: f.fileId, name: page.name })}>
                      {direct ? t.discover.install : t.discover.get}
                    </Button>
                  </div>
                  {f.description && <p className="mt-2 line-clamp-3 text-[12px] leading-relaxed text-fg-2">{decodeEntities(f.description.replace(/\[\/?[a-z]+[^\]]*\]/gi, " "))}</p>}
                </div>
              ))}
            </div>
          </section>
        ))}
        {oldCount > 0 && !showOld && (
          <Button variant="ghost" size="sm" onClick={() => setShowOld(true)}>
            {t.discover.showOld(oldCount)}
          </Button>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-line bg-surface-2/40 px-5 py-3">
        <span className="text-[11.5px] text-muted">Nexus Mods · #{page.modId}</span>
        <Button size="sm" variant="ghost" icon={<ExternalLink className="size-3.5" />} onClick={() => openUrl(page.url)}>
          {t.discover.openOnNexus}
        </Button>
      </div>
    </>
  );
}

function order(cat: string) {
  const i = FILE_ORDER.indexOf(cat);
  return i === -1 ? FILE_ORDER.length : i;
}

function JobState({ jobId, stage, message, progress }: { jobId: string; stage: string; message: string; progress: number | null }) {
  const t = useS();
  if (stage === "review") {
    return (
      <div className="flex items-center gap-3">
        <ShieldCheck className="size-5 shrink-0 text-accent" />
        <span className="flex-1 text-[13px] text-fg">{t.discover.readyForReview}</span>
        <Button variant="primary" onClick={() => useUi.getState().setReview(jobId)}>
          {t.discover.review}
        </Button>
      </div>
    );
  }
  return (
    <div>
      <div className="mb-2 flex items-center gap-2 text-[12.5px] text-fg-2">
        <Spinner className="size-3.5" />
        {message || t.discover.preparing}
      </div>
      <Progress value={progress} />
    </div>
  );
}

function ScanBadge({ scan }: { scan: string }) {
  const t = useS();
  if (!scan) return null;
  if (scan.toUpperCase() === "VERIFIED")
    return (
      <span className="flex items-center gap-1 text-ok" title={t.discover.scanCleanHint}>
        <ShieldCheck className="size-3.5" />
        {t.discover.scanClean}
      </span>
    );
  return (
    <span className="flex items-center gap-1 text-warn">
      <ShieldAlert className="size-3.5" />
      {scan.toLowerCase()}
    </span>
  );
}

