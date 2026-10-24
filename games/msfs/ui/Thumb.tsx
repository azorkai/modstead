// Modun küçük resmi: arka uçtan ham bayt (`msfs_thumbnail`) → blob adresi (CSP: img-src blob:).
// Görsel yoksa ya da okunamazsa moddan türeyen poster çizilir. Adresler oturum boyunca önbellekte kalır.

import { useEffect, useState } from "react";
import clsx from "clsx";
import { isTauri } from "@/lib/ipc";
import { api } from "./api";
import { posterCode } from "./format";
import { Poster, posterHue } from "./Poster";
import type { ModEntry } from "./types";

const cache = new Map<string, Promise<string | null>>();

/** Önizleme kipinde örnek görseller (mocks: `previewThumbs`). */
export const previewThumbs = new Map<string, string>();

function load(id: string): Promise<string | null> {
  let p = cache.get(id);
  if (!p) {
    p = isTauri
      ? api
          .thumbnail(id)
          .then((buf) => URL.createObjectURL(new Blob([buf])))
          .catch(() => null)
      : Promise.resolve(previewThumbs.get(id) ?? null);
    cache.set(id, p);
  }
  return p;
}

/** Görsel adresi; yüklenene kadar `undefined`, yoksa `null`. */
export function useThumb(m: Pick<ModEntry, "id"> & { info: { thumbnail: string | null } }): string | null | undefined {
  const has = !!m.info.thumbnail;
  const [state, setState] = useState<{ id: string; url: string | null | undefined }>({ id: m.id, url: has ? undefined : null });
  useEffect(() => {
    if (!has) {
      setState({ id: m.id, url: null });
      return;
    }
    let alive = true;
    void load(m.id).then((url) => alive && setState({ id: m.id, url }));
    return () => {
      alive = false;
    };
  }, [m.id, has]);
  return state.id === m.id ? state.url : undefined;
}

/** Görsel ya da poster; kapsayıcıyı doldurur. Konumlandırmayı (relative/absolute) çağıran verir. */
export function Thumb({ mod, className, imgClassName, bare }: { mod: ModEntry; className?: string; imgClassName?: string; /** Posterde kod yazısı olmasın (üstüne başlık yazılan alanlar). */ bare?: boolean }) {
  const url = useThumb(mod);
  const [failed, setFailed] = useState(false);
  return (
    <div className={clsx("overflow-hidden bg-surface-2", !/\b(absolute|fixed)\b/.test(className ?? "") && "relative", className)}>
      {url === undefined ? (
        <div className="skeleton absolute inset-0 rounded-none" />
      ) : url && !failed ? (
        <img src={url} alt="" draggable={false} onError={() => setFailed(true)} className={clsx("absolute inset-0 size-full object-cover", imgClassName)} />
      ) : (
        <Poster code={bare ? "" : posterCode(mod)} hue={posterHue(mod.info.folder)} kind={mod.info.category} />
      )}
    </div>
  );
}
