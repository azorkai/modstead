"""Kariyer haritasının coğrafi verisini üretir: games/msfs/ui/career/map/{coarse,detail,places}.ts

Kaynak: Natural Earth (https://www.naturalearthdata.com/, kamu malı / Public Domain), GeoJSON sürümleri
(https://github.com/nvkelso/natural-earth-vector/tree/master/geojson).
Kullanım:  python -I games/msfs/tools/map.py <geojson-klasörü> <çıktı-klasörü>

Klasörde beklenen dosyalar:
  ne_50m_land, ne_50m_lakes, ne_50m_admin_0_boundary_lines_land   → coarse.ts (dünya görünümü, tek parça)
  ne_10m_land, ne_10m_lakes, ne_10m_admin_0_boundary_lines_land   → detail.ts (10°'lik karolar)
  ne_10m_populated_places                                          → places.ts (şehir adları, Türkçe ve İngilizce)

Düzlem eşdikdörtgendir: x = boylam + 180, y = 90 - enlem (derece). Halkalar ve çizgiler Douglas-Peucker ile
sadeleştirilir, karolara kırpılır, tamsayıya yuvarlanır ve Google "encoded polyline" biçiminde yazılır (ilk nokta
mutlak, sonrakiler fark; parçalar boşlukla ayrılır). Kıyı çizgisi ayrıca saklanmaz: arayüz onu kara ve göl
halkalarından, karo kenarı üzerinde uzanan (kırpmanın eklediği) kenarları atlayarak türetir.
"""

import json
import os
import sys

TILE = 10  # derece


def load(folder, name):
    with open(os.path.join(folder, name + ".geojson"), encoding="utf-8") as f:
        return json.load(f)["features"]


def simplify(points, tol):
    """Douglas-Peucker; kapalı halkada uçlar aynı noktadır, o zaman uzaklık noktaya göre ölçülür."""
    if len(points) < 4 or tol <= 0:
        return points
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        a, b = stack.pop()
        ax, ay = points[a]
        bx, by = points[b]
        dx, dy = bx - ax, by - ay
        norm = (dx * dx + dy * dy) ** 0.5
        best, idx = 0.0, -1
        for i in range(a + 1, b):
            px, py = points[i]
            if norm < 1e-12:
                d = ((px - ax) ** 2 + (py - ay) ** 2) ** 0.5
            else:
                d = abs(dy * px - dx * py + bx * ay - by * ax) / norm
            if d > best:
                best, idx = d, i
        if best > tol and idx > 0:
            keep[idx] = True
            stack.append((a, idx))
            stack.append((idx, b))
    return [p for p, k in zip(points, keep) if k]


def project(coords):
    return [(lon + 180.0, 90.0 - lat) for lon, lat in coords]


def rings_of(feature):
    g = feature["geometry"]
    if g is None:
        return []
    polys = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]] if g["type"] == "Polygon" else []
    return [ring for poly in polys for ring in poly]


def lines_of(feature):
    g = feature["geometry"]
    if g is None:
        return []
    if g["type"] == "LineString":
        return [g["coordinates"]]
    if g["type"] == "MultiLineString":
        return g["coordinates"]
    return []


def bbox(pts):
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    return min(xs), min(ys), max(xs), max(ys)


def area(q):
    s = 0
    for i in range(len(q)):
        x1, y1 = q[i - 1]
        x2, y2 = q[i]
        s += x1 * y2 - x2 * y1
    return abs(s) / 2


# --- Kırpma ---------------------------------------------------------------------------------------------------


def _clip(points, inside, inter):
    out = []
    if not points:
        return out
    prev = points[-1]
    pin = inside(prev)
    for cur in points:
        cin = inside(cur)
        if cin:
            if not pin:
                out.append(inter(prev, cur))
            out.append(cur)
        elif pin:
            out.append(inter(prev, cur))
        prev, pin = cur, cin
    return out


def _at_x(xb):
    return lambda a, b: (xb, a[1] + (b[1] - a[1]) * (xb - a[0]) / (b[0] - a[0]))


def _at_y(yb):
    return lambda a, b: (a[0] + (b[0] - a[0]) * (yb - a[1]) / (b[1] - a[1]), yb)


def clip_ring(pts, x0, y0, x1, y1):
    """Sutherland-Hodgman: açık halka (son nokta ilkini tekrarlamaz). Eklenen kenarlar hep karo kenarı üzerindedir."""
    p = _clip(pts, lambda q: q[0] >= x0, _at_x(x0))
    p = _clip(p, lambda q: q[0] <= x1, _at_x(x1))
    p = _clip(p, lambda q: q[1] >= y0, _at_y(y0))
    return _clip(p, lambda q: q[1] <= y1, _at_y(y1))


def clip_line(pts, x0, y0, x1, y1):
    """Liang-Barsky ile parça parça; ardışık içerideki parçalar tek çizgide birleşir."""
    out, cur = [], []
    for a, b in zip(pts, pts[1:]):
        dx, dy = b[0] - a[0], b[1] - a[1]
        t0, t1, ok = 0.0, 1.0, True
        for p, q in ((-dx, a[0] - x0), (dx, x1 - a[0]), (-dy, a[1] - y0), (dy, y1 - a[1])):
            if p == 0:
                if q < 0:
                    ok = False
                    break
            else:
                r = q / p
                if p < 0:
                    t0 = max(t0, r)
                else:
                    t1 = min(t1, r)
                if t0 > t1:
                    ok = False
                    break
        if not ok:
            if len(cur) > 1:
                out.append(cur)
            cur = []
            continue
        s = (a[0] + t0 * dx, a[1] + t0 * dy)
        e = (a[0] + t1 * dx, a[1] + t1 * dy)
        if cur and cur[-1] == s:
            cur.append(e)
        else:
            if len(cur) > 1:
                out.append(cur)
            cur = [s, e]
        if t1 < 1.0:
            out.append(cur)
            cur = []
    if len(cur) > 1:
        out.append(cur)
    return out


# --- Kodlama --------------------------------------------------------------------------------------------------


def quantize(pts, q, closed):
    out = []
    for x, y in pts:
        p = (round(x * q), round(y * q))
        if not out or out[-1] != p:
            out.append(p)
    if closed and len(out) > 1 and out[0] == out[-1]:
        out.pop()
    return out


def _num(v):
    v = ~(v << 1) if v < 0 else v << 1
    s = []
    while v >= 0x20:
        s.append(chr((0x20 | (v & 0x1F)) + 63))
        v >>= 5
    s.append(chr(v + 63))
    return "".join(s)


def encode(pts):
    px = py = 0
    s = []
    for x, y in pts:
        s.append(_num(x - px))
        s.append(_num(y - py))
        px, py = x, y
    return "".join(s)


# --- Katmanlar ------------------------------------------------------------------------------------------------


def polygons(features, tol, min_area=0.0):
    """Sadeleştirilmiş açık halkalar (çok küçük göller atılır)."""
    out = []
    for f in features:
        for ring in rings_of(f):
            pts = simplify(project(ring), tol)
            if len(pts) > 1 and pts[0] == pts[-1]:
                pts = pts[:-1]
            if len(pts) < 3 or (min_area and area(pts) < min_area):
                continue
            out.append(pts)
    return out


def polylines(features, tol):
    return [simplify(project(line), tol) for f in features for line in lines_of(f)]


def tiles_of(b):
    x0, y0, x1, y1 = b
    for ty in range(max(0, int(y0 // TILE)), min(180 // TILE - 1, int(y1 // TILE)) + 1):
        for tx in range(max(0, int(x0 // TILE)), min(360 // TILE - 1, int(x1 // TILE)) + 1):
            yield tx, ty


def tile_rings(rings, q):
    by = {}
    for pts in rings:
        b = bbox(pts)
        for tx, ty in tiles_of(b):
            x0, y0 = tx * TILE, ty * TILE
            x1, y1 = x0 + TILE, y0 + TILE
            inside = b[0] >= x0 and b[2] <= x1 and b[1] >= y0 and b[3] <= y1
            clipped = pts if inside else clip_ring(pts, x0, y0, x1, y1)
            qq = quantize(clipped, q, True)
            if len(qq) >= 3 and area(qq) > 0:
                by.setdefault((tx, ty), []).append(encode(qq))
    return by


def tile_lines(lines, q):
    by = {}
    for pts in lines:
        if len(pts) < 2:
            continue
        for tx, ty in tiles_of(bbox(pts)):
            x0, y0 = tx * TILE, ty * TILE
            for part in clip_line(pts, x0, y0, x0 + TILE, y0 + TILE):
                qq = quantize(part, q, False)
                if len(qq) >= 2:
                    by.setdefault((tx, ty), []).append(encode(qq))
    return by


def js(s):
    return json.dumps(s, ensure_ascii=False)


HEADER = (
    "// Natural Earth (naturalearthdata.com, kamu malı) · games/msfs/tools/map.py ile üretildi; elle düzenleme.\n"
    "// Düzlem: x = boylam + 180, y = 90 - enlem. Parçalar \"encoded polyline\" (boşlukla ayrılmış).\n"
)


def coarse(src, dst):
    q = 100
    land = [encode(quantize(p, q, True)) for p in polygons(load(src, "ne_50m_land"), 0.02)]
    lakes = [encode(quantize(p, q, True)) for p in polygons(load(src, "ne_50m_lakes"), 0.02, 0.05)]
    borders = [encode(quantize(p, q, False)) for p in polylines(load(src, "ne_50m_admin_0_boundary_lines_land"), 0.02)]
    with open(dst, "w", encoding="utf-8", newline="\n") as o:
        o.write(HEADER)
        o.write(f"export const Q = {q};\n")
        o.write(f"export const LAND = {js(' '.join(land))};\n")
        o.write(f"export const LAKES = {js(' '.join(lakes))};\n")
        o.write(f"export const BORDERS = {js(' '.join(borders))};\n")
    print(f"coarse: {len(land)} kara, {len(lakes)} göl, {len(borders)} sınır, {os.path.getsize(dst) // 1024} KB")


def detail(src, dst, tol=0.003):
    q = 1000
    land = tile_rings(polygons(load(src, "ne_10m_land"), tol), q)
    lakes = tile_rings(polygons(load(src, "ne_10m_lakes"), tol, 0.0006), q)
    borders = tile_lines(polylines(load(src, "ne_10m_admin_0_boundary_lines_land"), tol), q)
    keys = sorted(set(land) | set(lakes) | set(borders), key=lambda k: (k[1], k[0]))
    with open(dst, "w", encoding="utf-8", newline="\n") as o:
        o.write(HEADER)
        o.write(f"// Karo anahtarı \"x_y\": x = (boylam + 180) / {TILE}, y = (90 - enlem) / {TILE}. Değer: [kara, göl, sınır].\n")
        o.write(f"export const Q = {q};\nexport const TILE = {TILE};\n")
        o.write("export const TILES: Record<string, [string, string, string]> = {\n")
        for k in keys:
            row = [" ".join(land.get(k, [])), " ".join(lakes.get(k, [])), " ".join(borders.get(k, []))]
            o.write(f'  "{k[0]}_{k[1]}": [{js(row[0])}, {js(row[1])}, {js(row[2])}],\n')
        o.write("};\n")
    print(f"detail: {len(keys)} karo, {os.path.getsize(dst) // 1024} KB")


def places(src, dst):
    rows = []
    for f in load(src, "ne_10m_populated_places"):
        p = f["properties"]
        mz = float(p.get("MIN_ZOOM") or 10)
        if mz > 8.5:
            continue
        en = (p.get("NAME_EN") or p.get("NAME") or "").strip()
        tr = (p.get("NAME_TR") or en).strip()
        if not en or "|" in en + tr:
            continue
        cap = 1 if p.get("ADM0CAP") == 1 else 0
        rows.append((mz, -(p.get("POP_MAX") or 0), f"{p['LATITUDE']:.3f}|{p['LONGITUDE']:.3f}|{mz:g}|{cap}|{tr}|{'' if en == tr else en}"))
    rows.sort()
    with open(dst, "w", encoding="utf-8", newline="\n") as o:
        o.write("// Natural Earth Populated Places (naturalearthdata.com, kamu malı) · games/msfs/tools/map.py ile üretildi.\n")
        o.write("// Satır: enlem|boylam|en küçük yakınlık|başkent|Türkçe ad|İngilizce ad (aynıysa boş). Önem sırasıyla.\n")
        o.write(f"export const PLACES = {js(chr(10).join(r[2] for r in rows))};\n")
    print(f"places: {len(rows)} yer, {os.path.getsize(dst) // 1024} KB")


def main(src, out):
    os.makedirs(out, exist_ok=True)
    coarse(src, os.path.join(out, "coarse.ts"))
    detail(src, os.path.join(out, "detail.ts"))
    places(src, os.path.join(out, "places.ts"))


if __name__ == "__main__":
    main(*sys.argv[1:3])
