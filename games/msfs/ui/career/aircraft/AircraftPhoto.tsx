// Uçağın gerçek fotoğrafı; ailesi bilinmiyorsa sınıf çizimi, o da yoksa simge.

import { useState } from "react";
import clsx from "clsx";
import { Plane } from "lucide-react";
import type { AircraftClass } from "../types";
import { aircraftVisual } from "./families";

export function AircraftPhoto({ title, cls, className, children }: { title: string; cls: AircraftClass | null | undefined; className?: string; children?: React.ReactNode }) {
  const v = aircraftVisual(title, cls);
  const [failed, setFailed] = useState(false);
  const show = !!v.src && !failed;
  return (
    <div className={clsx("relative overflow-hidden bg-[color-mix(in_oklab,var(--fg)_6%,var(--surface-2))]", className)}>
      {show ? (
        <img
          src={v.src}
          alt=""
          loading="lazy"
          draggable={false}
          onError={() => setFailed(true)}
          className={clsx("absolute inset-0 size-full", v.photo ? "object-cover" : "object-contain p-[8%] opacity-80")}
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
