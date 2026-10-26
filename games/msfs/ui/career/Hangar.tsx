// Hangar ve finans: bakiye/kredi, filo (bakım, satış), uçak satın alma, simdeki uçakların sınıfları, hesap hareketleri.

import { useMemo, useState } from "react";
import clsx from "clsx";
import { toast } from "sonner";
import { Landmark, Plane, RefreshCw, Search, ShoppingCart, Wallet, Warehouse, Wrench } from "lucide-react";
import { useLang } from "@/lib/i18n";
import { notifyError } from "@/shell/actions";
import { Badge, Button, ConfirmDialog, Dialog, DialogBody, DialogFooter, DialogHeader, Input, Progress } from "@/ui";
import { careerApi } from "./api";
import { className as clsName, dateTime, hours, money, moneyShort, num } from "./format";
import { useCareerT } from "./i18n";
import { MaintenanceBlock } from "./Maintenance";
import { invalidateCareer, useAircraftOptions, useLedger } from "./queries";
import type { AircraftClass, CareerView, ClassInfo, FleetView } from "./types";

export function Hangar({ view }: { view: CareerView }) {
  const t = useCareerT();
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-display text-[22px] font-semibold tracking-tight text-fg">{t.hangar.title}</h2>
        <p className="mt-0.5 text-[12.5px] text-fg-2">{t.hangar.subtitle}</p>
      </div>
      <div className="grid grid-cols-[1fr_380px] items-start gap-5">
        <div className="flex min-w-0 flex-col gap-5">
          <Fleet view={view} />
          <Market view={view} />
          <SimAircraft view={view} />
        </div>
        <div className="flex min-w-0 flex-col gap-5">
          <Finance view={view} />
          <Ledger />
        </div>
      </div>
    </div>
  );
}

function Card({ title, icon, aside, children }: { title: string; icon: React.ReactNode; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="card overflow-hidden">
      <header className="flex items-center gap-2.5 border-b border-line px-5 py-3.5">
        <span className="text-muted">{icon}</span>
        <h3 className="min-w-0 flex-1 text-[14px] font-semibold text-fg">{title}</h3>
        {aside}
      </header>
      {children}
    </section>
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
    <Card title={t.hangar.fleet} icon={<Warehouse className="size-4" />}>
      {view.fleet.length === 0 ? (
        <p className="px-5 py-5 text-[12.5px] text-fg-2">{t.hangar.fleetEmpty}</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 p-4">
          {view.fleet.map((f) => {
            const grounded = f.condition < 40 || f.due.grounded;
            return (
              <div key={f.id} className="rounded-[14px] border border-line bg-surface-2/40 p-3.5">
                <div className="flex items-start gap-3">
                  <div className="accent-soft flex size-10 shrink-0 items-center justify-center rounded-xl">
                    <Plane className="size-[18px]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[15px] font-semibold text-fg">{f.registration}</span>
                      {grounded && <Badge tone="danger">{t.hangar.grounded}</Badge>}
                    </div>
                    <div className="truncate text-[12px] text-fg-2">{f.title || clsName(f.class, view.classes)}</div>
                    <div className="mt-0.5 text-[11px] text-muted">
                      {clsName(f.class, view.classes)} · {t.hangar.at(f.location)} · {t.hangar.hours(hours(f.hours))}
                    </div>
                  </div>
                </div>
                <div className="mt-3">
                  <div className="mb-1 flex justify-between text-[11.5px]">
                    <span className="text-fg-2">{t.hangar.condition}</span>
                    <span className={clsx("tabular font-semibold", grounded ? "text-danger" : f.condition < 70 ? "text-warn" : "text-ok")}>{num(f.condition)}%</span>
                  </div>
                  <Progress value={f.condition / 100} tone={grounded ? "danger" : f.condition < 70 ? "accent" : "ok"} />
                </div>
                <MaintenanceBlock f={f} />
                <div className="mt-3 flex gap-2">
                  <Button size="sm" variant="secondary" icon={<Wrench className="size-3.5" />} disabled={f.condition >= 99.5} loading={busy === `r-${f.id}`} onClick={() => run(`r-${f.id}`, () => careerApi.repair(f.id), t.hangar.repaired)}>
                    {t.hangar.repair}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setSell(f)}>
                    {t.hangar.sell}
                  </Button>
                </div>
              </div>
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
    </Card>
  );
}

function Market({ view }: { view: CareerView }) {
  const t = useCareerT();
  const lang = useLang((s) => s.lang);
  const [buy, setBuy] = useState<ClassInfo | null>(null);
  const p = view.pilot!;
  const can = (c: ClassInfo) => c.licenses.every((l) => p.licenses.includes(l));
  const mult = p.difficulty === "easy" ? 0.6 : p.difficulty === "realistic" ? 1.4 : 1;
  return (
    <Card title={t.hangar.buy} icon={<ShoppingCart className="size-4" />}>
      {!p.canContract && <p className="border-b border-line bg-surface-2/40 px-5 py-2.5 text-[12px] text-warn">{t.hangar.needCpl}</p>}
      <ul>
        {view.classes.map((c) => (
          <li key={c.id} className={clsx("flex items-center gap-4 border-b border-line px-5 py-2.5 last:border-b-0", !can(c) && "opacity-55")}>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-semibold text-fg">{lang === "en" ? c.nameEn : c.nameTr}</div>
              <div className="truncate text-[11.5px] text-muted">{c.examples}</div>
            </div>
            <div className="hidden w-[150px] shrink-0 text-right text-[11px] text-fg-2 xl:block">
              <div>{t.hangar.rentRate(money(c.rentH * mult))}</div>
              <div>{t.hangar.maintRate(money(c.maintH * mult))}</div>
            </div>
            <Button size="sm" variant="secondary" disabled={!p.canContract || !can(c)} onClick={() => setBuy(c)}>
              {moneyShort(c.price * mult)}
            </Button>
          </li>
        ))}
      </ul>
      <BuyDialog cls={buy} view={view} onClose={() => setBuy(null)} price={buy ? buy.price * mult : 0} />
    </Card>
  );
}

function BuyDialog({ cls, view, onClose, price }: { cls: ClassInfo | null; view: CareerView; onClose: () => void; price: number }) {
  const t = useCareerT();
  const lang = useLang((s) => s.lang);
  const { data: options = [] } = useAircraftOptions(!!cls);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const fitting = options.filter((o) => o.class === cls?.id);
  const buy = async () => {
    if (!cls) return;
    setBusy(true);
    try {
      await careerApi.buy(cls.id, title || fitting[0]?.title || "");
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
    <Dialog open={!!cls} onClose={onClose} width={520} game="msfs">
      <DialogHeader title={cls ? (lang === "en" ? cls.nameEn : cls.nameTr) : ""} subtitle={t.hangar.buyHint} icon={<ShoppingCart className="size-5" />} onClose={onClose} />
      <DialogBody className="flex flex-col gap-3">
        <div className="flex items-center justify-between rounded-xl bg-surface-2/60 px-4 py-3">
          <span className="text-[12.5px] text-fg-2">{t.hangar.price}</span>
          <span className="tabular text-[18px] font-semibold text-fg">{money(price)}</span>
        </div>
        {fitting.length > 0 ? (
          <div className="flex max-h-[220px] flex-col gap-1 overflow-y-auto">
            {fitting.map((o) => (
              <button
                key={o.title}
                type="button"
                onClick={() => setTitle(o.title)}
                className={clsx("rounded-lg border px-3 py-2 text-left text-[12.5px]", (title || fitting[0].title) === o.title ? "border-[color-mix(in_oklab,var(--accent)_55%,transparent)] bg-[color-mix(in_oklab,var(--accent)_7%,transparent)] text-fg" : "border-line text-fg-2 hover:bg-surface-2")}
              >
                {o.title}
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
  const { data: options = [], refetch, isFetching } = useAircraftOptions(true);
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const k = q.trim().toLowerCase();
    return options.filter((o) => !k || o.title.toLowerCase().includes(k));
  }, [options, q]);
  const setClass = async (title: string, cls: AircraftClass | null) => {
    try {
      await careerApi.setClass(title, cls);
      invalidateCareer();
    } catch (e) {
      notifyError(e);
    }
  };
  return (
    <Card
      title={t.hangar.simAircraft}
      icon={<Plane className="size-4" />}
      aside={
        <Button
          size="sm"
          variant="ghost"
          icon={<RefreshCw className={clsx("size-3.5", isFetching && "animate-spin")} />}
          onClick={() =>
            careerApi
              .refreshAircraft()
              .then(() => setTimeout(() => void refetch(), 2500))
              .catch(notifyError)
          }
        >
          {t.hangar.refresh}
        </Button>
      }
    >
      <div className="flex flex-col gap-3 p-4">
        <p className="text-[12px] leading-relaxed text-fg-2">{t.hangar.simAircraftHint}</p>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.hangar.search} icon={<Search className="size-4" />} />
        {list.length === 0 ? (
          <p className="rounded-xl bg-surface-2/60 px-3 py-3 text-[12.5px] text-fg-2">{t.hangar.noSimAircraft}</p>
        ) : (
          <ul className="flex max-h-[360px] flex-col overflow-y-auto rounded-xl border border-line">
            {list.map((o) => (
              <li key={o.title} className="flex items-center gap-3 border-b border-line px-3 py-2 last:border-b-0">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12.5px] font-medium text-fg">{o.title}</div>
                  <div className="text-[11px] text-muted">
                    {t.hangar.source[o.classSource]}
                    {o.liveries.length > 1 && ` · ${t.pick.liveries(o.liveries.length)}`}
                  </div>
                </div>
                {o.managesOwnLoading && <Badge tone="info">EFB</Badge>}
                <select
                  value={o.class ?? ""}
                  onChange={(e) => setClass(o.title, (e.target.value || null) as AircraftClass | null)}
                  className={clsx("h-7 w-[180px] rounded-lg border border-line-strong bg-surface-2 px-2 text-[12px] outline-none", o.class ? "text-fg" : "text-warn")}
                  aria-label={t.hangar.setClass}
                >
                  <option value="">{t.hangar.unknownClass}</option>
                  {view.classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {clsName(c.id, view.classes)}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

function Finance({ view }: { view: CareerView }) {
  const t = useCareerT();
  const p = view.pilot!;
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState<"b" | "r" | null>(null);
  const n = Math.max(0, Math.round(Number(amount.replace(/[^\d]/g, "")) || 0));
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
    <Card title={t.hangar.finance} icon={<Wallet className="size-4" />}>
      <div className="flex flex-col gap-3 p-4">
        <div className="grid grid-cols-3 gap-2">
          <div className="well px-3 py-2.5">
            <div className="text-[11px] text-muted">{t.hangar.balance}</div>
            <div className="tabular mt-0.5 text-[15px] font-semibold text-fg">{moneyShort(p.money)}</div>
          </div>
          <div className="well px-3 py-2.5">
            <div className="text-[11px] text-muted">{t.hangar.loan}</div>
            <div className={clsx("tabular mt-0.5 text-[15px] font-semibold", p.loan > 0 ? "text-warn" : "text-fg")}>{moneyShort(p.loan)}</div>
          </div>
          <div className="well px-3 py-2.5">
            <div className="text-[11px] text-muted">{t.hangar.limit}</div>
            <div className="tabular mt-0.5 text-[15px] font-semibold text-fg">{moneyShort(p.creditLimit)}</div>
          </div>
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
        <p className="text-[11.5px] leading-relaxed text-muted">{p.canContract ? t.hangar.loanHint : t.hangar.needCpl}</p>
      </div>
    </Card>
  );
}

function Ledger() {
  const t = useCareerT();
  const { data: rows = [] } = useLedger();
  return (
    <Card title={t.hangar.ledger} icon={<Landmark className="size-4" />}>
      {rows.length === 0 ? (
        <p className="px-5 py-5 text-[12.5px] text-fg-2">{t.hangar.ledgerEmpty}</p>
      ) : (
        <ul className="max-h-[440px] overflow-y-auto">
          {rows.slice(0, 80).map((r, i) => (
            <li key={`${r.ts}-${i}`} className="flex items-center gap-3 border-b border-line px-5 py-2 last:border-b-0">
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12.5px] text-fg">{t.ledgerKinds[r.kind] ?? r.kind}</div>
                <div className="truncate text-[11px] text-muted">
                  {dateTime(r.ts)}
                  {r.detail && ` · ${r.kind === "loan" && /^\d+$/.test(r.detail) ? `${t.hangar.loan} ${money(Number(r.detail))}` : r.detail}`}
                </div>
              </div>
              <span className={clsx("tabular shrink-0 text-[12.5px] font-semibold", r.amount >= 0 ? "text-ok" : "text-fg-2")}>{money(r.amount, true)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
