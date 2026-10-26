// Uçak seçme penceresi: simdeki uçaklar aile aile, gerçek fotoğraflarıyla (MSFS 2024 listeyi SimConnect'le verir),
// kendi filon ve elle ad girme. Bir aile kartı seçilince sürüm ve boya alttaki çubuktan seçilir.

import { useMemo, useState } from "react";
import clsx from "clsx";
import { Check, Plane, RefreshCw, Search } from "lucide-react";
import { useT } from "@/lib/i18n";
import { notifyError } from "@/shell/actions";
import { Badge, Button, Dialog, DialogBody, DialogFooter, DialogHeader, Input } from "@/ui";
import { careerApi } from "./api";
import { AircraftPhoto } from "./aircraft/AircraftPhoto";
import { aircraftVisual, familyOf } from "./aircraft/families";
import { className as clsName, num } from "./format";
import { useCareerT } from "./i18n";
import { invalidateCareer, useAircraftOptions } from "./queries";
import { useCareerUi } from "./store";
import type { ActiveView, AircraftClass, AircraftOption, CareerView } from "./types";

interface Group {
  key: string;
  name: string;
  items: AircraftOption[];
  cls: AircraftClass | null;
  flyable: boolean;
  fits: boolean;
}

/** Aynı gerçek tipin sürümlerini (C172 yolcu, kargo, şamandıralı…) tek kartta toplar. */
function groupOptions(options: AircraftOption[], jobClass: AircraftClass | null): Group[] {
  const map = new Map<string, Group>();
  for (const o of options) {
    const f = familyOf(o.title);
    const key = f?.id ?? o.title;
    let g = map.get(key);
    if (!g) {
      g = { key, name: f?.name ?? o.title, items: [], cls: null, flyable: false, fits: false };
      map.set(key, g);
    }
    g.items.push(o);
    g.flyable ||= o.flyable;
    g.fits ||= jobClass !== null && o.class === jobClass;
  }
  const groups = [...map.values()];
  for (const g of groups) {
    g.items.sort((a, b) => Number(b.class === jobClass) - Number(a.class === jobClass) || Number(b.flyable) - Number(a.flyable) || a.title.localeCompare(b.title));
    g.cls = g.items.find((i) => i.class)?.class ?? null;
  }
  return groups.sort((a, b) => Number(b.fits) - Number(a.fits) || Number(b.flyable) - Number(a.flyable) || a.name.localeCompare(b.name));
}

const selectCls = "h-7 min-w-0 flex-1 rounded-lg border border-line-strong bg-surface-2 px-2 text-[12px] text-fg outline-none";

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

  const groups = useMemo(() => groupOptions(options, job.class), [options, job.class]);
  const shown = useMemo(() => {
    const k = q.trim().toLowerCase();
    return k ? groups.filter((g) => g.name.toLowerCase().includes(k) || g.items.some((i) => i.title.toLowerCase().includes(k))) : groups;
  }, [groups, q]);
  const fits = shown.filter((g) => g.fits);
  const others = shown.filter((g) => !g.fits);
  const selGroup = sel && !sel.fleetId ? groups.find((g) => g.items.some((i) => i.title === sel.title)) : undefined;
  const selItem = selGroup?.items.find((i) => i.title === sel?.title);

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

  const card = (g: Group) => (
    <Card
      key={g.key}
      title={g.items[0].title}
      cls={g.cls}
      name={g.name}
      selected={selGroup?.key === g.key}
      dim={!g.flyable}
      onClick={() => selGroup?.key !== g.key && setSel({ title: g.items[0].title, livery: "", fleetId: null })}
      meta={
        <>
          <Badge tone={g.cls ? "neutral" : "warn"}>{g.cls ? clsName(g.cls, view.classes) : t.hangar.source.unknown}</Badge>
          {g.items.length > 1 && <span className="text-[11px] text-muted">{t.pick.variants(g.items.length)}</span>}
          {!g.flyable && g.cls && <Badge tone="warn">{t.pick.notFlyable}</Badge>}
        </>
      }
    />
  );

  return (
    <Dialog open={open} onClose={() => setPick(false)} width={860} game="msfs">
      <DialogHeader title={t.pick.title} subtitle={t.pick.subtitle(clsName(job.class, view.classes))} icon={<Plane className="size-5" />} onClose={() => setPick(false)} />
      <DialogBody className="flex flex-col gap-4">
        {fleet.length > 0 && (
          <div>
            <Heading>{t.pick.own}</Heading>
            <div className="grid grid-cols-3 gap-2.5">
              {fleet.map((f) => (
                <Card
                  key={f.id}
                  title={f.title}
                  cls={f.class}
                  name={`${f.registration} · ${f.title || clsName(f.class, view.classes)}`}
                  selected={sel?.fleetId === f.id}
                  onClick={() => setSel({ title: f.title, livery: "", fleetId: f.id })}
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
        <div className="-mr-1 flex max-h-[430px] flex-col gap-4 overflow-y-auto pr-1">
          {shown.length === 0 && <p className="rounded-xl bg-surface-2/60 px-3 py-3 text-[12.5px] text-fg-2">{t.pick.none}</p>}
          {fits.length > 0 && (
            <div>
              <Heading>{t.pick.fits}</Heading>
              <div className="grid grid-cols-3 gap-2.5">{fits.map(card)}</div>
            </div>
          )}
          {others.length > 0 && (
            <div>
              {fits.length > 0 && <Heading>{t.pick.others}</Heading>}
              <div className="grid grid-cols-3 gap-2.5">{others.map(card)}</div>
            </div>
          )}
        </div>
        {selGroup && selItem && sel && <Selection group={selGroup} item={selItem} livery={sel.livery} view={view} onChange={(title, livery) => setSel({ title, livery, fleetId: null })} />}
        <div>
          <Heading>{t.pick.manualTitle}</Heading>
          <Input
            value={manual}
            onChange={(e) => {
              setManual(e.target.value);
              setSel(null);
            }}
            placeholder="C172SP G1000 Passengers"
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

function Heading({ children }: { children: React.ReactNode }) {
  return <div className="mb-1.5 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-muted">{children}</div>;
}

function Card({ title, cls, name, selected, dim, onClick, meta }: { title: string; cls: AircraftClass | null; name: string; selected: boolean; dim?: boolean; onClick: () => void; meta: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={name}
      className={clsx(
        "flex flex-col overflow-hidden rounded-xl border text-left transition-[border-color,box-shadow,opacity]",
        selected ? "border-[color-mix(in_oklab,var(--accent)_70%,transparent)] shadow-[0_0_0_2px_color-mix(in_oklab,var(--accent)_28%,transparent)]" : "border-line hover:border-line-strong",
        dim && !selected && "opacity-60 hover:opacity-90",
      )}
    >
      <AircraftPhoto title={title} cls={cls} className="aspect-[16/9] w-full">
        {selected && (
          <span className="accent-surface absolute right-2 top-2 flex size-6 items-center justify-center rounded-full text-accent-ink shadow-md">
            <Check className="size-3.5" />
          </span>
        )}
      </AircraftPhoto>
      <span className="flex min-w-0 flex-col gap-1 px-2.5 py-2">
        <span className="truncate text-[12.5px] font-semibold text-fg">{name}</span>
        <span className="flex flex-wrap items-center gap-1.5">{meta}</span>
      </span>
    </button>
  );
}

/** Seçilen aile: sürüm, boya, sınıfın nereden geldiği ve fotoğrafın atfı. */
function Selection({ group, item, livery, view, onChange }: { group: Group; item: AircraftOption; livery: string; view: CareerView; onChange: (title: string, livery: string) => void }) {
  const t = useCareerT();
  const v = aircraftVisual(item.title, item.class);
  return (
    <div className="flex gap-3 rounded-xl border border-line bg-surface-2/50 p-2.5">
      <AircraftPhoto title={item.title} cls={item.class} className="aspect-[16/9] w-40 shrink-0 rounded-lg" />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <span className="truncate text-[13.5px] font-semibold text-fg">{group.name}</span>
          {item.class && <Badge>{clsName(item.class, view.classes)}</Badge>}
          <span className="text-[11px] text-muted">{t.hangar.source[item.classSource]}</span>
        </div>
        {group.items.length > 1 && (
          <label className="flex items-center gap-2">
            <span className="w-14 shrink-0 text-[11.5px] text-muted">{t.pick.variant}</span>
            <select value={item.title} onChange={(e) => onChange(e.target.value, "")} className={selectCls}>
              {group.items.map((i) => (
                <option key={i.title} value={i.title}>
                  {i.title}
                  {!i.flyable && i.class ? ` · ${t.pick.notFlyable}` : ""}
                </option>
              ))}
            </select>
          </label>
        )}
        {item.liveries.length > 0 && (
          <label className="flex items-center gap-2">
            <span className="w-14 shrink-0 text-[11.5px] text-muted">{t.pick.livery}</span>
            <select value={livery} onChange={(e) => onChange(item.title, e.target.value)} className={selectCls}>
              <option value="">{t.pick.defaultLivery}</option>
              {item.liveries.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </label>
        )}
        <span className="mt-auto truncate text-[10.5px] text-muted" title={v.credit?.source}>
          {v.credit ? t.pick.photo(v.credit.author, v.credit.license) : !v.photo ? t.pick.classArt : ""}
        </span>
      </div>
    </div>
  );
}
