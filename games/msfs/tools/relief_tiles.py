"""Kariyer haritasının çevrimdışı arazi katmanını üretir: games/msfs/data/relief.tiles

Kaynak: Natural Earth II, gölgeli kabartma ve su (NE2_50M_SR_W, 1:50m raster; kamu malı / Public Domain).
  https://www.naturalearthdata.com/downloads/50m-raster-data/50m-natural-earth-2/
  İndirme: https://naciscdn.org/naturalearth/50m/raster/NE2_50M_SR_W.zip (içindeki NE2_50M_SR_W.tif)
  Koşullar: https://www.naturalearthdata.com/about/terms-of-use/

Kullanım (depodaki paket bu varsayılanlarla üretildi: z0-5, JPEG, kalite 80):
  python -I games/msfs/tools/relief_tiles.py <NE2_50M_SR_W.tif> games/msfs/data/relief.tiles [--max-zoom 5]
      [--format jpeg|webp] [--quality 80]

Biçim JPEG'dir: simin içindeki panelin tarayıcısı (Coherent GT) WebP açmaz; karolar orada da çizilir. 50m kaynak
z5'te kendi çözünürlüğüne denk gelir (10800 px ≈ 8192 px); z6 yalnızca büyütür ve paketi yaklaşık dört katına çıkarır.

Gereken: Python 3.10+, Pillow (WebP için libwebp'li derleme) ve numpy. Başka araç (GDAL vb.) gerekmez.
Aynı girdi ve aynı Pillow/numpy sürümleriyle çıktı bayt bayt aynıdır (depodaki paket: Python 3.10, Pillow 11.3,
numpy 2.2).

İzdüşüm: kaynak eşdikdörtgendir (boylam/enlem, -180..180, -90..90; .tfw'deki gibi). Karolar Web Mercator'dadır
(EPSG:3857, XYZ, 256 px, ±85.0511°). Boylam iki izdüşümde de doğrusal olduğundan her yakınlaştırma düzeyi için
kaynak önce yatayda karo genişliğine (256·2^z) yumuşak süzgeçle (Lanczos) ölçeklenir; sonra her çıktı satırının
enlemi hesaplanıp kaynakta iki komşu satır arasında doğrusal ara değerleme yapılır (kutuplara doğru Mercator
yalnızca büyütür, örtüşme olmaz).

Paket biçimi (küçük uçlu; Rust tarafı: games/msfs/src/career/tiles.rs):
  0  "MSTL"            sihirli sayı
  4  u8  sürüm (1)
  5  u8  en küçük yakınlaştırma (0)
  6  u8  en büyük yakınlaştırma
  7  u8  biçim (1 = WebP, 2 = JPEG)
  8  u32 karo sayısı = Σ 4^z
  12 dizin: her karo için (u32 başlangıç, u32 uzunluk); sıra z artan, sonra y, sonra x:
         sıra = (4^z - 4^zmin) / 3 + y·2^z + x
  …  karo verileri. Aynı içerikli karolar (ör. kutup karoları) bir kez yazılır, dizin aynı yeri gösterir.
"""

import argparse
import hashlib
import io
import os
import struct
import sys

import numpy as np
from PIL import Image

TILE = 256
MAGIC = b"MSTL"
VERSION = 1
FORMATS = {"webp": 1, "jpeg": 2}


def mercator_rows(width, src_height):
    """Her çıktı satırı için kaynakta (eşdikdörtgen, `src_height` satır) iki komşu satır ve ağırlık."""
    py = np.arange(width, dtype=np.float64) + 0.5
    lat = np.degrees(np.arctan(np.sinh(np.pi * (1.0 - 2.0 * py / width))))
    f = (90.0 - lat) / 180.0 * src_height - 0.5
    f = np.clip(f, 0.0, src_height - 1.0)
    i0 = np.floor(f).astype(np.int64)
    i1 = np.minimum(i0 + 1, src_height - 1)
    w = (f - i0).astype(np.float32)
    return i0, i1, w


def encode(tile, fmt, quality):
    buf = io.BytesIO()
    img = Image.fromarray(tile)
    if fmt == "webp":
        img.save(buf, format="WEBP", quality=quality, method=6)
    else:
        # Temel (progressive olmayan) JPEG: simin içindeki tarayıcı dahil her yerde açılır.
        img.save(buf, format="JPEG", quality=quality, optimize=True, progressive=False, subsampling="4:2:0")
    return buf.getvalue()


def render_zoom(src, z, fmt, quality):
    """Bir yakınlaştırma düzeyinin karoları: [(y, x, bayt)], y ve x artan."""
    width = TILE << z
    height = width // 2
    level = np.asarray(src.resize((width, height), Image.LANCZOS), dtype=np.float32)
    i0, i1, w = mercator_rows(width, height)
    n = 1 << z
    out = []
    for ty in range(n):
        rows = slice(ty * TILE, (ty + 1) * TILE)
        wy = w[rows][:, None, None]
        strip = level[i0[rows]] * (1.0 - wy) + level[i1[rows]] * wy
        strip = np.clip(np.rint(strip), 0, 255).astype(np.uint8)
        for tx in range(n):
            out.append((ty, tx, encode(np.ascontiguousarray(strip[:, tx * TILE:(tx + 1) * TILE]), fmt, quality)))
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("source", help="NE2_50M_SR_W.tif (eşdikdörtgen, bütün dünya)")
    ap.add_argument("output", help="paket dosyası (games/msfs/data/relief.tiles)")
    ap.add_argument("--min-zoom", type=int, default=0)
    ap.add_argument("--max-zoom", type=int, default=5)
    ap.add_argument("--format", choices=sorted(FORMATS), default="jpeg")
    ap.add_argument("--quality", type=int, default=80)
    a = ap.parse_args()
    if not (0 <= a.min_zoom <= a.max_zoom <= 7):
        sys.exit("yakınlaştırma 0..7 arasında olmalı")

    Image.MAX_IMAGE_PIXELS = None
    src = Image.open(a.source).convert("RGB")
    if abs(src.width - 2 * src.height) > 1:
        sys.exit(f"kaynak 2:1 eşdikdörtgen değil: {src.width}x{src.height}")

    blobs = []  # yazılacak benzersiz karolar
    seen = {}  # özet → (başlangıç, uzunluk)
    index = []
    offset = 12 + 8 * sum(4 ** z for z in range(a.min_zoom, a.max_zoom + 1))
    for z in range(a.min_zoom, a.max_zoom + 1):
        tiles = render_zoom(src, z, a.format, a.quality)
        level_bytes = 0
        for _, _, data in tiles:
            key = hashlib.sha256(data).digest()
            if key not in seen:
                seen[key] = (offset, len(data))
                blobs.append(data)
                offset += len(data)
                level_bytes += len(data)
            index.append(seen[key])
        print(f"z{z}: {len(tiles)} karo, {level_bytes / 1024:.0f} KB yeni veri", file=sys.stderr)

    if offset >= 2 ** 32:
        sys.exit("paket 4 GB'ı aşıyor")
    os.makedirs(os.path.dirname(os.path.abspath(a.output)), exist_ok=True)
    with open(a.output, "wb") as f:
        f.write(MAGIC)
        f.write(struct.pack("<BBBBI", VERSION, a.min_zoom, a.max_zoom, FORMATS[a.format], len(index)))
        for off, ln in index:
            f.write(struct.pack("<II", off, ln))
        for b in blobs:
            f.write(b)
    print(f"{a.output}: {len(index)} karo ({len(blobs)} benzersiz), {offset / 1024 / 1024:.2f} MB", file=sys.stderr)


if __name__ == "__main__":
    main()
