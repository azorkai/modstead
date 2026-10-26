// Uçağın görseli: mod uçağıysa paketin kendi küçük resmi (seçilen boyanınki), değilse ailesinin gerçek fotoğrafı;
// ailesi bilinmiyorsa sınıf çizimi, o da yoksa simge.

import { useState } from "react";
import clsx from "clsx";
import { Plane } from "lucide-react";
import { useAircraftOptions } from "../queries";
import type { AircraftClass, AircraftOption } from "../types";
import { aircraftVisual } from "./families";
import { useAircraftThumb } from "./thumbs";

export function AircraftPhoto({
  title,
  cls,
  className,
  children,
  livery,
  option,
}: {
  title: string;
  cls: AircraftClass | null | undefined;
  className?: string;
  children?: React.ReactNode;
  /** Mod uçağında bu boyanın küçük resmi gösterilir. */
  livery?: string;
  /** Verilmezse uçak listesinin önbelleğinden bulunur (liste hiç istenmediyse aile fotoğrafı). */
  option?: AircraftOption;
}) {
  const { data: options } = useAircraftOptions(false);
  const opt = option ?? options?.find((o) => o.title === title);
  const thumb = useAircraftThumb(opt?.thumb ? opt.title : null, livery ?? "");
  const v = aircraftVisual(title, cls);
  const [failed, setFailed] = useState<string | null>(null);
  const src = thumb && failed !== thumb ? thumb : v.src && failed !== v.src ? v.src : undefined;
  const real = !!thumb && src === thumb;
  return (
    <div className={clsx("relative overflow-hidden bg-[color-mix(in_oklab,var(--fg)_6%,var(--surface-2))]", className)}>
      {thumb === undefined ? (
        <div className="skeleton absolute inset-0 rounded-none" />
      ) : src ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          draggable={false}
          onError={() => setFailed(src)}
          className={clsx("absolute inset-0 size-full", real || v.photo ? "object-cover" : "object-contain p-[8%] opacity-80")}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-muted">
          <Plane className="size-1/4 max-h-8 max-w-8" />
        </div>
      )}
      {children}
    </div>
  );
}
