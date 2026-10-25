// Uçak seçme penceresi: simdeki uçaklar (MSFS 2024 listeyi SimConnect'le verir), kendi filon ve elle ad girme.

import { useMemo, useState } from "react";
import clsx from "clsx";
import { Check, Plane, RefreshCw, Search, Warehouse } from "lucide-react";
import { useT } from "@/lib/i18n";
import { notifyError } from "@/shell/actions";
import { Badge, Button, Dialog, DialogBody, DialogFooter, DialogHeader, Input } from "@/ui";
import { careerApi } from "./api";
import { className as clsName, num } from "./format";
import { useCareerT } from "./i18n";
import { invalidateCareer, useAircraftOptions } from "./queries";
import { useCareerUi } from "./store";
import type { ActiveView, AircraftOption, CareerView } from "./types";

export function AircraftPicker({ view, active }: { view: CareerView; active: ActiveView }) {
  const t = useCareerT();
  const st = useT();
  const open = useCareerUi((s) => s.pickOpen);
  const setPick = useCareerUi((s) => s.setPick);
  const { data: options = [], refetch, isFetching } = useAircraftOptions(open);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<{ title: string; livery: string; fleetId: string | null } | null>(null);
  const [manual, setManual] = useState("");
  const [busy, setBusy] = useState(false);
  const job = active.job;
  const fleet = view.fleet.filter((f) => f.location === job.from && f.class && job.mode === "contract");

  const list = useMemo(() => {
    const k = q.trim().toLowerCase();
    return options
      .filter((o) => !k || o.title.toLowerCase().includes(k))
      .sort((a, b) => Number(b.class === job.class) - Number(a.class === job.class) || Number(b.flyable) - Number(a.flyable));
  }, [options, q, job.class]);

  const choose = async () => {
    const pick = sel ?? (manual.trim() ? { title: manual.trim(), livery: "", fleetId: null } : null);
    if (!pick) return;
    setBusy(true);
    try {
      await careerApi.pickAircraft(pick.title, pick.livery, pick.fleetId);
      invalidateCareer();
      setPick(false);
    } catch (e) {
      notifyError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={() => setPick(false)} width={680} game="msfs">
      <DialogHeader title={t.pick.title} subtitle={t.pick.subtitle(clsName(job.class, view.classes))} icon={<Plane className="size-5" />} onClose={() => setPick(false)} />
      <DialogBody className="flex flex-col gap-4">
        {fleet.length > 0 && (
          <div>
            <div className="mb-1.5 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-muted">{t.pick.own}</div>
            <div className="flex flex-col gap-1.5">
              {fleet.map((f) => (
                <Option
                  key={f.id}
                  selected={sel?.fleetId === f.id}
                  onClick={() => setSel({ title: f.title, livery: "", fleetId: f.id })}
                  icon={<Warehouse className="size-4" />}
                  title={`${f.registration} · ${f.title || clsName(f.class, view.classes)}`}
                  meta={
                    <>
                      <Badge>{clsName(f.class, view.classes)}</Badge>
                      <span className="tabular text-[11px] text-muted">
                        {t.hangar.condition} {num(f.condition)}%
                      </span>
                    </>
                  }
                />
              ))}
            </div>
          </div>
        )}
        <div className="flex items-center gap-2">
          <Input className="flex-1" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.pick.search} icon={<Search className="size-4" />} />
          <Button
            variant="secondary"
            icon={<RefreshCw className={clsx("size-4", isFetching && "animate-spin")} />}
            onClick={() =>
              careerApi
                .refreshAircraft()
                .then(() => setTimeout(() => void refetch(), 2500))
                .catch(notifyError)
            }
          >
            {t.hangar.refresh}
          </Button>
        </div>
        <div className="flex max-h-[340px] flex-col gap-1.5 overflow-y-auto pr-1">
          {list.length === 0 && <p className="rounded-xl bg-surface-2/60 px-3 py-3 text-[12.5px] text-fg-2">{t.pick.none}</p>}
          {list.map((o) => (
            <AircraftRow key={o.title} o={o} view={view} selected={sel?.title === o.title && !sel.fleetId} livery={sel?.title === o.title ? sel.livery : ""} onSelect={(livery) => setSel({ title: o.title, livery, fleetId: null })} />
          ))}
        </div>
        <div>
          <div className="mb-1.5 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-muted">{t.pick.manualTitle}</div>
          <Input
            value={manual}
            onChange={(e) => {
              setManual(e.target.value);
              setSel(null);
            }}
            placeholder="Cessna Skyhawk G1000 Asobo"
          />
        </div>
      </DialogBody>
      <DialogFooter>
        <Button variant="ghost" onClick={() => setPick(false)}>
          {st.common.cancel}
        </Button>
        <Button variant="primary" disabled={!sel && !manual.trim()} loading={busy} onClick={choose}>
          {t.pick.use}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

function AircraftRow({ o, view, selected, livery, onSelect }: { o: AircraftOption; view: CareerView; selected: boolean; livery: string; onSelect: (livery: string) => void }) {
  const t = useCareerT();
  return (
    <div className={clsx("rounded-xl border transition-colors", selected ? "border-[color-mix(in_oklab,var(--accent)_55%,transparent)] bg-[color-mix(in_oklab,var(--accent)_7%,transparent)]" : "border-line hover:bg-surface-2/60", !o.flyable && "opacity-60")}>
      <Option
        selected={selected}
        onClick={() => onSelect(livery)}
        icon={<Plane className="size-4" />}
        title={o.title}
        bare
        meta={
          <>
            <Badge tone={o.class ? "neutral" : "warn"}>{o.class ? clsName(o.class, view.classes) : t.hangar.source.unknown}</Badge>
            <span className="text-[11px] text-muted">{t.hangar.source[o.classSource]}</span>
            {!o.flyable && o.class && <Badge tone="warn">{t.pick.notFlyable}</Badge>}
          </>
        }
      />
      {selected && o.liveries.length > 1 && (
        <div className="flex items-center gap-2 px-3 pb-2.5">
          <span className="text-[11.5px] text-muted">{t.pick.livery}</span>
          <select value={livery} onChange={(e) => onSelect(e.target.value)} className="h-7 min-w-0 flex-1 rounded-lg border border-line-strong bg-surface-2 px-2 text-[12px] text-fg outline-none">
            <option value="">{t.pick.defaultLivery}</option>
            {o.liveries.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}

function Option({ selected, onClick, icon, title, meta, bare }: { selected: boolean; onClick: () => void; icon: React.ReactNode; title: string; meta: React.ReactNode; bare?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "flex w-full items-center gap-3 px-3 py-2.5 text-left",
        !bare && "rounded-xl border transition-colors",
        !bare && (selected ? "border-[color-mix(in_oklab,var(--accent)_55%,transparent)] bg-[color-mix(in_oklab,var(--accent)_7%,transparent)]" : "border-line hover:bg-surface-2/60"),
      )}
    >
      <span className={clsx("flex size-8 shrink-0 items-center justify-center rounded-lg", selected ? "accent-surface text-accent-ink" : "bg-surface-2 text-muted")}>{selected ? <Check className="size-4" /> : icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium text-fg">{title}</span>
        <span className="mt-0.5 flex items-center gap-1.5">{meta}</span>
      </span>
    </button>
  );
}
