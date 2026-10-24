// Sağlık: puan, sorunlar (hata/uyarı/bilgi) ve her sorun için tek tık düzeltme.

import { useState } from "react";
import { motion } from "motion/react";
import { RefreshCw } from "lucide-react";
import clsx from "clsx";
import { Badge, Button, PageHeader, ScoreRing, Skeleton } from "@/ui";
import { useS } from "./i18n";
import { ModDrawer } from "./ModDrawer";
import { Filiz } from "./Pixel";
import { refreshAll, runFix, useModIndex, useSnapshot, useStardewSync } from "./queries";
import { IssueIcon, Page } from "./shared";
import type { Issue, Severity } from "./types";

export default function Health() {
  useStardewSync();
  const t = useS();
  const { data: snap, isFetching, isLoading } = useSnapshot();
  const health = snap?.health;
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const groups = (["error", "warning", "info"] as Severity[]).map((sv) => ({ severity: sv, items: health?.issues.filter((i) => i.severity === sv) ?? [] })).filter((g) => g.items.length);
  const score = health?.score ?? 100;
  // Başlık puandan değil en ağır sorundan gelir: hata varken "harika" denmez.
  const blocking = health?.issues.find((i) => i.kind === "smapi-missing" || i.kind === "game-missing");
  const errors = health?.errors ?? 0;
  const warnings = health?.warnings ?? 0;
  const mood = blocking?.kind === "smapi-missing" ? t.health.moodNoSmapi : blocking ? t.health.moodNoGame : errors ? t.health.moodErrors(errors) : warnings ? t.health.moodOk : t.health.moodGreat;

  return (
    <Page>
      <PageHeader
        title={t.health.title}
        subtitle={t.health.subtitle}
        actions={
          <Button icon={<RefreshCw className={clsx("size-4", isFetching && "animate-spin")} />} onClick={() => refreshAll()}>
            {t.health.rescan}
          </Button>
        }
      />

      {isLoading ? (
        <Skeleton className="mb-6 h-[184px] rounded-[18px]" />
      ) : (
        <section className="card mb-6 flex flex-wrap items-center gap-8 px-7 py-6">
          <ScoreRing score={score} size={128} stroke={11} label={t.health.score} />
          <div className="min-w-[240px] flex-1">
            <h2 className="text-display text-[24px] font-semibold leading-tight text-fg">{mood}</h2>
            <p className="mt-1 text-[13px] text-fg-2">{blocking ? blocking.detail : t.health.scoreHint}</p>
            {blocking?.fix && (
              <Button variant="primary" className="mt-4" onClick={() => runFix(blocking.fix!)}>
                {blocking.fix.label}
              </Button>
            )}
            <div className="mt-4 flex gap-2">
              <Badge tone={health?.errors ? "danger" : "neutral"}>{t.health.errors(health?.errors ?? 0)}</Badge>
              <Badge tone={health?.warnings ? "warn" : "neutral"}>{t.health.warnings(health?.warnings ?? 0)}</Badge>
              <Badge tone="info">{t.health.infos(health?.infos ?? 0)}</Badge>
            </div>
          </div>
          {!errors && <Filiz size={88} className="hidden lg:block" />}
        </section>
      )}

      {!isLoading && groups.length === 0 ? (
        <section className="card px-8 py-12 text-center">
          <h3 className="text-display text-[20px] font-semibold text-fg">{t.health.cleanTitle}</h3>
          <p className="mt-1 text-[13px] text-fg-2">{t.health.cleanBody}</p>
        </section>
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <section key={g.severity}>
              <h3 className="mb-3 flex items-center gap-2 text-[11.5px] font-medium uppercase tracking-[0.08em] text-muted">
                <IssueIcon severity={g.severity} /> {t.health.groups[g.severity]} <span>· {g.items.length}</span>
              </h3>
              <div className="space-y-2.5">
                {g.items.map((i, idx) => (
                  <IssueCard
                    key={i.id}
                    issue={i}
                    index={idx}
                    busy={busy === i.id}
                    onOpen={setOpen}
                    onFix={async () => {
                      setBusy(i.id);
                      await runFix(i.fix!);
                      setBusy(null);
                    }}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
      <ModDrawer folder={open} onClose={() => setOpen(null)} onOpen={setOpen} />
    </Page>
  );
}

function IssueCard({ issue: i, onFix, onOpen, busy, index }: { issue: Issue; onFix: () => void; onOpen: (folder: string) => void; busy: boolean; index: number }) {
  const { mods } = useModIndex();
  const involved = i.mods.map((f) => mods.find((m) => m.folder === f)).filter((m) => m !== undefined).slice(0, 8);
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index, 10) * 0.03 }}
      className={clsx("card flex items-start gap-4 p-4", i.severity === "error" && "border-danger/25", i.severity === "warning" && "border-warn/25")}
    >
      <div className={clsx("mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl", i.severity === "error" ? "bg-danger/12" : i.severity === "warning" ? "bg-warn/12" : "bg-info/12")}>
        <IssueIcon severity={i.severity} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-medium text-fg">{i.title}</div>
        <p data-selectable className="mt-0.5 text-[12.5px] text-fg-2">
          {i.detail}
        </p>
        {involved.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {involved.map((m) => (
              <button key={m.folder} onClick={() => onOpen(m.folder)} className="rounded-md border border-line bg-surface-2 px-1.5 py-0.5 text-[12px] text-fg-2 transition-colors hover:border-line-strong hover:text-fg">
                {m.name}
              </button>
            ))}
            {i.mods.length > 8 && <span className="text-[12px] text-muted">+{i.mods.length - 8}</span>}
          </div>
        )}
      </div>
      {i.fix && (
        <Button size="sm" variant={i.severity === "error" ? "subtle" : "secondary"} loading={busy} onClick={onFix}>
          {i.fix.label}
        </Button>
      )}
    </motion.div>
  );
}
