// Modstead'in kendi güncellemesi. Arka uç (src-tauri/src/updater.rs) arka planda denetler, indirir ve imzayı
// doğrular; burada yalnızca gösterilir ve kurulum kullanıcı "Yeniden başlat"a basınca istenir. Parçalar:
// olay akışı ve bildirim (`useUpdateFeed`, AppShell'de bir kez), üst çubuktaki gösterge (`UpdateButton`) ve
// penceresi (`UpdateDialog`), Ayarlar → Güncellemeler (`UpdateSection`). Bir oyun meşgulken (ör. MSFS açık ya da
// kariyer uçuşu izleniyor) arka uç kurulumu reddeder; arayüz nedenini önceden gösterir.

import { useEffect } from "react";
import { create } from "zustand";
import { toast } from "sonner";
import clsx from "clsx";
import { CircleArrowUp, ExternalLink, History, Loader2, RefreshCw, ShieldCheck, TriangleAlert } from "lucide-react";
import { t as dict, useT } from "@/lib/i18n";
import { EVENTS, errorMessage, invoke, listen } from "@/lib/ipc";
import { fetchUpdate, keys, queryClient, updateSettings, useSettings, useUpdate } from "@/lib/queries";
import { ago, locale, percent } from "@/lib/format";
import type { AppInfo, UpdateStatus } from "@/lib/types";
import { gameModule } from "@/games/registry";
import { Badge, Button, Dialog, DialogBody, DialogFooter, DialogHeader, Progress, Row, Section, Switch } from "@/ui";
import { notifyError } from "./actions";

const useUpdateUi = create<{ open: boolean; setOpen: (open: boolean) => void }>((set) => ({ open: false, setOpen: (open) => set({ open }) }));

/** Kurulumu ne bekletiyor? Bekleten bir şey yoksa `null`. */
function busyText(s: UpdateStatus | undefined): string | null {
  const b = s?.busy;
  if (!b) return null;
  const d = dict();
  if (b.games.length) {
    const info = queryClient.getQueryData<AppInfo>(keys.appInfo);
    return d.update.busyGames(b.games.map((id) => gameModule(id)?.name ?? info?.games.find((g) => g.id === id)?.name ?? id));
  }
  return b.jobs > 0 ? d.update.busyJobs(b.jobs) : null;
}

function day(sec: number): string {
  return new Date(sec * 1000).toLocaleDateString(locale(), { day: "numeric", month: "short", year: "numeric" });
}

function openUrl(url: string) {
  invoke("open_url", { url }).catch(notifyError);
}

/** Kurulumu ister. Başarıda Modstead kapanır, kurucu çalışır ve uygulamayı yeniden açar. */
export async function installUpdate() {
  try {
    await invoke("update_install");
  } catch (e) {
    toast.warning(dict().update.notNow, { description: errorMessage(e) });
    void queryClient.invalidateQueries({ queryKey: keys.update });
  }
}

async function checkNow() {
  try {
    const s = await invoke<UpdateStatus>("update_check");
    queryClient.setQueryData<UpdateStatus>(keys.update, (prev) => ({ ...s, busy: prev?.busy ?? null }));
  } catch (e) {
    notifyError(e);
  }
}

/** Bu oturumda bildirimi gösterilen sürüm: her sürüm bir kez; görmezden gelinirse sonraki açılışta yeniden. */
let offered: string | null = null;

function offer(s: UpdateStatus) {
  if (s.phase !== "ready" || !s.available || offered === s.available.version) return;
  offered = s.available.version;
  const d = dict();
  const blocked = busyText(s);
  toast(d.update.ready, {
    id: "modstead-update",
    description: blocked ?? d.update.readyToast(s.available.version),
    duration: 15_000,
    action: blocked || !s.canInstall ? undefined : { label: d.update.restart, onClick: () => void installUpdate() },
  });
}

const refresh = () => queryClient.fetchQuery({ queryKey: keys.update, queryFn: fetchUpdate, staleTime: 0 });

/** Güncelleme olaylarını önbelleğe işler; güncelleme hazır olunca bir kez bildirir. AppShell'de bir kez çağrılır. */
export function useUpdateFeed() {
  useEffect(() => {
    let alive = true;
    const off = listen<UpdateStatus>(EVENTS.update, (s) => {
      queryClient.setQueryData<UpdateStatus>(keys.update, (prev) => ({ ...s, busy: prev?.busy ?? null }));
      // Hazır olunca neyin beklettiğini de sor (olaylar bunu taşımaz).
      if (s.phase === "ready") refresh().then((full) => alive && offer(full), () => {});
    });
    // Arayüz açılmadan (ya da ilk kurulum ekranındayken) hazır olduysa.
    refresh().then((s) => alive && offer(s), () => {});
    return () => {
      alive = false;
      off();
    };
  }, []);
}

/** Üst çubuktaki kalıcı gösterge: yalnızca güncelleme hazırken (ya da kurulurken) görünür. `overlay`: üst çubuk
 *  vitrin görselinin üstünde (yanındaki arama kutusu gibi buzlu etiket). */
export function UpdateButton({ overlay }: { overlay?: boolean }) {
  const t = useT();
  const { data: s } = useUpdate();
  const setOpen = useUpdateUi((x) => x.setOpen);
  if (!s?.available || (s.phase !== "ready" && s.phase !== "installing")) return null;
  const installing = s.phase === "installing";
  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      title={t.update.readyTitle(s.available.version)}
      className={clsx(
        "flex h-9 shrink-0 items-center gap-2 rounded-full border pl-2.5 pr-3.5 text-[12.5px] font-semibold transition-colors",
        overlay
          ? "on-image border-white/15 hover:bg-[rgb(7_9_20/0.66)]"
          : "accent-soft border-[color-mix(in_oklab,var(--accent)_26%,transparent)] hover:bg-[color-mix(in_oklab,var(--accent)_20%,transparent)]",
      )}
    >
      {installing ? <Loader2 className="size-[15px] animate-spin" /> : <CircleArrowUp className="size-[15px]" />}
      {installing ? t.update.installing : t.update.ready}
    </button>
  );
}

/** Güncellemenin ayrıntısı ve "Yeniden başlat". Göstergeden ve Ayarlar'dan açılır. */
export function UpdateDialog() {
  const t = useT();
  const open = useUpdateUi((x) => x.open);
  const setOpen = useUpdateUi((x) => x.setOpen);
  const { data: s } = useUpdate();
  const close = () => setOpen(false);
  const a = s?.available;
  const blocked = busyText(s);
  return (
    <Dialog open={open && !!a} onClose={close} width={540}>
      {s && a && (
        <>
          <DialogHeader
            icon={<CircleArrowUp className="size-5" />}
            title={t.update.readyTitle(a.version)}
            subtitle={[t.update.running(s.current), a.date ? t.update.published(day(a.date)) : null].filter(Boolean).join(" · ")}
            onClose={close}
          />
          <DialogBody className="flex flex-col gap-4">
            <div>
              <Badge tone="ok" icon={<ShieldCheck className="size-3" />}>
                {t.update.signed}
              </Badge>
            </div>
            {a.notes && (
              <div data-selectable className="well max-h-[200px] overflow-y-auto whitespace-pre-line px-4 py-3 text-[12.5px] leading-relaxed text-fg-2">
                {a.notes}
              </div>
            )}
            <p className="text-[13px] leading-relaxed text-fg-2">{t.update.restartHint}</p>
            {blocked && (
              <div className="flex items-start gap-2.5 rounded-xl border border-warn/25 bg-warn/10 px-3.5 py-3 text-[12.5px] leading-relaxed text-fg">
                <TriangleAlert className="mt-px size-4 shrink-0 text-warn" />
                {blocked}
              </div>
            )}
            {!s.canInstall && <p className="text-[12.5px] text-muted">{t.update.devBuild}</p>}
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" className="mr-auto" icon={<ExternalLink className="size-4" />} onClick={() => openUrl(a.url)}>
              {t.update.notes}
            </Button>
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={close}>
                {t.update.later}
              </Button>
              <Button variant="primary" loading={s.phase === "installing"} disabled={!!blocked || !s.canInstall} onClick={() => void installUpdate()}>
                {t.update.restart}
              </Button>
            </div>
          </DialogFooter>
        </>
      )}
    </Dialog>
  );
}

/** Ayarlar → Güncellemeler: sürüm, son denetim, "Şimdi denetle", sürüm notları ve otomatik denetim. */
export function UpdateSection() {
  const t = useT();
  const { data: s } = useUpdate();
  const { data: settings } = useSettings();
  const setOpen = useUpdateUi((x) => x.setOpen);
  if (!s || !settings) return null;
  const a = s.available;
  const working = s.phase === "checking" || s.phase === "downloading";
  const ready = s.phase === "ready" || s.phase === "installing";
  const badge =
    ready && a ? (
      <Badge tone="accent" dot>
        {t.update.readyBadge(a.version)}
      </Badge>
    ) : s.phase === "downloading" && a ? (
      <Badge tone="info">{t.update.downloading(a.version)}</Badge>
    ) : s.phase === "checking" ? (
      <Badge>{t.update.checking}</Badge>
    ) : s.phase === "error" ? (
      <Badge tone="warn">{t.update.failed}</Badge>
    ) : s.checkedAt ? (
      <Badge tone="ok" dot>
        {t.update.upToDate}
      </Badge>
    ) : null;
  const description =
    s.phase === "downloading" ? (
      <span className="mt-1.5 flex items-center gap-3">
        <Progress value={s.progress} className="max-w-[280px]" />
        <span className="tabular text-[12px] text-muted">{percent(s.progress)}</span>
      </span>
    ) : (
      <span className="flex flex-col gap-0.5">
        <span>{s.checkedAt ? t.update.lastCheck(ago(s.checkedAt)) : t.update.neverChecked}</span>
        {s.phase === "error" && s.error && <span className="break-words text-warn">{s.error}</span>}
        {!s.canInstall && <span className="text-muted">{t.update.devBuild}</span>}
      </span>
    );
  return (
    <Section title={t.update.title}>
      <Row
        icon={<CircleArrowUp className="size-4" />}
        title={
          <span className="flex items-center gap-2">
            <span lang="en">Modstead {s.current}</span>
            {badge}
          </span>
        }
        description={description}
      >
        <div className="flex shrink-0 items-center gap-1.5">
          <Button variant="ghost" icon={<ExternalLink className="size-4" />} onClick={() => openUrl(ready && a ? a.url : s.currentUrl)}>
            {t.update.notes}
          </Button>
          {ready ? (
            <Button variant="primary" icon={<CircleArrowUp className="size-4" />} loading={s.phase === "installing"} onClick={() => setOpen(true)}>
              {t.update.restart}
            </Button>
          ) : (
            <Button variant="secondary" icon={<RefreshCw className={clsx("size-4", working && "animate-spin")} />} disabled={working} onClick={() => void checkNow()}>
              {t.update.checkNow}
            </Button>
          )}
        </div>
      </Row>
      <Row icon={<History className="size-4" />} title={t.update.auto} description={t.update.autoHint}>
        <Switch checked={settings.autoUpdate} onChange={(autoUpdate) => void updateSettings({ autoUpdate }).catch(notifyError)} label={t.update.auto} />
      </Row>
    </Section>
  );
}
