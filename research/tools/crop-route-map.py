#!/usr/bin/env python3
"""Potong peta rute resmi jadi potongan yang enak dibaca.

Peta rute resmi Transjakarta punya ukuran berbeda-beda (643x1600 sampai
1183x3003). Tulisan haltenya kecil, jadi setiap potongan diperbesar.

Pemakaian:
    python3 research/tools/crop-route-map.py <berkas> --from 0 --to 700 --scale 1.6
    python3 research/tools/crop-route-map.py <berkas> --bands 4 --scale 1.5
"""

from __future__ import annotations

import argparse
import pathlib

from PIL import Image

OUT = pathlib.Path("/tmp/route-maps/crops")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("path")
    parser.add_argument("--from", dest="start", type=int, default=0)
    parser.add_argument("--to", dest="end", type=int)
    parser.add_argument("--scale", type=float, default=1.5)
    parser.add_argument("--bands", type=int, default=0, help="bagi tinggi gambar jadi N bagian")
    parser.add_argument("--overlap", type=int, default=0)
    parser.add_argument("--out", help="nama berkas keluaran")
    arguments = parser.parse_args()

    source = pathlib.Path(arguments.path)
    image = Image.open(source).convert("RGB")
    width, height = image.size
    OUT.mkdir(parents=True, exist_ok=True)

    if arguments.bands:
        band = height // arguments.bands
        step = max(1, band - arguments.overlap)
        top = 0
        index = 0
        while top < height:
            bottom = min(height, top + band)
            crop = image.crop((0, top, width, bottom))
            crop = crop.resize((int(crop.width * arguments.scale), int(crop.height * arguments.scale)), Image.LANCZOS)
            target = OUT / f"{source.stem}-band{index}.png"
            crop.save(target)
            print(f"{target} (y {top}-{bottom} of {height}, {crop.width}x{crop.height})")
            index += 1
            if bottom >= height:
                break
            top += step
        return 0

    end = arguments.end if arguments.end is not None else height
    crop = image.crop((0, arguments.start, width, end))
    crop = crop.resize((int(crop.width * arguments.scale), int(crop.height * arguments.scale)), Image.LANCZOS)
    target = OUT / (arguments.out or f"{source.stem}-crop.png")
    crop.save(target)
    print(f"{target} (y {arguments.start}-{end} of {height}, {crop.width}x{crop.height})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
