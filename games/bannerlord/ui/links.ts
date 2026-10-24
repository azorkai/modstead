/** Yapıştırılan metni anlamlandırır: Nexus bağlantısı/numarası, nxm, GitHub deposu, Steam Workshop ya da arama. */
export type ParsedInput =
  | { kind: "nexus"; modId: number }
  | { kind: "nxm"; url: string }
  | { kind: "github"; repo: string }
  | { kind: "steam"; input: string }
  | { kind: "search"; query: string };

/** steamcommunity.com/sharedfiles/filedetails/?id=… ya da /workshop/filedetails/?id=… (öğe ya da koleksiyon). */
const STEAM_LINK = /steamcommunity\.com\/(?:sharedfiles|workshop)\/filedetails\/?\?(?:[^#]*&)?id=\d+/i;

export function parseInput(raw: string): ParsedInput {
  const text = raw.trim();
  if (/^nxm:\/\//i.test(text)) return { kind: "nxm", url: text };

  // Workshop kimlikleri 8+ hanelidir; Nexus numaraları 7 haneyi geçmez. Ayrıştırmayı arka uç yapar.
  if (STEAM_LINK.test(text) || /^\d{8,}$/.test(text)) return { kind: "steam", input: text };

  const nexus = text.match(/nexusmods\.com\/mountandblade2bannerlord\/mods\/(\d+)/i);
  if (nexus) return { kind: "nexus", modId: Number(nexus[1]) };
  if (/^#?\d{1,7}$/.test(text)) return { kind: "nexus", modId: Number(text.replace("#", "")) };

  const gh = text.match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+)/i);
  if (gh) return { kind: "github", repo: `${gh[1]}/${gh[2].replace(/\.git$/, "")}` };
  if (/^[\w.-]+\/[\w.-]+$/.test(text) && !text.includes("..")) return { kind: "github", repo: text };

  return { kind: "search", query: text };
}

export const nexusModUrl = (id: number) => `https://www.nexusmods.com/mountandblade2bannerlord/mods/${id}`;

/** Nexus dosya sayfası; `nmm=1` doğrudan "Mod Manager Download" akışını başlatır. */
export const nexusFileUrl = (modId: number, fileId?: number | null) =>
  fileId
    ? `${nexusModUrl(modId)}?tab=files&file_id=${fileId}&nmm=1`
    : `${nexusModUrl(modId)}?tab=files`;

export const workshopUrl = (id: string) => `https://steamcommunity.com/sharedfiles/filedetails/?id=${id}`;
export const virusTotalUrl = (sha256: string) => `https://www.virustotal.com/gui/file/${sha256}`;
