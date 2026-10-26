// Hangar ve finans: varlık şeridi (bakiye, borç, kredi, filo değeri, net varlık), filo (fotoğraf, durum, bakım,
// sigorta, satış), uçak pazarı ve simdeki uçakların sınıfları (tablolar); sağda kredi ve hesap hareketleri.

import { useMemo, useState } from "react";
import clsx from "clsx";
import { toast } from "sonner";
import { Landmark, MapPin, RefreshCw, Search, ShoppingCart, Wallet, Warehouse, Wrench } from "lucide-react";
import { useLang } from "@/lib/i18n";
import { notifyError } from "@/shell/actions";
import { Badge, Button, ConfirmDialog, Dialog, DialogBody, DialogFooter, DialogHeader, Input, Segmented } from "@/ui";
import { AircraftPhoto } from "./aircraft/AircraftPhoto";
import { useAircraftT } from "./aircraft/i18n";
import { careerApi } from "./api";
import { className as clsName, dateTime, hours, money, moneyShort, num } from "./format";
import { useCareerT } from "./i18n";
import { MaintenanceBlock } from "./Maintenance";
import { Bar, Disclosure, PageTitle, Panel, Stamp, StatCell, StatStrip, type GaugeTone } from "./parts";
import { invalidateCareer, useAircraftOptions, useLedger } from "./queries";
import type { AircraftClass, CareerView, ClassInfo, FleetView } from "./types";

export function Hangar({ view }: { view: CareerView }) {
  const t = useCareerT();
  const p = view.pilot!;
  const fleetValue = view.fleet.reduce((a, f) => a + (f.value ?? 0), 0);
  const worth = p.money + fleetValue - p.loan;
  return (
    <div className="flex flex-col gap-6">
      <PageTitle eyebrow={t.hangar.eyebrow(view.fleet.length, moneyShort(fleetValue))} title={t.hangar.title} subtitle={t.guide.introHangar} />
      <StatStrip>
        <StatCell label={t.hangar.loan} value={moneyShort(p.loan)} hint={t.guide.loan} tone={p.loan > 0 ? "warn" : undefined} sub={p.canContract ? t.hangar.available(moneyShort(Math.max(0, p.creditLimit - p.loan))) : t.hangar.needCpl} />
        <StatCell label={t.hangar.limit} value={moneyShort(p.creditLimit)} />
        <StatCell label={t.hangar.fleetValue} value={moneyShort(fleetValue)} sub={`${t.hangar.fleet} · ${view.fleet.length}`} />
        <StatCell label={t.hangar.netWorth} value={moneyShort(worth)} tone={worth >= 0 ? "ok" : "danger"} sub={t.hangar.netWorthHint} />
      </StatStrip>
      <Fleet view={view} />
      <div className="grid grid-cols-[minmax(0,1fr)_368px] items-start gap-6">
        <Market view={view} />
        <div className="flex min-w-0 flex-col gap-6">
          <Finance view={view} />
          <Ledger />
        </div>
      </div>
      <SimAircraft view={view} />
    </div>
  );
}

function Fleet({ view }: { view: CareerView }) {
  const t = useCareerT();
  const [sell, setSell] = useState<FleetView | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (id: string, f: () => Promise<number>, ok: (v: string) => string) => {
    setBusy(id);
    try {
      const v = await f();
      toast.success(ok(money(v)));
      invalidateCareer();
    } catch (e) {
      notifyError(e);
    } finally {
      setBusy(null);
    }
  };
  return (
    <Panel title={t.guide.secFleet} subtitle={t.guide.secFleetBody} icon={<Warehouse />} aside={view.fleet.length > 0 && <span className="tabular font-mono text-[11.5px] font-semibold text-muted">{view.fleet.length}</span>}>
      {view.fleet.length === 0 ? (
        <div className="flex items-center gap-4 px-6 py-6">
          <Warehouse className="size-7 shrink-0 text-muted" strokeWidth={1.5} />
          <p className="max-w-[70ch] text-[12.5px] leading-relaxed text-fg-2">{t.guide.fleetEmpty}</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 p-4">
          {view.fleet.map((f) => {
            const grounded = f.condition < 40 || f.due.grounded;
            const tone: GaugeTone = grounded ? "danger" : f.condition < 70 ? "warn" : "ok";
            return (
              <article key={f.id} className="flex min-w-0 flex-col overflow-hidden rounded-[14px] border border-line bg-surface-2/30">
                <AircraftPhoto title={f.title} cls={f.class} className="h-[132px] w-full">
                  <div className="absolute inset-0 bg-[linear-gradient(0deg,rgb(7_9_20/0.82)_0%,rgb(7_9_20/0.15)_55%,transparent_75%)]" />
                  <div className="absolute inset-x-3.5 bottom-3 flex items-end gap-2 text-white">
                    <div className="min-w-0 flex-1">
                      <div className="font-mono text-[19px] font-bold leading-none tracking-[0.04em]">{f.registration}</div>
                      <div className="mt-1 truncate text-[11.5px] text-white/75">{f.title || clsName(f.class, view.classes)}</div>
                    </div>
                    {grounded && <span className="shrink-0 rounded-full bg-danger px-2 py-0.5 text-[11px] font-semibold text-white">{t.hangar.grounded}</span>}
                  </div>
                </AircraftPhoto>
                <div className="flex flex-1 flex-col gap-3.5 px-3.5 pb-3.5 pt-3">
                  <div className="tabular flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-fg-2">
                    <span>{clsName(f.class, view.classes)}</span>
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="size-3 text-muted" />
                      <span className="font-mono font-semibold text-fg">{f.location}</span>
                    </span>
                    <span>{t.hangar.hours(hours(f.hours))}</span>
                  </div>
                  <div>
                    <div className="flex items-baseline justify-between">
                      <span className="text-[11.5px] text-muted">{t.hangar.condition}</span>
                      <span className={clsx("num text-[17px]", tone === "ok" ? "text-fg" : tone === "warn" ? "text-warn" : "text-danger")}>{num(f.condition)}%</span>
                    </div>
                    <Bar className="mt-1.5 h-2" value={f.condition / 100} tone={tone} ticks={10} />
                  </div>
                  <MaintenanceBlock f={f} />
                  <div className="mt-auto flex items-center gap-2 border-t border-line pt-3">
                    <Button size="sm" variant="secondary" icon={<Wrench className="size-3.5" />} disabled={f.condition >= 99.5} loading={busy === `r-${f.id}`} onClick={() => run(`r-${f.id}`, () => careerApi.repair(f.id), t.hangar.repaired)}>
                      {t.hangar.repair}
                    </Button>
                    <span className="flex-1" />
                    <span className="tabular text-[11px] text-muted">
                      {t.hangar.price} {moneyShort(f.value)}
                    </span>
                    <Button size="sm" variant="ghost" onClick={() => setSell(f)}>
                      {t.hangar.sell}
                    </Button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
      <ConfirmDialog
        open={!!sell}
        onClose={() => setSell(null)}
        onConfirm={() => {
          const f = sell!;
          setSell(null);
          void run(`s-${f.id}`, () => careerApi.sell(f.id), t.hangar.sold);
        }}
        title={t.hangar.sellConfirm}
        confirmLabel={t.hangar.sell}
        danger
      >
        {t.hangar.sellBody}
      </ConfirmDialog>
    </Panel>
  );
}

function Market({ view }: { view: CareerView }) {
  const t = useCareerT();
  const lang = useLang((s) => s.lang);
  const [buy, setBuy] = useState<ClassInfo | null>(null);
  const p = view.pilot!;
  const can = (c: ClassInfo) => c.licenses.every((l) => p.licenses.includes(l));
  const mult = p.difficulty === "easy" ? 0.6 : p.difficulty === "realistic" ? 1.4 : 1;
  const short = (id: string) => view.licenses.find((l) => l.id === id)?.short ?? id.toUpperCase();
  return (
    <Panel title={t.guide.secMarket} subtitle={t.guide.secMarketBody} icon={<ShoppingCart />}>
      {!p.canContract && <p className="border-b border-line bg-warn/8 px-6 py-2.5 text-[12px] text-warn">{t.hangar.needCpl}</p>}
      <table className="w-full table-fixed text-[12.5px]">
        <thead>
          <tr className="border-b border-line bg-surface-2/50 text-left">
            <Th className="pl-6">{t.hangar.colClass}</Th>
            <Th className="w-[64px] text-right">{t.hangar.colSeats}</Th>
            <Th className="w-[86px] text-right">{t.hangar.colRent}</Th>
            <Th className="w-[92px] text-right">{t.hangar.colMaint}</Th>
            <Th className="w-[150px]">{t.hangar.colLicences}</Th>
            <Th className="w-[124px] pr-6 text-right">{t.hangar.colPrice}</Th>
          </tr>
        </thead>
        <tbody>
          {view.classes.map((c) => {
            const ok = can(c);
            return (
              <tr key={c.id} className={clsx("border-b border-line last:border-b-0", !ok && "text-muted")}>
                <td className="py-2.5 pl-6 pr-3">
                  <div className={clsx("truncate text-[13px] font-semibold", ok ? "text-fg" : "text-fg-2")}>{lang === "en" ? c.nameEn : c.nameTr}</div>
                  <div className="truncate text-[11px] text-muted">{c.examples}</div>
                </td>
                <td className="tabular px-3 py-2.5 text-right text-fg-2">{num(c.seats)}</td>
                <td className="tabular whitespace-nowrap px-3 py-2.5 text-right text-fg-2">{money(c.rentH * mult)}</td>
                <td className="tabular whitespace-nowrap px-3 py-2.5 text-right text-fg-2">{money(c.maintH * mult)}</td>
                <td className="px-3 py-2.5">
                  <span className="flex flex-wrap gap-1">
                    {c.licenses
                      .filter((l) => l !== "spl")
                      .map((l) => (
                        <Stamp key={l} code={short(l)} size="sm" state={p.licenses.includes(l) ? "held" : "locked"} />
                      ))}
                  </span>
                </td>
                <td className="py-2 pl-3 pr-6 text-right">
                  <Button size="sm" variant="secondary" className="min-w-[92px]" disabled={!p.canContract || !ok} onClick={() => setBuy(c)}>
                    {moneyShort(c.price * mult)}
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <BuyDialog cls={buy} view={view} onClose={() => setBuy(null)} price={buy ? buy.price * mult : 0} />
    </Panel>
  );
}

function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <th className={clsx("whitespace-nowrap px-3 py-2.5 text-[11.5px] font-semibold text-muted", className)}>{children}</th>;
}

function BuyDialog({ cls, view, onClose, price }: { cls: ClassInfo | null; view: CareerView; onClose: () => void; price: number }) {
  const t = useCareerT();
  const a = useAircraftT();
  const lang = useLang((s) => s.lang);
  const { data: options = [] } = useAircraftOptions(!!cls);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const fitting = options.filter((o) => o.class === cls?.id);
  const chosen = title || fitting[0]?.title || "";
  const buy = async () => {
    if (!cls) return;
    setBusy(true);
    try {
      await careerApi.buy(cls.id, chosen);
      toast.success(t.hangar.bought);
      invalidateCareer();
      onClose();
    } catch (e) {
      notifyError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={!!cls} onClose={onClose} width={560} game="msfs">
      <DialogHeader title={cls ? (lang === "en" ? cls.nameEn : cls.nameTr) : ""} subtitle={t.hangar.buyHint} icon={<ShoppingCart className="size-5" />} onClose={onClose} />
      <DialogBody className="flex flex-col gap-3">
        <div className="flex items-center justify-between rounded-xl border border-line bg-surface-2/60 px-4 py-3">
          <span className="text-[11.5px] text-muted">{t.hangar.price}</span>
          <span className="num text-[22px] text-fg">{money(price)}</span>
        </div>
        {fitting.length > 0 ? (
          <div className="grid max-h-[260px] grid-cols-2 gap-2 overflow-y-auto">
            {fitting.map((o) => (
              <button
                key={o.title}
                type="button"
                onClick={() => setTitle(o.title)}
                className={clsx(
                  "flex items-center gap-2.5 rounded-xl border p-1.5 pr-3 text-left text-[12px]",
                  chosen === o.title ? "border-[color-mix(in_oklab,var(--accent)_55%,transparent)] bg-[color-mix(in_oklab,var(--accent)_7%,transparent)] text-fg" : "border-line text-fg-2 hover:bg-surface-2",
                )}
              >
                <AircraftPhoto title={o.title} option={o} cls={o.class} className="aspect-[16/10] w-16 shrink-0 rounded-lg" />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-semibold text-fg">{o.realType || o.title}</span>
                  {o.realType && o.realType !== o.title && <span className="truncate text-[11px] text-muted">{o.title}</span>}
                  {o.origin === "mod" && (
                    <span className="mt-0.5 flex min-w-0 items-center gap-1">
                      <Badge className="h-4 px-1.5 text-[10px]">{a.mod}</Badge>
                      <span className="truncate text-[10.5px] text-muted">{o.package?.title}</span>
                    </span>
                  )}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t.pick.manualTitle} />
        )}
        {view.pilot && view.pilot.money < price && <p className="text-[12px] text-warn">{t.hangar.loanHint}</p>}
      </DialogBody>
      <DialogFooter>
        <Button variant="primary" loading={busy} onClick={buy}>
          {t.hangar.buyFor(money(price))}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

function SimAircraft({ view }: { view: CareerView }) {
  const t = useCareerT();
  const a = useAircraftT();
  const { data: options = [], refetch, isFetching } = useAircraftOptions(true);
  const [q, setQ] = useState("");
  const [src, setSrc] = useState<"all" | "sim" | "mod">("all");
  const [open, setOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const counts = useMemo(() => ({ all: options.length, sim: options.filter((o) => o.origin !== "mod").length, mod: options.filter((o) => o.origin === "mod").length }), [options]);
  const list = useMemo(() => {
    const k = q.trim().toLowerCase();
    return options.filter(
      (o) =>
        (src === "all" || (src === "mod") === (o.origin === "mod")) &&
        (!k || `${o.title} ${o.realType} ${o.icaoType} ${o.package?.title ?? ""} ${o.package?.creator ?? ""}`.toLowerCase().includes(k)),
    );
  }, [options, q, src]);
  const save = async (f: () => Promise<void>) => {
    try {
      await f();
      invalidateCareer();
    } catch (e) {
      notifyError(e);
    }
  };
  const refresh = () => {
    setRefreshing(true);
    careerApi
      .refreshAircraft()
      .then(() => new Promise((r) => setTimeout(r, 2500)))
      .then(() => refetch())
      .catch(notifyError)
      .finally(() => setRefreshing(false));
  };
  const selectCls = "h-8 w-full rounded-full border border-line-strong bg-surface-2 px-3 text-[12px] outline-none focus:border-accent";
  return (
    <Disclosure
      open={open}
      onToggle={() => setOpen((v) => !v)}
      title={t.guide.secSim}
      eyebrow={options.length > 0 ? a.count(counts.all, counts.mod) : t.hangar.simAircraftHint}
      icon={<Search />}
      aside={
        <Button size="sm" variant="ghost" icon={<RefreshCw className={clsx("size-3.5", (refreshing || isFetching) && "animate-spin")} />} disabled={refreshing} onClick={refresh}>
          {t.hangar.refresh}
        </Button>
      }
    >
      <div className="flex items-center gap-2 border-b border-line px-4 py-3">
        <Input className="min-w-0 flex-1" value={q} onChange={(e) => setQ(e.target.value)} placeholder={a.search} icon={<Search className="size-4" />} />
        <Segmented
          id="hangar-source"
          value={src}
          onChange={setSrc}
          options={[
            { value: "all", label: a.filter.all, count: counts.all },
            { value: "sim", label: a.filter.sim, count: counts.sim },
            { value: "mod", label: a.filter.mod, count: counts.mod },
          ]}
        />
      </div>
      <p className="border-b border-line bg-surface-2/40 px-6 py-2.5 text-[11.5px] leading-relaxed text-fg-2">{a.hangarHint}</p>
      {list.length === 0 ? (
        <p className="px-6 py-5 text-[12.5px] text-fg-2">{options.length === 0 ? t.hangar.noSimAircraft : src === "mod" && counts.mod === 0 ? a.noMods : a.noMatch}</p>
      ) : (
        <ul className="max-h-[480px] overflow-y-auto">
          {list.map((o) => {
            const manualClass = o.classSource === "user";
            const manualLoading = o.loadingSource === "user";
            const meta = [
              o.realType && o.realType !== o.title ? o.realType : "",
              o.package?.title ?? "",
              o.origin === "mod" ? a.activeIn(o.sims) : "",
              o.liveries.length > 1 ? t.pick.liveries(o.liveries.length) : "",
            ].filter(Boolean);
            return (
              <li key={o.title} className="flex items-center gap-3 border-b border-line py-2.5 pl-3 pr-4 last:border-b-0">
                <AircraftPhoto title={o.title} option={o} cls={o.class} className="aspect-[16/10] w-[64px] shrink-0 rounded-md" />
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate text-[12.5px] font-medium text-fg">{o.title}</span>
                    {o.origin === "mod" && (
                      <span className="shrink-0 rounded-full border border-line-strong px-1.5 font-mono text-[9.5px] font-semibold uppercase leading-[16px] tracking-[0.08em] text-fg-2">{a.mod}</span>
                    )}
                  </div>
                  {meta.length > 0 && <div className="mt-0.5 truncate text-[11px] text-muted">{meta.join(" · ")}</div>}
                </div>
                <label className="flex w-[212px] shrink-0 flex-col gap-1">
                  <span className="truncate font-mono text-[9.5px] font-semibold uppercase tracking-[0.1em] text-muted">
                    {a.loading.label} · {manualLoading ? a.classManual : a.classAuto}
                  </span>
                  <select
                    value={manualLoading ? (o.managesOwnLoading ? "own" : "modstead") : "auto"}
                    onChange={(e) => save(() => careerApi.setLoading(o.title, e.target.value === "auto" ? null : e.target.value === "own"))}
                    className={clsx(selectCls, "text-fg")}
                    aria-label={a.setLoading}
                  >
                    <option value="auto">{a.loading.auto(o.autoLoading)}</option>
                    <option value="own">{a.loading.own}</option>
                    <option value="modstead">{a.loading.modstead}</option>
                  </select>
                </label>
                <label className="flex w-[248px] shrink-0 flex-col gap-1">
                  <span className="truncate font-mono text-[9.5px] font-semibold uppercase tracking-[0.1em] text-muted" title={manualClass ? undefined : a.basis[o.autoSource]}>
                    {a.setClass} · {manualClass ? a.classManual : `${a.classAuto}${a.basisShort[o.autoSource] ? ` · ${a.basisShort[o.autoSource]}` : ""}`}
                  </span>
                  <select
                    value={manualClass ? (o.class ?? "") : ""}
                    onChange={(e) => save(() => careerApi.setClass(o.title, (e.target.value || null) as AircraftClass | null))}
                    className={clsx(selectCls, o.class ? "text-fg" : "text-warn")}
                    aria-label={t.hangar.setClass}
                  >
                    <option value="">{o.autoClass ? a.auto(clsName(o.autoClass, view.classes)) : a.autoUnknown}</option>
                    {view.classes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {clsName(c.id, view.classes)}
                      </option>
                    ))}
                  </select>
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </Disclosure>
  );
}

function Finance({ view }: { view: CareerView }) {
  const t = useCareerT();
  const p = view.pilot!;
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState<"b" | "r" | null>(null);
  const n = Math.max(0, Math.round(Number(amount.replace(/[^\d]/g, "")) || 0));
  const used = p.creditLimit > 0 ? p.loan / p.creditLimit : 0;
  const run = async (k: "b" | "r") => {
    setBusy(k);
    try {
      await (k === "b" ? careerApi.borrow(n) : careerApi.repay(n));
      setAmount("");
      invalidateCareer();
    } catch (e) {
      notifyError(e);
    } finally {
      setBusy(null);
    }
  };
  return (
    <Panel title={t.guide.secMoney} subtitle={t.guide.secMoneyBody} icon={<Wallet />}>
      <div className="flex flex-col gap-3.5 px-6 py-4">
        <div>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[11.5px] text-muted">{t.hangar.loan}</span>
            <span className="tabular text-[12px] text-muted">
              <b className={clsx("font-semibold", p.loan > 0 ? "text-warn" : "text-fg")}>{moneyShort(p.loan)}</b> / {moneyShort(p.creditLimit)}
            </span>
          </div>
          <Bar className="mt-2 h-2" value={used} tone={used > 0.8 ? "danger" : used > 0.5 ? "warn" : "accent"} ticks={10} />
        </div>
        <Input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={t.hangar.amount} icon={<Landmark className="size-4" />} inputClassName="tabular" disabled={!p.canContract} />
        <div className="flex gap-2">
          <Button className="flex-1" variant="secondary" disabled={!p.canContract || n <= 0} loading={busy === "b"} onClick={() => run("b")}>
            {t.hangar.borrow}
          </Button>
          <Button className="flex-1" variant="secondary" disabled={p.loan <= 0 || n <= 0} loading={busy === "r"} onClick={() => run("r")}>
            {t.hangar.repay}
          </Button>
        </div>
        {!p.canContract && <p className="text-[11.5px] leading-relaxed text-warn">{t.hangar.needCpl}</p>}
      </div>
    </Panel>
  );
}

function Ledger() {
  const t = useCareerT();
  const { data: rows = [] } = useLedger();
  return (
    <Panel title={t.hangar.ledger} icon={<Landmark />}>
      {rows.length === 0 ? (
        <p className="px-6 py-5 text-[12.5px] text-fg-2">{t.hangar.ledgerEmpty}</p>
      ) : (
        <ul className="max-h-[520px] overflow-y-auto">
          {rows.slice(0, 80).map((r, i) => (
            <li key={`${r.ts}-${i}`} className="flex items-center gap-3 border-b border-line px-6 py-2.5 last:border-b-0">
              <span className={clsx("size-1.5 shrink-0 rounded-full", r.amount >= 0 ? "bg-ok" : "bg-fg-2/40")} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12.5px] text-fg">{t.ledgerKinds[r.kind] ?? r.kind}</div>
                <div className="truncate font-mono text-[10.5px] text-muted">
                  {dateTime(r.ts)}
                  {r.detail && ` · ${r.kind === "loan" && /^\d+$/.test(r.detail) ? `${t.hangar.loan} ${money(Number(r.detail))}` : r.detail}`}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className={clsx("tabular text-[12.5px] font-semibold", r.amount >= 0 ? "text-ok" : "text-fg")}>{money(r.amount, true)}</div>
                <div className="tabular text-[10.5px] text-muted">{money(r.balance)}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
