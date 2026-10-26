// Başarımlar: kariyer verisinden hesaplanır (arka uç `career::achievements`); gruplara ayrılmış kartlar.

import clsx from "clsx";
import { Globe, Medal, Plane, Sparkles, Trophy } from "lucide-react";
import { Progress } from "@/ui";
import { num } from "./format";
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
    <section className="flex flex-col gap-3">
      <div className="flex items-end gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-display flex items-center gap-2 text-[22px] font-semibold tracking-tight text-fg">
            <Trophy className="size-5 text-accent" />
            {r.achievements.title}
          </h2>
        </div>
        <span className="tabular text-[12.5px] text-fg-2">{r.achievements.count(done, list.length)}</span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {groups.map(({ g, items }) => {
          const I = GROUP_ICON[g];
          return (
            <div key={g} className="card overflow-hidden">
              <header className="flex items-center gap-2 border-b border-line px-4 py-2.5">
                <I className="size-4 text-accent" />
                <span className="text-[13px] font-semibold text-fg">{r.achievements.groups[g]}</span>
              </header>
              <ul className="flex flex-col divide-y divide-line">
                {items.map((a) => {
                  const [title, body] = r.achievements.items[a.id] ?? [a.id, ""];
                  const p = Math.min(1, a.target > 0 ? a.progress / a.target : 0);
                  return (
                    <li key={a.id} className="flex items-center gap-3 px-4 py-2.5">
                      <div className={clsx("flex size-8 shrink-0 items-center justify-center rounded-xl", a.done ? "accent-soft" : "bg-surface-3 text-muted")}>
                        <Trophy className="size-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className={clsx("truncate text-[12.5px] font-semibold", a.done ? "text-fg" : "text-fg-2")}>{title}</span>
                          <span className="flex-1" />
                          <span className="tabular shrink-0 text-[11px] text-muted">
                            {num(Math.min(a.progress, a.target), a.target < 100 && a.progress % 1 !== 0 ? 1 : 0)} / {num(a.target)}
                          </span>
                        </div>
                        <div className="truncate text-[11px] text-muted">{body}</div>
                        {!a.done && <Progress className="mt-1.5" value={p} />}
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
