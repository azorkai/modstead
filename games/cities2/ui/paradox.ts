// Paradox Mods mod sayfası çekmecesinin durumu ve kısa yollar. Çekmece her CS2 sayfasında `Page` ile
// bağlanır; `openPdxMod(id)` her yerden çağrılır (bağımlılıktan bağımlılığa gezerken geri dönülebilir).

import { create } from "zustand";
import { useUi } from "@/lib/store";
import { GAME, goPage } from "./queries";

interface SheetState {
  modId: string | null;
  history: string[];
  open: (modId: string) => void;
  back: () => void;
  close: () => void;
}

export const usePdxSheet = create<SheetState>((set) => ({
  modId: null,
  history: [],
  open: (modId) => set((x) => ({ modId, history: x.modId !== null && x.modId !== modId ? [...x.history, x.modId] : x.history })),
  back: () => set((x) => ({ modId: x.history.at(-1) ?? null, history: x.history.slice(0, -1) })),
  close: () => set({ modId: null, history: [] }),
}));

/** Paradox Mods sayfasını uygulama içinde açar (CS2 sayfasında değilsek Keşfet'e geçer). */
export function openPdxMod(modId: string) {
  const view = useUi.getState().view;
  if (view.kind !== "game" || view.game !== GAME) goPage("discover");
  usePdxSheet.getState().open(modId);
}

export const pdxModUrl = (modId: string) => `https://mods.paradoxplaza.com/mods/${modId}/Windows`;

/** "mods.paradoxplaza.com/mods/161156/Windows" ya da "#161156" → "161156" */
export function parsePdxRef(text: string): string | null {
  const url = text.match(/mods\.paradoxplaza\.com\/mods\/(\d{1,12})/i);
  if (url) return url[1];
  const id = text.trim().match(/^#(\d{1,12})$/);
  return id ? id[1] : null;
}

/** Paradox'un markdown alt kümesi (başlık, kalın, liste, bağlantı) için hafif ayrıştırıcı: düz metin blokları. */
export type MdBlock = { kind: "h"; text: string } | { kind: "li"; text: string } | { kind: "p"; text: string };

export function parseMarkdown(src: string): MdBlock[] {
  const blocks: MdBlock[] = [];
  let para: string[] = [];
  const flush = () => {
    const text = para.join(" ").trim();
    if (text) blocks.push({ kind: "p", text });
    para = [];
  };
  for (const raw of src.replace(/\r/g, "").split("\n")) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flush();
      continue;
    }
    const h = line.match(/^\s{0,3}#{1,6}\s+(.*)$/);
    const li = line.match(/^\s*(?:[-*+]|\d+[.)])\s+(.*)$/);
    if (h) {
      flush();
      blocks.push({ kind: "h", text: h[1] });
    } else if (li) {
      flush();
      blocks.push({ kind: "li", text: li[1] });
    } else para.push(line.trim().replace(/\s{2,}$/, ""));
  }
  flush();
  return blocks.slice(0, 400);
}

/** Satır içi biçim: `**kalın**` ve `[metin](adres)` → parçalar (bağlantılar düz metin; adres ayrı). */
export type MdSpan = { text: string; bold?: boolean; href?: string };

export function inline(text: string): MdSpan[] {
  const out: MdSpan[] = [];
  const re = /\*\*(.+?)\*\*|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|\\(.)/g;
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push({ text: text.slice(last, m.index) });
    if (m[1] !== undefined) out.push({ text: m[1], bold: true });
    else if (m[2] !== undefined) out.push({ text: m[2], href: m[3] });
    else out.push({ text: m[4] });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}
