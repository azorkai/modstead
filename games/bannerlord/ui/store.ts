// Bannerlord sayfalarının ortak durumu (Otağ'ın store/app.ts'i). Yükleme sırası kaydedilene kadar
// burada düzenlenir; sunucu verisi arka uçtan `bannerlord_overview` ile gelir. Görevler, inceleme
// penceresi, genel ayarlar ve komut paleti kabuktadır.

import { create } from "zustand";
import { toast } from "sonner";
import { EVENTS, isTauri, listen } from "@/lib/ipc";
import { useUi } from "@/lib/store";
import { api, errorText } from "./api";
import { getT } from "./i18n";
import type { BannerlordSettings, Fix, Issue, ModEntry, ModuleInfo, Overview, SettingsPatch, SteamLookup, SteamTarget, UpdateItem } from "./types";

export type View = "library" | "discover" | "updates" | "profiles" | "backups" | "settings";
export type DiscoverSource = "nexus" | "steam";

/** Keşfet'in Steam Workshop kapısı; sayfa değişse de korunur. */
export interface SteamState {
  input: string;
  /** Son başarılı/denenen sorgu; pencereye dönüşte yenilemek için. */
  query: string | null;
  result: SteamLookup | null;
  loading: boolean;
  error: string | null;
}

export interface ConfirmRequest {
  title: string;
  body: string;
  confirmLabel?: string;
  danger?: boolean;
  resolve: (ok: boolean) => void;
}

interface AppState {
  ready: boolean;
  loading: boolean;
  overview: Overview | null;
  modules: Record<string, ModuleInfo>;
  order: ModEntry[];
  savedOrder: ModEntry[];
  issues: Issue[];
  validating: boolean;
  selectedId: string | null;
  /** Oyuna özel ayarlar (genel ayarlar kabukta). */
  settings: BannerlordSettings | null;
  discoverQuery: { text: string; nonce: number } | null;
  updates: UpdateItem[] | null;
  confirmRequest: ConfirmRequest | null;
  launching: boolean;
  saving: boolean;
  sorting: boolean;
  /** Küçük harfli modül kimliği → logo adresi. */
  images: Record<string, string>;
  discoverSource: DiscoverSource;
  steam: SteamState;

  /** refreshImages: logosu olmayan modlar için arka uç yeniden dener (Kütüphane'deki yeniden tara). */
  load(refresh?: boolean, refreshImages?: boolean): Promise<void>;
  loadImages(refresh?: boolean): Promise<void>;
  loadSettings(): Promise<void>;
  setDiscoverSource(s: DiscoverSource): void;
  setSteamInput(v: string): void;
  lookupSteam(input: string, quiet?: boolean): Promise<void>;
  /** steam_open; sonrasında 15 dakika boyunca pencereye dönüşte yeniden tarar. */
  openInSteam(target: SteamTarget, id?: string | null): Promise<void>;
  onWindowFocus(): Promise<void>;
  applyOverview(o: Overview, keepOrder?: boolean): void;
  setView(v: View): void;
  select(id: string | null): void;
  setOrder(order: ModEntry[]): void;
  toggle(id: string, enabled?: boolean): void;
  setAll(enabled: boolean, filter?: (m: ModuleInfo) => boolean): void;
  move(activeId: string, overId: string): void;
  autoSort(): Promise<void>;
  save(): Promise<boolean>;
  revert(): void;
  launch(opts?: { continueGame?: boolean; useBlse?: boolean }): Promise<void>;
  applyFix(fix: Fix): Promise<void>;
  updateSettings(p: SettingsPatch): Promise<void>;
  searchNexus(text: string): void;
  setUpdates(u: UpdateItem[] | null): void;
  confirm(req: Omit<ConfirmRequest, "resolve">): Promise<boolean>;
  closeConfirm(ok: boolean): void;
}

export const sameOrder = (a: ModEntry[], b: ModEntry[]) => a.length === b.length && a.every((e, i) => e.id === b[i].id && e.enabled === b[i].enabled);

const keyOf = (id: string) => id.toLowerCase();

let validateTimer: ReturnType<typeof setTimeout> | undefined;
let validateSeq = 0;

function scheduleValidate(get: () => AppState, set: (p: Partial<AppState>) => void) {
  clearTimeout(validateTimer);
  set({ validating: true });
  validateTimer = setTimeout(async () => {
    const seq = ++validateSeq;
    try {
      const issues = await api.validateOrder(get().order);
      if (seq === validateSeq) set({ issues, validating: false });
    } catch {
      if (seq === validateSeq) set({ validating: false });
    }
  }, 140);
}

// Logo isteklerini sıraya koyar: ilk çağrı ağ yüzünden birkaç saniye sürebilir; bu sırada gelen
// çağrılar tek bir ek tura birleştirilir (refresh isteyen varsa o tur refresh olur).
let imagesBusy = false;
let imagesQueued: { refresh: boolean } | null = null;

// Steam'de bir şey açıldıktan sonra Modstead'e dönüşte yeniden tarama penceresi.
const STEAM_WATCH_MS = 15 * 60 * 1000;
const FOCUS_RESCAN_GAP_MS = 4000;
let steamWatchUntil = 0;
let lastFocusRescan = 0;
let steamSeq = 0;

/** Yeniden taramadan sonra kullanıcının kaydedilmemiş sırasını korur. */
function mergeOrder(current: ModEntry[], fresh: ModEntry[]): ModEntry[] {
  const freshKeys = new Set(fresh.map((e) => keyOf(e.id)));
  const kept = current.filter((e) => freshKeys.has(keyOf(e.id)));
  const keptKeys = new Set(kept.map((e) => keyOf(e.id)));
  return [...kept, ...fresh.filter((e) => !keptKeys.has(keyOf(e.id)))];
}

export const useApp = create<AppState>((set, get) => ({
  ready: false,
  loading: false,
  overview: null,
  modules: {},
  order: [],
  savedOrder: [],
  issues: [],
  validating: false,
  selectedId: null,
  settings: null,
  discoverQuery: null,
  updates: null,
  confirmRequest: null,
  launching: false,
  saving: false,
  sorting: false,
  images: {},
  discoverSource: "nexus",
  steam: { input: "", query: null, result: null, loading: false, error: null },

  async load(refresh = false, refreshImages = false) {
    set({ loading: true });
    try {
      const o = await api.overview(refresh);
      get().applyOverview(o, true);
      void get().loadImages(refreshImages);
      if (!get().settings) void get().loadSettings();
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      set({ loading: false, ready: true });
    }
  },

  applyOverview(o, keepOrder = false) {
    const modules: Record<string, ModuleInfo> = {};
    for (const m of o.modules) modules[keyOf(m.id)] = m;
    const state = get();
    const dirty = state.ready && !sameOrder(state.order, state.savedOrder);
    const order = keepOrder && dirty ? mergeOrder(state.order, o.order) : o.order;
    // Oyun klasörü değiştiyse yeni modüllerin logolarını iste.
    const gameChanged = !!state.overview && state.overview.game?.root !== o.game?.root;
    set({ overview: o, modules, order, savedOrder: o.order, issues: o.issues });
    if (keepOrder && dirty) scheduleValidate(get, set);
    if (gameChanged) void get().loadImages(false);
  },

  async loadImages(refresh = false) {
    if (imagesBusy) {
      imagesQueued = { refresh: refresh || !!imagesQueued?.refresh };
      return;
    }
    imagesBusy = true;
    try {
      let next: boolean | null = refresh;
      while (next !== null) {
        imagesQueued = null;
        try {
          set({ images: await api.moduleImages(next) });
        } catch {
          /* logolar süs; hata sessizce baş harflere düşer */
        }
        // await sırasında başka çağrı geldiyse bir tur daha.
        const queued = imagesQueued as { refresh: boolean } | null;
        next = queued ? queued.refresh : null;
      }
    } finally {
      imagesBusy = false;
    }
  },

  async loadSettings() {
    try {
      set({ settings: await api.getSettings() });
    } catch {
      /* ayarlar sayfası yeniden dener */
    }
  },

  setDiscoverSource(discoverSource) {
    set({ discoverSource });
  },

  setSteamInput(input) {
    set({ steam: { ...get().steam, input } });
  },

  async lookupSteam(input, quiet = false) {
    const query = input.trim();
    if (!query) return;
    const my = ++steamSeq;
    if (!quiet) set({ steam: { ...get().steam, query, loading: true, error: null } });
    try {
      const result = await api.steamLookup(query);
      if (my === steamSeq) set({ steam: { ...get().steam, query, result, loading: false, error: null } });
    } catch (e) {
      // Sessiz yenilemede (pencereye dönüş) eski sonuçları koru.
      if (my === steamSeq && !quiet) set({ steam: { ...get().steam, result: null, loading: false, error: errorText(e) } });
    }
  },

  async openInSteam(target, id = null) {
    try {
      await api.steamOpen(target, id);
      steamWatchUntil = Date.now() + STEAM_WATCH_MS;
      if (target === "item") {
        const t = getT();
        toast(t.steam.opened, { description: t.steam.openedHint });
      }
    } catch (e) {
      toast.error(errorText(e));
    }
  },

  async onWindowFocus() {
    const now = Date.now();
    if (now > steamWatchUntil || now - lastFocusRescan < FOCUS_RESCAN_GAP_MS || get().loading) return;
    lastFocusRescan = now;
    const before = new Set(Object.keys(get().modules));
    await get().load(true);
    const added = Object.keys(get().modules).filter((k) => !before.has(k)).length;
    if (added > 0) toast.success(getT().steam.newMods(added));
    const q = get().steam.query;
    if (q) await get().lookupSteam(q, true);
  },

  setView(view) {
    useUi.getState().go({ kind: "game", game: "bannerlord", page: view });
  },

  select(selectedId) {
    set({ selectedId });
  },

  setOrder(order) {
    set({ order });
    scheduleValidate(get, set);
  },

  toggle(id, enabled) {
    const order = get().order.map((e) => (keyOf(e.id) === keyOf(id) ? { ...e, enabled: enabled ?? !e.enabled } : e));
    get().setOrder(order);
  },

  setAll(enabled, filter) {
    const { modules } = get();
    const order = get().order.map((e) => {
      const m = modules[keyOf(e.id)];
      if (!m || m.isOfficial) return e;
      if (filter && !filter(m)) return e;
      return { ...e, enabled };
    });
    get().setOrder(order);
  },

  move(activeId, overId) {
    const order = [...get().order];
    const from = order.findIndex((e) => e.id === activeId);
    const to = order.findIndex((e) => e.id === overId);
    if (from < 0 || to < 0 || from === to) return;
    const [item] = order.splice(from, 1);
    order.splice(to, 0, item);
    get().setOrder(order);
  },

  async autoSort() {
    set({ sorting: true });
    try {
      const r = await api.sortOrder(get().order);
      clearTimeout(validateTimer);
      validateSeq++;
      set({ order: r.order, issues: r.issues, validating: false });
      const t = getT();
      toast.success(r.changed ? t.store.sorted : t.store.alreadySorted);
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      set({ sorting: false });
    }
  },

  async save() {
    set({ saving: true });
    try {
      const o = await api.saveOrder(get().order);
      get().applyOverview(o);
      const t = getT();
      toast.success(t.store.saved, { description: t.store.savedBody });
      return true;
    } catch (e) {
      toast.error(errorText(e));
      return false;
    } finally {
      set({ saving: false });
    }
  },

  revert() {
    set({ order: get().savedOrder });
    scheduleValidate(get, set);
  },

  async launch(opts = {}) {
    const errors = get().issues.filter((i) => i.severity === "error");
    if (errors.length > 0) {
      const list = errors
        .slice(0, 3)
        .map((e) => "• " + e.title)
        .join("\n");
      const t = getT();
      const ok = await get().confirm({
        title: t.store.criticalTitle(errors.length),
        body: `${list}${errors.length > 3 ? "\n…" : ""}\n\n${t.store.criticalBody}`,
        confirmLabel: t.store.launchAnyway,
        danger: true,
      });
      if (!ok) return;
    }
    set({ launching: true });
    try {
      const useBlse = opts.useBlse ?? (get().settings?.preferBlse && !!get().overview?.game?.blse);
      await api.launch(get().order, { continueGame: !!opts.continueGame, useBlse: !!useBlse });
      set({ savedOrder: get().order });
      const t = getT();
      toast.success(t.store.launching, { description: t.common.modsEnabled(communityEnabled(get())) });
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setTimeout(() => set({ launching: false }), 1500);
    }
  },

  async applyFix(fix) {
    const s = get();
    const t = getT();
    try {
      switch (fix.type) {
        case "enable":
          s.toggle(fix.moduleId, true);
          toast.success(t.store.enabledMod(s.modules[keyOf(fix.moduleId)]?.name ?? fix.moduleId));
          break;
        case "disable":
          s.toggle(fix.moduleId, false);
          break;
        case "sort":
          await s.autoSort();
          break;
        case "unblock": {
          const o = await api.unblockModule(fix.moduleId);
          s.applyOverview(o, true);
          toast.success(t.store.unblocked);
          break;
        }
        case "search":
          s.searchNexus(fix.query);
          break;
        case "retireCopy": {
          const ok = await s.confirm({ title: t.store.retireTitle, body: t.store.retireBody, confirmLabel: t.store.retireConfirm });
          if (!ok) return;
          const o = await api.retireCopy(fix.path);
          s.applyOverview(o, true);
          toast.success(getT().store.retired);
          break;
        }
      }
    } catch (e) {
      toast.error(errorText(e));
    }
  },

  async updateSettings(patch) {
    const prev = get().settings;
    if (prev) set({ settings: { ...prev, ...patch } });
    try {
      set({ settings: await api.updateSettings(patch) });
    } catch (e) {
      if (prev) set({ settings: prev });
      toast.error(errorText(e));
    }
  },

  searchNexus(text) {
    set({ discoverSource: "nexus", discoverQuery: { text, nonce: Date.now() } });
    get().setView("discover");
  },

  setUpdates(updates) {
    set({ updates });
  },

  confirm(req) {
    return new Promise<boolean>((resolve) => {
      set({ confirmRequest: { ...req, resolve } });
    });
  },

  closeConfirm(ok) {
    const r = get().confirmRequest;
    set({ confirmRequest: null });
    r?.resolve(ok);
  },
}));

// Kurulum bitti, oyun klasörü değişti ya da başka bir sayfa modülleri değiştirdi: yeniden yükle
// (kaydedilmemiş sıra korunur). Yalnızca sayfalar bir kez açıldıysa.
if (isTauri) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  listen<{ game: string }>(EVENTS.gameChanged, ({ game }) => {
    if (game !== "bannerlord" || !useApp.getState().ready) return;
    clearTimeout(timer);
    timer = setTimeout(() => void useApp.getState().load(false), 250);
  });
}

/** Etkin topluluk modları (resmî modüller hariç); kenar çubuğu ve ana sayfa kartıyla aynı sayım. */
export function communityEnabled(s: Pick<AppState, "order" | "modules">): number {
  return s.order.filter((e) => e.enabled && s.modules[keyOf(e.id)] && !s.modules[keyOf(e.id)].isOfficial).length;
}

export const useDirty = () => useApp((s) => !sameOrder(s.order, s.savedOrder));

export const moduleOf = (modules: Record<string, ModuleInfo>, id: string) => modules[id.toLowerCase()];
