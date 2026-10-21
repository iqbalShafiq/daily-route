#!/usr/bin/env python3
"""Tarik daftar koridor resmi Transjakarta dari halaman operator.

Halaman https://transjakarta.co.id/rute memuat seluruh koridor yang
dijalankan operator, dikelompokkan menurut jenis layanannya. Daftar itu
adalah sumber kebenaran untuk **koridor mana saja yang ada** dan untuk
**jenis layanan masing-masing** — dua hal yang tidak bisa ditebak dari
OpenStreetMap.

Pemakaian:
    python3 research/tools/extract-official-routes.py --out research/data/transjakarta-routes.json
"""

from __future__ import annotations

import argparse
import json
import pathlib
import re
import urllib.request

ROUTE_PAGE = "https://transjakarta.co.id/rute"

# Nama bagian di halaman -> kelas layanan yang dipakai aplikasi.
SECTIONS: dict[str, str] = {
    "BRT": "brt",
    "Angkutan Pengumpan": "non-brt",
    "Royaltrans": "royaltrans",
    "Wisata": "wisata",
    "Mikrotrans": "mikrotrans",
    "Rumah Susun": "rumah-susun",
    "Transjabodetabek": "transjabodetabek",
}

HEADERS = {"User-Agent": "daily-route/0.1 (Jakarta transit data pipeline)"}

CODE = re.compile(r"^[A-Z0-9]{1,8}$")
NAME = re.compile(r"^[A-Z0-9 .,'()/&\-]{4,}$")


def visible_lines(html: str) -> list[str]:
    without_scripts = re.sub(r"<script.*?</script>", " ", html, flags=re.S)
    without_styles = re.sub(r"<style.*?</style>", " ", without_scripts, flags=re.S)
    text = re.sub(r"<[^>]+>", "\n", without_styles)
    return [line.strip() for line in text.splitlines() if line.strip()]


def split_sections(lines: list[str]) -> list[tuple[str, list[str]]]:
    """Bagi baris halaman per jenis layanan.

    Setiap jenis layanan dimulai dengan judulnya, lalu baris "Rute",
    lalu pasangan kode dan nama.
    """
    starts: list[tuple[str, int]] = []
    for index in range(len(lines) - 1):
        if lines[index + 1] == "Rute" and lines[index] in SECTIONS:
            starts.append((lines[index], index))

    sections: list[tuple[str, list[str]]] = []
    for position, (name, index) in enumerate(starts):
        end = starts[position + 1][1] if position + 1 < len(starts) else len(lines)
        sections.append((name, lines[index:end]))
    return sections


def parse(section: list[str]) -> list[dict[str, str]]:
    pairs: list[tuple[str, str]] = []
    index = 0
    while index < len(section) - 1:
        code, name = section[index], section[index + 1]
        if CODE.match(code) and NAME.match(name) and not CODE.match(name) and name != "Rute":
            pairs.append((code, name))
            index += 2
            continue
        index += 1
    return [{"code": code, "name": name} for code, name in pairs]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", default="research/data/transjakarta-routes.json")
    parser.add_argument("--url", default=ROUTE_PAGE)
    arguments = parser.parse_args()

    request = urllib.request.Request(arguments.url, headers=HEADERS)
    with urllib.request.urlopen(request, timeout=60) as response:
        html = response.read().decode("utf-8", "ignore")

    lines = visible_lines(html)
    sections = split_sections(lines)
    if not sections:
        print("tidak menemukan bagian layanan di halaman", flush=True)
        return 2

    corridors: list[dict[str, str]] = []
    for name, section in sections:
        service = SECTIONS[name]
        for corridor in parse(section):
            corridors.append(
                {
                    "code": corridor["code"].replace(".", "").upper(),
                    "name": corridor["name"],
                    "service": service,
                }
            )

    document = {
        "source": arguments.url,
        "operator": "PT Transportasi Jakarta (Transjakarta)",
        "note": (
            "Daftar koridor resmi. Kelas layanan memakai nama jenis layanan "
            "di halaman operator."
        ),
        "corridors": corridors,
    }

    out = pathlib.Path(arguments.out)
    out.write_text(json.dumps(document, indent=2, ensure_ascii=False) + "\n")
    print(f"{len(corridors)} koridor ditulis ke {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
