// Kayıtlı oyunlar. Sıra = varsayılan kenar çubuğu sırası (Rust'taki `GAMES` listesiyle aynı).
// Yeni oyun: games/<id>/ui/index.tsx'teki modülü buraya ekle.

import bannerlord from "../../games/bannerlord/ui";
import cities2 from "../../games/cities2/ui";
import msfs from "../../games/msfs/ui";
import stardew from "../../games/stardew/ui";
import type { GameModule } from "./types";

const ALL: GameModule[] = [msfs, bannerlord, stardew, cities2];

/** Şimdilik yalnızca MSFS yayında: bu oyunlar arayüzün hiçbir yerinde görünmez (kodları ve arka uçları duruyor).
 *  Geri açmak için listeden çıkar. */
const HIDDEN = new Set<string>(["bannerlord", "stardew", "cities2"]);

export const GAMES: GameModule[] = ALL.filter((g) => !HIDDEN.has(g.id));

export function gameModule(id: string | null | undefined): GameModule | undefined {
  return GAMES.find((g) => g.id === id);
}
