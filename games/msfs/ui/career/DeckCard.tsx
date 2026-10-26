// Uçuş ekranı kartı: canlı harita ve uçuş verileri ikinci ekranda (Modstead penceresi ya da tarayıcı) ya da aynı
// Wi-Fi'deki bir tablette. Kart düzeni simdeki paketlerin kartlarıyla aynıdır (ToolCard). Yerel ağ erişimi isteğe
// bağlıdır ve salt okunurdur; QR'ı sunucu üretir (görsel olarak gösterilir, sayfaya işlenmez) ve ayrı pencerede açılır.
// "Bağlantıyı yenile" anahtarı değiştirir: eski tablet bağlantıları çalışmaz olur.

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AppWindow, Copy, ExternalLink, MonitorSmartphone, QrCode, RefreshCw, ShieldCheck } from "lucide-react";
import { notifyError, openUrl } from "@/shell/actions";
import { Badge, Button, ConfirmDialog, Dialog, DialogBody, DialogHeader, Switch } from "@/ui";
import { careerApi } from "./api";
import { num } from "./format";
import { ToolCard } from "./Hud";
import { useCareerT } from "./i18n";
import { Hint } from "./parts";
import { ck, useDeckInfo } from "./queries";

/** Uçuş ekranını Modstead penceresinde açar (özet satırındaki hızlı eylem de bunu kullanır). */
export function useOpenDeck() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const open = async () => {
    setBusy(true);
    try {
      await careerApi.deckOpen();
      void qc.invalidateQueries({ queryKey: ck.deck });
    } catch (e) {
      notifyError(e);
    } finally {
      setBusy(false);
    }
  };
  return { open, busy };
}

export function DeckCard() {
  const t = useCareerT();
  const d = t.deck;
  const qc = useQueryClient();
  const { data: info } = useDeckInfo();
  const { open, busy: opening } = useOpenDeck();
  const [busy, setBusy] = useState<"lan" | "rotate" | null>(null);
  const [qr, setQr] = useState(false);
  const [confirm, setConfirm] = useState(false);
  if (!info) return null;

  const run = async (what: "lan" | "rotate", f: () => Promise<unknown>, ok?: string) => {
    setBusy(what);
    try {
      const next = await f();
      if (next) qc.setQueryData(ck.deck, next);
      if (ok) toast.success(ok);
    } catch (e) {
      notifyError(e);
    } finally {
      setBusy(null);
    }
  };
  const copy = (url: string) =>
    navigator.clipboard
      .writeText(url)
      .then(() => toast.success(d.copied))
      .catch(notifyError);

  const noServer = info.port === null || !info.localUrl;
  const lan = info.lan;
  return (
    <>
      <ToolCard
        icon={<MonitorSmartphone />}
        title={d.title}
        hint={d.body}
        badge={noServer ? <Badge tone="warn">{t.guide.toolsNoServer}</Badge> : <Badge tone="ok">{info.windowOpen ? d.windowOpen : t.guide.toolsReady}</Badge>}
        preview={<DeckPreview />}
        body={t.guide.deckShort}
        status={
          <label className="flex w-full items-center gap-2.5">
            <Switch checked={lan.enabled} disabled={noServer || busy !== null} label={t.guide.lanShort} onChange={(on) => void run("lan", () => careerApi.deckSetLan(on))} size="sm" />
            <span className="text-[12.5px] text-fg">{t.guide.lanShort}</span>
            <Hint text={`${d.lanBody} ${d.lanFirewall}`} />
          </label>
        }
        notes={lan.error ? <p className="rounded-xl bg-warn/10 px-3 py-2 text-[12px] text-warn">{lan.error}</p> : noServer ? <p className="rounded-xl bg-warn/10 px-3 py-2 text-[12px] text-warn">{d.noServer}</p> : null}
        actions={
          <>
            <Button size="sm" variant="secondary" icon={<AppWindow className="size-3.5" />} loading={opening} disabled={noServer} onClick={() => void open()}>
              {d.open}
            </Button>
            <Button size="sm" variant="ghost" icon={<ExternalLink className="size-3.5" />} disabled={noServer} onClick={() => void openUrl(info.localUrl!)}>
              {d.browser}
            </Button>
            <span className="flex-1" />
            {lan.enabled && lan.url && (
              <Button size="sm" variant="ghost" icon={<QrCode className="size-3.5" />} onClick={() => setQr(true)}>
                {t.guide.qr}
              </Button>
            )}
          </>
        }
      />

      {/* Tablet: QR, adres ve bağlantıyı yenileme */}
      <Dialog open={qr && !!lan.url} onClose={() => setQr(false)} width={480} game="msfs">
        <DialogHeader title={d.lan} subtitle={d.lanOn} icon={<QrCode className="size-5" />} onClose={() => setQr(false)} />
        <DialogBody className="flex flex-col gap-4">
          <div className="flex items-start gap-4">
            {info.qrSvg && (
              // Sunucunun ürettiği SVG yalnızca görsel olarak gösterilir (sayfaya HTML olarak işlenmez).
              <img src={`data:image/svg+xml;utf8,${encodeURIComponent(info.qrSvg)}`} alt="QR" draggable={false} className="size-[148px] shrink-0 rounded-xl border border-line [image-rendering:pixelated]" />
            )}
            <div className="flex min-w-0 flex-1 flex-col gap-2 text-[12.5px] leading-relaxed text-fg-2">
              <p>{d.scan}</p>
              <p className="flex items-start gap-2">
                <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-ok" />
                {d.lanBody}
              </p>
              <p className="text-[11.5px] text-muted">{d.lanFirewall}</p>
            </div>
          </div>
          {lan.url && (
            <div className="flex items-center gap-2 rounded-xl border border-line-strong bg-surface-2 py-1 pl-3 pr-1">
              <span className="min-w-0 flex-1 break-all font-mono text-[11.5px] leading-relaxed text-fg" data-selectable>
                {lan.url}
              </span>
              <Button size="sm" variant="ghost" icon={<Copy className="size-3.5" />} onClick={() => void copy(lan.url!)}>
                {d.copy}
              </Button>
            </div>
          )}
          <div>
            <Button size="sm" variant="ghost" className="text-muted" icon={<RefreshCw className="size-3.5" />} loading={busy === "rotate"} disabled={busy !== null} onClick={() => setConfirm(true)}>
              {d.rotate}
            </Button>
          </div>
        </DialogBody>
      </Dialog>
      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={() => {
          setConfirm(false);
          void run("rotate", careerApi.deckRotate, d.rotated);
        }}
        title={d.rotateConfirm}
        confirmLabel={d.rotate}
        danger
      >
        {d.rotateBody}
      </ConfirmDialog>
    </>
  );
}

/** Uçuş ekranının küçük bir kopyası: harita, rota, uçak ve üç sayı (uçuş ekranı varsayılan olarak koyudur). */
function DeckPreview() {
  const t = useCareerT();
  const p = t.deck.preview;
  return (
    <div className="msfs-sim-panel flex h-full overflow-hidden rounded-xl text-white" aria-hidden>
      <svg viewBox="0 4 220 104" preserveAspectRatio="xMidYMid slice" className="h-full min-w-0 flex-1">
        <path d="M0 70 C30 60 50 76 80 66 S130 40 160 48 S200 30 220 36 V104 H0 Z" fill="currentColor" fillOpacity={0.06} />
        <path d="M0 70 C30 60 50 76 80 66 S130 40 160 48 S200 30 220 36" fill="none" stroke="currentColor" strokeOpacity={0.22} strokeWidth={1} />
        <circle cx={150} cy={58} r={34} fill="none" stroke="currentColor" strokeOpacity={0.18} strokeDasharray="2 3" />
        <path d="M40 80 Q120 30 196 40" fill="none" stroke="var(--accent)" strokeOpacity={0.5} strokeWidth={1.6} strokeDasharray="5 4" />
        <path d="M40 80 Q90 50 150 58" fill="none" stroke="var(--accent)" strokeWidth={2.4} strokeLinecap="round" />
        <circle cx={40} cy={80} r={3.6} fill="none" stroke="var(--accent)" strokeWidth={1.6} />
        <circle cx={196} cy={40} r={3.6} fill="none" stroke="var(--accent)" strokeWidth={1.6} />
        <circle cx={196} cy={40} r={1.5} fill="var(--accent)" />
        <g transform="translate(150 58) rotate(70) scale(0.9)">
          <path d="M0 -9 L2 -2 L9 2 L9 4 L2 2 L1.5 7 L4 9 L4 10.5 L0 9.5 L-4 10.5 L-4 9 L-1.5 7 L-2 2 L-9 4 L-9 2 L-2 -2 Z" fill="var(--accent)" />
        </g>
      </svg>
      <div className="flex w-[96px] shrink-0 flex-col justify-center gap-1.5 border-l border-white/10 px-3 text-[9px] font-semibold uppercase tracking-[0.06em] text-white/55">
        {[
          [p.gs, "111 kt"],
          [p.alt, `${num(4500)} ft`],
          [p.eta, "12:44Z"],
        ].map(([l, v]) => (
          <div key={l}>
            {l}
            <div className="text-[12.5px] font-bold normal-case leading-tight tracking-normal text-white">{v}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
