#!/usr/bin/env python3
"""Bandingkan daftar rute resmi Transjakarta dengan data aplikasi.

Halaman resmi operator adalah sumber kebenaran untuk **koridor mana saja
yang ada**. Koordinat dan urutan halte tetap berasal dari OpenStreetMap,
tapi kalau sebuah koridor tidak ada di daftar resmi, koridor itu tidak
boleh ada di snapshot.

Halaman yang dibaca:
- https://transjakarta.co.id/layanan/brt            (koridor BRT)
- https://transjakarta.co.id/layanan/angkutan-pengumpan
- https://transjakarta.co.id/layanan/mikrotrans

Pemakaian:
    python3 research/tools/verify-official-routes.py [--json] [--strict]

Keluarannya: 0 bila snapshot konsisten, 1 bila ada selisih.
"""

from __future__ import annotations

import argparse
import json
import pathlib
import re
import sys
import urllib.error
import urllib.request

REPO = pathlib.Path(__file__).resolve().parents[2]
SNAPSHOT = REPO / "data" / "transit-network.json"

PAGES = {
    "brt": "https://transjakarta.co.id/layanan/brt",
    "pengumpan": "https://transjakarta.co.id/layanan/angkutan-pengumpan",
    "mikrotrans": "https://transjakarta.co.id/layanan/mikrotrans",
}

# Kode koridor: angka, opsional huruf, atau bentuk JAK<angka><huruf>.
CODE = re.compile(r"^(?:L)?\d{1,2}[A-Z]?$|^JAK\.?\d{1,3}[A-Z]?$")
# Nama koridor: huruf kapital, angka, tanda baca rute.
NAME = re.compile(r"^[A-Z0-9 .,'()/&\-]{4,}$")

# Peta kode -> kelas layanan yang dipakai aplikasi.
CLASS_BY_SOURCE = {
    "brt": {"brt"},
    "pengumpan": {"non-brt", "minitrans", "royaltrans"},
    "mikrotrans": {"feeder"},
}


def fetch(url: str, timeout: int = 30) -> str:
    request = urllib.request.Request(url, headers={"User-Agent": "daily-route-verify/1.0"})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.read().decode("utf-8", "ignore")


def visible_lines(html: str) -> list[str]:
    without_scripts = re.sub(r"<script.*?</script>", " ", html, flags=re.S)
    without_styles = re.sub(r"<style.*?</style>", " ", without_scripts, flags=re.S)
    text = re.sub(r"<[^>]+>", "\n", without_styles)
    return [line.strip() for line in text.splitlines() if line.strip()]


def parse_corridors(html: str) -> list[tuple[str, str]]:
    """Pasangkan kode dan nama koridor dari teks halaman."""
    lines = visible_lines(html)
    pairs: list[tuple[str, str]] = []
    index = 0
    while index < len(lines) - 1:
        code, name = lines[index], lines[index + 1]
        if CODE.match(code) and NAME.match(name) and not CODE.match(name):
            pairs.append((code, name))
            index += 2
            continue
        index += 1
    return pairs


def normalise(code: str) -> str:
    """Bandingkan kode tanpa titik dan huruf besar/kecil: JAK.44 = JAK44."""
    return code.replace(".", "").upper()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json", action="store_true", help="keluarkan laporan sebagai JSON")
    parser.add_argument("--strict", action="store_true", help="selisih mana pun dianggap gagal")
    arguments = parser.parse_args()

    snapshot = json.loads(SNAPSHOT.read_text())
    lines = [line for line in snapshot["lines"] if line["systemId"] == "transjakarta"]

    report: dict[str, object] = {"checkedAt": "run", "sources": {}, "problems": []}

    for source, url in PAGES.items():
        try:
            html = fetch(url)
        except (urllib.error.URLError, TimeoutError) as error:
            print(f"gagal membaca {url}: {error}", file=sys.stderr)
            return 2

        official = parse_corridors(html)
        official_codes = {normalise(code) for code, _ in official}
        app_codes = {
            normalise(line["code"])
            for line in lines
            if line["code"] and line["serviceClass"] in CLASS_BY_SOURCE[source]
        }

        missing = sorted(official_codes - app_codes)
        extra = sorted(app_codes - official_codes)

        report["sources"][source] = {
            "url": url,
            "official": len(official),
            "app": len(app_codes),
            "missingInApp": missing,
            "extraInApp": extra,
        }
        if missing:
            report["problems"].append({"source": source, "kind": "missing", "codes": missing})
        if extra:
            report["problems"].append({"source": source, "kind": "extra", "codes": extra})

    if arguments.json:
        print(json.dumps(report, indent=2, ensure_ascii=False))
    else:
        for source, data in report["sources"].items():
            print(f"{source:11} resmi {data['official']:3}  aplikasi {data['app']:3}")
            if data["missingInApp"]:
                print(f"            tidak ada di aplikasi: {', '.join(data['missingInApp'])}")
            if data["extraInApp"]:
                print(f"            ada di aplikasi saja: {', '.join(data['extraInApp'])}")

    return 1 if arguments.strict and report["problems"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
