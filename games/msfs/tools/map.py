"""Kariyer haritasının coğrafi verisini üretir: games/msfs/ui/career/map/{coarse,detail,places,rivers,urban,roads,runways}.ts

Kaynak: Natural Earth (https://www.naturalearthdata.com/, kamu malı / Public Domain), GeoJSON sürümleri
(https://github.com/nvkelso/natural-earth-vector/tree/master/geojson); pistler OurAirports
(https://ourairports.com/data/, kamu malı / Public Domain).
Kullanım:  python -I games/msfs/tools/map.py <geojson-klasörü> <çıktı-klasörü> [<ourairports-klasörü>] [--only ad,ad]

Klasörde beklenen dosyalar:
  ne_50m_land, ne_50m_lakes, ne_50m_admin_0_boundary_lines_land   → coarse.ts (dünya görünümü, tek parça)
  ne_10m_land, ne_10m_lakes, ne_10m_admin_0_boundary_lines_land   → detail.ts (10°'lik karolar)
  ne_10m_populated_places                                          → places.ts (şehir adları, Türkçe ve İngilizce)
  ne_10m_rivers_lake_centerlines                                   → rivers.ts (akarsular, üç önem sınıfı)
  ne_10m_urban_areas                                               → urban.ts (yerleşim alanları)
  ne_10m_roads                                                     → roads.ts (ana ve ikincil yollar)
  OurAirports airports.csv + runways.csv                           → runways.ts (uçları bilinen açık pistler)
`--only` yalnızca adı verilen çıktıları üretir (ör. `--only rivers,urban,roads,runways`).

Düzlem eşdikdörtgendir: x = boylam + 180, y = 90 - enlem (derece). Halkalar ve çizgiler Douglas-Peucker ile
sadeleştirilir, karolara kırpılır, tamsayıya yuvarlanır ve Google "encoded polyline" biçiminde yazılır (ilk nokta
mutlak, sonrakiler fark; parçalar boşlukla ayrılır). Kıyı çizgisi ayrıca saklanmaz: arayüz onu kara ve göl
halkalarından, karo kenarı üzerinde uzanan (kırpmanın eklediği) kenarları atlayarak türetir.
"""

import csv
import json
import math
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


def tile_rings(rings, q, enc=encode):
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
                by.setdefault((tx, ty), []).append(enc(qq))
    return by


def tile_lines(lines, q, enc=encode):
    by = {}
    for pts in lines:
        if len(pts) < 2:
            continue
        for tx, ty in tiles_of(bbox(pts)):
            x0, y0 = tx * TILE, ty * TILE
            for part in clip_line(pts, x0, y0, x0 + TILE, y0 + TILE):
                qq = quantize(part, q, False)
                if len(qq) >= 2:
                    by.setdefault((tx, ty), []).append(enc(qq))
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


def chained(by):
    """Karodaki parçaları zincirleme kodlar: her parçanın ilk noktası da bir önceki parçanın son noktasına göre farktır
    (yakın parçalarda başlangıç birkaç karakterde kalır). Arayüz bunu `decode(s, true)` ile çözer."""
    out = {}
    for key, parts in by.items():
        px = py = 0
        enc = []
        for pts in parts:
            s = []
            for x, y in pts:
                s.append(_num(x - px))
                s.append(_num(y - py))
                px, py = x, y
            enc.append("".join(s))
        out[key] = enc
    return out


def _tiles_ts(dst, comment, q, by, width, header=HEADER):
    """Karolu katman dosyası: değer tek parça dizisi ya da `width` uzunlukta sınıf dizisi."""
    keys = sorted({k for layer in by for k in layer}, key=lambda k: (k[1], k[0]))
    with open(dst, "w", encoding="utf-8", newline="\n") as o:
        o.write(header)
        o.write(f"// Karo anahtarı \"x_y\": x = (boylam + 180) / {TILE}, y = (90 - enlem) / {TILE}. {comment}\n")
        o.write(f"export const Q = {q};\n")
        kind = "string" if width == 1 else "[" + ", ".join(["string"] * width) + "]"
        o.write(f"export const TILES: Record<string, {kind}> = {{\n")
        for k in keys:
            row = [" ".join(layer.get(k, [])) for layer in by]
            val = js(row[0]) if width == 1 else "[" + ", ".join(js(r) for r in row) + "]"
            o.write(f'  "{k[0]}_{k[1]}": {val},\n')
        o.write("};\n")
    return len(keys)


def rivers(src, dst, tol=0.005):
    """Akarsu ve göl orta çizgileri; sınıf Natural Earth önem derecesinden: 0–3 büyük, 4–6 orta, 7–8 küçük (9 ve
    üstü alınmaz). Küçükler biraz daha sadeleşir: yalnızca yakında görünürler, orada da kıyı kadar keskin olmaları
    gerekmez."""
    q = 500
    groups = [[], [], []]
    for f in load(src, "ne_10m_rivers_lake_centerlines"):
        p = f["properties"]
        rank = p.get("scalerank") or 10
        if p.get("featurecla") not in ("River", "Lake Centerline") or rank > 8:
            continue
        groups[0 if rank <= 3 else 1 if rank <= 6 else 2].append(f)
    by = [chained(tile_lines(polylines(g, tol if i < 2 else tol * 1.4), q, list)) for i, g in enumerate(groups)]
    n = _tiles_ts(dst, "Değer: [büyük, orta, küçük] akarsular, zincirleme kodlu.", q, by, 3)
    print(f"rivers: {n} karo, {os.path.getsize(dst) // 1024} KB")


def urban(src, dst, tol=0.01, min_km2=8.0):
    """Yerleşim alanları (dolgu); çok küçük alanlar atılır. Kaynak ~1 km çözünürlüklü uydu verisinden türediği için
    ~1 km'lik sadeleştirme biçimi bozmaz."""
    q = 500
    feats = [f for f in load(src, "ne_10m_urban_areas") if (f["properties"].get("area_sqkm") or 0) >= min_km2]
    by = [chained(tile_rings(polygons(feats, tol, 0.0006), q, list))]
    n = _tiles_ts(dst, "Değer: yerleşim alanı halkaları, zincirleme kodlu.", q, by, 1)
    print(f"urban: {n} karo, {os.path.getsize(dst) // 1024} KB")


ROAD_MAJOR = ("Major Highway", "Beltway", "Bypass")


def roads(src, dst, tol=0.005, secondary_rank=5):
    """Ana yollar (otoyol, çevre yolu) ve önemli ikincil yollar; feribot ve patikalar alınmaz."""
    q = 500
    major, minor = [], []
    for f in load(src, "ne_10m_roads"):
        p = f["properties"]
        t = p.get("type")
        if t in ROAD_MAJOR:
            major.append(f)
        elif t == "Secondary Highway" and (p.get("scalerank") or 10) <= secondary_rank:
            minor.append(f)
    by = [chained(tile_lines(polylines(major, tol), q, list)), chained(tile_lines(polylines(minor, tol), q, list))]
    n = _tiles_ts(dst, "Değer: [ana, ikincil] yollar, zincirleme kodlu.", q, by, 2)
    print(f"roads: {n} karo, {os.path.getsize(dst) // 1024} KB")


RUNWAY_TYPES = ("large_airport", "medium_airport", "small_airport", "seaplane_base")
PAVED = ("ASP", "CON", "BIT", "PEM", "TAR", "MAC", "PAV", "ASF", "CEM")


def surface_class(s):
    s = (s or "").upper()
    if any(s.startswith(p) or p in s for p in PAVED):
        return "P"
    if "WAT" in s:
        return "W"
    return "U"


def clean(s):
    return " ".join((s or "").replace("\t", " ").split())


def _opposite(ident):
    """Pistin karşı ucunun olağan adı ("05L" → "23R"); sayı değilse boş."""
    digits = "".join(c for c in ident if c.isdigit())
    if not digits or len(digits) > 2 or ident[: len(digits)] != digits:
        return ""
    n = (int(digits) + 18 - 1) % 36 + 1
    side = {"L": "R", "R": "L", "C": "C", "": ""}.get(ident[len(digits) :], None)
    return "" if side is None else f"{n:02d}{side}"


def runways(folder, dst):
    """Uçları bilinen açık pistler. Parça: kodlanmış sayılar + ":" + bir uç [+ ":" + öbür uç, olağan adı değilse].
    Sayılar (1/Q derece, karo köşesine göre): x1, y1 (karodaki bir önceki pistin x1, y1'ine göre fark; pistler yakınlık
    sırasında), dx, dy (öbür uç), genişlik (5 m birimi), yüzey (0 sert, 1 toprak/çim, 2 su)."""
    q = 20000
    known = set()
    with open(os.path.join(folder, "airports.csv"), encoding="utf-8", newline="") as f:
        for a in csv.DictReader(f):
            if a["type"] in RUNWAY_TYPES:
                known.add(a["id"])
    rows = {}
    with open(os.path.join(folder, "runways.csv"), encoding="utf-8", newline="") as f:
        for r in csv.DictReader(f):
            if r["closed"] == "1" or r["airport_ref"] not in known:
                continue
            try:
                la1, lo1 = float(r["le_latitude_deg"]), float(r["le_longitude_deg"])
                la2, lo2 = float(r["he_latitude_deg"]), float(r["he_longitude_deg"])
            except ValueError:
                continue
            # Uçları çok yakın ya da çok uzak (veri hatası) olan pistler alınmaz.
            span = math.hypot((lo2 - lo1) * math.cos(math.radians(la1)), la2 - la1) * 60 * 1852
            if span < 150 or span > 6500:
                continue
            try:
                width = float(r["width_ft"] or 0) * 0.3048
            except ValueError:
                width = 0
            if not width or width > 150:
                width = 45 if span > 2400 else 30 if span > 1200 else 18
            x1, y1, x2, y2 = lo1 + 180, 90 - la1, lo2 + 180, 90 - la2
            tx, ty = int(min(x1, 359.999) // TILE), int(min(y1, 179.999) // TILE)
            le = clean(r["le_ident"]).upper().replace(" ", "").replace(":", "")
            he = clean(r["he_ident"]).upper().replace(" ", "").replace(":", "")
            ends = le if he == _opposite(le) else f"{le}:{he}"
            rows.setdefault((tx, ty), []).append((x1, y1, x2, y2, max(1, round(width / 5)), surface_class(r["surface"]), ends))
    by = {}
    for (tx, ty), items in rows.items():
        # Yakınlık sırası: çeyrek derecelik şeritler, şeritte boylama göre (yakın pistlerin farkı küçük kalır).
        items.sort(key=lambda it: (int(it[1] * 4), it[0] if int(it[1] * 4) % 2 == 0 else -it[0]))
        ox, oy = tx * TILE * q, ty * TILE * q
        px = py = 0
        parts = []
        for x1, y1, x2, y2, w, s, ends in items:
            a, b = round(x1 * q) - ox, round(y1 * q) - oy
            c, d = round(x2 * q) - ox - a, round(y2 * q) - oy - b
            nums = [a - px, b - py, c, d, w, {"P": 0, "U": 1, "W": 2}[s]]
            px, py = a, b
            parts.append("".join(_num(v) for v in nums) + ":" + ends)
        by[(tx, ty)] = parts
    header = "// OurAirports (ourairports.com, kamu malı) · games/msfs/tools/map.py ile üretildi; elle düzenleme.\n// Düzlem: x = boylam + 180, y = 90 - enlem.\n"
    n = _tiles_ts(dst, "Değer: pistler (bkz. tools/map.py runways).", q, [by], 1, header)
    total = sum(len(v) for v in rows.values())
    print(f"runways: {total} pist, {n} karo, {os.path.getsize(dst) // 1024} KB")


OUTPUTS = ("coarse", "detail", "places", "rivers", "urban", "roads", "runways")


def main(src, out, airports=None, only=None):
    os.makedirs(out, exist_ok=True)
    want = set(only or OUTPUTS)
    if "coarse" in want:
        coarse(src, os.path.join(out, "coarse.ts"))
    if "detail" in want:
        detail(src, os.path.join(out, "detail.ts"))
    if "places" in want:
        places(src, os.path.join(out, "places.ts"))
    if "rivers" in want:
        rivers(src, os.path.join(out, "rivers.ts"))
    if "urban" in want:
        urban(src, os.path.join(out, "urban.ts"))
    if "roads" in want:
        roads(src, os.path.join(out, "roads.ts"))
    if "runways" in want and airports:
        runways(airports, os.path.join(out, "runways.ts"))


if __name__ == "__main__":
    args = sys.argv[1:]
    only = None
    if "--only" in args:
        i = args.index("--only")
        only = args[i + 1].split(",")
        del args[i : i + 2]
    main(args[0], args[1], args[2] if len(args) > 2 else None, only)
