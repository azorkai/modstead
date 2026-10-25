"""Kariyer kipi için havalimanı veritabanını üretir: games/msfs/src/career/airports.tsv

Kaynak: OurAirports (https://ourairports.com/data/, kamu malı / Public Domain).
Kullanım:  python -I games/msfs/tools/airports.py <airports.csv> <runways.csv> <çıktı.tsv>

Kapalı alanlar, helikopter pistleri ve balon alanları alınmaz. Kimlik MSFS'in kullandığı biçimdedir:
ICAO kodu varsa o, yoksa GPS kodu, yoksa OurAirports kimliği. Her satır:

  kimlik  tür(L/M/S/W)  ad  şehir  ülke  enlem  boylam  rakım_ft  en_uzun_pist_ft  yüzey(P/U/W)  ışık(0/1)  tarifeli(0/1)  pist

`pist` en uzun açık pistin iki ucu ("05/23"); uçuşu pistte başlatırken kullanılır.
"""

import csv
import sys

TYPES = {"large_airport": "L", "medium_airport": "M", "small_airport": "S", "seaplane_base": "W"}
PAVED = ("ASP", "CON", "BIT", "PEM", "TAR", "MAC", "PAV", "ASF", "CEM")
WATER = ("WAT",)


def surface_class(s: str) -> str:
    s = (s or "").upper()
    if any(s.startswith(p) or p in s for p in PAVED):
        return "P"
    if any(p in s for p in WATER):
        return "W"
    return "U"


def clean(s: str) -> str:
    return " ".join((s or "").replace("\t", " ").split())


def main(airports_csv: str, runways_csv: str, out_tsv: str) -> None:
    best = {}
    with open(runways_csv, encoding="utf-8", newline="") as f:
        for r in csv.DictReader(f):
            if r["closed"] == "1":
                continue
            try:
                length = int(float(r["length_ft"] or 0))
            except ValueError:
                length = 0
            ref = r["airport_ref"]
            cur = best.get(ref)
            # Aynı uzunlukta kaplamalı pist çimden önce gelir.
            key = (length, surface_class(r["surface"]) == "P")
            if cur is None or key > cur[0]:
                ends = "/".join(e for e in (clean(r["le_ident"]), clean(r["he_ident"])) if e)
                best[ref] = (key, length, surface_class(r["surface"]), r["lighted"] == "1", ends)

    rows = []
    seen = set()
    with open(airports_csv, encoding="utf-8", newline="") as f:
        for a in csv.DictReader(f):
            t = TYPES.get(a["type"])
            if not t:
                continue
            ident = clean(a["icao_code"] or a["gps_code"] or a["ident"]).upper()
            if not ident or len(ident) > 8 or ident in seen:
                continue
            rw = best.get(a["id"])
            if t != "W" and (rw is None or rw[1] < 300):
                # Pist bilgisi olmayan kara havalimanında iş üretilemez (uçak sınıfı seçilemez).
                continue
            seen.add(ident)
            length, surf, lit, ends = (rw[1], rw[2], rw[3], rw[4]) if rw else (0, "W", False, "")
            try:
                elev = int(float(a["elevation_ft"] or 0))
            except ValueError:
                elev = 0
            rows.append(
                "\t".join(
                    [
                        ident,
                        t,
                        clean(a["name"]),
                        clean(a["municipality"]),
                        a["iso_country"],
                        f"{float(a['latitude_deg']):.5f}",
                        f"{float(a['longitude_deg']):.5f}",
                        str(elev),
                        str(length),
                        surf,
                        "1" if lit else "0",
                        "1" if a["scheduled_service"] == "yes" else "0",
                        ends,
                    ]
                )
            )
    rows.sort()
    with open(out_tsv, "w", encoding="utf-8", newline="\n") as f:
        f.write("# OurAirports (ourairports.com, Public Domain) · games/msfs/tools/airports.py ile üretildi\n")
        f.write("\n".join(rows))
        f.write("\n")
    print(f"{len(rows)} havalimanı yazıldı: {out_tsv}")


if __name__ == "__main__":
    main(*sys.argv[1:4])
