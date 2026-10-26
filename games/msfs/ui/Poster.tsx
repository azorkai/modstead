// Görseli olmayan modlar ve katalog için üretilen poster: koyu zemin, modun tonunda ince dikey ışık çizgileri,
// geniş Archivo ile dev tip kodu ve siluet. Renkler moddan türeyen tondur (oyuna özel veri rengi); kod yazısı kartın
// yüksekliğiyle ölçeklenir.

import clsx from "clsx";
import { hueOf } from "@/lib/format";
import type { Category } from "./types";

export function Poster({ code, hue, kind = "other", engines = 2, className }: { code: string; hue: number; kind?: Category; engines?: 2 | 4; className?: string }) {
  // Koyu, modun tonunda zemin + alttan yükselen ince dikey ışık çizgileri (Modstead'in "oluklu ışık" motifi).
  const bg = `linear-gradient(180deg, hsl(${hue} 42% 15%) 0%, hsl(${(hue + 12) % 360} 48% 8%) 100%)`;
  const streaks = `repeating-linear-gradient(90deg, transparent 0 18px, hsl(${hue} 85% 60% / 0.16) 40px, hsl(${hue} 95% 78% / 0.55) 41.5px, transparent 42px 48px),
    linear-gradient(180deg, transparent 30%, hsl(${hue} 85% 55% / 0.45) 100%)`;
  return (
    <div className={clsx("relative size-full overflow-hidden [container-type:size]", className)} style={{ background: bg }} aria-hidden>
      <div
        className="absolute inset-0"
        style={{ background: streaks, maskImage: "radial-gradient(120% 90% at 60% 120%, #000 25%, rgb(0 0 0 / 0.4) 55%, transparent 80%)", WebkitMaskImage: "radial-gradient(120% 90% at 60% 120%, #000 25%, rgb(0 0 0 / 0.4) 55%, transparent 80%)" }}
      />
      {(kind === "aircraft" || kind === "livery") && <PlaneSilhouette engines={engines} />}
      {(kind === "airport" || kind === "scenery") && <Runway />}
      <div
        className="absolute left-[7%] top-[30%] select-none leading-none text-white"
        style={{ fontFamily: "var(--font-brand)", fontWeight: 900, fontStretch: "122%", letterSpacing: "-0.02em", fontSize: "min(30cqh, 19cqw)", textShadow: "0 6px 30px rgb(0 0 0 / 0.45)" }}
      >
        {code}
      </div>
    </div>
  );
}

/** Mod için poster tonu: kimlikten kararlı bir renk. */
export function posterHue(seed: string): number {
  return hueOf(seed);
}

/** Üstten görünüş yolcu uçağı silueti. */
function PlaneSilhouette({ engines }: { engines: 2 | 4 }) {
  return (
    <svg className="absolute -right-[6%] -top-[8%] h-[95%] rotate-[32deg] opacity-80" viewBox="0 0 200 200">
      <g fill="rgb(255 255 255 / 0.9)">
        <rect x="92.5" y="14" width="15" height="172" rx="7.5" />
        <path d="M93 78 L14 116 L14 126 L93 104 Z" />
        <path d="M107 78 L186 116 L186 126 L107 104 Z" />
        <path d="M93 160 L62 176 L62 183 L93 176 Z" />
        <path d="M107 160 L138 176 L138 183 L107 176 Z" />
      </g>
      <g fill="rgb(255 255 255 / 0.72)">
        <rect x="56" y="95" width="9" height="20" rx="4" />
        <rect x="135" y="95" width="9" height="20" rx="4" />
        {engines === 4 && (
          <>
            <rect x="31" y="107" width="8" height="17" rx="3.5" />
            <rect x="161" y="107" width="8" height="17" rx="3.5" />
          </>
        )}
      </g>
    </svg>
  );
}

/** Perspektifte pist. */
function Runway() {
  return (
    <svg className="absolute right-0 top-0 h-full w-[70%] opacity-75" viewBox="0 0 200 200" preserveAspectRatio="xMaxYMid slice">
      <path d="M86 10 L114 10 L180 196 L20 196 Z" fill="rgb(255 255 255 / 0.14)" />
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <rect key={i} x={98.6 - i * 0.9} y={22 + i * 30} width={2.8 + i * 1.8} height={12 + i * 3} fill="rgb(255 255 255 / 0.85)" />
      ))}
      <path d="M86 10 L20 196" stroke="rgb(255 255 255 / 0.7)" strokeWidth="1.5" />
      <path d="M114 10 L180 196" stroke="rgb(255 255 255 / 0.7)" strokeWidth="1.5" />
    </svg>
  );
}
