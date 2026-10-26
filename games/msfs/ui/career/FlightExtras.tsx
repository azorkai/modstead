// Uçuş ayrıntısının gerçekçilik bölümleri: yaklaşma kapısı, teker koyma noktası ve rüzgâr, prosedürler, XP bonusları,
// yolcu konforu ve yük hasarı, görev hedefleri, gece/aletli süre; kesintiye itiraz.

import { useState } from "react";
import clsx from "clsx";
import { CircleCheck, CircleX, CloudFog, Gavel, Moon, PlaneLanding, Sparkles, Target } from "lucide-react";
import { toast } from "sonner";
import { notifyError } from "@/shell/actions";
import { Badge, Button } from "@/ui";
import { careerApi } from "./api";
import { duration, num } from "./format";
import { useCareerT } from "./i18n";
import { invalidateCareer } from "./queries";
import { useRealT } from "./real-i18n";
import type { LogEntry } from "./types";

function Box({ title, icon, children, aside }: { title: string; icon: React.ReactNode; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="min-w-0 overflow-hidden rounded-[14px] border border-line">
      <div className="flex items-center gap-2 border-b border-line bg-surface-2/40 px-3.5 py-2">
        <span className="flex shrink-0 text-accent [&_svg]:size-3.5">{icon}</span>
        <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-fg-2">{title}</span>
        {aside}
      </div>
      <div className="px-3.5 py-3">{children}</div>
    </div>
  );
}

function Kv({ k, v, tone }: { k: string; v: React.ReactNode; tone?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 py-[2px] text-[12px]">
      <span className="text-fg-2">{k}</span>
      <span className={clsx("tabular text-right", tone ?? "text-fg")}>{v}</span>
    </div>
  );
}

/** Gerçekçilik bölümleri. `part`: "landing" yalnızca yaklaşma ve teker koyma, "score" prosedürler, XP ekleri ve
 *  diğerleri (uçuş ayrıntısında hikâye sırasına göre ayrı yerlerde gösterilir); "all" hepsi yan yana. */
export function FlightExtras({ e, part = "all" }: { e: LogEntry; part?: "all" | "landing" | "score" }) {
  const r = useRealT();
  const t = useCareerT();
  const s = e.summary;
  const l = e.landing;
  const a = s.approach;
  const procs = s.procedures ?? [];
  const bonuses = s.bonuses ?? [];
  const fix = l?.runway ?? null;
  const hasTimes = (s.nightS ?? 0) > 0 || (s.imcS ?? 0) > 0;

  const approach = (
    <Box
      title={r.flight.approach}
      icon={<PlaneLanding className="size-4 text-accent" />}
      aside={a?.evaluated ? <Badge tone={a.stable ? "ok" : "warn"}>{a.stable ? r.flight.stable : r.flight.unstable}</Badge> : <Badge>{r.flight.notEvaluated}</Badge>}
    >
      {a?.evaluated && (
        <>
          <div className="mb-1 text-[11.5px] text-muted">{r.flight.gate(a.gateFt)}</div>
          <Kv k="V/S" v={`${num(a.vsFpm)} fpm`} tone={a.vsFpm < -1000 ? "text-warn" : undefined} />
          <Kv k="IAS" v={`${num(a.iasKt)} kt`} />
          {a.reasons.length > 0 && (
            <ul className="mt-1.5 flex flex-col gap-0.5">
              {a.reasons.map((x) => (
                <li key={x} className="flex items-center gap-1.5 text-[11.5px] text-warn">
                  <CircleX className="size-3.5" />
                  {r.flight.reasons[x] ?? x}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {l && (
        <div className="mt-2 border-t border-line pt-2">
          <div className="mb-1 text-[11.5px] font-semibold text-fg">{r.flight.touchdown}</div>
          {fix ? (
            <>
              <Kv k={r.flight.runway(fix.runway)} v={fix.distanceM >= 0 ? r.flight.fromThreshold(fix.distanceM) : r.flight.beforeThreshold(fix.distanceM)} tone={fix.distanceM > fix.tdzM + 150 || fix.distanceM < 0 ? "text-warn" : "text-ok"} />
              <div className="text-right text-[10.5px] text-muted">{r.flight.tdz(fix.tdzM)}</div>
              <Kv k="" v={r.flight.centerline(fix.centerlineM)} tone={Math.abs(fix.centerlineM) > fix.widthM / 2 - 4 ? "text-warn" : undefined} />
            </>
          ) : null}
          {(l.windKt ?? 0) > 0 && <Kv k={r.flight.wind} v={`${r.flight.crosswind(l.crosswindKt ?? 0)} · ${r.flight.headwind(l.headwindKt ?? 0)}`} />}
          <div className="mt-1 flex flex-wrap gap-1">
            {l.night && <Badge icon={<Moon className="size-3" />}>{r.flight.night}</Badge>}
            {l.imc && (
              <Badge tone="info" icon={<CloudFog className="size-3" />}>
                {r.flight.imc}
              </Badge>
            )}
            {l.overweight && <Badge tone="danger">{r.flight.overweight}</Badge>}
          </div>
        </div>
      )}
    </Box>
  );

  const procBox = (
    <Box title={r.flight.procedures} icon={<CircleCheck className="size-4 text-accent" />}>
      {procs.length === 0 ? (
        <p className="text-[11.5px] text-muted">{r.flight.proceduresHint}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {procs.map((p) => (
            <li key={p.code} className="flex items-center gap-1.5 text-[12px]">
              {p.ok ? <CircleCheck className="size-3.5 shrink-0 text-ok" /> : <CircleX className="size-3.5 shrink-0 text-muted" />}
              <span className={p.ok ? "text-fg" : "text-muted"}>{r.flight.proc[p.code] ?? p.code}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-2.5 border-t border-line pt-2">
        <div className="mb-1 flex items-center gap-1.5 text-[11.5px] font-semibold text-fg">
          <Sparkles className="size-3.5 text-accent" />
          {r.flight.bonuses}
          <span className="flex-1" />
          <span className="tabular text-accent">+{s.bonusPct ?? 0}%</span>
        </div>
        {bonuses.map(([code, v]) => (
          <Kv key={code} k={r.flight.bonus[code] ?? code} v={`+${v}%`} tone="text-accent" />
        ))}
      </div>
    </Box>
  );

  const others: React.ReactNode[] = [];
  if ((s.comfort !== null && s.comfort !== undefined) || (s.cargoDamage ?? 0) > 0) {
    others.push(
      <Box key="comfort" title={s.comfort !== null && s.comfort !== undefined ? r.flight.comfort : r.flight.cargoDamage} icon={<Sparkles className="size-4 text-accent" />}>
        {s.comfort !== null && s.comfort !== undefined && <Kv k={r.flight.comfortLabel(s.comfort)} v={`${s.comfort}/100`} tone={s.comfort >= 75 ? "text-ok" : s.comfort >= 50 ? "text-warn" : "text-danger"} />}
        {(s.cargoDamage ?? 0) > 0 && <Kv k={r.flight.cargoDamage} v={`%${num(s.cargoDamage ?? 0)}`} tone="text-danger" />}
      </Box>,
    );
  }
  if ((s.objectivesTotal ?? 0) > 0) {
    others.push(
      <Box key="objectives" title={r.flight.objectives} icon={<Target className="size-4 text-accent" />}>
        <Kv k={t.kinds[e.job.kind]} v={r.objectives.done(s.objectivesDone ?? 0, s.objectivesTotal ?? 0)} tone={(s.objectivesDone ?? 0) === s.objectivesTotal ? "text-ok" : "text-warn"} />
      </Box>,
    );
  }
  if (hasTimes) {
    others.push(
      <Box key="times" title={r.flight.times} icon={<Moon className="size-4 text-accent" />}>
        {(s.nightS ?? 0) > 0 && <Kv k={r.flight.nightTime} v={duration((s.nightS ?? 0) / 60)} />}
        {(s.imcS ?? 0) > 0 && <Kv k={r.flight.imcTime} v={duration((s.imcS ?? 0) / 60)} />}
      </Box>,
    );
  }

  if (part === "landing") return approach;
  if (part === "score")
    return (
      <div className={clsx("grid gap-3", others.length ? "grid-cols-2" : "grid-cols-1")}>
        {procBox}
        {others.length > 0 && <div className="flex flex-col gap-3">{others}</div>}
      </div>
    );
  return (
    <div className="grid grid-cols-3 gap-3">
      {approach}
      {procBox}
      <div className="flex flex-col gap-3">{others}</div>
    </div>
  );
}

/** Kesinti satırı: 7 gün içinde, geçerli uçuşta itiraz düğmesiyle. */
export function DeductionRow({ e, code, value, label }: { e: LogEntry; code: string; value: number; label: string }) {
  const r = useRealT();
  const [busy, setBusy] = useState(false);
  const canAppeal = !e.summary.invalid && Date.now() / 1000 - e.endedAt < 7 * 86400;
  return (
    <li className="group flex items-center justify-between gap-2">
      <span className="min-w-0 flex-1 truncate text-fg-2">{label}</span>
      {canAppeal && (
        <Button
          size="sm"
          variant="ghost"
          className="h-6 px-1.5 text-[11px] opacity-0 transition-opacity group-hover:opacity-100"
          icon={<Gavel className="size-3" />}
          loading={busy}
          title={r.flight.appealHint}
          onClick={async () => {
            setBusy(true);
            try {
              await careerApi.appeal(e.id, code);
              toast.success(r.flight.appealDone(value));
              invalidateCareer();
            } catch (err) {
              notifyError(err);
            } finally {
              setBusy(false);
            }
          }}
        >
          {r.flight.appeal}
        </Button>
      )}
      <span className="tabular font-semibold text-warn">−{value}</span>
    </li>
  );
}
