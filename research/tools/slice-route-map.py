#!/usr/bin/env python3
"""Unduh peta rute resmi lalu potong jadi irisan vertikal yang enak dibaca.

Peta rute resmi Transjakarta tinggi sekali (sekitar 640x1600 piksel) dan
tulisan halte kecil. Kalau dibaca utuh, teksnya tidak terbaca. Skrip ini
mengunduh berkas, memperbesar 2x, lalu memotongnya menjadi irisan
vertikal yang saling tumpang tindih.

Pemakaian:
    python3 research/tools/slice-route-map.py B25 --url https://.../B25-20260714.jpeg
    python3 research/tools/slice-route-map.py B25 --map-json /tmp/route-maps.json
"""

from __future__ import annotations

import argparse
import json
import pathlib
import sys
import urllib.request

from PIL import Image

BASE = "https://smk.transjakarta.co.id/aset/berkas/rute/"
HEADERS = {"User-Agent": "daily-route/0.1 (Jakarta transit data pipeline)"}
OUT = pathlib.Path("/tmp/route-maps")


def download(url: str, target: pathlib.Path) -> pathlib.Path:
    if target.exists() and target.stat().st_size > 1000:
        return target
    request = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(request, timeout=60) as response:
        data = response.read()
    if len(data) < 1000:
        raise RuntimeError(f"berkas terlalu kecil: {url}")
    target.write_bytes(data)
    return target


def slice_image(path: pathlib.Path, out_dir: pathlib.Path, scale: int, overlap: int) -> list[pathlib.Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    for old in out_dir.glob(f"{path.stem}-slice-*.png"):
        old.unlink()
    image = Image.open(path).convert("RGB")
    if scale != 1:
        image = image.resize((image.width * scale, image.height * scale), Image.LANCZOS)
    width, height = image.size
    slice_height = max(1, height // 3)
    step = max(1, slice_height - overlap)
    written: list[pathlib.Path] = []
    index = 0
    top = 0
    while top < height:
        bottom = min(height, top + slice_height)
        crop = image.crop((0, top, width, bottom))
        target = out_dir / f"{path.stem}-slice-{index}.png"
        crop.save(target)
        written.append(target)
        index += 1
        if bottom >= height:
            break
        top += step
    return written


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("code")
    parser.add_argument("--url")
    parser.add_argument("--map-json", help="berkas hasil find-route-maps.py")
    parser.add_argument("--scale", type=int, default=2)
    parser.add_argument("--overlap", type=int, default=120)
    parser.add_argument("--info", action="store_true", help="hanya cetak ukuran berkas")
    arguments = parser.parse_args()

    url = arguments.url
    if not url and arguments.map_json:
        found = json.loads(pathlib.Path(arguments.map_json).read_text())
        url = found.get(arguments.code)
    if not url:
        print(f"tidak ada url untuk {arguments.code}", file=sys.stderr)
        return 2

    OUT.mkdir(parents=True, exist_ok=True)
    name = url.rsplit("/", 1)[-1]
    target = OUT / name
    path = download(url, target)
    image = Image.open(path)
    print(f"{arguments.code} {url} {image.width}x{image.height} {path.stat().st_size} bytes")
    if arguments.info:
        return 0
    for written in slice_image(path, OUT, arguments.scale, arguments.overlap):
        print(written)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
