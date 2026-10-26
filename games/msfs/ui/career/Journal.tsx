// Kariyer günlüğü kartı: Modstead'in simle konuşmasının son satırları (games/msfs/src/career/journal.rs).

import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { FolderOpen, ScrollText } from "lucide-react";
import { notifyError } from "@/shell/actions";
import { Button } from "@/ui";
import { careerApi } from "./api";
import { useCareerT } from "./i18n";
import { ck } from "./queries";

export function JournalCard() {
  const t = useCareerT();
  const { data: lines = [] } = useQuery({ queryKey: [...ck.all, "journal"], queryFn: () => careerApi.journal(120), refetchInterval: 3000 });
  const box = useRef<HTMLDivElement>(null);
  // Yeni satır gelince en alta kay (kullanıcı yukarıda okuyorsa dokunma).
  useEffect(() => {
    const el = box.current;
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 60) el.scrollTop = el.scrollHeight;
  }, [lines]);

  return (
    <section className="card overflow-hidden">
      <header className="flex items-center gap-3 border-b border-line px-5 py-3.5">
        <ScrollText className="size-4 text-fg-2" />
        <h3 className="min-w-0 flex-1 text-[14px] font-semibold text-fg">{t.journal.title}</h3>
        <Button variant="ghost" size="sm" icon={<FolderOpen className="size-3.5" />} onClick={() => careerApi.revealJournal().catch(notifyError)}>
          {t.journal.reveal}
        </Button>
      </header>
      <div className="px-5 pb-4 pt-3">
        <p className="mb-2 text-[11.5px] leading-relaxed text-muted">{t.journal.hint}</p>
        <div ref={box} className="max-h-[260px] overflow-y-auto rounded-xl bg-surface-2/60 px-3 py-2 font-mono text-[10.5px] leading-[1.55] text-fg-2">
          {lines.length === 0 ? (
            <span className="text-muted">{t.journal.empty}</span>
          ) : (
            lines.map((l, i) => {
              // "2026-10-25 16:40:12.345 [alan] ileti" → saat, alan ve ileti ayrı tonlarda.
              const m = /^\S+ (\d\d:\d\d:\d\d)\.\d+ \[([^\]]+)\] (.*)$/.exec(l);
              return m ? (
                <div key={i} className="break-words">
                  <span className="text-muted">{m[1]}</span> <span className="text-accent">{m[2]}</span> {m[3]}
                </div>
              ) : (
                <div key={i} className="break-words">
                  {l}
                </div>
              );
            })
          )}
        </div>
      </div>
    </section>
  );
}
