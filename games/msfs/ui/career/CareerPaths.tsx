// Kariyer yollarının arayüz parçaları: yol kartları (kayıt ve yol değiştirme), başlangıç kartları, kahramandaki yol
// rozeti, Lisanslar'daki rütbe basamakları, Panel'deki yol hedefi, iş satırlarındaki yol etiketi.

import { useMemo, useState } from "react";
import clsx from "clsx";
import { toast } from "sonner";
import { ArrowRight, Check, Flag, Lock, Repeat2 } from "lucide-react";
import { currentLang } from "@/lib/i18n";
import { notifyError } from "@/shell/actions";
import { Button, Dialog, DialogBody, DialogFooter, DialogHeader } from "@/ui";
import { careerApi } from "./api";
import { className as clsName, hours, money, num } from "./format";
import { useCareerT } from "./i18n";
import { Bar, Hint, INK, KindIcon, LICENSE_ART, MoreLink, Stamp } from "./parts";
import { PATH_FOCUS, PATH_ICON, PATH_ORDER, licenceShort, nameOf, nextStep, pathPhoto } from "./paths";
import { usePathT } from "./paths-i18n";
import { invalidateCareer, usePaths } from "./queries";
import { useCareerUi } from "./store";
import type { CareerPath, CareerView, ClassInfo, Job, PathInfo, PathStatus, PilotView, RankStep } from "./types";

/** Görsel üstündeki perde: iki temada da sabit koyu. */
const SCRIM = "linear-gradient(180deg, rgb(7 9 20 / 0.42) 0%, rgb(7 9 20 / 0) 26%, rgb(7 9 20 / 0.5) 50%, rgb(7 9 20 / 0.93) 100%)";

function PathImg({ path, className, dim }: { path: CareerPath; className?: string; dim?: boolean }) {
  const p = pathPhoto(path);
  if (!p.src) return null;
  return (
    <img
      src={p.src}
      alt=""
      title={p.credit}
      draggable={false}
      className={clsx("absolute inset-0 size-full object-cover", dim && "saturate-[0.75]", className)}
      style={{ objectPosition: PATH_FOCUS[path] }}
    />
  );
}

/** Seçim işareti: seçiliyken vurgu dolgulu onay, değilken ince halka. */
function SelectMark({ on, onImage }: { on: boolean; onImage?: boolean }) {
  return (
    <span
      className={clsx(
        "flex size-6 shrink-0 items-center justify-center rounded-full transition-colors",
        on ? "bg-accent text-accent-ink" : onImage ? "border-[1.5px] border-white/45 bg-black/15" : "border-[1.5px] border-line-strong",
      )}
    >
      {on && <Check className="size-3.5" strokeWidth={3} />}
    </span>
  );
}

// ───────────── Yol kartları ─────────────

/** Yol kartı (kayıt ekranı): uçağın fotoğrafı üstünde tipik işler, altta ad, tanıtım, ne uçulduğu ve yolun zirvesi. */
export function PathCard({ info, selected, onSelect, onOpen }: { info: PathInfo; selected: boolean; onSelect: () => void; onOpen?: () => void }) {
  const t = useCareerT();
  const pt = usePathT();
  const copy = pt.path[info.id];
  const top = info.ranks[info.ranks.length - 1];
  return (
    <button
      type="button"
      onClick={onSelect}
      onDoubleClick={onOpen}
      aria-pressed={selected}
      data-theme="dark"
      data-game="msfs"
      className={clsx(
        "group relative flex h-[288px] w-full min-w-0 flex-col overflow-hidden rounded-[18px] text-left outline-none transition-shadow duration-200 focus-visible:ring-2 focus-visible:ring-accent",
        selected ? "shadow-[0_0_0_2px_var(--accent),0_18px_40px_-18px_rgb(0_0_0/0.6)]" : "shadow-[0_0_0_1px_rgb(255_255_255/0.08)] hover:shadow-[0_0_0_1px_rgb(255_255_255/0.22)]",
      )}
      style={{ background: INK }}
    >
      {/* Fotoğraf üstte; alt yarısı mürekkebe karışır, yazı düz zeminde kalır. */}
      <div className="absolute inset-x-0 top-0 h-[178px] overflow-hidden">
        <PathImg path={info.id} className="transition-transform duration-500 ease-out group-hover:scale-[1.035]" />
        <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgb(7 9 20 / 0.35) 0%, rgb(7 9 20 / 0) 30%, rgb(7 9 20 / 0) 55%, rgb(7 9 20) 100%)" }} />
      </div>
      <div className="relative flex items-start gap-2 p-3.5">
        <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
          {info.kinds.slice(0, 2).map((k) => (
            <span key={k} className="msfs-on-image inline-flex h-6 items-center gap-1.5 rounded-full px-2 text-[11px] font-semibold text-white">
              <KindIcon kind={k} className="size-3" />
              {t.kinds[k]}
            </span>
          ))}
          {info.kinds.length > 2 && <span className="msfs-on-image inline-flex h-6 items-center rounded-full px-2 text-[11px] font-semibold text-white/80">+{info.kinds.length - 2}</span>}
        </div>
        <SelectMark on={selected} onImage />
      </div>
      <span className="flex-1" />
      <div className="relative px-4 pb-4">
        <h3 className="title text-[20px] leading-tight text-white">{nameOf(info)}</h3>
        <p className="mt-1 line-clamp-2 min-h-[2.6em] text-[12.5px] leading-[1.3] text-white/70">{copy.tagline}</p>
        <div className="mt-2 truncate font-mono text-[10.5px] tracking-[0.04em] text-white/50">{copy.flies}</div>
        {top && (
          <div className="mt-3 flex items-center gap-1.5 border-t border-white/12 pt-2.5 text-[11.5px] text-white/60">
            <Flag className="size-3 shrink-0" />
            {pt.onboarding.goal}
            <span className="truncate font-semibold text-white/90">{nameOf(top)}</span>
          </div>
        )}
      </div>
    </button>
  );
}

/** Serbest pilot (yol seçmeden): geniş, sakin satır. */
export function GeneralChoice({ info, selected, onSelect, onOpen }: { info: PathInfo; selected: boolean; onSelect: () => void; onOpen?: () => void }) {
  const pt = usePathT();
  return (
    <button
      type="button"
      onClick={onSelect}
      onDoubleClick={onOpen}
      aria-pressed={selected}
      className={clsx(
        "card flex w-full items-center gap-4 py-2.5 pl-2.5 pr-5 text-left transition-[border-color,background-color]",
        selected ? "border-[color-mix(in_oklab,var(--accent)_60%,transparent)] bg-[color-mix(in_oklab,var(--accent)_6%,var(--surface))]" : "hover:bg-surface-2/60",
      )}
    >
      <span data-theme="dark" data-game="msfs" className="relative h-[54px] w-[88px] shrink-0 overflow-hidden rounded-[10px]" style={{ background: INK }}>
        <PathImg path="general" dim={!selected} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="text-[11.5px] font-medium text-muted">{pt.onboarding.general}</span>
          <span className="text-muted">·</span>
          <span className="title text-[15px] text-fg">{nameOf(info)}</span>
        </span>
        <span className="mt-0.5 block truncate text-[12.5px] text-fg-2">{pt.path.general.tagline}</span>
      </span>
      <span className="hidden shrink-0 items-center gap-1.5 min-[1300px]:flex">
        <span className="rounded-full bg-surface-3 px-2.5 py-1 text-[11px] font-semibold text-fg-2">{pt.onboarding.mixed}</span>
        <span className="rounded-full bg-surface-3 px-2.5 py-1 text-[11px] font-semibold text-fg-2">{pt.onboarding.noBonus}</span>
      </span>
      <SelectMark on={selected} />
    </button>
  );
}

// ───────────── Başlangıç kartları ─────────────

/** Uçabildiği sınıflar: yolun uçaklarından en büyük üçü ("Dar gövde jet, Bölgesel jet, Bölgesel turboprop"). */
function topClasses(info: PathInfo, classes: ClassInfo[]): string {
  const own = info.fast.flyable.filter((c) => info.classes.includes(c));
  return (own.length ? own : info.fast.flyable)
    .slice()
    .reverse()
    .slice(0, 3)
    .map((c) => clsName(c, classes))
    .join(", ");
}

/** "Sıfırdan" ya da "Deneyimli başla": görsel, ne verdiği (rütbe, saat, bakiye) ve not. */
export function StartCard({ kind, info, classes, selected, onSelect, onOpen }: { kind: "student" | "fast"; info: PathInfo; classes: ClassInfo[]; selected: boolean; onSelect: () => void; onOpen?: () => void }) {
  const t = useCareerT();
  const pt = usePathT();
  const o = pt.onboarding;
  const fast = kind === "fast";
  const firstRank = info.ranks.find((r) => r.id === info.fast.rankId);
  const stamps = fast ? info.fast.licenses.filter((l) => l !== "spl") : ["spl"];
  return (
    <button
      type="button"
      onClick={onSelect}
      onDoubleClick={onOpen}
      aria-pressed={selected}
      className={clsx(
        "card flex min-w-0 flex-col overflow-hidden text-left outline-none transition-shadow duration-200 focus-visible:ring-2 focus-visible:ring-accent",
        selected ? "shadow-[0_0_0_2px_var(--accent)]" : "hover:shadow-[0_0_0_1px_var(--line-strong)]",
      )}
    >
      <div data-theme="dark" data-game="msfs" className="relative h-[168px] shrink-0 overflow-hidden" style={{ background: INK }}>
        {fast ? (
          <PathImg path={info.id} />
        ) : (
          <img src={LICENSE_ART.spl} alt="" draggable={false} className="absolute inset-0 size-full object-cover" style={{ objectPosition: "70% 70%" }} />
        )}
        <div className="absolute inset-0" style={{ background: SCRIM }} />
        <div className="absolute inset-x-4 top-4 flex items-start gap-2">
          <div className="flex min-w-0 flex-1 flex-wrap gap-1">
            {stamps.map((s) => (
              <Stamp key={s} code={licenceShort(s)} onImage size="sm" />
            ))}
          </div>
          <SelectMark on={selected} onImage />
        </div>
        <div className="absolute inset-x-5 bottom-4">
          <div className="flex items-center gap-2">
            <span className="eyebrow text-white/65">{fast ? o.fast.label : o.scratch.label}</span>
            {!fast && <span className="rounded-full bg-white/15 px-2 text-[10.5px] font-semibold leading-[18px] text-white">{o.scratch.badge}</span>}
          </div>
          <div className="title mt-1 text-[21px] leading-tight text-white">{fast ? o.fast.title : o.scratch.title}</div>
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-4 p-5">
        <p className="text-pretty text-[13px] leading-relaxed text-fg-2">{fast ? pt.path[info.id].fast : o.scratch.body}</p>
        <div className="grid grid-cols-3 divide-x divide-line rounded-[12px] border border-line">
          <MiniFact label={o.rank} value={fast ? nameOf(firstRank) || o.noRank : o.noRank} />
          <MiniFact label={o.hours} value={fast ? hours(info.fast.hours) : "0"} unit={t.units.h} />
          <MiniFact label={o.money} value={money(fast ? info.fast.money : info.scratchMoney)} />
        </div>
        <div className="mt-auto flex flex-col gap-1.5 text-[12px]">
          {fast ? (
            <>
              <div className="flex gap-1.5">
                <span className="shrink-0 text-muted">{o.flyable}:</span>
                <span className="min-w-0 truncate font-medium text-fg">{topClasses(info, classes)}</span>
              </div>
              <div className="text-muted">{o.fast.note}</div>
            </>
          ) : (
            <>
              <div className="font-medium text-fg">{o.scratch.first}</div>
              <RouteLine route={["spl", ...info.route]} held={["spl"]} compact />
            </>
          )}
        </div>
      </div>
    </button>
  );
}

function MiniFact({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="min-w-0 px-3.5 py-2.5">
      <div className="truncate text-[11px] text-muted">{label}</div>
      <div className="mt-0.5 flex min-w-0 items-baseline gap-1">
        <span className="truncate text-[14px] font-semibold text-fg">{value}</span>
        {unit && value !== "—" && <span className="text-[11px] font-semibold text-muted">{unit}</span>}
      </div>
    </div>
  );
}

/** Lisans sırası: SPL → PPL → CPL …; sahip olunanlar dolu, sıradaki kesik çizgili. */
export function RouteLine({ route, held, next, size = "sm", compact }: { route: string[]; held: string[]; next?: string | null; size?: "sm" | "md"; compact?: boolean }) {
  return (
    <span className="flex flex-wrap items-center gap-x-1 gap-y-1.5">
      {route.map((id, i) => (
        <span key={id} className="flex items-center gap-1">
          <Stamp code={licenceShort(id)} size={size} state={held.includes(id) ? "held" : id === next ? "ready" : "locked"} />
          {/* Dar alanda (özet) satır kırılınca sonda çizgi kalmasın diye bağlantı çizgisi yok. */}
          {!compact && i < route.length - 1 && <span className="h-px w-2.5 bg-line-strong" />}
        </span>
      ))}
    </span>
  );
}

// ───────────── Kahraman rozeti ─────────────

/** Pilot şeridindeki yol rozeti: simge + yolun adı (görsel üstünde). */
export function PathChip({ status }: { status: PathStatus }) {
  const I = PATH_ICON[status.path];
  return (
    <span className="msfs-on-image inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[11.5px] font-semibold text-white">
      <I className="size-3.5" />
      {nameOf(status)}
    </span>
  );
}

// ───────────── İş etiketi ─────────────

/** İş satırında yol etiketi: yol dışıysa kesik çizgili soluk etiket, yolundaysa vurgu etiketi. */
export function PathTag({ job, compact }: { job: Job; compact?: boolean }) {
  const pt = usePathT();
  if (job.offPath) {
    return (
      <span title={pt.tags.offPathHint} className="inline-flex h-[18px] shrink-0 items-center rounded-full border border-dashed border-line-strong px-1.5 text-[10.5px] font-semibold leading-none text-muted">
        {pt.tags.offPath}
      </span>
    );
  }
  const xp = job.pathXpBonus ?? 0;
  if (!xp) return null;
  const pay = job.pathPayBonus ?? 0;
  return (
    <span title={pt.tags.onPathHint(pay, xp)} className="accent-soft inline-flex h-[18px] shrink-0 items-center gap-1 rounded-full px-1.5 text-[10.5px] font-semibold leading-none">
      <Flag className="size-2.5" strokeWidth={2.5} />
      {compact ? pt.tags.onPath : `${pt.tags.onPath} · ${pt.tags.bonus(pay, xp)}`}
    </span>
  );
}

// ───────────── Lisanslar: rütbe basamakları ─────────────

/** Kariyer yolu ve rütbe basamakları (Lisanslar sayfasının başı). Serbest pilotta yol seçme çağrısı. */
export function PathLadder({ view }: { view: CareerView }) {
  const t = useCareerT();
  const pt = usePathT();
  const [open, setOpen] = useState(false);
  const p = view.pilot!;
  const s = p.pathStatus;
  if (!s) return null;
  const general = s.path === "general";
  return (
    <section className="card overflow-hidden">
      {general ? (
        <div className="flex items-center gap-5 py-3 pl-3 pr-5">
          <span data-theme="dark" data-game="msfs" className="relative h-[66px] w-[106px] shrink-0 overflow-hidden rounded-[10px]" style={{ background: INK }}>
            <PathImg path="general" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[12px] font-semibold text-muted">{pt.rank.yourPath}</div>
            <div className="title mt-0.5 text-[15px] text-fg">{nameOf(s)}</div>
            <p className="mt-0.5 text-[12.5px] leading-relaxed text-fg-2">{pt.rank.general}</p>
          </div>
          <Button variant="secondary" icon={<Flag className="size-4" />} onClick={() => setOpen(true)}>
            {pt.rank.choose}
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-[264px_minmax(0,1fr)] min-[1400px]:grid-cols-[300px_minmax(0,1fr)]">
          <div data-theme="dark" data-game="msfs" className="relative flex min-h-[248px] flex-col overflow-hidden p-5 text-white" style={{ background: INK }}>
            <PathImg path={s.path} />
            <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgb(7 9 20 / 0.55), rgb(7 9 20 / 0.15) 40%, rgb(7 9 20 / 0.9))" }} />
            <div className="relative">
              <div className="eyebrow text-white/65">{pt.rank.yourPath}</div>
              <h3 className="title mt-1.5 text-[22px] leading-tight text-white">{nameOf(s)}</h3>
            </div>
            <span className="flex-1" />
            <div className="relative flex items-end gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-[11.5px] text-white/65">
                  {pt.rank.pathHours}
                  <Hint text={pt.rank.pathHoursHint} className="text-white/50 hover:text-white" />
                </div>
                <div className="mt-0.5 flex items-baseline gap-1">
                  <span className="num text-[26px] text-white">{hours(s.hours)}</span>
                  <span className="text-[12px] font-semibold text-white/60">{t.units.h}</span>
                </div>
              </div>
              <Button size="sm" variant="secondary" icon={<Repeat2 className="size-3.5" />} onClick={() => setOpen(true)}>
                {pt.rank.change}
              </Button>
            </div>
          </div>
          <div className="flex min-w-0 flex-col gap-5 px-6 pb-5 pt-5">
            <div className="flex items-center gap-2">
              <h3 className="title text-[15px] text-fg">{pt.rank.title}</h3>
              <Hint text={`${pt.rank.bonusHint(s.ladder[Math.max(0, s.rank - 1)]?.payBonus ?? 4, s.xpBonus)} ${pt.rank.sticky}`} />
              <span className="flex-1" />
              {s.payBonus > 0 && <span className="accent-soft rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold">{pt.tags.bonus(s.payBonus, s.xpBonus)}</span>}
            </div>
            <Ladder pilot={p} status={s} view={view} />
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line pt-4">
              <span className="text-[12px] font-medium text-muted">{pt.rank.route}</span>
              <RouteLine route={["spl", ...(s.route ?? [])]} held={p.licenses} next={s.nextLicense} />
            </div>
          </div>
        </div>
      )}
      <PathChangeDialog open={open} onClose={() => setOpen(false)} view={view} />
    </section>
  );
}

/** Üç basamak yan yana: numara, ad, ücret primi, şartlar (lisans, yolda saat, itibar). */
function Ladder({ pilot, status, view }: { pilot: PilotView; status: PathStatus; view: CareerView }) {
  const pt = usePathT();
  const next = nextStep(status.ladder);
  return (
    <ol className="grid grid-cols-3 gap-0">
      {status.ladder.map((step, i) => {
        const state = step.reached ? (i === status.rank - 1 ? "current" : "reached") : step === next ? "next" : "locked";
        return (
          <li key={step.id} className="relative min-w-0 pr-5">
            {i < status.ladder.length - 1 && <span className={clsx("absolute left-6 right-1 top-[11px] h-[2px]", step.reached && status.ladder[i + 1].reached ? "bg-ok/60" : "bg-line-strong")} />}
            <span
              className={clsx(
                "relative z-[1] flex size-6 items-center justify-center rounded-full font-mono text-[11px] font-bold",
                step.reached ? "bg-ok text-[var(--surface)]" : state === "next" ? "bg-surface text-accent ring-2 ring-accent ring-offset-2 ring-offset-[var(--surface)]" : "border-2 border-line-strong bg-surface text-muted",
              )}
            >
              {step.reached ? <Check className="size-3.5" strokeWidth={3} /> : i + 1}
            </span>
            <div className="mt-3 flex items-center gap-1.5">
              <span className={clsx("eyebrow", state === "current" ? "text-ok" : state === "next" ? "text-accent" : "text-muted")}>
                {state === "current" ? pt.rank.current : state === "reached" ? pt.rank.reached : state === "next" ? pt.rank.next : pt.rank.locked}
              </span>
            </div>
            <div className={clsx("title mt-1 truncate text-[15px]", state === "locked" ? "text-fg-2" : "text-fg")} title={nameOf(step)}>
              {nameOf(step)}
            </div>
            <div className="tabular mt-0.5 text-[11.5px] text-muted">{pt.rank.payBonus(step.payBonus)}</div>
            <Requirements step={step} pilot={pilot} status={status} view={view} muted={step.reached} />
          </li>
        );
      })}
    </ol>
  );
}

/** Basamağın şartları: lisans damgaları, yolda saat ve itibar göstergeleri. */
function Requirements({ step, pilot, status, view, muted }: { step: RankStep; pilot: PilotView; status: PathStatus; view: CareerView; muted?: boolean }) {
  const pt = usePathT();
  const short = (id: string) => view.licenses.find((l) => l.id === id)?.short ?? licenceShort(id);
  const hoursOk = status.hours + 1e-6 >= step.hoursNeeded;
  const repOk = pilot.reputation + 1e-6 >= step.reputationNeeded;
  return (
    <div className={clsx("mt-3 flex flex-col gap-2.5", muted && "opacity-70")}>
      <div className="flex flex-wrap items-center gap-1">
        {step.licenses.map((l) => (
          <span key={l} className="inline-flex items-center gap-1">
            <Stamp code={short(l)} size="sm" state={step.missingLicenses.includes(l) ? "locked" : "held"} />
          </span>
        ))}
        {step.missingLicenses.length === 0 && <Check className="size-3.5 text-ok" strokeWidth={3} />}
      </div>
      {step.hoursNeeded > 0 && (
        <div>
          <div className="tabular mb-1 flex items-center justify-between gap-2 text-[11.5px] text-fg-2">
            <span className="truncate">{pt.rank.hoursIn(hours(Math.min(status.hours, step.hoursNeeded)), hours(step.hoursNeeded))}</span>
            {hoursOk && <Check className="size-3 shrink-0 text-ok" strokeWidth={3} />}
          </div>
          <Bar value={status.hours / step.hoursNeeded} tone={hoursOk ? "ok" : "accent"} />
        </div>
      )}
      {step.reputationNeeded > 0 && (
        <div>
          <div className="tabular mb-1 flex items-center justify-between gap-2 text-[11.5px] text-fg-2">
            <span className="truncate">{pt.rank.reputation(Math.round(Math.min(pilot.reputation, step.reputationNeeded)), step.reputationNeeded)}</span>
            {repOk && <Check className="size-3 shrink-0 text-ok" strokeWidth={3} />}
          </div>
          <Bar value={pilot.reputation / step.reputationNeeded} tone={repOk ? "ok" : "accent"} />
        </div>
      )}
      {step.hoursNeeded === 0 && step.reputationNeeded === 0 && step.licenses.length === 0 && <div className="text-[11.5px] text-muted">{pt.rank.noReq}</div>}
    </div>
  );
}

// ───────────── Panel: yolun hedefi ─────────────

/** Panel'de yolun sıradaki basamağı: ne gerektiği (lisans, yolda saat, itibar) ve yapılacaklar tek cümlede. */
export function PathGoals({ view }: { view: CareerView }) {
  const t = useCareerT();
  const pt = usePathT();
  const setTab = useCareerUi((s) => s.setTab);
  const p = view.pilot!;
  const s = p.pathStatus!;
  const next = nextStep(s.ladder);
  const current = s.rank > 0 ? s.ladder[s.rank - 1] : null;
  const short = (id: string) => view.licenses.find((l) => l.id === id)?.short ?? licenceShort(id);
  const todo: string[] = [];
  if (next) {
    if (next.missingLicenses.length) todo.push(pt.goals.getLicence(next.missingLicenses.map(short).join(", ")));
    const left = next.hoursNeeded - s.hours;
    if (left > 0.05) todo.push(pt.goals.flyMore(hours(left), s.kinds.map((k) => t.kinds[k]).join(", ").toLocaleLowerCase(currentLang() === "en" ? "en" : "tr")));
    if (p.reputation + 1e-6 < next.reputationNeeded) todo.push(pt.goals.reputation(next.reputationNeeded));
  }
  return (
    <section className="card @container overflow-hidden">
      <div className="flex items-center gap-4 border-b border-line py-3 pl-3 pr-5">
        <span data-theme="dark" data-game="msfs" className="relative h-[54px] w-[88px] shrink-0 overflow-hidden rounded-[10px]" style={{ background: INK }}>
          <PathImg path={s.path} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12px] text-muted">{pt.goals.eyebrow(nameOf(s), current ? nameOf(current) : p.title)}</div>
          <h3 className="title mt-0.5 truncate text-[15px] text-fg">{next ? pt.goals.nextRank(nameOf(next)) : pt.goals.atTop(nameOf(current))}</h3>
        </div>
        {s.payBonus > 0 || s.xpBonus > 0 ? (
          <span className="accent-soft hidden shrink-0 rounded-full px-2.5 py-1 text-[11.5px] font-semibold @min-[620px]:inline-flex" title={pt.rank.bonusHint(s.payBonus, s.xpBonus)}>
            {pt.tags.bonus(s.payBonus, s.xpBonus)}
          </span>
        ) : null}
        <MoreLink onClick={() => setTab("licenses")}>{pt.goals.seeLadder}</MoreLink>
      </div>
      {next ? (
        <>
          <div className="grid grid-cols-3 divide-x divide-line">
            <GoalCell label={pt.rank.licences} done={next.missingLicenses.length === 0}>
              <span className="flex flex-wrap items-center gap-1">
                {next.licenses.map((l) => (
                  <Stamp key={l} code={short(l)} size="sm" state={next.missingLicenses.includes(l) ? "locked" : "held"} />
                ))}
              </span>
            </GoalCell>
            <GoalCell label={pt.rank.pathHours} done={s.hours + 1e-6 >= next.hoursNeeded} value={next.hoursNeeded > 0 ? s.hours / next.hoursNeeded : 1}>
              <span className="tabular text-[13px] font-semibold text-fg">
                {hours(s.hours)} <span className="font-normal text-muted">/ {hours(next.hoursNeeded)} {t.units.h}</span>
              </span>
            </GoalCell>
            <GoalCell label={t.hero.reputation} done={p.reputation + 1e-6 >= next.reputationNeeded} value={next.reputationNeeded > 0 ? p.reputation / next.reputationNeeded : 1}>
              <span className="tabular text-[13px] font-semibold text-fg">
                {num(p.reputation, 0)} <span className="font-normal text-muted">/ {next.reputationNeeded}</span>
              </span>
            </GoalCell>
          </div>
          {todo.length > 0 && (
            <div className="flex items-start gap-2 border-t border-line px-6 py-3 text-[12.5px] leading-relaxed text-fg-2">
              <ArrowRight className="mt-[3px] size-3.5 shrink-0 text-accent" />
              <span>
                <span className="font-semibold text-fg">{pt.goals.todo}:</span> {todo.join(" · ")}
              </span>
            </div>
          )}
        </>
      ) : (
        <p className="px-6 py-4 text-[12.5px] leading-relaxed text-fg-2">{pt.goals.atTopBody}</p>
      )}
    </section>
  );
}

function GoalCell({ label, done, value, children }: { label: string; done: boolean; value?: number; children: React.ReactNode }) {
  return (
    <div className="min-w-0 px-6 py-3.5">
      <div className="flex items-center justify-between gap-2 text-[11.5px] text-muted">
        <span className="truncate">{label}</span>
        {done ? <Check className="size-3.5 shrink-0 text-ok" strokeWidth={3} /> : value === undefined && <Lock className="size-3 shrink-0" />}
      </div>
      <div className="mt-1.5 flex min-h-[20px] items-center">{children}</div>
      {value !== undefined && <Bar value={value} tone={done ? "ok" : "accent"} className="mt-2" />}
    </div>
  );
}

// ───────────── Yol değiştirme ─────────────

/** Yol değiştirme penceresi: yol kartları (küçük), kalanlar ve değişenler, onay. */
export function PathChangeDialog({ open, onClose, view }: { open: boolean; onClose: () => void; view: CareerView }) {
  const pt = usePathT();
  const p = view.pilot!;
  const current = p.path ?? "general";
  const [pick, setPick] = useState<CareerPath>(current);
  const [busy, setBusy] = useState(false);
  const { data: catalog, isError } = usePaths(null);
  const list = useMemo(() => PATH_ORDER.map((id) => catalog?.find((c) => c.id === id)).filter((x): x is PathInfo => !!x), [catalog]);
  const chosen = list.find((c) => c.id === pick);
  const save = async () => {
    setBusy(true);
    try {
      await careerApi.setPath(pick);
      invalidateCareer();
      toast.success(pt.change.done(nameOf(chosen)));
      onClose();
    } catch (e) {
      notifyError(e);
    } finally {
      setBusy(false);
    }
  };
  const hoursOn = (info: PathInfo) => (info.kinds.length ? info.kinds.reduce((a, k) => a + (p.stats.kindHours?.[k] ?? 0), 0) : p.stats.hours);
  return (
    <Dialog open={open} onClose={onClose} width={880} game="msfs">
      <DialogHeader title={pt.change.title} subtitle={pt.change.subtitle} icon={<Repeat2 className="size-5" />} onClose={onClose} />
      <DialogBody className="flex flex-col gap-4">
        {isError && <p className="text-[12.5px] text-warn">{pt.onboarding.catalogError}</p>}
        <div className="grid grid-cols-3 gap-3">
          {list
            .filter((c) => c.id !== "general")
            .map((c) => (
              <MiniPathCard key={c.id} info={c} selected={pick === c.id} current={current === c.id} hoursOn={hoursOn(c)} onSelect={() => setPick(c.id)} />
            ))}
        </div>
        {list.find((c) => c.id === "general") && <GeneralChoice info={list.find((c) => c.id === "general")!} selected={pick === "general"} onSelect={() => setPick("general")} />}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-[12px] bg-surface-2/60 px-4 py-3">
            <div className="text-[12px] font-semibold text-fg">{pt.change.keeps}</div>
            <p className="mt-0.5 text-[12px] leading-relaxed text-fg-2">{pt.change.keepsBody}</p>
          </div>
          <div className="rounded-[12px] bg-surface-2/60 px-4 py-3">
            <div className="text-[12px] font-semibold text-fg">{pt.change.changes}</div>
            <p className="mt-0.5 text-[12px] leading-relaxed text-fg-2">{pt.change.changesBody}</p>
          </div>
        </div>
      </DialogBody>
      <DialogFooter>
        {view.active && <span className="mr-auto text-[12px] text-warn">{pt.change.busy}</span>}
        <Button variant="ghost" onClick={onClose}>
          {pt.onboarding.back}
        </Button>
        <Button variant="primary" loading={busy} disabled={pick === current || !!view.active || !chosen} onClick={save}>
          {chosen ? pt.change.confirm(nameOf(chosen)) : pt.rank.change}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

/** Pencere içindeki küçük yol kartı: fotoğraf, ad, o yolda uçulan saat; şu anki yol işaretli. */
function MiniPathCard({ info, selected, current, hoursOn, onSelect }: { info: PathInfo; selected: boolean; current: boolean; hoursOn: number; onSelect: () => void }) {
  const pt = usePathT();
  const t = useCareerT();
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      data-theme="dark"
      data-game="msfs"
      className={clsx(
        "relative flex h-[132px] min-w-0 flex-col overflow-hidden rounded-[14px] p-3 text-left outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-accent",
        selected ? "shadow-[0_0_0_2px_var(--accent)]" : "shadow-[0_0_0_1px_rgb(255_255_255/0.08)] hover:shadow-[0_0_0_1px_rgb(255_255_255/0.22)]",
      )}
      style={{ background: INK }}
    >
      <PathImg path={info.id} />
      <div className="absolute inset-0" style={{ background: SCRIM }} />
      <div className="relative flex items-start gap-2">
        {current ? <span className="msfs-on-image rounded-full px-2 py-0.5 text-[10.5px] font-semibold text-white">{pt.change.current}</span> : <span />}
        <span className="flex-1" />
        <SelectMark on={selected} onImage />
      </div>
      <span className="flex-1" />
      <div className="relative">
        <div className="title truncate text-[15px] text-white">{nameOf(info)}</div>
        <div className="tabular mt-0.5 truncate text-[11.5px] text-white/65">
          {pt.rank.pathHours}: {hours(hoursOn)} {t.units.h}
        </div>
      </div>
    </button>
  );
}

