// Lisanslar ve yetkiler: kariyer yolu şeridi, sınava hazır olanlar (çağrıyla), sıradakiler (şartlarıyla) ve sahip
// olunanlar; altta başarımlar. Hazır olanın sınavı buradan açılır.

import { useState } from "react";
import clsx from "clsx";
import { toast } from "sonner";
import { ArrowRight, Check, ClipboardCheck, Lock } from "lucide-react";
import { useLang } from "@/lib/i18n";
import { notifyError } from "@/shell/actions";
import { Button, Input } from "@/ui";
import { Achievements } from "./Achievements";
import { careerApi } from "./api";
import { className as clsName, hours, money } from "./format";
import { useCareerT } from "./i18n";
import { Bar, INK, LICENSE_ART, PageTitle, Stamp, StatusTag, pickGoal } from "./parts";
import { PathLadder } from "./CareerPaths";
import { hasPath, pathLicenceGoal } from "./paths";
import { invalidateCareer } from "./queries";
import { useCareerUi } from "./store";
import type { CareerView, LicenseView } from "./types";

const PASS: Record<string, number> = { easy: 65, normal: 75, realistic: 85 };

/** Kapak perdesi: iki temada da sabit koyu (görselin üstündeki yazı beyaz kalsın). */
const SCRIM = "linear-gradient(0deg, rgb(7 9 20 / 0.78) 0%, rgb(7 9 20 / 0.2) 45%, transparent 65%)";

export function Licenses({ view }: { view: CareerView }) {
  const t = useCareerT();
  const held = view.licenses.filter((l) => l.held);
  const ready = view.licenses.filter((l) => !l.held && l.ready);
  const next = view.licenses.filter((l) => !l.held && !l.ready);
  return (
    <div className="flex flex-col gap-6">
      <PageTitle
        eyebrow={
          <>
            {t.licenses.count(held.length, view.licenses.length)}
            {ready.length > 0 && <span className="text-accent"> · {t.licenses.readyCount(ready.length)}</span>}
          </>
        }
        title={t.licenses.title}
        subtitle={t.guide.introLicenses}
      />
      <PathLadder view={view} />
      <Path view={view} />

      {ready.length > 0 && (
        <Group title={t.licenses.readyGroup}>
          <div className="grid grid-cols-2 gap-4">
            {ready.map((l) => (
              <LicenseCard key={l.id} l={l} view={view} />
            ))}
          </div>
        </Group>
      )}
      {next.length > 0 && (
        <Group title={t.licenses.nextGroup}>
          <ul className="card divide-y divide-line overflow-hidden">
            {next.map((l) => (
              <NextRow key={l.id} l={l} view={view} />
            ))}
          </ul>
        </Group>
      )}
      {held.length > 0 && (
        <Group title={t.licenses.heldGroup}>
          <div className="grid grid-cols-4 gap-3">
            {held.map((l) => (
              <HeldCard key={l.id} l={l} />
            ))}
          </div>
        </Group>
      )}
      <div className="mt-2">
        <Achievements view={view} />
      </div>
      {/* Seviye değişince (ör. lisans verilince) kutudaki sayı yenilensin. */}
      {import.meta.env.DEV && <DevTools key={view.pilot?.level} view={view} />}
    </div>
  );
}

/** Geliştirici araçları (yalnızca geliştirme sürümü): lisansları tek tıkla ver/al ve seviyeyi elle ayarla.
 *  Arka uç sürüm derlemesinde bu komutları reddeder. */
function DevTools({ view }: { view: CareerView }) {
  const t = useCareerT();
  const lang = useLang((s) => s.lang);
  const p = view.pilot!;
  const [level, setLevel] = useState(String(p.level));
  const [busy, setBusy] = useState(false);
  const held = new Set(view.licenses.filter((l) => l.held).map((l) => l.id));
  const apply = async (ids: Set<string>) => {
    setBusy(true);
    try {
      await careerApi.debugLicenses([...ids]);
      invalidateCareer();
      toast.success(t.licenses.dev.done);
    } catch (e) {
      notifyError(e);
    } finally {
      setBusy(false);
    }
  };
  // Verilirken ön şartlar da eklenir; alınırken bağlı olanları arka uç düşürür.
  const withRequires = (id: string, into: Set<string>) => {
    into.add(id);
    for (const r of view.licenses.find((l) => l.id === id)?.requires ?? []) withRequires(r, into);
    return into;
  };
  const toggle = (id: string) => {
    const next = new Set(held);
    if (held.has(id)) next.delete(id);
    else withRequires(id, next);
    void apply(next);
  };
  const applyLevel = async () => {
    const n = Math.round(Number(level));
    if (!Number.isFinite(n) || n < 1) return;
    setBusy(true);
    try {
      await careerApi.debugLevel(n);
      invalidateCareer();
      toast.success(t.licenses.dev.levelDone(n));
    } catch (e) {
      notifyError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Group title={t.licenses.dev.title}>
      <section className="card flex flex-col gap-4 border-dashed px-6 py-5">
        <p className="text-[12.5px] text-fg-2">{t.licenses.dev.note}</p>
        <div className="flex flex-wrap gap-2">
          {view.licenses.map((l) => (
            <button
              key={l.id}
              type="button"
              disabled={busy || l.id === "spl"}
              onClick={() => toggle(l.id)}
              title={lang === "en" ? l.nameEn : l.nameTr}
              className={clsx(
                "flex h-8 items-center gap-1.5 rounded-full border px-3 font-mono text-[11.5px] font-bold tracking-[0.06em] transition-colors disabled:cursor-default",
                held.has(l.id) ? "border-ok/50 bg-ok/10 text-ok" : "border-line-strong text-muted hover:border-accent hover:text-accent",
                busy && "opacity-60",
              )}
            >
              {held.has(l.id) && <Check className="size-3" strokeWidth={3} />}
              {l.short}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => void apply(new Set(view.licenses.map((l) => l.id)))}>
            {t.licenses.dev.all}
          </Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => void apply(new Set(["spl"]))}>
            {t.licenses.dev.none}
          </Button>
          <span className="flex-1" />
          <span className="text-[12.5px] text-fg-2">{t.licenses.dev.level}</span>
          <Input
            type="number"
            min={1}
            max={60}
            value={level}
            onChange={(e) => setLevel(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void applyLevel()}
            className="w-[92px]"
            inputClassName="tabular"
          />
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => void applyLevel()}>
            {t.licenses.dev.setLevel}
          </Button>
        </div>
      </section>
    </Group>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="eyebrow flex items-center gap-3 text-muted">
        {title}
        <span className="h-px flex-1 bg-line" />
      </h3>
      {children}
    </section>
  );
}

/** Kariyer yolu: her lisans bir durak; sahip olunan dolu, sınava hazır olan vurgu halkası, eksik olan boş. */
function Path({ view }: { view: CareerView }) {
  const lang = useLang((s) => s.lang);
  const list = view.licenses;
  return (
    <section className="card px-6 pb-4 pt-4">
      <PathLine view={view} />
      <ol className="grid" style={{ gridTemplateColumns: `repeat(${list.length}, minmax(0, 1fr))` }}>
        {list.map((l, i) => {
          const state = l.held ? "held" : l.ready ? "ready" : "locked";
          const nextHeld = i < list.length - 1 && list[i + 1].held;
          return (
            <li key={l.id} className="relative flex min-w-0 flex-col items-center text-center">
              {i < list.length - 1 && <span className={clsx("absolute left-1/2 top-[9px] h-[2px] w-full", l.held && nextHeld ? "bg-ok/60" : l.held ? "bg-[linear-gradient(90deg,var(--ok),var(--line-strong))] opacity-70" : "bg-line-strong")} />}
              <span
                className={clsx(
                  "relative z-[1] flex size-5 items-center justify-center rounded-full",
                  state === "held" ? "bg-ok text-[var(--surface)]" : state === "ready" ? "bg-surface ring-2 ring-accent ring-offset-2 ring-offset-[var(--surface)]" : "border-2 border-line-strong bg-surface",
                )}
              >
                {state === "held" && <Check className="size-3" strokeWidth={3} />}
                {state === "ready" && <span className="pulse-dot size-2 rounded-full bg-accent" />}
              </span>
              <span className={clsx("mt-2.5 font-mono text-[12px] font-bold tracking-[0.06em]", state === "locked" ? "text-muted" : state === "ready" ? "text-accent" : "text-fg")}>{l.short}</span>
              <span className="mt-0.5 line-clamp-2 px-1 text-[10.5px] leading-tight text-muted">{lang === "en" ? l.nameEn : l.nameTr}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function LicenseCard({ l, view }: { l: LicenseView; view: CareerView }) {
  const t = useCareerT();
  const lang = useLang((s) => s.lang);
  const [busy, setBusy] = useState(false);
  const setTab = useCareerUi((s) => s.setTab);
  const setPick = useCareerUi((s) => s.setPick);
  const p = view.pilot!;
  const name = (id: string) => view.licenses.find((v) => v.id === id)?.short ?? id;
  const take = async () => {
    setBusy(true);
    try {
      await careerApi.checkride(l.id);
      invalidateCareer();
      toast.success(t.licenses.taken);
      setTab("panel");
      setPick(true);
    } catch (e) {
      notifyError(e);
    } finally {
      setBusy(false);
    }
  };
  const locked = l.missingLicenses.length > 0;
  const art = LICENSE_ART[l.id];
  const h = p.stats.hours / Math.max(0.1, l.hoursNeeded);
  const lv = p.level / Math.max(1, l.levelNeeded);
  return (
    <section className={clsx("card flex min-w-0 flex-col overflow-hidden", l.ready && "border-[color-mix(in_oklab,var(--accent)_45%,var(--line))]")}>
      <div data-theme="dark" data-game="msfs" className={clsx("relative shrink-0 overflow-hidden", l.ready ? "h-[150px]" : "h-[112px]")} style={{ background: INK }}>
        {art && (
          <img
            src={art}
            alt=""
            draggable={false}
            className={clsx("absolute inset-0 size-full object-cover", locked ? "opacity-60 brightness-[0.8] grayscale-[0.9]" : !l.ready && "saturate-[0.7]")}
          />
        )}
        <div className="absolute inset-0" style={{ background: SCRIM }} />
        <div className="absolute left-3.5 top-3.5">
          <Stamp code={l.short} state={l.ready ? "ready" : "held"} onImage size="md" />
        </div>
        <span className="absolute right-3.5 top-3.5">
          {l.ready ? (
            <StatusTag tone="accent" className="!bg-accent !text-accent-ink" icon={<ClipboardCheck className="size-3" />}>
              {t.licenses.ready}
            </StatusTag>
          ) : (
            <StatusTag className="!bg-black/45 !text-white/80" icon={locked ? <Lock className="size-2.5" /> : undefined}>
              {t.licenses.locked}
            </StatusTag>
          )}
        </span>
        <h3 className={clsx("title absolute inset-x-4 bottom-3 truncate leading-tight text-white", l.ready ? "text-[19px]" : "text-[16px]")}>{lang === "en" ? l.nameEn : l.nameTr}</h3>
      </div>
      <div className="flex min-w-0 flex-1 flex-col px-4 pb-4 pt-3">
        <p className="line-clamp-2 text-[12px] leading-relaxed text-fg-2">
          <span className="font-semibold text-fg">{t.guide.unlocks}:</span> {lang === "en" ? l.aboutEn : l.aboutTr}
        </p>
        {l.requires.length > 0 && (
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[11.5px]">
            <span className="text-muted">{t.licenses.requires}</span>
            {l.requires.map((r) => (
              <StatusTag key={r} tone={l.missingLicenses.includes(r) ? "warn" : "ok"} icon={l.missingLicenses.includes(r) ? undefined : <Check className="size-2.5" strokeWidth={3} />}>
                {name(r)}
              </StatusTag>
            ))}
          </div>
        )}
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Req label={t.licenses.hours(hours(p.stats.hours), hours(l.hoursNeeded))} value={h} />
          <Req label={t.licenses.level(p.level, l.levelNeeded)} value={lv} />
        </div>
        <div className="tabular mt-3 flex items-center justify-between gap-2 text-[11.5px]">
          <span className={p.money >= l.fee ? "text-fg-2" : "text-warn"}>{t.licenses.fee(money(l.fee))}</span>
          <span className="truncate text-muted">{t.licenses.exam(clsName(l.examClass, view.classes))}</span>
        </div>
        {l.ready && (
          <div className="mt-4 flex items-center gap-3 border-t border-line pt-4">
            <Button variant="primary" icon={<ClipboardCheck className="size-4" />} loading={busy} disabled={!!view.active} onClick={take}>
              {t.licenses.take}
            </Button>
            <span className="text-[11.5px] leading-snug text-muted">{view.active ? t.panel.busy : t.guide.checkrideHow(PASS[p.difficulty] ?? 75)}</span>
          </div>
        )}
      </div>
    </section>
  );
}

/** Sıradaki lisans: küçük çizim, ad, önkoşullar, saat ve seviye göstergeleri, ücret. */
function NextRow({ l, view }: { l: LicenseView; view: CareerView }) {
  const t = useCareerT();
  const lang = useLang((s) => s.lang);
  const p = view.pilot!;
  const name = (id: string) => view.licenses.find((v) => v.id === id)?.short ?? id;
  const locked = l.missingLicenses.length > 0;
  const art = LICENSE_ART[l.id];
  return (
    <li className="grid grid-cols-[132px_minmax(0,1fr)_150px_150px_150px] items-center gap-6 py-3 pl-3 pr-6">
      <div data-theme="dark" data-game="msfs" className="relative h-[66px] overflow-hidden rounded-xl" style={{ background: INK }}>
        {art && <img src={art} alt="" draggable={false} className={clsx("absolute inset-0 size-full object-cover", locked ? "opacity-60 grayscale-[0.9]" : "saturate-[0.7]")} />}
        <div className="absolute inset-0 bg-[linear-gradient(0deg,rgb(7_9_20/0.6),transparent_70%)]" />
        <span className="absolute bottom-1.5 left-2">
          <Stamp code={l.short} onImage size="sm" state={locked ? "locked" : "held"} />
        </span>
      </div>
      <div className="min-w-0">
        <div className="title flex items-center gap-2 truncate text-[14px] text-fg">
          {locked && <Lock className="size-3.5 shrink-0 text-muted" />}
          <span className="truncate">{lang === "en" ? l.nameEn : l.nameTr}</span>
        </div>
        <div className="mt-0.5 truncate text-[12px] text-fg-2">
          <span className="font-semibold text-fg">{t.guide.unlocks}:</span> {lang === "en" ? l.aboutEn : l.aboutTr}
        </div>
        {l.requires.length > 0 && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            <span className="mr-0.5 text-[11px] text-muted">{t.licenses.requires}</span>
            {l.requires.map((r) => (
              <StatusTag key={r} tone={l.missingLicenses.includes(r) ? "warn" : "ok"} icon={l.missingLicenses.includes(r) ? undefined : <Check className="size-2.5" strokeWidth={3} />}>
                {name(r)}
              </StatusTag>
            ))}
          </div>
        )}
      </div>
      <Req label={t.licenses.hours(hours(p.stats.hours), hours(l.hoursNeeded))} value={p.stats.hours / Math.max(0.1, l.hoursNeeded)} />
      <Req label={t.licenses.level(p.level, l.levelNeeded)} value={p.level / Math.max(1, l.levelNeeded)} />
      <div className="tabular min-w-0 text-right">
        <div className={clsx("text-[12.5px] font-semibold", p.money >= l.fee ? "text-fg" : "text-warn")}>{money(l.fee)}</div>
        <div className="truncate text-[11px] text-muted">{clsName(l.examClass, view.classes)}</div>
      </div>
    </li>
  );
}

/** Sahip olunan lisans: plastik kart gibi küçük, çizim üstünde kısaltma ve ad. */
function HeldCard({ l }: { l: LicenseView }) {
  const t = useCareerT();
  const lang = useLang((s) => s.lang);
  const art = LICENSE_ART[l.id];
  return (
    <div data-theme="dark" data-game="msfs" className="relative h-[118px] overflow-hidden rounded-2xl border border-line" style={{ background: INK }}>
      {art && <img src={art} alt="" draggable={false} className="absolute inset-0 size-full object-cover" />}
      <div className="absolute inset-0" style={{ background: "linear-gradient(90deg, rgb(7 9 20 / 0.82), rgb(7 9 20 / 0.3) 70%), linear-gradient(0deg, rgb(7 9 20 / 0.5), transparent 60%)" }} />
      <div className="relative flex h-full flex-col p-3.5 text-white">
        <div className="flex items-center gap-2">
          <Stamp code={l.short} onImage size="sm" />
          <span className="flex-1" />
          <span className="flex size-5 items-center justify-center rounded-full bg-ok text-[rgb(7_9_20)]" title={t.licenses.held}>
            <Check className="size-3" strokeWidth={3} />
          </span>
        </div>
        <span className="flex-1" />
        <div className="title line-clamp-2 text-[13.5px] leading-tight">{lang === "en" ? l.nameEn : l.nameTr}</div>
      </div>
    </div>
  );
}

function Req({ label, value }: { label: string; value: number }) {
  const v = Math.min(1, value);
  return (
    <div className="min-w-0">
      <div className="tabular mb-1.5 flex items-center justify-between gap-1 text-[11.5px] text-fg-2">
        <span className="truncate">{label}</span>
        {v >= 1 && <Check className="size-3.5 shrink-0 text-ok" strokeWidth={3} />}
      </div>
      <Bar value={v} tone={v >= 1 ? "ok" : "accent"} ticks={10} />
    </div>
  );
}

/** "Şu an: CPL · Ticari pilot lisansı → Sıradaki: IR · sınav uçuşuna hazır" (ya da ne gerektiği). */
function PathLine({ view }: { view: CareerView }) {
  const t = useCareerT();
  const lang = useLang((s) => s.lang);
  const p = view.pilot!;
  const name = (l: LicenseView) => (lang === "en" ? l.nameEn : l.nameTr);
  const top = [...view.licenses].reverse().find((l) => l.held && !["me", "ir", "heli"].includes(l.id)) ?? view.licenses.find((l) => l.held);
  const route = p.pathStatus?.route ?? [];
  const ready = view.licenses.filter((l) => l.ready && !l.held);
  const next = ready.find((l) => route.includes(l.id)) ?? (hasPath(p) ? pathLicenceGoal(view, null) : null) ?? ready[0] ?? pickGoal(view.licenses, p.stats.hours, p.level);
  const needs: string[] = [];
  if (next && !next.ready) {
    const left = Math.max(0, next.hoursNeeded - p.stats.hours);
    if (left > 0) needs.push(t.panel.needHours(hours(left)));
    if (next.levelNeeded > p.level) needs.push(t.panel.needLevel(next.levelNeeded));
    needs.push(t.panel.examFee(money(next.fee)));
  }
  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
      {top && (
        <span className="text-fg-2">
          <span className="text-muted">{t.guide.now}:</span> <span className="font-semibold text-fg">{top.short}</span> · {name(top)}
        </span>
      )}
      {next ? (
        <>
          <ArrowRight className="size-4 text-muted" />
          <span className="text-fg-2">
            <span className="text-muted">{t.guide.next}:</span> <span className={clsx("font-semibold", next.ready ? "text-accent" : "text-fg")}>{next.short}</span> · {name(next)}
            <span className={clsx("ml-1", next.ready ? "font-semibold text-accent" : "text-fg-2")}>({next.ready ? t.guide.nextReady : needs.join(" · ")})</span>
          </span>
        </>
      ) : (
        <span className="text-fg-2">{t.guide.allHeld}</span>
      )}
    </div>
  );
}
