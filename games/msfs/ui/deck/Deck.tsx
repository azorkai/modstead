// Uçuş ekranı: ikinci ekran, Modstead'in ayrı penceresi ya da tablet için EFB tarzı uçuş arkadaşı. Yalnızca okur.
// Yerleşim pencereye göre: yatay tablet (harita ~%60 + yan kartlar), dikey (harita üstte, kartlar altta, kayar)
// ve küçük pencere (harita + özet sütunu). Veri: canlı durum ≈1 sn, kariyer ≈5 sn, iz ≈10 sn, hava ≈5 dk.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import clsx from "clsx";
import { useQuery } from "@tanstack/react-query";
import { KeyRound, Maximize, Minimize, Moon, Sun, Info, Unplug, WifiOff, MonitorSmartphone } from "lucide-react";
import { Badge, Button, Progress, Skeleton } from "@/ui";
import { careerApi } from "../career/api";
import { useCareerT } from "../career/i18n";
import { ck, useTrack } from "../career/queries";
import type { MapPoint } from "../career/RouteMap";
import type { ActiveView, TrackPoint } from "../career/types";
import { num } from "../career/format";
import { distanceNm } from "./calc";
import { DestinationCard, FuelCard, JobCard, ScoreCard } from "./cards";
import { BurnMeter, Smoother, useLiveFeed, useNow, type Feed } from "./feed";
import { useDeckT } from "./i18n";
import { buildModel, type DeckModel } from "./model";
import { DataStrip, KindIcon, MapPanel, ProgressPanel, Vitals } from "./parts";

type Layout = "landscape" | "portrait" | "compact";

function measure(): { layout: Layout; w: number } {
  const [w, h] = [window.innerWidth, window.innerHeight];
  const layout: Layout = w <= 700 && w > h ? "compact" : w >= 900 && w > h ? "landscape" : "portrait";
  return { layout, w };
}

function useLayout() {
  const [s, set] = useState(measure);
  useEffect(() => {
    const on = () => set(measure());
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return s;
}

/** Görüntüleyene özel küçük tercihler (izleme, yön, tema); depolama kapalıysa varsayılanla çalışır. */
function usePersisted<T extends string>(key: string, initial: T, allowed: readonly T[]): [T, (v: T) => void] {
  const [v, setV] = useState<T>(() => {
    try {
      const s = localStorage.getItem(key) as T | null;
      return s !== null && allowed.includes(s) ? s : initial;
    } catch {
      return initial;
    }
  });
  const set = useCallback(
    (x: T) => {
      setV(x);
      try {
        localStorage.setItem(key, x);
      } catch {
        /* depolama kapalı olabilir */
      }
    },
    [key],
  );
  return [v, set];
}

export const THEME_KEY = "modstead.deck.theme";

function useFullscreen() {
  type Doc = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => void; webkitFullscreenEnabled?: boolean };
  type El = HTMLElement & { webkitRequestFullscreen?: () => void };
  const doc = document as Doc;
  const current = () => !!(document.fullscreenElement ?? doc.webkitFullscreenElement);
  const supported = !!(document.fullscreenEnabled || doc.webkitFullscreenEnabled);
  const [on, setOn] = useState(current);
  useEffect(() => {
    const h = () => setOn(current());
    document.addEventListener("fullscreenchange", h);
    document.addEventListener("webkitfullscreenchange", h);
    return () => {
      document.removeEventListener("fullscreenchange", h);
      document.removeEventListener("webkitfullscreenchange", h);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const toggle = () => {
    const el = document.documentElement as El;
    try {
      if (current()) {
        if (document.exitFullscreen) void document.exitFullscreen().catch(() => {});
        else doc.webkitExitFullscreen?.();
      } else if (el.requestFullscreen) void el.requestFullscreen().catch(() => {});
      else el.webkitRequestFullscreen?.();
    } catch {
      /* tarayıcı reddetti */
    }
  };
  return { supported, on, toggle };
}

/** Ekranı açık tutma: yalnızca güvenli bağlamda (HTTPS ya da bu makine) çalışır; yerel ağda (HTTP) yoktur. */
function useWakeLock() {
  const supported = typeof navigator !== "undefined" && "wakeLock" in navigator && window.isSecureContext;
  const [on, setOn] = useState(false);
  const lock = useRef<WakeLockSentinel | null>(null);
  const want = useRef(false);
  const acquire = useCallback(async () => {
    try {
      const s = await navigator.wakeLock.request("screen");
      lock.current = s;
      setOn(true);
      s.addEventListener("release", () => setOn(false));
    } catch {
      setOn(false);
    }
  }, []);
  useEffect(() => {
    // Sekme gizlenince kilit düşer; görünür olunca istenmişse yeniden alınır.
    const h = () => {
      if (want.current && document.visibilityState === "visible") void acquire();
    };
    document.addEventListener("visibilitychange", h);
    return () => document.removeEventListener("visibilitychange", h);
  }, [acquire]);
  const toggle = () => {
    if (want.current) {
      want.current = false;
      void lock.current?.release();
      lock.current = null;
      setOn(false);
    } else {
      want.current = true;
      void acquire();
    }
  };
  return { supported, on, toggle };
}

/** Yedek meydanın konumu: uçuş kâğıdında yalnızca adı ve uzaklığı var; varışın çevresindeki havalimanlarından bulunur. */
function useAlternatePos(active: ActiveView | null): MapPoint | null {
  const alt = active?.dispatch?.alternate ?? null;
  const to = active?.to ?? null;
  const box = useMemo(() => {
    if (!alt || !to) return null;
    const d = alt.distanceNm / 60 + 0.3;
    const dl = d / Math.max(0.2, Math.cos((to.lat * Math.PI) / 180));
    return { south: to.lat - d, north: to.lat + d, west: to.lon - dl, east: to.lon + dl };
  }, [alt, to]);
  const { data } = useQuery({
    queryKey: ["msfs", "deck", "alternate", alt?.icao ?? "", box],
    queryFn: () => careerApi.mapAirports(box!, 2),
    enabled: !!box,
    staleTime: Infinity,
  });
  const hit = data?.find((a) => a.icao === alt?.icao);
  return useMemo(() => (hit ? { lat: hit.lat, lon: hit.lon, icao: hit.icao } : null), [hit?.icao, hit?.lat, hit?.lon]); // eslint-disable-line react-hooks/exhaustive-deps
}

type Conn = "connecting" | "ok" | "unreachable" | "unauthorized";

function connection(feed: Feed): Conn {
  if (feed.error?.code === "unauthorized") return "unauthorized";
  if (feed.okAt === null) return feed.failures > 0 ? "unreachable" : "connecting";
  // Tek bir kayıp yanıt bağlantı kopması sayılmaz.
  return feed.failures >= 2 ? "unreachable" : "ok";
}

export function Deck() {
  const { layout, w } = useLayout();
  const smoother = useMemo(() => new Smoother(), []);
  const burn = useMemo(() => new BurnMeter(), []);
  const feed = useLiveFeed((l, at) => {
    smoother.push(l.inFlight ? l.telemetry : null, l.paused);
    burn.push(l.inFlight ? l.telemetry : null, at);
  });
  const now = useNow();
  const live = feed.live;
  const conn = connection(feed);

  const { data: view = null } = useQuery({ queryKey: ck.state, queryFn: careerApi.state, refetchInterval: 5000, staleTime: 4000 });
  const active = view?.active ?? null;
  const { data: metars } = useQuery({ queryKey: ck.weather, queryFn: careerApi.weather, enabled: !!view?.pilot, refetchInterval: 5 * 60_000, staleTime: 4 * 60_000 });
  const flying = !!active && !!live?.flight;
  const { data: fetched } = useTrack(flying);

  // İz: sunucudan ≈10 sn'de bir; aradaki konumlar canlı örneklerden eklenir.
  const [tail, setTail] = useState<TrackPoint[]>([]);
  useEffect(() => setTail([]), [fetched]);
  useEffect(() => {
    const tel = live?.telemetry;
    if (!flying || !live?.inFlight || !tel) return;
    setTail((prev) => {
      const last = prev[prev.length - 1] ?? fetched?.[fetched.length - 1];
      if (last && distanceNm({ lat: last[0], lon: last[1] }, tel) < 0.05) return prev;
      return [...prev.slice(-600), [tel.lat, tel.lon, tel.altFt, tel.gsKt]];
    });
  }, [live]); // eslint-disable-line react-hooks/exhaustive-deps
  const track = useMemo(() => (flying && (fetched?.length || tail.length) ? [...(fetched ?? []), ...tail] : undefined), [flying, fetched, tail]);

  const alternate = useAlternatePos(active);
  const m = buildModel({ now, view, live, course: smoother.track(), burnLbH: burn.rate(), metars, alternate });

  const [follow, setFollowS] = usePersisted("modstead.deck.follow", "on", ["on", "off"] as const);
  const [orient, setOrientS] = usePersisted("modstead.deck.orient", "north", ["north", "track"] as const);
  const setFollow = useCallback((on: boolean) => setFollowS(on ? "on" : "off"), [setFollowS]);
  const setTrackUp = useCallback((on: boolean) => setOrientS(on ? "track" : "north"), [setOrientS]);

  const banner = <ConnBanner conn={conn} feed={feed} m={m} now={now} />;
  const map = (cls: string) => (
    <MapPanel m={m} track={track} smooth={smoother.get} follow={follow === "on"} setFollow={setFollow} trackUp={orient === "track"} setTrackUp={setTrackUp} banner={banner} className={cls} />
  );
  const noCareer = view && !view.pilot;
  // Kariyer durumu gelene kadar iskelet: "aktif iş yok" gibi yanlış bir şey söylenmesin.
  const cards = !view
    ? [<Skeleton key="a" className="h-[260px] shrink-0" />, <Skeleton key="b" className="h-[180px] shrink-0" />, <Skeleton key="c" className="h-[160px] shrink-0" />, <Skeleton key="d" className="h-[150px] shrink-0" />]
    : noCareer
      ? [<NoCareer key="nc" />]
      : [<DestinationCard key="d" m={m} />, <FuelCard key="f" m={m} />, <ScoreCard key="s" m={m} />, <JobCard key="j" m={m} />];
  // Bağlantı koptuysa son veriler soluk kalır (eski olduğu belli olsun).
  const stale = conn === "unreachable" || conn === "unauthorized";

  return (
    <div className="relative flex h-full flex-col bg-bg">
      {layout === "landscape" ? (
        <>
          <Header m={m} conn={conn} feed={feed} now={now} compact={false} />
          <main className="flex min-h-0 flex-1 gap-3 p-3">
            <div className="flex min-w-0 flex-1 flex-col gap-3">
              {/* On sütun yalnızca her hücre ~88 px'e sığınca; değilse iki satır. */}
              <DataStrip m={m} cols={w - 36 - Math.min(480, Math.max(320, w * 0.32)) >= 880 ? 10 : 5} size="lg" stale={stale} />
              {map("flex-1")}
              <ProgressPanel m={m} cols={5} />
            </div>
            <aside className="flex w-[clamp(320px,32vw,480px)] shrink-0 flex-col gap-3 overflow-y-auto pb-1">
              {cards}
              <WakeHint />
            </aside>
          </main>
        </>
      ) : layout === "portrait" ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <Header m={m} conn={conn} feed={feed} now={now} compact={w < 560} tiny={w < 480} sticky />
          <main className="flex flex-col gap-3 p-3">
            <DataStrip m={m} cols={w >= 560 ? 5 : 4} size={w >= 560 ? "lg" : "md"} stale={stale} />
            {map("h-[min(54vh,640px)] min-h-[300px] shrink-0")}
            <ProgressPanel m={m} cols={w >= 600 ? 5 : 3} />
            {w >= 640 && !noCareer ? (
              <div className="grid grid-cols-2 items-start gap-3">
                <div className="flex min-w-0 flex-col gap-3">
                  {cards[0]}
                  {cards[3]}
                </div>
                <div className="flex min-w-0 flex-col gap-3">
                  {cards[1]}
                  {cards[2]}
                </div>
              </div>
            ) : (
              cards
            )}
            <WakeHint />
          </main>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <Header m={m} conn={conn} feed={feed} now={now} compact sticky />
          <main className="flex flex-col gap-2 p-2">
            {/* İlk ekran: harita ve en sık bakılan sayılar. */}
            <div className="flex gap-2" style={{ height: "max(300px, calc(100dvh - 64px))" }}>
              {map("min-w-0 flex-1")}
              <div className="flex w-[212px] shrink-0 flex-col gap-2">
                <Vitals m={m} />
                <MiniProgress m={m} />
              </div>
            </div>
            <ProgressPanel m={m} cols={3} />
            {cards}
          </main>
        </div>
      )}
      {conn === "unauthorized" && <Unauthorized />}
    </div>
  );
}

// ───────────── Üst çubuk ─────────────

function ToolButton({ label, onClick, active, children }: { label: string; onClick: () => void; active?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      onClick={onClick}
      className={clsx("inline-flex size-11 shrink-0 items-center justify-center rounded-xl text-fg-2 transition-colors hover:bg-surface-2 hover:text-fg", active && "bg-surface-2 text-accent")}
    >
      {children}
    </button>
  );
}

function Header({ m, conn, feed, now, compact, tiny, sticky }: { m: DeckModel; conn: Conn; feed: Feed; now: number; compact: boolean; tiny?: boolean; sticky?: boolean }) {
  const t = useDeckT();
  const ct = useCareerT();
  const fs = useFullscreen();
  const wake = useWakeLock();
  const [theme, setTheme] = useState(() => (document.documentElement.dataset.theme === "light" ? "light" : "dark"));
  const flipTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    setTheme(next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      /* depolama kapalı olabilir */
    }
  };
  const job = m.active?.job ?? null;
  const tail = m.live?.aircraft?.atcId || null;
  return (
    <header className={clsx("z-10 flex shrink-0 items-center gap-3 border-b border-line bg-bg-2", compact ? "h-14 px-2" : "h-16 px-4", sticky && "sticky top-0")}>
      {!tiny && (
        <span className="accent-soft flex size-10 shrink-0 items-center justify-center rounded-xl">
          <KindIcon kind={job?.kind ?? null} className="size-[18px]" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        {!compact && (
          <div className="truncate text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">
            {m.view ? `${t.title} · ${job ? ct.kinds[job.kind] : t.freeFlight}` : "Modstead"}
          </div>
        )}
        <div className="flex min-w-0 items-center gap-2">
          {!m.view ? (
            <span className="text-display truncate text-[18px] font-semibold text-fg">{t.title}</span>
          ) : job ? (
            <span className="inline-flex shrink-0 items-center gap-2 font-mono text-[19px] font-bold tracking-tight text-fg">
              {job.from}
              <svg viewBox="0 0 40 10" className="h-2.5 w-7 shrink-0 text-accent" aria-hidden>
                <path d="M1 5h34M31 1.5 37 5l-6 3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {job.to}
            </span>
          ) : (
            <span className="text-display truncate text-[18px] font-semibold text-fg">{t.freeFlight}</span>
          )}
          {tail && !compact && <span className="truncate font-mono text-[12px] text-muted">{tail}</span>}
        </div>
      </div>
      {m.flight && !compact && <Badge tone="accent">{ct.phases[m.flight.phase] ?? m.flight.phase}</Badge>}
      <StatusPill conn={conn} feed={feed} m={m} now={now} compact={compact} dotOnly={tiny} />
      <div className="flex shrink-0 items-center">
        {wake.supported && (
          <ToolButton label={wake.on ? t.controls.wakeOn : t.controls.wakeOff} onClick={wake.toggle} active={wake.on}>
            <MonitorSmartphone className="size-[18px]" />
          </ToolButton>
        )}
        <ToolButton label={theme === "dark" ? t.controls.light : t.controls.dark} onClick={flipTheme}>
          {theme === "dark" ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
        </ToolButton>
        {fs.supported && (
          <ToolButton label={fs.on ? t.controls.exitFullscreen : t.controls.fullscreen} onClick={fs.toggle}>
            {fs.on ? <Minimize className="size-[18px]" /> : <Maximize className="size-[18px]" />}
          </ToolButton>
        )}
      </div>
    </header>
  );
}

function StatusPill({ conn, feed, m, now, compact, dotOnly }: { conn: Conn; feed: Feed; m: DeckModel; now: number; compact: boolean; dotOnly?: boolean }) {
  const t = useDeckT();
  const ct = useCareerT();
  const live = m.live;
  let tone: "ok" | "warn" | "danger" | "muted";
  let label: string;
  let sub: string | null = null;
  if (conn === "unauthorized") {
    tone = "danger";
    label = t.status.unauthorized;
  } else if (conn === "unreachable") {
    tone = "danger";
    label = t.status.unreachable;
    sub = feed.retryAt && feed.retryAt > now ? t.status.retryIn(Math.max(1, Math.ceil((feed.retryAt - now) / 1000))) : t.status.retrying;
  } else if (conn === "connecting" || !live) {
    tone = "muted";
    label = t.status.connecting;
  } else if (live.link.state !== "connected") {
    tone = "warn";
    label = live.link.state === "connecting" ? t.status.simConnecting : t.status.simWaiting;
  } else if (live.paused) {
    tone = "warn";
    label = t.status.paused;
  } else {
    tone = "ok";
    label = t.status.connected(ct.sim[live.link.sim ?? ""] ?? live.link.sim ?? "MSFS");
  }
  return (
    <span
      role="status"
      title={sub ? `${label} · ${sub}` : label}
      aria-label={label}
      className={clsx(
        "inline-flex h-9 min-w-0 shrink items-center gap-2 rounded-full border bg-surface text-[12px] font-medium",
        dotOnly ? "w-9 shrink-0 justify-center" : "px-3",
        tone === "danger" ? "border-danger/30" : "border-line",
      )}
    >
      <span className={clsx("size-2 shrink-0 rounded-full", tone === "ok" ? "pulse-dot bg-ok" : tone === "warn" ? "bg-warn" : tone === "danger" ? "bg-danger" : "bg-muted")} />
      {!dotOnly && <span className={clsx("truncate", compact && "max-w-[120px]", tone === "danger" ? "text-danger" : "text-fg")}>{label}</span>}
      {sub && !compact && <span className="hidden shrink-0 text-muted min-[1100px]:inline">· {sub}</span>}
    </span>
  );
}

// ───────────── Durum bildirimleri ─────────────

function ConnBanner({ conn, feed, m, now }: { conn: Conn; feed: Feed; m: DeckModel; now: number }) {
  const t = useDeckT();
  if (conn === "unreachable") {
    const stale = feed.okAt ? Math.round((now - feed.okAt) / 1000) : null;
    const retry = feed.retryAt && feed.retryAt > now ? t.status.retryIn(Math.max(1, Math.ceil((feed.retryAt - now) / 1000))) : t.status.retrying;
    return (
      <div className="pointer-events-auto flex max-w-[460px] items-center gap-3 rounded-2xl border border-danger/30 bg-surface px-3.5 py-2.5 shadow-lg">
        <WifiOff className="size-5 shrink-0 text-danger" />
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold text-fg">{t.status.unreachable}</div>
          <div className="text-[11.5px] leading-snug text-fg-2">{stale === null ? t.status.unreachableBody : `${t.status.stale(stale)} · ${retry}`}</div>
        </div>
        <Button variant="secondary" size="lg" onClick={feed.retry}>
          {t.status.retryNow}
        </Button>
      </div>
    );
  }
  if (conn === "ok" && m.live && m.live.link.state !== "connected") {
    return (
      <div className="flex max-w-[420px] items-center gap-2.5 rounded-2xl border border-line-strong bg-surface px-3.5 py-2.5 shadow-lg">
        <Unplug className="size-4 shrink-0 text-warn" />
        <span className="text-[12.5px] text-fg-2">{t.status.noSim}</span>
      </div>
    );
  }
  return null;
}

function Unauthorized() {
  const t = useDeckT();
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-[var(--scrim)] p-6">
      <div className="card max-w-[440px] p-6 text-center">
        <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-danger/10 text-danger">
          <KeyRound className="size-6" />
        </span>
        <h1 className="text-display mt-4 text-[20px] font-semibold text-fg">{t.status.unauthorized}</h1>
        <p className="mt-2 text-[13px] leading-relaxed text-fg-2">{t.status.unauthorizedBody}</p>
      </div>
    </div>
  );
}

function NoCareer() {
  const t = useDeckT();
  return (
    <section className="card p-5">
      <h2 className="text-display text-[16px] font-semibold text-fg">{t.noCareer}</h2>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-fg-2">{t.noCareerBody}</p>
    </section>
  );
}

/** Tablette ekranı açık tutma ipucu: tarayıcı yerel ağda (HTTP) ekran kilidini engelleyemez; taklit etmiyoruz. */
function WakeHint() {
  const t = useDeckT();
  const relevant = typeof window !== "undefined" && !("wakeLock" in navigator && window.isSecureContext) && !!window.matchMedia?.("(pointer: coarse)").matches;
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem("modstead.deck.wakeHint") === "seen";
    } catch {
      return false;
    }
  });
  if (!relevant || hidden) return null;
  return (
    <div className="flex shrink-0 items-start gap-3 rounded-2xl border border-info/25 bg-info/5 px-4 py-3">
      <Info className="mt-0.5 size-4 shrink-0 text-info" />
      <p className="min-w-0 flex-1 text-[12px] leading-relaxed text-fg-2">{t.controls.wakeHint}</p>
      <Button
        variant="ghost"
        size="lg"
        onClick={() => {
          setHidden(true);
          try {
            localStorage.setItem("modstead.deck.wakeHint", "seen");
          } catch {
            /* depolama kapalı olabilir */
          }
        }}
      >
        {t.controls.dismiss}
      </Button>
    </div>
  );
}

/** Küçük pencerede özet sütununun altı: evre ve rota ilerlemesi. */
function MiniProgress({ m }: { m: DeckModel }) {
  const t = useDeckT();
  const ct = useCareerT();
  const frac = m.flownNm !== null && m.totalNm ? m.flownNm / m.totalNm : null;
  return (
    <div className="card flex flex-1 flex-col justify-center gap-1.5 px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[12px] font-semibold text-fg">{m.flight ? (ct.phases[m.flight.phase] ?? m.flight.phase) : t.freeFlight}</span>
        {m.flight && <span className="tabular text-[12px] font-semibold text-accent">{m.flight.scoreNow}</span>}
      </div>
      <Progress value={frac ?? 0} />
      <div className="tabular flex justify-between text-[10.5px] text-muted">
        <span>{m.active?.job.from ?? ""}</span>
        <span>{m.remainingNm !== null ? `${num(m.remainingNm, 1)} nm` : ""}</span>
        <span>{m.active?.job.to ?? ""}</span>
      </div>
    </div>
  );
}
