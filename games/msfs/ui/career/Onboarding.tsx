// İlk kayıt: kariyerin ne olduğunu üç adımda anlatan vitrin + pilot kayıt formu.

import { useState } from "react";
import clsx from "clsx";
import { motion } from "motion/react";
import { toast } from "sonner";
import { Check, MapPin, X } from "lucide-react";
import { useArt } from "@/lib/art";
import { notifyError } from "@/shell/actions";
import { Button, Input, Segmented } from "@/ui";
import { MsfsArt } from "../Art";
import { careerApi } from "./api";
import { useCareerT } from "./i18n";
import { AirportSearch, LinkPill } from "./parts";
import { invalidateCareer } from "./queries";
import type { AirportHit, CareerView, CreateRequest, Difficulty } from "./types";

type Start = CreateRequest["start"];

export function Onboarding({ view }: { view: CareerView }) {
  const t = useCareerT();
  const art = useArt("msfs", "hero");
  const [name, setName] = useState("");
  const [callsign, setCallsign] = useState("");
  const [home, setHome] = useState<AirportHit | null>(null);
  const [difficulty, setDifficulty] = useState<Difficulty>("normal");
  const [start, setStart] = useState<Start>("student");
  const [busy, setBusy] = useState(false);

  const create = async () => {
    if (!home) return;
    setBusy(true);
    try {
      await careerApi.create({ name, callsign, home: home.icao, difficulty, start });
      invalidateCareer();
      toast.success(t.title);
    } catch (e) {
      notifyError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-[1180px] pb-16">
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className={clsx("relative overflow-hidden rounded-3xl border border-line", !art && "hero-surface")}
      >
        {art ? (
          <img src={art} alt="" draggable={false} className="absolute inset-0 size-full object-cover" style={{ objectPosition: "70% 40%" }} />
        ) : (
          <MsfsArt className="pointer-events-none absolute -right-6 bottom-0 h-full w-[60%] text-accent opacity-90" />
        )}
        {art && <div className="absolute inset-0" style={{ background: "linear-gradient(90deg, rgb(8 9 12 / 0.93) 0%, rgb(8 9 12 / 0.75) 48%, rgb(8 9 12 / 0.35) 100%)" }} />}
        <div className="relative grid grid-cols-[1fr_440px] gap-10 px-9 py-9">
          <div className={clsx("flex min-w-0 flex-col", art ? "text-white" : "text-fg")}>
            <div className="flex items-center gap-3">
              <span className={clsx("text-[11px] font-semibold uppercase tracking-[0.12em]", art ? "text-white/60" : "text-muted")}>{t.onboarding.eyebrow}</span>
              <LinkPill link={view.link} onImage={!!art} />
            </div>
            <h1 className="text-display mt-3 text-[40px] font-semibold leading-[1.02] tracking-tight">{t.onboarding.title}</h1>
            <p className={clsx("mt-3 max-w-[520px] text-[14px] leading-relaxed", art ? "text-white/78" : "text-fg-2")}>{t.onboarding.body}</p>
            <ol className="mt-8 flex flex-col gap-3">
              {t.onboarding.steps.map((s, i) => (
                <li key={s.title} className={clsx("flex max-w-[520px] gap-3.5 rounded-2xl px-4 py-3.5", art ? "msfs-on-image" : "card")}>
                  <span className="accent-surface flex size-7 shrink-0 items-center justify-center rounded-full text-[13px] font-bold text-accent-ink">{i + 1}</span>
                  <span className="min-w-0">
                    <span className="block text-[13.5px] font-semibold">{s.title}</span>
                    <span className={clsx("mt-0.5 block text-[12.5px] leading-relaxed", art ? "text-white/70" : "text-fg-2")}>{s.body}</span>
                  </span>
                </li>
              ))}
            </ol>
            <p className={clsx("mt-auto pt-6 text-[11.5px]", art ? "text-white/50" : "text-muted")}>{t.link.about}</p>
          </div>

          <div className="card-raised flex flex-col gap-4 p-5" style={{ boxShadow: "var(--shadow-lg)" }}>
            <h2 className="text-display text-[18px] font-semibold text-fg">{t.onboarding.form}</h2>
            <Field label={t.onboarding.name}>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t.onboarding.namePh} maxLength={40} autoFocus />
            </Field>
            <Field label={t.onboarding.callsign}>
              <Input value={callsign} onChange={(e) => setCallsign(e.target.value.toUpperCase())} placeholder={t.onboarding.callsignPh} maxLength={12} inputClassName="font-mono" />
            </Field>
            <Field label={t.onboarding.home}>
              {home ? (
                <div className="flex h-9 items-center gap-2 rounded-[10px] border border-line-strong bg-surface-2/70 px-3">
                  <MapPin className="size-4 text-accent" />
                  <span className="font-mono text-[13px] font-semibold text-fg">{home.icao}</span>
                  <span className="min-w-0 flex-1 truncate text-[12.5px] text-fg-2">{home.name}</span>
                  <button type="button" onClick={() => setHome(null)} className="text-muted hover:text-fg" aria-label="×">
                    <X className="size-4" />
                  </button>
                </div>
              ) : (
                <AirportSearch onPick={setHome} placeholder={t.onboarding.homePh} />
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
            <Field label={t.onboarding.start}>
              <div className="flex flex-col gap-2">
                {(["student", "commercial", "airline"] as const).map((s) => {
                  const on = start === s;
                  const info = t.starts[s];
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setStart(s)}
                      className={clsx(
                        "flex items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors",
                        on ? "border-[color-mix(in_oklab,var(--accent)_55%,transparent)] bg-[color-mix(in_oklab,var(--accent)_8%,transparent)]" : "border-line hover:bg-surface-2",
                      )}
                    >
                      <span className={clsx("mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border", on ? "border-accent bg-accent text-accent-ink" : "border-line-strong")}>
                        {on && <Check className="size-3" strokeWidth={3} />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2 text-[13px] font-semibold text-fg">
                          {info.label}
                          {"badge" in info && <span className="accent-soft rounded-md px-1.5 text-[10.5px] font-semibold leading-[18px]">{info.badge}</span>}
                        </span>
                        <span className="mt-0.5 block text-[12px] leading-relaxed text-fg-2">{info.body}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </Field>
            <Button variant="primary" size="lg" className="mt-1 w-full" disabled={!name.trim() || !home} loading={busy} onClick={create}>
              {busy ? t.onboarding.creating : t.onboarding.create}
            </Button>
          </div>
        </div>
      </motion.section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11.5px] font-semibold uppercase tracking-[0.06em] text-muted">{label}</span>
      {children}
    </div>
  );
}
