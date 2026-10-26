// İlk kayıt üç adımda: (1) kariyer yolu — uçak fotoğraflı yol kartları, (2) başlangıç — sıfırdan ya da deneyimli,
// (3) pilot kaydı — ad, ana üs (yolun önerdiği üsler ya da herhangi bir havalimanı), zorluk; yanda seçimin özeti.

import { useMemo, useState } from "react";
import clsx from "clsx";
import { motion } from "motion/react";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Check, Flag, MapPin, X } from "lucide-react";
import { notifyError } from "@/shell/actions";
import { Button, Input, Segmented, Skeleton } from "@/ui";
import { careerApi } from "./api";
import { hours, money } from "./format";
import { useCareerT } from "./i18n";
import { AirportSearch, Hint, INK, LinkPill, Stamp } from "./parts";
import { PATH_FOCUS, PATH_ORDER, licenceShort, nameOf, pathPhoto } from "./paths";
import { usePathT } from "./paths-i18n";
import { GeneralChoice, PathCard, RouteLine, StartCard } from "./CareerPaths";
import { invalidateCareer, usePaths } from "./queries";
import type { AirportHit, CareerPath, CareerView, Difficulty, PathInfo } from "./types";

type StartKind = "student" | "fast";

export function Onboarding({ view }: { view: CareerView }) {
  const t = useCareerT();
  const pt = usePathT();
  const o = pt.onboarding;
  const [step, setStep] = useState(0);
  const [path, setPath] = useState<CareerPath | null>(null);
  const [start, setStart] = useState<StartKind>("student");
  const [name, setName] = useState("");
  const [callsign, setCallsign] = useState("");
  const [birthYear, setBirthYear] = useState("");
  const [home, setHome] = useState<AirportHit | null>(null);
  const [difficulty, setDifficulty] = useState<Difficulty>("normal");
  const [busy, setBusy] = useState(false);
  const { data: catalog, isError } = usePaths(difficulty);
  const list = useMemo(() => PATH_ORDER.map((id) => catalog?.find((c) => c.id === id)).filter((x): x is PathInfo => !!x), [catalog]);
  const info = path ? list.find((c) => c.id === path) : undefined;
  // Eski uygulamada yol kataloğu yoksa yol ve başlangıç adımları atlanır (öğrenci, serbest pilot).
  const noPaths = isError;

  const go = (n: number) => {
    setStep(n);
    window.scrollTo?.({ top: 0 });
    document.querySelector("main")?.scrollTo?.({ top: 0 });
  };
  const choosePath = (p: CareerPath) => {
    setPath(p);
  };
  const create = async () => {
    if (!home) return;
    setBusy(true);
    try {
      const y = Number.parseInt(birthYear, 10);
      await careerApi.create({ name, callsign, home: home.icao, difficulty, start: path ? start : "student", birthYear: Number.isFinite(y) ? y : null, path: path ?? undefined });
      invalidateCareer();
      toast.success(t.title);
    } catch (e) {
      notifyError(e);
    } finally {
      setBusy(false);
    }
  };

  const titles = [o.pathTitle, o.startTitle, o.formTitle];
  const bodies = [o.pathBody, o.startBody, o.formBody];
  const special = list.filter((c) => c.id !== "general");
  const general = list.find((c) => c.id === "general");

  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-6 pb-16">
      <header className="flex flex-wrap items-end gap-x-8 gap-y-4">
        <div className="min-w-0 flex-1 basis-[520px]">
          <div className="eyebrow mb-2 flex items-center gap-2 text-muted">
            <span className="size-1.5 rounded-full bg-accent" />
            {o.eyebrow}
            <span className="text-line-strong">/</span>
            {o.step(step + 1)}
          </div>
          <h1 className="headline text-[34px] text-fg">{titles[step]}</h1>
          <p className="mt-2 max-w-[74ch] text-pretty text-[13.5px] leading-relaxed text-fg-2">{bodies[step]}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-3">
          <LinkPill link={view.link} />
          <Stepper step={step} labels={o.steps} onStep={(n) => n < step && go(n)} />
        </div>
      </header>

      <motion.div key={step} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="flex flex-col gap-5">
        {step === 0 && (
          <>
            {noPaths ? (
              <p className="card px-6 py-5 text-[13px] text-fg-2">{o.catalogError}</p>
            ) : !catalog ? (
              <div className="grid grid-cols-3 gap-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-[276px] rounded-[18px]" />
                ))}
              </div>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-4">
                  {special.map((c) => (
                    <PathCard key={c.id} info={c} selected={path === c.id} onSelect={() => choosePath(c.id)} onOpen={() => {
                        choosePath(c.id);
                        go(1);
                      }} />
                  ))}
                </div>
                {general && <GeneralChoice info={general} selected={path === "general"} onSelect={() => choosePath("general")} onOpen={() => {
                    choosePath("general");
                    go(1);
                  }} />}
              </>
            )}
            <Footer>
              <span className="flex-1" />
              <Button variant="primary" size="lg" trailing={<ArrowRight className="size-4" />} disabled={!noPaths && !path} onClick={() => go(noPaths ? 2 : 1)}>
                {o.continue}
              </Button>
            </Footer>
          </>
        )}

        {step === 1 && info && (
          <>
            <ChosenPath info={info} onChange={() => go(0)} />
            <div className="grid grid-cols-2 gap-5">
              <StartCard kind="student" info={info} classes={view.classes} selected={start === "student"} onSelect={() => setStart("student")} onOpen={() => {
                  setStart("student");
                  go(2);
                }} />
              <StartCard kind="fast" info={info} classes={view.classes} selected={start === "fast"} onSelect={() => setStart("fast")} onOpen={() => {
                  setStart("fast");
                  go(2);
                }} />
            </div>
            <Footer>
              <Button variant="ghost" size="lg" icon={<ArrowLeft className="size-4" />} onClick={() => go(0)}>
                {o.back}
              </Button>
              <span className="flex-1" />
              <Button variant="primary" size="lg" trailing={<ArrowRight className="size-4" />} onClick={() => go(2)}>
                {o.continue}
              </Button>
            </Footer>
          </>
        )}

        {step === 2 && (
          <div className="grid grid-cols-[minmax(0,1fr)_372px] items-start gap-6">
            <section className="card-raised flex flex-col gap-4 p-6" style={{ boxShadow: "var(--shadow-lg)" }}>
              <Field label={t.onboarding.name}>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t.onboarding.namePh} maxLength={40} autoFocus />
              </Field>
              <div className="grid grid-cols-[1fr_120px] gap-3">
                <Field label={t.onboarding.callsign} hint={t.guide.callsignHint}>
                  <Input value={callsign} onChange={(e) => setCallsign(e.target.value.toUpperCase())} placeholder={t.onboarding.callsignPh} maxLength={12} inputClassName="font-mono" />
                </Field>
                <Field label={t.onboarding.birthYear} hint={<Hint text={t.onboarding.birthYearHint} />}>
                  <Input value={birthYear} onChange={(e) => setBirthYear(e.target.value.replace(/[^0-9]/g, "").slice(0, 4))} placeholder="1995" inputMode="numeric" inputClassName="tabular" title={t.onboarding.birthYearHint} />
                </Field>
              </div>
              <Field label={t.onboarding.home} hint={home ? t.guide.homeHint : undefined}>
                {home ? (
                  <div className="flex h-9 items-center gap-2 rounded-full border border-line-strong bg-surface-2/70 pl-3.5 pr-2">
                    <MapPin className="size-4 text-accent" />
                    <span className="font-mono text-[13px] font-semibold text-fg">{home.icao}</span>
                    <span className="min-w-0 flex-1 truncate text-[12.5px] text-fg-2">{home.name}</span>
                    <button type="button" onClick={() => setHome(null)} className="flex size-6 items-center justify-center rounded-full text-muted hover:bg-surface-3 hover:text-fg" aria-label="×">
                      <X className="size-4" />
                    </button>
                  </div>
                ) : (
                  <>
                    <AirportSearch onPick={setHome} placeholder={t.onboarding.homePh} />
                    {info && info.homes.length > 0 && (
                      <div className="mt-1.5">
                        <div className="mb-1.5 text-[11.5px] text-muted">{o.homeSuggested}</div>
                        <div className="flex flex-wrap gap-1.5">
                          {info.homes.map((a) => (
                            <button
                              key={a.icao}
                              type="button"
                              onClick={() => setHome({ ...a, distanceNm: null, ticket: null })}
                              title={a.name}
                              className="inline-flex h-7 max-w-[220px] items-center gap-1.5 rounded-full border border-line bg-surface-2/60 px-2.5 text-[12px] transition-colors hover:border-[color-mix(in_oklab,var(--accent)_45%,var(--line))] hover:bg-surface-2"
                            >
                              <span className="font-mono font-semibold text-accent">{a.icao}</span>
                              <span className="truncate text-fg-2">{cityOf(a.city, a.name)}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </Field>
              <Field label={t.onboarding.difficulty}>
                <Segmented<Difficulty>
                  id="career-difficulty"
                  value={difficulty}
                  onChange={setDifficulty}
                  options={(["easy", "normal", "realistic"] as const).map((d) => ({ value: d, label: t.difficulty[d].label }))}
                />
                <p className="mt-1.5 text-[11.5px] text-muted">{t.difficulty[difficulty].body}</p>
              </Field>
              <div className="mt-1 flex items-center gap-3 border-t border-line pt-4">
                <Button variant="ghost" size="lg" icon={<ArrowLeft className="size-4" />} onClick={() => go(noPaths ? 0 : 1)}>
                  {o.back}
                </Button>
                <span className="flex-1" />
                <Button variant="primary" size="lg" disabled={!name.trim() || !home} loading={busy} onClick={create}>
                  {busy ? t.onboarding.creating : o.create}
                </Button>
              </div>
            </section>
            {info && <Summary info={info} start={start} onPath={() => go(0)} onStart={() => go(1)} />}
          </div>
        )}
      </motion.div>
    </div>
  );
}

/** Şehir adının kısası: "Paris (Roissy-en-France, …)" → "Paris". */
function cityOf(city: string, name: string): string {
  const c = (city || name).split(/[(,/]/)[0].trim();
  return c || name;
}

function Footer({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center gap-3 pt-1">{children}</div>;
}

/** Adım göstergesi: numaralı haplar; geçilen adımlara dönülebilir. */
function Stepper({ step, labels, onStep }: { step: number; labels: string[]; onStep: (n: number) => void }) {
  return (
    <ol className="flex items-center gap-1 rounded-full border border-line bg-surface p-1 shadow-[var(--highlight)]">
      {labels.map((l, i) => {
        const done = i < step;
        const on = i === step;
        return (
          <li key={l}>
            <button
              type="button"
              disabled={!done && !on}
              onClick={() => done && onStep(i)}
              aria-current={on ? "step" : undefined}
              className={clsx(
                "flex h-8 items-center gap-2 rounded-full pl-1.5 pr-3.5 text-[12.5px] font-semibold transition-colors disabled:opacity-100",
                on ? "cursor-default bg-fg text-bg" : done ? "text-fg-2 hover:bg-surface-2 hover:text-fg" : "text-muted",
              )}
            >
              <span
                className={clsx(
                  "flex size-5 items-center justify-center rounded-full font-mono text-[10.5px] font-bold",
                  on ? "bg-bg/15 text-bg" : done ? "bg-ok/15 text-ok" : "bg-surface-3 text-muted",
                )}
              >
                {done ? <Check className="size-3" strokeWidth={3} /> : i + 1}
              </span>
              {l}
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/** Seçilen yol (2. adımın başı): küçük fotoğraf, ad, tanıtım, "Değiştir". */
function ChosenPath({ info, onChange }: { info: PathInfo; onChange: () => void }) {
  const pt = usePathT();
  const photo = pathPhoto(info.id);
  return (
    <div className="card flex items-center gap-4 py-2.5 pl-2.5 pr-5">
      <span data-theme="dark" data-game="msfs" className="relative h-[54px] w-[88px] shrink-0 overflow-hidden rounded-[10px]" style={{ background: INK }}>
        {photo.src && <img src={photo.src} alt="" title={photo.credit} draggable={false} className="absolute inset-0 size-full object-cover" style={{ objectPosition: PATH_FOCUS[info.id] }} />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[11.5px] font-medium text-muted">{pt.onboarding.steps[0]}</div>
        <div className="title truncate text-[15px] text-fg">{nameOf(info)}</div>
        <div className="truncate text-[12.5px] text-fg-2">{pt.path[info.id].tagline}</div>
      </div>
      <Button variant="secondary" size="sm" onClick={onChange}>
        {pt.onboarding.change}
      </Button>
    </div>
  );
}

/** 3. adımın yanı: seçimin özeti (yol, başlangıç, başlarken ne var, hedef). */
function Summary({ info, start, onPath, onStart }: { info: PathInfo; start: StartKind; onPath: () => void; onStart: () => void }) {
  const t = useCareerT();
  const pt = usePathT();
  const o = pt.onboarding;
  const fast = start === "fast";
  const photo = pathPhoto(info.id);
  const firstRank = info.ranks.find((r) => r.id === info.fast.rankId);
  const top = info.ranks[info.ranks.length - 1];
  const licences = fast ? info.fast.licenses.filter((l) => l !== "spl") : ["spl"];
  return (
    <aside className="card sticky top-4 flex flex-col overflow-hidden">
      <div data-theme="dark" data-game="msfs" className="relative h-[128px] overflow-hidden" style={{ background: INK }}>
        {photo.src && <img src={photo.src} alt="" title={photo.credit} draggable={false} className="absolute inset-0 size-full object-cover" style={{ objectPosition: PATH_FOCUS[info.id] }} />}
        <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgb(7 9 20 / 0.1), rgb(7 9 20 / 0.85))" }} />
        <div className="absolute inset-x-5 bottom-3.5">
          <div className="eyebrow text-white/65">{o.summary}</div>
          <div className="title mt-1 truncate text-[19px] text-white">{nameOf(info)}</div>
        </div>
      </div>
      <dl className="flex flex-col divide-y divide-line text-[12.5px]">
        <Row label={o.steps[0]} value={nameOf(info)} action={o.change} onAction={onPath} />
        <Row label={o.steps[1]} value={fast ? o.fast.label : o.scratch.label} action={o.change} onAction={onStart} />
        <div className="flex flex-col gap-2.5 px-5 py-3.5">
          <dt className="text-muted">{o.youGet}</dt>
          <dd className="flex flex-wrap gap-1">
            {licences.map((l) => (
              <Stamp key={l} code={licenceShort(l)} size="sm" />
            ))}
          </dd>
          <dd className="grid grid-cols-3 gap-2">
            <SumFact label={o.rank} value={fast ? nameOf(firstRank) || o.noRank : o.noRank} />
            <SumFact label={o.hours} value={`${hours(fast ? info.fast.hours : 0)} ${t.units.h}`} />
            <SumFact label={o.money} value={money(fast ? info.fast.money : info.scratchMoney)} />
          </dd>
        </div>
        {info.route.length > 0 && (
          <div className="flex flex-col gap-2 px-5 py-3.5">
            <dt className="text-muted">{o.route}</dt>
            <dd>
              <RouteLine route={["spl", ...info.route]} held={fast ? info.fast.licenses : ["spl"]} compact />
            </dd>
          </div>
        )}
        {top && (
          <div className="flex items-center gap-2 px-5 py-3.5">
            <Flag className="size-3.5 text-accent" />
            <dt className="text-muted">{o.goal}</dt>
            <dd className="ml-auto truncate font-semibold text-fg">{nameOf(top)}</dd>
          </div>
        )}
      </dl>
    </aside>
  );
}

function Row({ label, value, action, onAction }: { label: string; value: string; action: string; onAction: () => void }) {
  return (
    <div className="flex items-center gap-3 px-5 py-3">
      <dt className="w-[76px] shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 flex-1 truncate font-semibold text-fg">{value}</dd>
      <button type="button" onClick={onAction} className="shrink-0 text-[12px] font-semibold text-accent hover:underline">
        {action}
      </button>
    </div>
  );
}

function SumFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-[10px] bg-surface-2/70 px-2.5 py-2">
      <div className="truncate text-[10.5px] text-muted">{label}</div>
      <div className="mt-0.5 truncate text-[12.5px] font-semibold text-fg" title={value}>
        {value}
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="flex items-center gap-1.5">
        <span className="eyebrow text-muted">{label}</span>
        {hint && typeof hint !== "string" && hint}
      </span>
      {children}
      {typeof hint === "string" && <span className="text-[11.5px] text-muted">{hint}</span>}
    </div>
  );
}
