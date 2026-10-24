// Paradox Mods mod sayfası çekmecesi: ekran görüntüleri, yazar ve sürüm, oyun sürümüyle uyumluluk,
// gerekenler (kurulu mu?), açıklama, sürüm notları ve bağlantılar. Abonelik Paradox Mods sayfasında
// yapılır (oyun hesapla eşitleyip kendisi indirir); kuruluysa önbellekteki klasörü açılabilir.

import { Fragment, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, ArrowUpCircle, Check, ChevronRight, Copy, ExternalLink, FolderOpen, Link2, PackageCheck, TriangleAlert, Users, X } from "lucide-react";
import clsx from "clsx";
import { toast } from "sonner";
import { ago, bytes, locale } from "@/lib/format";
import { errorMessage } from "@/lib/ipc";
import { notifyError, openUrl } from "@/shell/actions";
import { Badge, Button, IconButton, Spinner } from "@/ui";
import { api } from "./api";
import { useS } from "./i18n";
import { compact } from "./nexus";
import { inline, parseMarkdown, usePdxSheet, type MdBlock } from "./paradox";
import { GAME, modCompat, pendingUpdate, tagLabel, useEnv, useModIndex } from "./queries";
import { CompatBadge, Label, Rating } from "./shared";
import type { PdxModDetail } from "./types";

export function PdxSheet() {
  const modId = usePdxSheet((s) => s.modId);
  const close = usePdxSheet((s) => s.close);
  useEffect(() => {
    if (modId === null) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [modId, close]);

  return createPortal(
    <AnimatePresence>
      {modId !== null && (
        <div data-game={GAME}>
          <motion.div className="fixed inset-0 top-[54px] z-40" style={{ background: "var(--scrim)" }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={close} />
          <motion.aside
            role="dialog"
            className="card-raised fixed bottom-3 right-3 top-[62px] z-40 flex w-[560px] max-w-[94vw] flex-col overflow-hidden"
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

function SheetBody({ modId, onClose }: { modId: string; onClose: () => void }) {
  const t = useS();
  const { data, error, isLoading } = useQuery({ queryKey: [GAME, "pdx-mod", modId], queryFn: () => api.pdxMod(modId), staleTime: 5 * 60_000 });
  if (isLoading || !data) {
    return (
      <div className="relative flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
        <IconButton label={t.common.close} onClick={onClose} className="absolute right-3 top-3">
          <X className="size-4" />
        </IconButton>
        {error ? <p className="text-[13px] text-danger">{errorMessage(error)}</p> : <Spinner className="size-6" />}
      </div>
    );
  }
  return <Loaded mod={data} onClose={onClose} />;
}

function Loaded({ mod: m, onClose }: { mod: PdxModDetail; onClose: () => void }) {
  const t = useS();
  const { data: env } = useEnv();
  const { byPdx } = useModIndex();
  const history = usePdxSheet((s) => s.history);
  const back = usePdxSheet((s) => s.back);
  const open = usePdxSheet((s) => s.open);
  const images = m.screenshots.length ? m.screenshots : m.thumbnail ? [{ image: m.thumbnail, thumbnail: m.thumbnail }] : [];
  const [shot, setShot] = useState(0);
  const [allNotes, setAllNotes] = useState(false);
  const installed = byPdx.get(m.modId);
  const pending = installed ? pendingUpdate({ ...installed, meta: m }) : null;
  const state = modCompat({ tags: m.tags, requiredVersion: m.requiredVersion }, env?.version);
  const blocks = parseMarkdown(m.description);
  const signedOut = env?.account.loggedIn === false;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(m.url);
      toast.success(t.common.linkCopied);
    } catch (e) {
      notifyError(e);
    }
  };

  return (
    <>
      <div className="relative shrink-0 bg-[#0b0d12]">
        <div className="relative aspect-[16/8] overflow-hidden">
          {images[shot] ? <img src={images[shot].image} alt="" draggable={false} className="size-full object-cover" /> : <div className="hero-surface size-full" />}
          <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/5 to-black/30" />
        </div>
        <div className="absolute inset-x-3 top-3 flex items-center justify-between">
          {history.length > 0 ? (
            <button onClick={back} className="flex h-8 items-center gap-1 rounded-lg border border-white/15 bg-black/55 px-2.5 text-[12px] text-white backdrop-blur-md hover:bg-black/70">
              <ArrowLeft className="size-3.5" />
              {t.common.back}
            </button>
          ) : (
            <span />
          )}
          <button onClick={onClose} aria-label={t.common.close} className="grid size-8 place-items-center rounded-lg border border-white/15 bg-black/55 text-white backdrop-blur-md hover:bg-black/70">
            <X className="size-4" />
          </button>
        </div>
        <div className="absolute inset-x-5 bottom-3">
          <div className="flex flex-wrap gap-1">
            {m.tags.slice(0, 4).map((tag) => (
              <span key={tag} className="inline-flex h-5 items-center rounded-md border border-white/15 bg-black/55 px-1.5 text-[11px] font-medium text-white backdrop-blur-md">
                {tagLabel(tag)}
              </span>
            ))}
          </div>
          <h2 className="text-display mt-1.5 text-[24px] font-semibold leading-tight text-white [text-shadow:0_1px_3px_rgb(0_0_0/0.6)]">{m.name}</h2>
          <div className="mt-0.5 text-[12.5px] text-white/75">
            {t.sheet.by(m.author)}
            {m.userVersion && <span className="font-mono"> · {m.userVersion}</span>}
          </div>
        </div>
      </div>
      {images.length > 1 && (
        <div className="flex shrink-0 gap-1.5 overflow-x-auto border-b border-line bg-surface-2/40 px-3 py-2 [scrollbar-width:thin]">
          {images.map((img, i) => (
            <button key={img.thumbnail} onClick={() => setShot(i)} className={clsx("h-12 w-20 shrink-0 overflow-hidden rounded-md border-2 transition-colors", i === shot ? "border-accent" : "border-transparent opacity-70 hover:opacity-100")}>
              <img src={img.thumbnail} alt="" loading="lazy" draggable={false} className="size-full object-cover" />
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-5 pb-6 pt-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" icon={<ExternalLink className="size-4" />} onClick={() => openUrl(m.url)}>
            {t.sheet.openOnParadox}
          </Button>
          <Button variant="subtle" icon={<Copy className="size-3.5" />} onClick={copy}>
            {t.common.copyLink}
          </Button>
          {installed && (
            <Button variant="ghost" icon={<FolderOpen className="size-3.5" />} onClick={() => api.openPath("pdx", installed.folder).catch(notifyError)}>
              {t.sheet.openFolder}
            </Button>
          )}
        </div>

        {installed ? (
          <div className="mt-3 flex items-start gap-2 rounded-[12px] border border-line bg-surface-2/60 px-3.5 py-2.5 text-[12.5px]">
            {pending ? <ArrowUpCircle className="mt-0.5 size-4 shrink-0 text-accent" /> : <PackageCheck className="mt-0.5 size-4 shrink-0 text-ok" />}
            <div className="text-fg-2">
              <span className="font-medium text-fg">{t.sheet.installedAs(installed.version ?? "?")}</span>
              {pending && <div className="text-muted">{t.sheet.updatePending(pending)}</div>}
            </div>
          </div>
        ) : (
          <div className={clsx("mt-3 flex items-start gap-2 rounded-[12px] border px-3.5 py-2.5 text-[12.5px]", signedOut ? "border-warn/30 bg-warn/5" : "border-line bg-surface-2/60")}>
            {signedOut ? <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warn" /> : <Link2 className="mt-0.5 size-4 shrink-0 text-accent" />}
            <div className="text-fg-2">
              {t.sheet.subscribeHint}
              {signedOut && <div className="mt-0.5 text-warn">{t.discover.howSignedOut}</div>}
            </div>
          </div>
        )}

        <div className="mt-4 grid grid-cols-4 gap-2">
          <Fact label={t.sheet.subscribers} value={<span className="inline-flex items-center gap-1"><Users className="size-3.5 text-muted" />{compact(m.subscriptions)}</span>} />
          <Fact label={t.sheet.rating} value={m.rating !== null && m.ratingsTotal > 0 ? <Rating value={m.rating} total={m.ratingsTotal} /> : "—"} />
          <Fact label={t.sheet.size} value={m.size ? bytes(m.size) : "—"} />
          <Fact label={t.sheet.updated} value={m.updated ? ago(Date.parse(m.updated)) : "—"} />
        </div>

        {m.requiredVersion && (
          <div className="mt-3 flex items-center gap-2 text-[12.5px] text-fg-2">
            <span className="text-muted">{t.sheet.gameVersion}:</span>
            <span className="font-mono text-[12px]">{m.requiredVersion}</span>
            {env?.version && <span className="text-muted">· {t.sheet.yourGame(env.version)}</span>}
            <CompatBadge state={state} showOk />
          </div>
        )}

        <section className="mt-5">
          <Label>{t.sheet.requirements}</Label>
          {m.requirements.length === 0 ? (
            <p className="text-[12.5px] text-muted">{t.sheet.noRequirements}</p>
          ) : (
            <div className="overflow-hidden rounded-[12px] border border-line">
              {m.requirements.map((r) => {
                const have = byPdx.has(r.modId);
                return (
                  <button key={r.modId} onClick={() => open(r.modId)} className="flex w-full items-center gap-3 border-b border-line px-3.5 py-2.5 text-left last:border-b-0 hover:bg-surface-2">
                    {have ? <Check className="size-4 shrink-0 text-ok" /> : <TriangleAlert className="size-4 shrink-0 text-warn" />}
                    <span className="min-w-0 flex-1 truncate text-[13px] text-fg">{r.name || `#${r.modId}`}</span>
                    <Badge tone={have ? "ok" : "warn"}>{have ? t.sheet.reqInstalled : t.sheet.reqMissing}</Badge>
                    <ChevronRight className="size-4 text-muted" />
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {blocks.length > 0 && (
          <section className="mt-5">
            <Label>{t.sheet.description}</Label>
            <Markdown blocks={blocks} />
          </section>
        )}

        {m.changelog.length > 0 && (
          <section className="mt-5">
            <Label>{t.sheet.changelog}</Label>
            <div className="flex flex-col gap-3">
              {(allNotes ? m.changelog : m.changelog.slice(0, 3)).map((c) => (
                <div key={`${c.version}-${c.released}`} className="rounded-[12px] border border-line bg-surface-2/40 px-3.5 py-2.5">
                  <div className="flex items-center gap-2 text-[12px]">
                    <span className="font-mono font-medium text-fg">{c.version || "—"}</span>
                    <span className="text-muted">{c.released ? new Date(c.released.replace(" ", "T") + "Z").toLocaleDateString(locale(), { day: "numeric", month: "short", year: "numeric" }) : ""}</span>
                  </div>
                  <div className="mt-1">
                    <Markdown blocks={parseMarkdown(c.details)} compact />
                  </div>
                </div>
              ))}
              {m.changelog.length > 3 && !allNotes && (
                <button className="self-start text-[12px] text-accent hover:underline" onClick={() => setAllNotes(true)}>
                  {t.common.showMore}
                </button>
              )}
            </div>
          </section>
        )}

        {m.links.length > 0 && (
          <section className="mt-5">
            <Label>{t.sheet.links}</Label>
            <div className="flex flex-wrap gap-2">
              {m.links.map((l) => (
                <Button key={l.url} size="sm" variant="subtle" icon={<ExternalLink className="size-3.5" />} onClick={() => openUrl(l.url)} title={l.url}>
                  {t.sheet.linkKinds[l.kind] ?? hostOf(l.url)}
                </Button>
              ))}
            </div>
          </section>
        )}
      </div>
    </>
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-[12px] border border-line bg-surface-2/40 px-3 py-2">
      <div className="text-[11px] text-muted">{label}</div>
      <div className="tabular mt-0.5 truncate text-[13px] font-medium text-fg">{value}</div>
    </div>
  );
}

/** Paradox açıklamasının hafif çizimi: başlık, paragraf, madde; bağlantılar tıklanınca izinli adresler açılır. */
function Markdown({ blocks, compact }: { blocks: MdBlock[]; compact?: boolean }) {
  return (
    <div className={clsx("flex flex-col text-fg-2", compact ? "gap-1 text-[12px]" : "gap-2 text-[13px] leading-relaxed")} data-selectable>
      {blocks.map((b, i) =>
        b.kind === "h" ? (
          <h5 key={i} className={clsx("font-semibold text-fg", compact ? "text-[12px]" : "mt-1 text-[13.5px]")}>
            <Inline text={b.text} />
          </h5>
        ) : b.kind === "li" ? (
          <div key={i} className="flex gap-2">
            <span className="mt-[0.6em] size-1 shrink-0 rounded-full bg-muted" />
            <span>
              <Inline text={b.text} />
            </span>
          </div>
        ) : (
          <p key={i}>
            <Inline text={b.text} />
          </p>
        ),
      )}
    </div>
  );
}

function Inline({ text }: { text: string }) {
  return (
    <>
      {inline(text).map((sp, i) =>
        sp.href ? (
          <button key={i} className="text-accent hover:underline" onClick={() => openUrl(sp.href!)} title={sp.href}>
            {sp.text}
          </button>
        ) : sp.bold ? (
          <strong key={i} className="font-semibold text-fg">
            {sp.text}
          </strong>
        ) : (
          <Fragment key={i}>{sp.text}</Fragment>
        ),
      )}
    </>
  );
}
