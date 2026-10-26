// Lisanslar ve yetkiler: her biri saat, seviye, ücret ve önkoşul şartıyla; hazır olanın sınavı buradan açılır.

import { useState } from "react";
import clsx from "clsx";
import { toast } from "sonner";
import { CircleCheck, ClipboardCheck, Lock } from "lucide-react";
import { useLang } from "@/lib/i18n";
import { notifyError } from "@/shell/actions";
import { Badge, Button, Progress } from "@/ui";
import { careerApi } from "./api";
import { className as clsName, hours, money } from "./format";
import { Achievements } from "./Achievements";
import { useCareerT } from "./i18n";
import { invalidateCareer } from "./queries";
import { useCareerUi } from "./store";
import type { CareerView, LicenseView } from "./types";
import artAtpl from "./art/atpl.svg";
import artCpl from "./art/cpl.svg";
import artHeli from "./art/heli.svg";
import artIr from "./art/ir.svg";
import artJet from "./art/jet.svg";
import artMe from "./art/me.svg";
import artNarrow from "./art/narrow.svg";
import artPpl from "./art/ppl.svg";
import artSpl from "./art/spl.svg";
import artWide from "./art/wide.svg";

const PASS: Record<string, number> = { easy: 65, normal: 75, realistic: 85 };

/** Lisans kapak çizimleri (kimlikler `progression.rs` → `LICENSES` ile aynı). Tanınmayan kimlik görselsiz kalır. */
const ART: Record<string, string> = {
  spl: artSpl,
  ppl: artPpl,
  cpl: artCpl,
  me: artMe,
  ir: artIr,
  heli: artHeli,
  jet: artJet,
  atpl: artAtpl,
  narrow: artNarrow,
  wide: artWide,
};

/** Kapak perdesi: iki temada da sabit koyu (görselin üstündeki yazı beyaz kalsın). */
const SCRIM = "linear-gradient(0deg, rgb(8 9 12 / 0.66) 0%, rgb(8 9 12 / 0.14) 36%, transparent 52%)";

export function Licenses({ view }: { view: CareerView }) {
  const t = useCareerT();
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-display text-[22px] font-semibold tracking-tight text-fg">{t.licenses.title}</h2>
        <p className="mt-0.5 text-[12.5px] text-fg-2">{t.licenses.subtitle}</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {view.licenses.map((l) => (
          <LicenseCard key={l.id} l={l} view={view} />
        ))}
      </div>
      <Achievements view={view} />
    </div>
  );
}

function LicenseCard({ l, view }: { l: LicenseView; view: CareerView }) {
  const t = useCareerT();
  const lang = useLang((s) => s.lang);
  const [busy, setBusy] = useState(false);
  const setTab = useCareerUi((s) => s.setTab);
  const setPick = useCareerUi((s) => s.setPick);
  const p = view.pilot!;
  const name = (id: string) => {
    const x = view.licenses.find((v) => v.id === id);
    return x ? x.short : id;
  };
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
  const locked = !l.held && l.missingLicenses.length > 0;
  const art = ART[l.id];
  return (
    <section
      className={clsx(
        "card flex flex-col overflow-hidden",
        l.held && "border-ok/25",
        l.ready && "border-[color-mix(in_oklab,var(--accent)_55%,transparent)] shadow-[0_0_0_3px_color-mix(in_oklab,var(--accent)_10%,transparent)]",
      )}
    >
      {/* Kapak: lisansın çizimi; önkoşulu eksikse gri ve soluk, şartları bekleyende hafif soluk */}
      <div className="relative h-[146px] shrink-0 overflow-hidden bg-[rgb(8_9_12)]">
        {art && (
          <img
            src={art}
            alt=""
            draggable={false}
            className={clsx(
              "absolute inset-0 size-full object-cover",
              locked ? "opacity-70 brightness-[0.8] grayscale-[0.9]" : !l.held && !l.ready && "saturate-[0.65]",
            )}
          />
        )}
        <div className="absolute inset-0" style={{ background: SCRIM }} />
        <span className="msfs-on-image absolute left-3 top-3 inline-flex h-6 items-center rounded-md px-1.5 font-mono text-[11px] font-bold tracking-[0.06em] text-white">
          {l.short}
        </span>
        <span
          className={clsx(
            "absolute right-3 top-3 inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-[11.5px] font-semibold",
            l.ready ? "accent-surface" : "msfs-on-image text-white",
          )}
        >
          {l.held ? <CircleCheck className="size-3.5 text-ok" /> : l.ready ? <ClipboardCheck className="size-3.5" /> : locked ? <Lock className="size-3 text-white/75" /> : null}
          {l.held ? t.licenses.held : l.ready ? t.licenses.ready : t.licenses.locked}
        </span>
        <h3 className="text-display absolute inset-x-4 bottom-3 truncate text-[18px] font-semibold leading-tight tracking-tight text-white [text-shadow:0_1px_10px_rgb(8_9_12/0.55)]">
          {lang === "en" ? l.nameEn : l.nameTr}
        </h3>
      </div>
      <div className="min-w-0 flex-1 px-4 pb-4 pt-3">
        <p className="text-[12px] leading-relaxed text-fg-2">{lang === "en" ? l.aboutEn : l.aboutTr}</p>
        {!l.held && l.id !== "spl" && (
          <div className="mt-3 flex flex-col gap-2">
            {l.requires.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 text-[11.5px] text-fg-2">
                <span className="text-muted">{t.licenses.requires}</span>
                {l.requires.map((r) => (
                  <Badge key={r} tone={l.missingLicenses.includes(r) ? "warn" : "ok"}>
                    {name(r)}
                  </Badge>
                ))}
              </div>
            )}
            <Req label={t.licenses.hours(hours(p.stats.hours), hours(l.hoursNeeded))} value={p.stats.hours / Math.max(0.1, l.hoursNeeded)} />
            <Req label={t.licenses.level(p.level, l.levelNeeded)} value={p.level / Math.max(1, l.levelNeeded)} />
            <div className="flex items-center justify-between gap-2 text-[11.5px]">
              <span className={p.money >= l.fee ? "text-fg-2" : "text-warn"}>{t.licenses.fee(money(l.fee))}</span>
              <span className="truncate text-muted">{t.licenses.exam(clsName(l.examClass, view.classes))}</span>
            </div>
            {l.ready && (
              <div className="mt-1 flex items-center gap-3">
                <Button variant="primary" icon={<ClipboardCheck className="size-4" />} loading={busy} disabled={!!view.active} onClick={take}>
                  {t.licenses.take}
                </Button>
                <span className="text-[11px] leading-snug text-muted">{t.licenses.pass(PASS[p.difficulty] ?? 75)}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function Req({ label, value }: { label: string; value: number }) {
  const v = Math.min(1, value);
  return (
    <div>
      <div className="mb-1 flex justify-between text-[11.5px] text-fg-2">
        <span className="tabular">{label}</span>
        {v >= 1 && <CircleCheck className="size-3.5 text-ok" />}
      </div>
      <Progress value={v} tone={v >= 1 ? "ok" : "accent"} />
    </div>
  );
}
