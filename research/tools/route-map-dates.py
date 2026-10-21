#!/usr/bin/env python3
"""Buat satu gambar berisi baris "Diperbarui per ..." dari banyak peta rute.

Teks tanggal ada di kiri bawah peta dan hanya setinggi sekitar 8 piksel,
jadi setiap baris diperbesar enam kali lalu disusun ke bawah. Dengan begitu
semuanya bisa dibaca dalam satu kali baca.

Pemakaian:
    python3 research/tools/route-map-dates.py /tmp/route-maps/*.jpeg
"""

from __future__ import annotations

import pathlib
import sys

from PIL import Image, ImageOps

SCALE = 6
CROP_WIDTH = 220


def date_band(image: Image.Image) -> Image.Image:
    """Potong baris teks tanggal paling bawah di sisi kiri gambar."""
    width, height = image.size
    left = image.crop((0, height - 60, min(CROP_WIDTH, width), height)).convert("L")
    pixels = left.load()
    best = None
    for y in range(left.height):
        dark = sum(1 for x in range(left.width) if pixels[x, y] < 140)
        if dark > 3:
            best = y
    if best is None:
        return left.crop((0, left.height - 16, left.width, left.height))
    top = max(0, best - 6)
    return left.crop((0, top, left.width, min(left.height, best + 10)))


def main() -> int:
    paths = [pathlib.Path(p) for p in sys.argv[1:]]
    bands = []
    for path in paths:
        image = Image.open(path).convert("RGB")
        band = date_band(image)
        band = band.resize((band.width * SCALE, band.height * SCALE), Image.LANCZOS)
        band = ImageOps.autocontrast(band.convert("L")).convert("RGB")
        bands.append((path.name, band))

    if not bands:
        return 1
    label_width = 150
    total_width = label_width + max(b.width for _, b in bands)
    total_height = sum(b.height + 8 for _, b in bands)
    sheet = Image.new("RGB", (total_width, total_height), "white")
    y = 0
    for name, band in bands:
        sheet.paste(band, (label_width, y))
        y += band.height + 8
    out = pathlib.Path("/tmp/route-maps/crops/dates.png")
    out.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(out)
    print(f"{len(bands)} baris -> {out} ({total_width}x{total_height})")
    for index, (name, _) in enumerate(bands):
        print(f"{index}: {name}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
