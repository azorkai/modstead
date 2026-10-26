// Uçak seçme penceresi: simdeki uçaklar aile aile (gerçek fotoğraflarıyla), mod uçakları paket paket (paketin kendi
// küçük resmiyle), kendi filon ve elle ad girme. Üstte süzgeçler: Hepsi / Sim / Mod, sınıf, arama. Bir kart seçilince
// sürüm ve boya alttaki çubuktan seçilir; mod uçağının paketi, etkin olduğu simler ve kendi EFB'si orada yazar.

import { useMemo, useState } from "react";
import clsx from "clsx";
import { Check, CircleAlert, ClipboardList, Plane, RefreshCw, Search, Tablet } from "lucide-react";
import { useT } from "@/lib/i18n";
import { notifyError } from "@/shell/actions";
import { Badge, Button, Dialog, DialogBody, DialogFooter, DialogHeader, IconButton, Input, Segmented } from "@/ui";
import { careerApi } from "./api";
import { AircraftPhoto } from "./aircraft/AircraftPhoto";
import { aircraftVisual, familyOf } from "./aircraft/families";
import { useAircraftT } from "./aircraft/i18n";
import { className as clsName, num } from "./format";
import { useCareerT } from "./i18n";
import { invalidateCareer, useAircraftOptions } from "./queries";
import { useCareerUi } from "./store";
import type { ActiveView, AircraftClass, AircraftOption, CareerView } from "./types";

type Sim = "msfs2020" | "msfs2024";
type Source = "all" | "sim" | "mod";

interface Group {
  key: string;
  name: string;
  /** Mod uçağında paketin adı. */
  sub: string;
  items: AircraftOption[];
  cls: AircraftClass | null;
  flyable: boolean;
  fits: boolean;
  mod: boolean;
  efb: boolean;
  sims: Sim[];
  /** Aramada bakılan metin (küçük harf). */
  hay: string;
}

/** Aynı gerçek tipin sürümlerini (C172 yolcu, kargo, şamandıralı…) ve aynı mod paketinin sürümlerini tek kartta toplar. */
function groupOptions(options: AircraftOption[], jobClass: AircraftClass | null): Group[] {
  const map = new Map<string, Group>();
  for (const o of options) {
    const pkg = o.origin === "mod" ? o.package : null;
    const f = familyOf(o.title);
    const key = pkg ? `mod:${pkg.id}/${pkg.simobject}` : (f?.id ?? o.title);
    let g = map.get(key);
    if (!g) {
      g = {
        key,
        name: pkg ? o.realType || pkg.title || o.title : (f?.name ?? o.title),
        sub: pkg ? pkg.title : "",
        items: [],
        cls: null,
        flyable: false,
        fits: false,
        mod: !!pkg,
        efb: false,
        sims: [],
        hay: "",
      };
      map.set(key, g);
    }
    g.items.push(o);
    g.flyable ||= o.flyable;
    g.fits ||= jobClass !== null && o.class === jobClass;
    g.efb ||= o.managesOwnLoading;
    for (const s of o.sims) if (!g.sims.includes(s)) g.sims.push(s);
    g.hay += ` ${o.title} ${o.realType} ${o.icaoType} ${pkg?.title ?? ""} ${pkg?.creator ?? ""}`.toLowerCase();
  }
  const groups = [...map.values()];
  for (const g of groups) {
    g.items.sort((a, b) => Number(b.class === jobClass) - Number(a.class === jobClass) || Number(b.flyable) - Number(a.flyable) || a.title.localeCompare(b.title));
    g.cls = g.items.find((i) => i.class)?.class ?? null;
    g.sims.sort();
    g.hay = `${g.name.toLowerCase()} ${g.hay}`;
  }
  return groups.sort((a, b) => Number(b.fits) - Number(a.fits) || Number(b.flyable) - Number(a.flyable) || a.name.localeCompare(b.name));
}

/** Bağlı sim (2020/2024); bağlı değilse `null`. */
function currentSim(view: CareerView): Sim | null {
  const s = view.link.state === "connected" ? view.link.sim : null;
  return s === "msfs2020" || s === "msfs2024" ? s : null;
}

const selectCls = "h-7 min-w-0 flex-1 rounded-full border border-line-strong bg-surface-2 px-2.5 text-[12px] text-fg outline-none focus:border-accent";

export function AircraftPicker({ view, active }: { view: CareerView; active: ActiveView }) {
  const t = useCareerT();
  const a = useAircraftT();
  const st = useT();
  const open = useCareerUi((s) => s.pickOpen);
  const setPick = useCareerUi((s) => s.setPick);
  const { data: options = [], refetch, isFetching } = useAircraftOptions(open);
  const [q, setQ] = useState("");
  const [src, setSrc] = useState<Source>("all");
  const [clsFilter, setClsFilter] = useState<AircraftClass | "">("");
  const [refreshing, setRefreshing] = useState(false);
  const [sel, setSel] = useState<{ title: string; livery: string; fleetId: string | null } | null>(null);
  const [manual, setManual] = useState("");
  const [busy, setBusy] = useState(false);
  const job = active.job;
  const sim = currentSim(view);
  const fleet = view.fleet.filter((f) => f.location === job.from && f.class && job.mode === "contract");

  const groups = useMemo(() => groupOptions(options, job.class), [options, job.class]);
  const counts = useMemo(() => ({ all: groups.length, sim: groups.filter((g) => !g.mod).length, mod: groups.filter((g) => g.mod).length }), [groups]);
  const classesHere = useMemo(() => view.classes.filter((c) => groups.some((g) => g.cls === c.id)), [view.classes, groups]);
  const shown = useMemo(() => {
    const k = q.trim().toLowerCase();
    return groups.filter((g) => (src === "all" || (src === "mod") === g.mod) && (!clsFilter || g.cls === clsFilter) && (!k || g.hay.includes(k)));
  }, [groups, q, src, clsFilter]);
  const fits = shown.filter((g) => g.fits);
  const others = shown.filter((g) => !g.fits);
  const selGroup = sel && !sel.fleetId ? groups.find((g) => g.items.some((i) => i.title === sel.title)) : undefined;
  const selItem = selGroup?.items.find((i) => i.title === sel?.title);

  const refresh = () => {
    setRefreshing(true);
    careerApi
      .refreshAircraft()
      .then(() => new Promise((r) => setTimeout(r, 2500)))
      .then(() => refetch())
      .catch(notifyError)
      .finally(() => setRefreshing(false));
  };

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

  const card = (g: Group) => {
    const missing = g.mod && sim !== null && !g.sims.includes(sim);
    return (
      <Card
        key={g.key}
        option={g.items[0]}
        cls={g.cls}
        name={g.name}
        sub={g.sub}
        selected={selGroup?.key === g.key}
        dim={!g.flyable || missing}
        onClick={() => selGroup?.key !== g.key && setSel({ title: g.items[0].title, livery: "", fleetId: null })}
        overlay={
          g.mod && (
            <span className="msfs-on-image absolute left-2 top-2 inline-flex h-5 items-center rounded-full px-2 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-white">
              {a.mod}
            </span>
          )
        }
        meta={
          <>
            <Badge tone={g.cls ? "neutral" : "warn"}>{g.cls ? clsName(g.cls, view.classes) : t.hangar.source.unknown}</Badge>
            {g.efb && (
              <Badge tone="info" icon={<Tablet className="size-3" />}>
                {a.efb}
              </Badge>
            )}
            {g.items.length > 1 && <span className="text-[11px] text-muted">{t.pick.variants(g.items.length)}</span>}
            {!g.flyable && g.cls && <Badge tone="warn">{t.pick.notFlyable}</Badge>}
            {missing && sim && <Badge tone="warn">{a.notInSim(sim)}</Badge>}
          </>
        }
      />
    );
  };

  return (
    <Dialog open={open} onClose={() => setPick(false)} width={880} game="msfs">
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
          <Input className="min-w-0 flex-1" value={q} onChange={(e) => setQ(e.target.value)} placeholder={a.search} icon={<Search className="size-4" />} />
          <Segmented
            id="pick-source"
            value={src}
            onChange={setSrc}
            options={[
              { value: "all", label: a.filter.all, count: counts.all },
              { value: "sim", label: a.filter.sim, count: counts.sim },
              { value: "mod", label: a.filter.mod, count: counts.mod },
            ]}
          />
          <select
            value={clsFilter}
            onChange={(e) => setClsFilter(e.target.value as AircraftClass | "")}
            aria-label={a.allClasses}
            className="h-9 w-[168px] shrink-0 rounded-full border border-line-strong bg-surface-2/70 px-3.5 text-[12.5px] text-fg outline-none transition-colors hover:border-[color-mix(in_oklab,var(--fg)_22%,transparent)] focus:border-accent"
          >
            <option value="">{a.allClasses}</option>
            {classesHere.map((c) => (
              <option key={c.id} value={c.id}>
                {clsName(c.id, view.classes)}
              </option>
            ))}
          </select>
          <IconButton label={a.refresh} onClick={refresh} disabled={refreshing}>
            <RefreshCw className={clsx("size-4", (refreshing || isFetching) && "animate-spin")} />
          </IconButton>
        </div>
        <div className="-mr-1 flex max-h-[430px] min-h-[200px] flex-col gap-4 overflow-y-auto pr-1">
          {shown.length === 0 && (
            <p className="rounded-xl bg-surface-2/60 px-3 py-3 text-[12.5px] text-fg-2">{groups.length === 0 ? t.pick.none : src === "mod" && counts.mod === 0 ? a.noMods : a.noMatch}</p>
          )}
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
        {selGroup && selItem && sel && <Selection group={selGroup} item={selItem} livery={sel.livery} view={view} sim={sim} onChange={(title, livery) => setSel({ title, livery, fleetId: null })} />}
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

function Card({
  title,
  option,
  cls,
  name,
  sub,
  selected,
  dim,
  onClick,
  meta,
  overlay,
}: {
  title?: string;
  option?: AircraftOption;
  cls: AircraftClass | null;
  name: string;
  sub?: string;
  selected: boolean;
  dim?: boolean;
  onClick: () => void;
  meta: React.ReactNode;
  overlay?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={sub ? `${name} · ${sub}` : name}
      className={clsx(
        "flex flex-col overflow-hidden rounded-xl border text-left transition-[border-color,box-shadow,opacity]",
        selected ? "border-[color-mix(in_oklab,var(--accent)_70%,transparent)] shadow-[0_0_0_2px_color-mix(in_oklab,var(--accent)_28%,transparent)]" : "border-line hover:border-line-strong",
        dim && !selected && "opacity-60 hover:opacity-90",
      )}
    >
      <AircraftPhoto title={option?.title ?? title ?? ""} option={option} cls={cls} className="aspect-[16/9] w-full">
        {overlay}
        {selected && (
          <span className="accent-surface absolute right-2 top-2 flex size-6 items-center justify-center rounded-full text-accent-ink shadow-md">
            <Check className="size-3.5" />
          </span>
        )}
      </AircraftPhoto>
      <span className="flex min-w-0 flex-col gap-1 px-2.5 py-2">
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-[12.5px] font-semibold text-fg">{name}</span>
          {sub && <span className="truncate text-[11px] text-muted">{sub}</span>}
        </span>
        <span className="flex flex-wrap items-center gap-1.5">{meta}</span>
      </span>
    </button>
  );
}

/** Ağırlık (lb) → ton ya da lb; yakıt galon. */
function specLine(o: AircraftOption, fmt: (mtow: string, fuel: string, cruise: string) => string): string {
  const s = o.specs;
  if (!s) return "";
  const mtowLb = s.maxTakeoffLb > 0 ? s.maxTakeoffLb : s.mtowLb;
  const mtow = mtowLb > 0 ? (mtowLb >= 20_000 ? `${num(mtowLb * 0.000453592, 1)} t` : `${num(mtowLb)} lb`) : "";
  const fuel = s.fuelCapacityGal > 0 ? `${num(s.fuelCapacityGal)} gal` : "";
  const cruise = s.cruiseKt > 0 ? `${num(s.cruiseKt)} kt` : "";
  return fmt(mtow, fuel, cruise);
}

/** Seçilen kart: sürüm, boya, sınıfın nereden geldiği, mod paketi ve kendi EFB'si, görselin kaynağı. */
function Selection({ group, item, livery, view, sim, onChange }: { group: Group; item: AircraftOption; livery: string; view: CareerView; sim: Sim | null; onChange: (title: string, livery: string) => void }) {
  const t = useCareerT();
  const a = useAircraftT();
  const v = aircraftVisual(item.title, item.class);
  const pkg = item.origin === "mod" ? item.package : null;
  const missing = !!pkg && sim !== null && !item.sims.includes(sim);
  const source = item.classSource === "user" ? a.classManual : `${a.classAuto} · ${a.basis[item.classSource] ?? ""}`;
  const specs = specLine(item, a.specs);
  return (
    <div className="flex gap-3 rounded-xl border border-line bg-surface-2/50 p-2.5">
      <AircraftPhoto title={item.title} option={item} livery={livery} cls={item.class} className="aspect-[16/9] w-44 shrink-0 rounded-lg" />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-[13.5px] font-semibold text-fg">{group.name}</span>
          {item.class && <Badge>{clsName(item.class, view.classes)}</Badge>}
          <span className="shrink-0 text-[11px] text-muted">{source}</span>
        </div>
        {pkg && (
          <div className="flex min-w-0 items-center gap-1.5 text-[11.5px] text-fg-2">
            <span className="shrink-0 rounded-full border border-line-strong px-1.5 font-mono text-[9.5px] font-semibold uppercase leading-[16px] tracking-[0.08em] text-muted">{a.mod}</span>
            <span className="truncate">
              {pkg.title}
              {pkg.creator && <span className="text-muted"> · {a.by(pkg.creator)}</span>}
            </span>
            <span className={clsx("shrink-0", missing ? "text-warn" : "text-muted")}>· {a.activeIn(item.sims)}</span>
          </div>
        )}
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
        {missing && sim && (
          <p className="flex items-start gap-1.5 text-[11.5px] leading-snug text-warn">
            <CircleAlert className="mt-px size-3.5 shrink-0" />
            {a.notInSimHint(sim)}
          </p>
        )}
        {item.managesOwnLoading && (
          <p className="flex items-start gap-1.5 text-[11.5px] leading-snug text-info">
            <ClipboardList className="mt-px size-3.5 shrink-0" />
            {a.efbNote}
          </p>
        )}
        <span className="mt-auto truncate text-[10.5px] text-muted" title={v.credit?.source}>
          {[specs && `${a.specsFrom[item.specsSource] ?? ""}: ${specs}`, item.thumb ? a.thumbFromPackage : v.credit ? t.pick.photo(v.credit.author, v.credit.license) : !v.photo ? t.pick.classArt : ""]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </div>
    </div>
  );
}
