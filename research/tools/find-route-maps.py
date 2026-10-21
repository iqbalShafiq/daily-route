#!/usr/bin/env python3
"""Cari berkas peta rute resmi Transjakarta untuk sebuah koridor.

Berkas peta rute resmi bernama `<kode>-<tanggal unggah>.<ext>` di
https://smk.transjakarta.co.id/aset/berkas/rute/. Tidak ada daftar isi,
jadi tanggalnya harus dicari.

Pemakaian:
    python3 research/tools/find-route-maps.py B25 S61 T31 ...
    python3 research/tools/find-route-maps.py --from-json research/data/transjakarta-routes.json
"""

from __future__ import annotations

import argparse
import concurrent.futures
import datetime as dt
import json
import pathlib
import sys
import urllib.error
import urllib.request

BASE = "https://smk.transjakarta.co.id/aset/berkas/rute/"
REPO = pathlib.Path(__file__).resolve().parents[2]
CURATED = REPO / "research" / "data" / "transjakarta.json"

HEADERS = {"User-Agent": "daily-route/0.1 (Jakarta transit data pipeline)"}


def known_dates() -> list[str]:
    """Tanggal unggah yang sudah dipakai berkas lain, paling baru dulu."""
    if not CURATED.exists():
        return []
    document = json.loads(CURATED.read_text())
    dates: set[str] = set()
    for system in document.get("systems", []):
        for corridor in system.get("corridors", []):
            url = corridor.get("officialMapUrl")
            if not url:
                continue
            name = url.rsplit("/", 1)[-1]
            stem = name.rsplit(".", 1)[0]
            if "-" in stem:
                dates.add(stem.rsplit("-", 1)[-1])
    return sorted(dates, reverse=True)


def sweep_dates(start: dt.date, end: dt.date) -> list[str]:
    dates = []
    day = start
    while day <= end:
        dates.append(day.strftime("%Y%m%d"))
        day += dt.timedelta(days=1)
    return list(reversed(dates))


def head(url: str, timeout: int = 15) -> bool:
    """Apakah url itu benar-benar berkas gambar.

    Server berkas itu menjawab 302 ke beranda untuk berkas yang tidak
    ada, dan urllib mengikuti redirect itu. Karena itu jawabannya
    diperiksa lagi: tipe harus gambar dan alamat akhirnya harus masih
    berkas yang diminta.
    """
    request = urllib.request.Request(url, headers=HEADERS, method="HEAD")
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            if response.status != 200:
                return False
            content_type = response.headers.get("Content-Type", "")
            if not content_type.startswith("image/"):
                return False
            return response.geturl().split("?")[0].endswith(url.rsplit("/", 1)[-1])
    except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, OSError):
        return False


def find(code: str, candidates: list[str]) -> str | None:
    for date in candidates:
        for extension in ("jpeg", "jpg", "png"):
            url = f"{BASE}{code}-{date}.{extension}"
            if head(url):
                return url
    return None


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("codes", nargs="*", help="kode koridor")
    parser.add_argument("--from-json", help="berkas JSON berisi daftar kode")
    parser.add_argument("--out", help="tulis hasil ke berkas JSON ini")
    arguments = parser.parse_args()

    codes = list(arguments.codes)
    if arguments.from_json:
        document = json.loads(pathlib.Path(arguments.from_json).read_text())
        for item in document.get("corridors", []):
            if item.get("code"):
                codes.append(item["code"].replace(".", ""))
    codes = [c.replace(".", "") for c in dict.fromkeys(codes)]
    if not codes:
        print("tidak ada kode untuk dicari", file=sys.stderr)
        return 2

    candidates = known_dates() + sweep_dates(dt.date(2024, 1, 1), dt.date(2026, 10, 21))
    print(f"{len(codes)} koridor, {len(candidates)} kandidat tanggal", file=sys.stderr)

    found: dict[str, str] = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        futures = {pool.submit(find, code, candidates): code for code in codes}
        for future in concurrent.futures.as_completed(futures):
            code = futures[future]
            url = future.result()
            if url:
                found[code] = url
                print(f"  {code:8} {url}", file=sys.stderr)
            else:
                print(f"  {code:8} TIDAK DITEMUKAN", file=sys.stderr)

    if arguments.out:
        pathlib.Path(arguments.out).write_text(json.dumps(found, indent=2))
    print(json.dumps(found, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
