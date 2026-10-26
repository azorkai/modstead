// Başarımlar: kariyer verisinden hesaplanır (arka uç `career::achievements`); dört grup yan yana, her biri madalya
// satırlarıyla. Kazanılan madalya dolu, kazanılmayan ilerleme çubuğuyla.

import clsx from "clsx";
import { Check, Globe, Medal, Plane, Sparkles, Trophy } from "lucide-react";
import { num } from "./format";
import { Bar } from "./parts";
import { useRealT } from "./real-i18n";
import type { Achievement, CareerView } from "./types";

const GROUP_ICON: Record<Achievement["group"], typeof Plane> = { flying: Plane, skill: Sparkles, career: Medal, world: Globe };

export function Achievements({ view }: { view: CareerView }) {
  const r = useRealT();
  const list = view.achievements ?? [];
  if (list.length === 0) return null;
  const done = list.filter((a) => a.done).length;
  const groups = (["flying", "skill", "career", "world"] as const).map((g) => ({ g, items: list.filter((a) => a.group === g) })).filter((x) => x.items.length > 0);
  return (
    <section className="flex flex-col gap-4">
      <header className="flex items-end gap-6">
        <h2 className="headline min-w-0 flex-1 text-[24px] text-fg">{r.achievements.title}</h2>
        <div className="w-[240px]">
          <div className="mb-1.5 flex items-baseline justify-end gap-1.5">
            <span className="num text-[20px] text-fg">{done}</span>
            <span className="tabular text-[12px] font-semibold text-muted">/ {list.length}</span>
          </div>
          <Bar value={done / list.length} ticks={list.length} className="h-2" />
        </div>
      </header>
      <div className="grid grid-cols-4 items-start gap-4">
        {groups.map(({ g, items }) => {
          const I = GROUP_ICON[g];
          const got = items.filter((a) => a.done).length;
          return (
            <div key={g} className="card overflow-hidden">
              <header className="flex items-center gap-2 border-b border-line px-4 py-3">
                <I className="size-4 text-accent" />
                <span className="title min-w-0 flex-1 truncate text-[13.5px] text-fg">{r.achievements.groups[g]}</span>
                <span className="tabular font-mono text-[11px] font-semibold text-muted">
                  {got}/{items.length}
                </span>
              </header>
              <ul className="flex flex-col divide-y divide-line">
                {items.map((a) => {
                  const [title, body] = r.achievements.items[a.id] ?? [a.id, ""];
                  const p = Math.min(1, a.target > 0 ? a.progress / a.target : 0);
                  return (
                    <li key={a.id} className="flex items-start gap-3 px-4 py-3">
                      <span
                        className={clsx(
                          "relative mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full",
                          a.done ? "accent-surface" : "border border-dashed border-line-strong text-muted",
                        )}
                      >
                        <Trophy className="size-[15px]" />
                        {a.done && (
                          <span className="absolute -bottom-0.5 -right-0.5 flex size-3.5 items-center justify-center rounded-full bg-ok text-[var(--surface)] ring-2 ring-[var(--surface)]">
                            <Check className="size-2.5" strokeWidth={3.5} />
                          </span>
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className={clsx("truncate text-[12.5px] font-semibold", a.done ? "text-fg" : "text-fg-2")}>{title}</div>
                        <div className="line-clamp-2 text-[11px] leading-snug text-muted">{body}</div>
                        {!a.done && (
                          <div className="mt-2 flex items-center gap-2">
                            <Bar value={p} className="h-1" />
                            <span className="tabular shrink-0 font-mono text-[10.5px] text-muted">
                              {num(Math.min(a.progress, a.target), a.target < 100 && a.progress % 1 !== 0 ? 1 : 0)}/{num(a.target)}
                            </span>
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}
