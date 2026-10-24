// Oyunun gerçek simgesi: kendi .exe'sinden ya da mağaza kutucuğundan (bkz. src-tauri/src/art.rs).
// Simge, oyunun renginde koyu bir karonun üstünde durur; iki temada da aynı görünür (uygulama simgesi gibi).
// Simge yoksa oyunun vurgu renginde glif karosu. Küçük simgeler (piksel sanatı) keskin büyütülür.

import { useState } from "react";
import clsx from "clsx";
import { useArt } from "@/lib/art";
import type { GameModule } from "@/games/types";

export function GameIcon({ game, size = 40, active, dim, className }: { game: GameModule; size?: number; active?: boolean; dim?: boolean; className?: string }) {
  const icon = useArt(game.id, "icon");
  const [loaded, setLoaded] = useState<{ src: string; width: number } | null>(null);
  const natural = loaded && loaded.src === icon ? loaded.width : 0;
  const radius = Math.round(size * 0.3);
  const box = { width: size, height: size, borderRadius: radius };

  if (icon === null) {
    return (
      <span data-game={game.id} className={clsx("accent-surface inline-flex shrink-0 items-center justify-center", dim && "opacity-50", className)} style={box}>
        <game.Icon style={{ width: size * 0.45, height: size * 0.45 }} strokeWidth={2} />
      </span>
    );
  }

  // Piksel sanatı (≤64 px) tam katlarla büyür; büyük simgeler karoya sığar.
  const pixel = natural > 0 && natural <= 64;
  const fit = size * 0.84;
  const inner = pixel && Math.floor(fit / natural) >= 1 ? Math.floor(fit / natural) * natural : fit;
  return (
    <span
      data-game={game.id}
      className={clsx("relative inline-flex shrink-0 items-center justify-center overflow-hidden transition-[box-shadow,opacity] duration-200", dim && "opacity-50", className)}
      style={{
        ...box,
        background: "radial-gradient(120% 100% at 50% 0%, color-mix(in oklab, var(--accent) 34%, #12141a), color-mix(in oklab, var(--accent) 12%, #0b0c10))",
        boxShadow: active
          ? "inset 0 1px 0 rgb(255 255 255 / 0.14), 0 0 0 2px var(--bg-2), 0 0 0 3.5px var(--accent), 0 8px 22px -10px color-mix(in oklab, var(--accent) 80%, transparent)"
          : "inset 0 1px 0 rgb(255 255 255 / 0.1), inset 0 0 0 1px color-mix(in oklab, var(--accent) 26%, rgb(255 255 255 / 0.06))",
      }}
    >
      {icon && (
        <img
          src={icon}
          alt=""
          draggable={false}
          onLoad={(e) => setLoaded({ src: icon, width: e.currentTarget.naturalWidth })}
          className="pointer-events-none object-contain drop-shadow-[0_2px_6px_rgb(0_0_0/0.45)]"
          style={{ width: inner, height: inner, imageRendering: pixel ? "pixelated" : undefined, opacity: natural ? 1 : 0 }}
        />
      )}
    </span>
  );
}
