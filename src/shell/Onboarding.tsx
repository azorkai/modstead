// İlk açılış: hoş geldin → bulunan oyunlar → güvenlik ve hesap.
// Kurulum taraması hoş geldin ekranında bütün oyunlar için aynı anda başlar; oyun adımına gelindiğinde sonuç hazırdır.
// Yalnızca bulunan oyunlar sorulur (öntanımlı seçili). Bulunamayanlar göze batmayan "klasörünü seç" yolunda durur;
// hiçbiri bulunamazsa boş durum aynı yolu açık gösterir. Sonraki adım da yalnızca seçilen oyunları ilgilendireni sorar.

import { useState, type FormEvent, type ReactNode } from "react";
import { AnimatePresence, LayoutGroup, MotionConfig, motion } from "motion/react";
import { ArrowRight, BadgeCheck, Check, ChevronDown, ClipboardCheck, ExternalLink, FolderOpen, FolderSearch, KeyRound, Link2, PackageCheck, ScanSearch, SearchX } from "lucide-react";
import clsx from "clsx";
import { useQueryClient } from "@tanstack/react-query";
import { useArt } from "@/lib/art";
import { useLang, useT } from "@/lib/i18n";
import { errorMessage, invoke } from "@/lib/ipc";
import { keys, updateSettings, useAppInfo, useDetectMany, useGamesStatus, useNexus, useNxmStatus } from "@/lib/queries";
import type { GameStatus, NexusStatus, NxmStatus } from "@/lib/types";
import { Badge, Button, Input, Segmented, Skeleton, Spinner, Switch } from "@/ui";
import { GAMES } from "@/games/registry";
import type { GameModule } from "@/games/types";
import { chooseGameFolder, notifyError, openUrl } from "./actions";
import { GameIcon } from "./GameIcon";
import { LogoMark, LogoTile } from "./Logo";
import { gamesSetting } from "./Rail";
import { WindowControls } from "./TopBar";

const IDS = GAMES.map((g) => g.id);
const NEXUS_KEYS = "https://next.nexusmods.com/settings/api-keys";
const EASE = [0.2, 0.7, 0.2, 1] as const;

// ───────────── Tarama ─────────────

const STORES: Record<string, string> = { steam: "Steam", gog: "GOG", epic: "Epic Games", xbox: "Xbox", store: "Microsoft Store" };

/** Kurulumun tek satırlık özeti: "Steam · 1.6.15 · SMAPI 4.5.2", "MSFS 2024 · Microsoft Store". */
function installLine(c: { label: string; store: string; version: string | null }): string {
  const store = STORES[c.store];
  const label = c.label.trim();
  const l = label.toLowerCase();
  // Etiket çoğu oyunda mağaza adının kendisidir ("STEAM", "Xbox"); öyleyse mağazanın düzgün adı yazılır.
  const parts = !store || l.includes(store.toLowerCase()) ? [l === store?.toLowerCase() ? store : label, c.version] : [store, c.version, label];
  return parts.filter(Boolean).join(" · ");
}

interface Scan {
  game: GameModule;
  /** Bu bilgisayarda kurulum bulundu (tarama, kayıtlı yol ya da elle seçilen klasör). */
  found: boolean;
  /** Tarama sürüyor ve henüz bir şey bulunmadı. */
  pending: boolean;
  /** Klasörü ilk kurulumda elle seçildi. */
  picked: boolean;
  installs: string[];
}

/** Bütün oyunlar için tarama (game_detect) ve kayıtlı durum (games_status), paralel. */
function useScan(picked: Record<string, GameStatus>): Scan[] {
  const detects = useDetectMany(IDS);
  const { data: statuses } = useGamesStatus();
  return GAMES.map((game, i) => {
    const q = detects[i];
    const manual = picked[game.id];
    const status = statuses?.find((s) => s.id === game.id)?.status;
    const candidates = q.data ?? [];
    // Elle seçilen klasörde yolun kendisi gösterilir: hangi klasörün bağlandığı görülsün.
    const installs = manual ? manual.installs.map((c) => c.path || installLine(c)) : (candidates.length ? candidates : status?.installed ? status.installs : []).map(installLine);
    const found = !!manual || candidates.length > 0 || !!status?.installed;
    return { game, found, pending: !found && q.isPending, picked: !!manual, installs };
  });
}

// ───────────── Parçalar ─────────────

function Steps({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-1.5" aria-hidden>
      {[0, 1, 2].map((i) => (
        <motion.span key={i} className="h-1.5 rounded-full" animate={{ width: i === step ? 22 : 6, background: i <= step ? "var(--brand)" : "var(--line-strong)" }} transition={{ duration: 0.25 }} />
      ))}
    </div>
  );
}

function CheckMark({ on }: { on: boolean }) {
  return (
    <span className={clsx("flex size-6 shrink-0 items-center justify-center rounded-full border transition-[background,border-color,color] duration-200", on ? "accent-surface border-transparent" : "glass border-line-strong text-transparent")}>
      <Check className="size-3.5" strokeWidth={3} />
    </span>
  );
}

/** Hoş geldin ekranındaki oyun simgesi: tarama sürerken nefes alır, bulununca belirginleşir. */
function ScanIcon({ s }: { s: Scan }) {
  return (
    <div className="flex w-[68px] flex-col items-center gap-2">
      <motion.div
        className="relative"
        initial={false}
        animate={s.pending ? { opacity: [0.35, 0.7, 0.35], scale: 0.96 } : { opacity: s.found ? 1 : 0.3, scale: s.found ? 1 : 0.94 }}
        transition={s.pending ? { duration: 1.6, repeat: Infinity, ease: "easeInOut" } : { duration: 0.35, ease: EASE }}
      >
        <GameIcon game={s.game} size={52} />
        <AnimatePresence>
          {s.found && (
            <motion.span
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 520, damping: 26 }}
              className="absolute -bottom-1 -right-1 flex size-5 items-center justify-center rounded-full border-2 border-bg bg-ok text-bg"
            >
              <Check className="size-3" strokeWidth={3.2} />
            </motion.span>
          )}
        </AnimatePresence>
      </motion.div>
      <span className={clsx("text-[11.5px] font-medium transition-colors duration-300", s.found ? "text-fg-2" : "text-muted")}>{s.game.short}</span>
    </div>
  );
}

/** Bulunan oyunun seçim kutucuğu: oyunun kütüphane görseli, yoksa kendi çizimi. */
function GameTile({ s, on, onToggle, tall }: { s: Scan; on: boolean; onToggle: () => void; tall?: boolean }) {
  const t = useT();
  const hero = useArt(s.game.id, "hero");
  const logo = useArt(s.game.id, "logo");
  const Art = s.game.Art;
  const onImage = !!hero;
  return (
    <motion.button
      layout
      type="button"
      role="checkbox"
      aria-checked={on}
      aria-label={s.game.name}
      data-game={s.game.id}
      onClick={onToggle}
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3, ease: EASE }}
      className={clsx(
        "group relative overflow-hidden rounded-[18px] border text-left outline-none transition-[border-color,box-shadow] duration-200 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
        tall ? "h-[188px]" : "h-[164px]",
        on ? "border-accent shadow-[0_10px_30px_-16px_color-mix(in_oklab,var(--accent)_80%,transparent)]" : "border-line hover:border-line-strong",
      )}
    >
      <div className={clsx("absolute inset-0 transition-[filter,opacity] duration-300", !on && "opacity-55 grayscale")}>
        {hero ? (
          <>
            <img src={hero} alt="" draggable={false} className="absolute inset-0 size-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03]" />
            {/* Görsel alanı iki temada da koyu kalır: logolar açık renklidir. */}
            <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgb(8 9 12 / 0.08) 10%, rgb(8 9 12 / 0.84) 100%)" }} />
          </>
        ) : (
          <div className="hero-surface absolute inset-0">{Art && <Art className="pointer-events-none absolute -right-6 bottom-0 h-full w-[118%] text-accent opacity-80" />}</div>
        )}
      </div>
      <div className="relative flex h-full flex-col justify-between p-4">
        <div className="flex items-start gap-2">
          <GameIcon game={s.game} size={36} dim={!on} />
          <div className="flex-1" />
          {s.picked && (
            <Badge tone="ok" icon={<Check className="size-3" />} className="glass mt-0.5">
              {t.onboarding.picked}
            </Badge>
          )}
          <CheckMark on={on} />
        </div>
        <div className="min-w-0">
          {logo ? (
            <img src={logo} alt="" draggable={false} className={clsx("max-h-[46px] max-w-[72%] object-contain object-left drop-shadow-[0_4px_18px_rgb(0_0_0/0.55)] transition-opacity", !on && "opacity-70")} />
          ) : (
            logo === null && <span className={clsx("text-display block truncate text-[19px] font-semibold leading-tight tracking-tight", onImage ? "text-white" : "text-fg")}>{s.game.name}</span>
          )}
          <div className={clsx("mt-2 truncate text-[12px]", s.picked && "font-mono text-[11.5px]", onImage ? "text-white/75" : "text-fg-2")} title={s.installs.join("\n")}>
            {s.installs.join("  ·  ")}
          </div>
        </div>
      </div>
    </motion.button>
  );
}

function MissingRow({ s, onPicked }: { s: Scan; onPicked: (status: GameStatus) => void }) {
  const t = useT();
  const lang = useLang((l) => l.lang);
  const [busy, setBusy] = useState(false);
  const pick = async () => {
    setBusy(true);
    try {
      const status = await chooseGameFolder(s.game.id);
      if (status) onPicked(status);
    } finally {
      setBusy(false);
    }
  };
  return (
    <motion.li layout="position" exit={{ opacity: 0, height: 0 }} data-game={s.game.id} className="flex items-center gap-3.5 px-4 py-3">
      <GameIcon game={s.game} size={36} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13.5px] font-medium text-fg">{s.game.name}</div>
        <div className="truncate text-[12px] text-muted">{s.game.tagline[lang]}</div>
      </div>
      <Button size="sm" variant="secondary" icon={<FolderOpen className="size-3.5" />} loading={busy} onClick={pick}>
        {t.common.chooseFolder}
      </Button>
    </motion.li>
  );
}

function MissingList({ items, onPicked }: { items: Scan[]; onPicked: (id: string, status: GameStatus) => void }) {
  const t = useT();
  return (
    <div className="card overflow-hidden">
      <p className="border-b border-line px-4 py-2.5 text-[12px] text-fg-2">{t.onboarding.missingHint}</p>
      <ul className="divide-y divide-[var(--line)]">
        <AnimatePresence initial={false}>
          {items.map((s) => (
            <MissingRow key={s.game.id} s={s} onPicked={(status) => onPicked(s.game.id, status)} />
          ))}
        </AnimatePresence>
      </ul>
    </div>
  );
}

function PipelineStep({ index, icon, title, hint, extra }: { index: number; icon: ReactNode; title: string; hint: string; extra?: ReactNode }) {
  return (
    <motion.li
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.06 * index, ease: EASE }}
      className="card relative flex flex-col px-4 pb-4 pt-3.5"
    >
      <div className="flex items-center justify-between">
        <span className="flex size-9 items-center justify-center rounded-xl border border-line bg-surface-2 text-accent">{icon}</span>
        <span className="tabular text-[11px] font-medium text-muted">{String(index + 1).padStart(2, "0")}</span>
      </div>
      <div className="mt-3 text-[13.5px] font-semibold text-fg">{title}</div>
      <div className="mt-0.5 text-[12px] leading-relaxed text-fg-2">{hint}</div>
      {extra && <div className="mt-2.5">{extra}</div>}
    </motion.li>
  );
}

// ───────────── Adımlar ─────────────

function Welcome({ scan, onStart }: { scan: Scan[]; onStart: () => void }) {
  const t = useT();
  const pending = scan.some((s) => s.pending);
  const found = scan.filter((s) => s.found);
  return (
    <div className="flex flex-col items-center text-center">
      <LogoTile size={84} />
      <h1 className="mt-7 text-[34px] font-semibold tracking-tight text-fg">{t.onboarding.welcome}</h1>
      <p className="mt-3 max-w-[520px] text-balance text-[15px] leading-relaxed text-fg-2">{t.onboarding.welcomeBody}</p>
      <div className="mt-9 flex items-start gap-2">
        {scan.map((s) => (
          <ScanIcon key={s.game.id} s={s} />
        ))}
      </div>
      <div className="mt-4 flex h-5 items-center justify-center gap-2 text-[13px]" aria-live="polite">
        {pending ? (
          <>
            <Spinner className="size-3.5" />
            <span className="text-fg-2">{t.onboarding.scanning}</span>
          </>
        ) : found.length ? (
          <>
            <Check className="size-4 text-ok" strokeWidth={2.6} />
            <span className="text-fg-2">{t.onboarding.scanFound(found.map((s) => s.game.short))}</span>
          </>
        ) : (
          <span className="text-muted">{t.onboarding.scanNone}</span>
        )}
      </div>
      <Button variant="brand" size="lg" className="mt-9 px-7" trailing={<ArrowRight className="size-4" />} onClick={onStart}>
        {t.onboarding.start}
      </Button>
    </div>
  );
}

function GamesStep({
  scan,
  off,
  onToggle,
  onPicked,
}: {
  scan: Scan[];
  off: Set<string>;
  onToggle: (id: string) => void;
  onPicked: (id: string, status: GameStatus) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const found = scan.filter((s) => s.found);
  const pending = scan.filter((s) => s.pending);
  const missing = scan.filter((s) => !s.found && !s.pending);
  const none = found.length === 0 && pending.length === 0;
  const chosen = found.filter((s) => !off.has(s.game.id)).length;
  const cols = found.length === 1 ? "grid-cols-1" : found.length === 3 ? "grid-cols-3" : "grid-cols-2";
  const picked = (id: string, status: GameStatus) => {
    onPicked(id, status);
    setOpen(true);
  };

  return (
    <LayoutGroup>
      {none && (
        <div className="mb-5 flex size-12 items-center justify-center rounded-2xl border border-line bg-surface-2 text-fg-2">
          <SearchX className="size-6" />
        </div>
      )}
      <h2 className="text-[26px] font-semibold tracking-tight text-fg">{found.length ? t.onboarding.gamesFound(found.length) : none ? t.onboarding.noneTitle : t.onboarding.gamesTitle}</h2>
      <p className="mt-2 text-pretty text-[14px] leading-relaxed text-fg-2">
        {found.length > 1 ? t.onboarding.gamesBody : found.length ? t.onboarding.gamesBodyOne : none ? t.onboarding.noneBody(GAMES.map((g) => g.name)) : t.onboarding.gamesScanning}
      </p>

      {found.length > 0 ? (
        <div className={clsx("mt-6 grid gap-3", cols)}>
          {found.map((s) => (
            <GameTile key={s.game.id} s={s} on={!off.has(s.game.id)} onToggle={() => onToggle(s.game.id)} tall={found.length === 1} />
          ))}
        </div>
      ) : (
        pending.length > 0 && (
          <div className="mt-6 grid grid-cols-2 gap-3">
            <Skeleton className="h-[164px] rounded-[18px]" />
            <Skeleton className="h-[164px] rounded-[18px]" />
          </div>
        )
      )}

      {pending.length > 0 && (
        <motion.p layout="position" className="mt-3 flex items-center gap-2 text-[12.5px] text-muted" aria-live="polite">
          <Spinner className="size-3.5" />
          {t.onboarding.searchingFor(pending.map((s) => s.game.short))}
        </motion.p>
      )}

      {none ? (
        <motion.div layout="position" className="mt-6">
          <MissingList items={missing} onPicked={picked} />
          <p className="mt-3 text-[12.5px] leading-relaxed text-muted">{t.onboarding.noneSkip}</p>
        </motion.div>
      ) : (
        missing.length > 0 && (
          <motion.div layout="position" className="mt-4">
            <button
              type="button"
              aria-expanded={open}
              onClick={() => setOpen((v) => !v)}
              className="-ml-1.5 inline-flex items-center gap-2 rounded-lg px-1.5 py-1 text-[13px] text-fg-2 outline-none transition-colors hover:text-fg focus-visible:ring-2 focus-visible:ring-accent"
            >
              <FolderSearch className="size-4 text-muted" />
              {t.onboarding.missingToggle}
              <ChevronDown className={clsx("size-4 text-muted transition-transform duration-200", open && "rotate-180")} />
            </button>
            <AnimatePresence initial={false}>
              {open && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.24, ease: EASE }} className="overflow-hidden">
                  <div className="pt-2.5">
                    <MissingList items={missing} onPicked={picked} />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )
      )}

      {found.length > 0 && (
        <motion.p layout="position" className={clsx("mt-4 text-[12.5px] leading-relaxed", chosen === 0 ? "text-warn" : "text-muted")}>
          {chosen === 0 ? t.onboarding.chooseOne : t.onboarding.later}
        </motion.p>
      )}
    </LayoutGroup>
  );
}

interface NexusSetup {
  key: string;
  setKey: (v: string) => void;
  error: string | null;
  connecting: boolean;
  connect: () => Promise<boolean>;
  nxmOn: boolean;
  setNxmOn: (v: boolean) => void;
}

function NexusCard({ games, setup }: { games: GameModule[]; setup: NexusSetup }) {
  const t = useT();
  const { data: nexus } = useNexus();
  const { data: nxm } = useNxmStatus();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (setup.key.trim()) void setup.connect();
  };
  return (
    <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.24, ease: EASE }} className="card mt-4 overflow-hidden">
      <div className="flex items-start gap-4 px-5 pb-3.5 pt-4">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-line bg-surface-2 text-fg-2">
          <KeyRound className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-semibold text-fg">
            {t.onboarding.nexusTitle} <span className="font-normal text-muted">· {t.common.optional}</span>
          </div>
          <p className="mt-0.5 text-[12.5px] leading-relaxed text-fg-2">{t.onboarding.nexusBody(games.map((g) => g.short))}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {games.map((g) => (
            <GameIcon key={g.id} game={g} size={26} />
          ))}
        </div>
      </div>
      <div className="px-5 pb-4">
        {nexus?.hasKey ? (
          <Badge tone="ok" icon={<BadgeCheck className="size-3" />}>
            {nexus.user ? t.onboarding.nexusConnected(nexus.user.name) : t.settings.stored}
          </Badge>
        ) : (
          <>
            <form onSubmit={submit} className="flex items-center gap-2">
              <Input
                type="password"
                className="flex-1"
                value={setup.key}
                onChange={(e) => setup.setKey(e.target.value)}
                placeholder={t.settings.keyPlaceholder}
                aria-invalid={!!setup.error}
                icon={<KeyRound className="size-3.5" />}
              />
              <Button type="submit" variant="secondary" loading={setup.connecting} disabled={!setup.key.trim()}>
                {t.settings.connect}
              </Button>
            </form>
            <div className="mt-2 flex items-start justify-between gap-4 text-[12px]">
              <span className={setup.error ? "text-danger" : "text-muted"}>{setup.error ?? t.settings.nexusKeyHint}</span>
              <button type="button" onClick={() => void openUrl(NEXUS_KEYS)} className="inline-flex shrink-0 items-center gap-1 font-medium text-accent hover:underline">
                {t.onboarding.nexusGetKey}
                <ExternalLink className="size-3.5" />
              </button>
            </div>
          </>
        )}
      </div>
      <div className="flex items-center gap-4 border-t border-line px-5 py-3.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-line bg-surface-2 text-fg-2">
          <Link2 className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-medium text-fg">{t.onboarding.nxmTitle}</div>
          <div className="mt-0.5 text-[12px] leading-relaxed text-fg-2">{nxm?.otherHandler && !nxm.registered ? t.onboarding.nxmOther : t.onboarding.nxmFree}</div>
        </div>
        {nxm?.registered ? (
          <Badge tone="ok" dot>
            {t.home.nxmOurs}
          </Badge>
        ) : (
          <Switch checked={setup.nxmOn} onChange={setup.setNxmOn} label={t.onboarding.nxmTitle} disabled={!nxm} />
        )}
      </div>
    </motion.section>
  );
}

function SetupStep({ nexusGames, setup }: { nexusGames: GameModule[]; setup: NexusSetup }) {
  const t = useT();
  const { data: info } = useAppInfo();
  const noDefender = info?.defenderAvailable === false;
  return (
    <div>
      <h2 className="text-[26px] font-semibold tracking-tight text-fg">{t.onboarding.securityTitle}</h2>
      <p className="mt-2 text-pretty text-[14px] leading-relaxed text-fg-2">{t.onboarding.securityBody}</p>
      <ol className="mt-6 grid grid-cols-4 gap-2.5">
        <PipelineStep index={0} icon={<BadgeCheck className="size-[18px]" />} title={t.onboarding.pipeline.verify} hint={t.onboarding.pipeline.verifyHint} />
        <PipelineStep
          index={1}
          icon={<ScanSearch className="size-[18px]" />}
          title={t.onboarding.pipeline.scan}
          hint={t.onboarding.pipeline.scanHint}
          extra={
            <Badge tone={noDefender ? "warn" : "ok"} dot>
              {noDefender ? t.home.defenderMissing : t.home.defenderOn}
            </Badge>
          }
        />
        <PipelineStep index={2} icon={<ClipboardCheck className="size-[18px]" />} title={t.onboarding.pipeline.review} hint={t.onboarding.pipeline.reviewHint} />
        <PipelineStep index={3} icon={<PackageCheck className="size-[18px]" />} title={t.onboarding.pipeline.install} hint={t.onboarding.pipeline.installHint} />
      </ol>
      {noDefender && <p className="mt-3 text-[12.5px] leading-relaxed text-warn">{t.onboarding.defenderMissing}</p>}
      {nexusGames.length > 0 && (
        <>
          <NexusCard games={nexusGames} setup={setup} />
          <p className="mt-3 text-[12px] leading-relaxed text-muted">{t.onboarding.accountsLater}</p>
        </>
      )}
    </div>
  );
}

// ───────────── Akış ─────────────

const slide = {
  enter: (dir: number) => ({ opacity: 0, x: dir * 28 }),
  center: { opacity: 1, x: 0 },
  exit: (dir: number) => ({ opacity: 0, x: dir * -20 }),
};

export function Onboarding() {
  const t = useT();
  const qc = useQueryClient();
  const lang = useLang((s) => s.lang);
  const { data: info } = useAppInfo();
  const { data: nexus } = useNexus();
  const { data: nxm } = useNxmStatus();
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  // Elle klasörü seçilen oyunlar ve bulunup kullanıcının kapattıkları; seçim bunlardan türer.
  const [picked, setPicked] = useState<Record<string, GameStatus>>({});
  const [off, setOff] = useState<Set<string>>(() => new Set());
  const [key, setKey] = useState("");
  const [keyError, setKeyError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [nxmChoice, setNxmChoice] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  const scan = useScan(picked);
  const found = scan.filter((s) => s.found);
  const none = found.length === 0 && !scan.some((s) => s.pending);
  const chosen = found.filter((s) => !off.has(s.game.id)).map((s) => s.game);
  // Nexus yalnızca seçilen oyunlardan biri Nexus'ta varsa sorulur (GameInfo.nexus).
  const nexusGames = chosen.filter((g) => (info?.games.find((x) => x.id === g.id)?.nexus.length ?? 0) > 0);
  // "Mod Manager Download" bağlantıları başka bir uygulamada değilse öntanımlı olarak Modstead'e bağlanır.
  const nxmOn = nxmChoice ?? (!!nxm && !nxm.otherHandler);

  const go = (next: number) => {
    setDir(next > step ? 1 : -1);
    setStep(next);
  };

  const connect = async (): Promise<boolean> => {
    setConnecting(true);
    setKeyError(null);
    try {
      qc.setQueryData(keys.nexus, await invoke<NexusStatus>("nexus_set_key", { key: key.trim() }));
      setKey("");
      return true;
    } catch (e) {
      setKeyError(errorMessage(e));
      return false;
    } finally {
      setConnecting(false);
    }
  };

  const finish = async () => {
    setBusy(true);
    try {
      if (nexusGames.length > 0) {
        // Yazılmış ama bağlanmamış anahtar: önce bağla; olmazsa hata kartta görünür, akış burada kalır.
        if (key.trim() && !nexus?.hasKey && !(await connect())) return;
        if (nxmOn && nxm && !nxm.registered) {
          try {
            qc.setQueryData(keys.nxm, await invoke<NxmStatus>("nxm_register"));
          } catch (e) {
            notifyError(e);
          }
        }
      }
      await updateSettings({ onboarded: true, games: gamesSetting(chosen.map((g) => g.id)) });
    } catch (e) {
      notifyError(e);
    } finally {
      setBusy(false);
    }
  };

  const setLanguage = (language: "tr" | "en") => {
    useLang.getState().setLang(language);
    void updateSettings({ language }).catch(notifyError);
  };

  return (
    <MotionConfig reducedMotion="user">
      <div data-tauri-drag-region className="app-backdrop flex h-full flex-col">
        <header data-tauri-drag-region className="flex h-[54px] shrink-0 items-center gap-3 pl-6 pr-4">
          <LogoMark size={20} />
          <span data-tauri-drag-region className="text-[13px] font-semibold text-fg">
            Modstead
          </span>
          <div data-tauri-drag-region className="flex-1" />
          <Segmented
            id="onboarding-lang"
            size="sm"
            value={lang}
            onChange={setLanguage}
            options={[
              { value: "tr", label: "Türkçe" },
              { value: "en", label: "English" },
            ]}
          />
          <WindowControls />
        </header>

        <main data-tauri-drag-region className="flex min-h-0 flex-1 flex-col items-center overflow-y-auto px-8">
          <div className="my-auto w-full max-w-[720px] py-6">
            <AnimatePresence mode="wait" custom={dir}>
              <motion.div key={step} custom={dir} variants={slide} initial="enter" animate="center" exit="exit" transition={{ duration: 0.24, ease: EASE }}>
                {step === 0 && <Welcome scan={scan} onStart={() => go(1)} />}
                {step === 1 && (
                  <GamesStep
                    scan={scan}
                    off={off}
                    onToggle={(id) =>
                      setOff((prev) => {
                        const next = new Set(prev);
                        if (!next.delete(id)) next.add(id);
                        return next;
                      })
                    }
                    onPicked={(id, status) => {
                      setPicked((p) => ({ ...p, [id]: status }));
                      setOff((prev) => {
                        const next = new Set(prev);
                        next.delete(id);
                        return next;
                      });
                    }}
                  />
                )}
                {step === 2 && <SetupStep nexusGames={nexusGames} setup={{ key, setKey, error: keyError, connecting, connect, nxmOn, setNxmOn: setNxmChoice }} />}
              </motion.div>
            </AnimatePresence>
          </div>
        </main>

        <AnimatePresence initial={false}>
          {step > 0 && (
            <motion.footer
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="mx-auto flex w-full max-w-[784px] shrink-0 items-center justify-between px-8 pb-7 pt-4"
            >
              <Button variant="ghost" className="-ml-3.5" onClick={() => go(step - 1)}>
                {t.common.back}
              </Button>
              <Steps step={step} />
              {step === 1 ? (
                none ? (
                  <Button variant="secondary" trailing={<ArrowRight className="size-4" />} onClick={() => go(2)}>
                    {t.onboarding.skip}
                  </Button>
                ) : (
                  <Button variant="brand" trailing={<ArrowRight className="size-4" />} onClick={() => go(2)} disabled={chosen.length === 0}>
                    {t.common.next}
                  </Button>
                )
              ) : (
                <Button variant="brand" onClick={finish} loading={busy}>
                  {t.onboarding.finish}
                </Button>
              )}
            </motion.footer>
          )}
        </AnimatePresence>
      </div>
    </MotionConfig>
  );
}
