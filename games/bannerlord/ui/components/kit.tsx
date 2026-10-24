// Bannerlord sayfalarının bileşenleri: ortak kit (@/ui) + modül logosu.

import { useState } from "react";
import clsx from "clsx";
import { hueOf, initials } from "@/lib/format";
import { useApp } from "../store";

export * from "@/ui";

type ImgStatus = "loading" | "loaded" | "failed";

/** Modül logosu; görsel yoksa ya da yüklenemezse addan türeyen renkli baş harfler. Resmî modüller oyunun vurgusunu taşır. */
export function ModAvatar({ name, size = 32, official, src }: { name: string; size?: number; official?: boolean; src?: string }) {
  const h = hueOf(name);
  const [img, setImg] = useState<{ src?: string; status: ImgStatus }>({ status: "loading" });
  const status: ImgStatus = img.src === src ? img.status : "loading";
  const useImg = !!src && !official && status !== "failed";
  const loaded = useImg && status === "loaded";
  return (
    <div
      className="relative flex shrink-0 items-center justify-center overflow-hidden rounded-[9px] font-semibold tracking-tight"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.36,
        background: loaded
          ? "var(--surface-3)"
          : official
            ? "linear-gradient(160deg, color-mix(in oklab, var(--accent) 30%, var(--surface-3)), var(--surface-2))"
            : `linear-gradient(160deg, oklch(0.5 0.08 ${h}), oklch(0.32 0.05 ${h}))`,
        color: official ? "var(--accent)" : `oklch(0.95 0.04 ${h})`,
        boxShadow: "inset 0 1px 0 rgb(255 255 255 / 0.08), inset 0 0 0 1px rgb(255 255 255 / 0.05)",
      }}
    >
      {!loaded && initials(name)}
      {useImg && (
        <img
          src={src}
          alt=""
          draggable={false}
          decoding="async"
          referrerPolicy="no-referrer"
          onLoad={() => setImg({ src, status: "loaded" })}
          onError={() => setImg({ src, status: "failed" })}
          className={clsx("absolute inset-0 size-full object-cover transition-opacity duration-200", loaded ? "opacity-100" : "opacity-0")}
        />
      )}
      {loaded && <span aria-hidden className="pointer-events-none absolute inset-0 rounded-[inherit]" style={{ boxShadow: "inset 0 0 0 1px color-mix(in oklab, var(--fg) 12%, transparent)" }} />}
    </div>
  );
}

/** Modül kimliğinin logosu; yalnızca o modülün kaydı değişince yeniden çizer. */
export function useModuleImage(id: string | null | undefined): string | undefined {
  return useApp((s) => (id ? s.images[id.toLowerCase()] : undefined));
}

export function ModuleAvatar({ id, name, size, official }: { id: string; name: string; size?: number; official?: boolean }) {
  const src = useModuleImage(official ? null : id);
  return <ModAvatar name={name} size={size} official={official} src={src} />;
}

/** Otağ'daki ilerleme çubuğu adı. */
export { Progress as ProgressBar } from "@/ui";
