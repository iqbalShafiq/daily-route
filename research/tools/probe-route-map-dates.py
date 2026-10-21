#!/usr/bin/env python3
"""Cari berkas peta rute resmi pada satu rentang tanggal, lengkap dengan ukuran.

Berguna untuk mencari versi peta yang lebih besar (peta lama 1182x3003, peta
baru 640x1600) atau untuk memastikan berkas mana yang terbaru.

Pemakaian:
    python3 research/tools/probe-route-map-dates.py B14 20260601 20260731
"""

from __future__ import annotations

import concurrent.futures
import datetime as dt
import sys
import urllib.error
import urllib.request

BASE = "https://smk.transjakarta.co.id/aset/berkas/rute/"
HEADERS = {"User-Agent": "daily-route/0.1 (Jakarta transit data pipeline)"}


def head(url: str) -> tuple[str, int] | None:
    request = urllib.request.Request(url, headers=HEADERS, method="HEAD")
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            if response.status != 200:
                return None
            if not response.headers.get("Content-Type", "").startswith("image/"):
                return None
            if not response.geturl().split("?")[0].endswith(url.rsplit("/", 1)[-1]):
                return None
            return url, int(response.headers.get("Content-Length", 0))
    except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, OSError):
        return None


def main() -> int:
    code = sys.argv[1]
    start = dt.date.fromisoformat(sys.argv[2])
    end = dt.date.fromisoformat(sys.argv[3])
    dates = []
    day = start
    while day <= end:
        dates.append(day.strftime("%Y%m%d"))
        day += dt.timedelta(days=1)

    candidates = [f"{BASE}{code}-{d}.{e}" for d in dates for e in ("jpeg", "jpg", "png")]
    found: list[tuple[str, int]] = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=16) as pool:
        for result in pool.map(head, candidates):
            if result:
                found.append(result)
                print(result[0], result[1], flush=True)
    if not found:
        print("tidak ada berkas")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
