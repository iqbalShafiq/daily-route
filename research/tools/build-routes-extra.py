#!/usr/bin/env python3
"""Bangun research/data/transjakarta-routes-extra.json dari hasil bacaan peta rute.

Data di dalam berkas ini adalah hasil bacaan manual dari gambar peta rute
resmi Transjakarta (https://smk.transjakarta.co.id/aset/berkas/rute/).
Berkas ini hanya collects transkripsi; berkas JSON-nya yang jadi sumber
data.

Pemakaian:
    python3 research/tools/build-routes-extra.py
"""

from __future__ import annotations

import json
import pathlib

REPO = pathlib.Path(__file__).resolve().parents[2]
OUT = REPO / "research" / "data" / "transjakarta-routes-extra.json"

SOURCE = "https://smk.transjakarta.co.id/aset/berkas/rute/"
RETRIEVED_AT = "2026-10-21"

TRANSAJABODETABEK = "PT Transportasi Jakarta (Transjakarta) + contracted operators"
TRANSAJAKARTA = "PT Transportasi Jakarta (Transjakarta)"

CORRIDORS: list[dict] = [
    {
        "code": "B14",
        "name": "Summarecon Bekasi - Kuningan",
        "service": "royaltrans",
        "corridorType": "Royaltrans",
        "operator": TRANSAJAKARTA,
        "status": "operating",
        "serviceHours": "WD only (weekday), D 06.00-09.00 Summarecon Bekasi, D 16.00-19.00 Kuningan",
        "officialMapUrl": "https://smk.transjakarta.co.id/aset/berkas/rute/B14-20260720.jpeg",
        "updatedAt": "2026-06-25",
        "updatedAtUncertain": True,
        "stations": [
            stop("Summarecon Bekasi", terminal=True),
            stop("Bandar Djakarta Bekasi"),
            stop("RS Mitra Keluarga 2"),
            stop("Kayuringin 2"),
            stop("Mall Metropolitan"),
            stop("Tegal Parang 2"),
            stop("Bulog"),
            stop("Kuningan Timur 1"),
            stop("Patra Kuningan 1"),
            stop("Patra kuningan 2"),
            stop("Kuningan 1"),
            stop("Epicentrum Selatan"),
            stop("Perpustakaan Jakarta | Nyi Ageng Serang"),
            stop("GOR Sumantri 1"),
            stop("Karet Kuningan 1"),
            stop("Tugu Insurance"),
            stop("Pusat Edukasi Anti Korupsi KPK"),
            stop("Setiabudi Integritas 1", terminal=True),
        ],
        "reverseStops": [
            stop("Summarecon Bekasi", terminal=True),
            stop("RS Mitra Keluarga 1"),
            stop("Kuningan Timur 2"),
            stop("Menara Karya"),
            stop("Kemenkes 2"),
            stop("BNI Syariah"),
            stop("Kedubes Malaysia"),
            stop("GOR Sumantri 2"),
            stop("Karet Kuningan 2"),
            stop("Kuningan Madya 2"),
            stop("Menara Duta"),
            stop("Setiabudi Integritas 1", terminal=True),
        ],
    },
    {
        "code": "B25",
        "name": "Bekasi - Dukuh Atas",
        "service": "transjabodetabek",
        "corridorType": "Transjabodetabek",
        "operator": TRANSAJABODETABEK,
        "status": "operating",
        "serviceHours": "WD+WE, D 05.00-22.00 both directions",
        "officialMapUrl": "https://smk.transjakarta.co.id/aset/berkas/rute/B25-20260819.jpeg",
        "updatedAt": "2025-08-17",
        "updatedAtUncertain": True,
        "notes": "Peta Prints the bottom terminal as 'Galungung', not 'Dukuh Atas'.",
        "stations": [
            stop("Terminal Bekasi", terminal=True),
            stop("Sbr. GOR Betos Cut Mutia"),
            stop("Melati Cut Mutia"),
            stop("Sbr. Unisma"),
            stop("Cut Mutia 3"),
            stop("Sbr. Cut Mutia 5"),
            stop("Cut Mutia 4"),
            stop("Simpang Rw. Panjang Ahmad Yani"),
            stop("Sbr. Simpang"),
            stop("Pekayon Ahmad Yani"),
            stop("Mega Mall Bekasi"),
            stop("Jln. Lele Kayuringin"),
            stop("Rumah Sakit Kayuringin Kalimalang"),
            stop("Jln. Satria Raya"),
            stop("Ruko Jakasampurna"),
            stop("Grand Kota Bintang"),
            stop("Flyover Jatinegara"),
            stop("Stasiun Jatinegara", transfers=["KCI"]),
            stop("Jatinegara"),
            stop("Kampung Melayu"),
            stop("Matraman Baru", transfers=["5", "5C", "7U"]),
            stop("Timur St. Manggarai", transfers=["4B", "6M"]),
            stop("Plaza St. Manggarai", transfers=["4B", "6M"]),
            stop("Manggarai Temporer 1"),
            stop("Pasar Rumput"),
            stop("Halimun", transfers=["4", "4D", "6M"]),
            stop("Galungung", transfers=["4", "6"], terminal=True),
        ],
        "reverseStops": [
            stop("Terminal Bekasi", terminal=True),
            stop("GOR Betos Cut Mutia"),
            stop("Rawa Baru Cut Mutia"),
            stop("Unisma"),
            stop("Sbr. Cut Mutia 3"),
            stop("Cut Mutia 5"),
            stop("Cut Mutia 6"),
            stop("Pekayon Ahmad Yani"),
            stop("Simpang Pekayon Ahmad Yani"),
            stop("Bekasi Barat"),
            stop("Mall Metropolitan"),
            stop("Jln. Villa Utama"),
            stop("Halte Grand"),
            stop("Jln. Chandrabaga"),
            stop("Jembatan Chandrabaga"),
            stop("Jln. Borobudur Malabar"),
            stop("Pedati Prumpung"),
            stop("Stasiun Jatinegara", transfers=["KCI"]),
            stop("Jatinegara"),
            stop("Kampung Melayu"),
            stop("Matraman Baru", transfers=["5", "5C", "7U"]),
            stop("Timur St. Manggarai", transfers=["4B", "6M"]),
            stop("Plaza St. Manggarai", transfers=["4B", "6M"]),
            stop("Manggarai Temporer 2"),
            stop("Pasar Rumput"),
            stop("Halimun", transfers=["4", "4D", "6M"]),
            stop("Galungung", transfers=["4", "6"], terminal=True),
        ],
    },
    {
        "code": "P11",
        "name": "Blok M - Bogor",
        "service": "transjabodetabek",
        "corridorType": "Transjabodetabek",
        "operator": TRANSAJABODETABEK,
        "status": "operating",
        "serviceHours": "WD+WE, D 05.00-22.00 both directions",
        "officialMapUrl": "https://smk.transjakarta.co.id/aset/berkas/rute/P11-20260714.jpeg",
        "updatedAt": "2026-07-13",
        "stations": [
            stop("Blok M Jalur 4", transfers=[
                "1", "1C", "1E", "1K", "1M", "1P", "1Q", "1W", "6U", "6N", "6M",
                "6W", "7B", "7Q", "8E", "8D", "B13", "S61", "T31", "SH2", "JAK.31",
            ], terminal=True),
            stop("Kejaksaan Agung", transfers=["LRT Jakarta"]),
            stop("Pasar Santa"),
            stop("Rawa Barat"),
            stop("Tegal Mampang", transfers=["4K", "5N", "7B", "13", "13B", "13E", "L13E"]),
            stop("Pancoran", transfers=["4K", "9", "9A", "9C"]),
            stop("Pancoran Tugu"),
            stop("Cibubur Junction"),
            stop("Pintu Tol Citeureup 1"),
            stop("Simpang Sentul"),
            stop("Sentul"),
            stop("Mall Bellanova Sentul"),
            stop("Sentul City", note="Hanya dilintasi pada Sabtu, Minggu dan Hari Libur Nasional"),
            stop("Botani Square", terminal=True),
        ],
        "reverseStops": [
            stop("Blok M Jalur 4", transfers=[
                "1", "1C", "1E", "1K", "1M", "1P", "1Q", "1W", "6U", "6N", "6M",
                "6W", "7B", "7Q", "8E", "8D", "B13", "S61", "T31", "SH2", "JAK.31",
            ], terminal=True),
            stop("Kejaksaan Agung", transfers=["LRT Jakarta"]),
            stop("Pasar Santa"),
            stop("Rawa Barat"),
            stop("Tegal Mampang", transfers=["4K", "5N", "7B", "13", "13B", "13E", "L13E"]),
            stop("Pancoran", transfers=["4K", "9", "9A", "9C"]),
            stop("Pancoran Tugu"),
            stop("Buperta Cibubur"),
            stop("Pintu Tol Citeureup 2"),
            stop("Monumen Pancakarsa"),
            stop("Sentul City", note="Hanya dilintasi pada Sabtu, Minggu dan Hari Libur Nasional"),
            stop("Mall Bellanova Sentul"),
            stop("Botani Square", terminal=True),
        ],
    },
    {
        "code": "S61",
        "name": "Alam Sutera - Blok M",
        "service": "transjabodetabek",
        "corridorType": "Transjabodetabek",
        "operator": TRANSAJABODETABEK,
        "status": "operating",
        "serviceHours": "WD+WE, D 05.00-22.00 both directions",
        "officialMapUrl": "https://smk.transjakarta.co.id/aset/berkas/rute/S61-20260714.jpeg",
        "updatedAt": "2026-07-13",
        "stations": [
            stop("Flavor Bliss", terminal=True),
            stop("Sutera Utama"),
            stop("Sports Center"),
            stop("Onyx"),
            stop("Prominence"),
            stop("Escala 2"),
            stop("Escala 1"),
            stop("Renata"),
            stop("Rest Area Km 13 Jakarta Merak"),
            stop("Tol Kb. Jeruk 1"),
            stop("Kota Bambu", transfers=["3F", "9", "9A", "9E", "10H"]),
            stop("Kemanggisan"),
            stop("Petamburan"),
            stop("Gerbang Pemuda", transfers=["1B", "1W", "9", "9A", "10H", "T31"]),
            stop("Senayan Bank Jakarta", transfers=["1", "1F", "3F", "9C", "10H", "T31"]),
            stop("Bundaran Senayan", transfers=["1", "1F", "6M", "10H"]),
            stop("Masjid Agung"),
            stop("Kejaksa Agung"),
            stop("ASEAN", transfers=["Terminal Bus"]),
            stop("Blok M Jalur 4", transfers=[
                "1", "1C", "1E", "1K", "1M", "1P", "1Q", "1W", "6U", "6N", "6M",
                "6W", "7B", "7Q", "8E", "8D", "B13", "P11", "T31", "SH2", "JAK.31",
            ], terminal=True),
        ],
        "reverseStops": [
            stop("Flavor Bliss", terminal=True),
            stop("Olivia"),
            stop("Mall"),
            stop("IKEA"),
            stop("Rest Area Km 13 Merak Jakarta"),
            stop("Tol Kb.Jeruk 2"),
            stop("Kota Bambu", transfers=["3F", "9", "9A", "9E", "10H"]),
            stop("Kemanggisan"),
            stop("Petamburan"),
            stop("Gerbang Pemuda", transfers=["1B", "1W", "9", "9A", "10H", "T31"]),
            stop("Senayan Bank Jakarta", transfers=["1", "1F", "3F", "9C", "10H", "T31"]),
            stop("Bundaran Senayan", transfers=["1", "1F", "6M", "10H"]),
            stop("Masjid Agung"),
            stop("Kejaksa Agung"),
            stop("ASEAN", transfers=["Terminal Bus"]),
            stop("Blok M Jalur 4", transfers=[
                "1", "1C", "1E", "1K", "1M", "1P", "1Q", "1W", "6U", "6N", "6M",
                "6W", "7B", "7Q", "8E", "8D", "B13", "P11", "T31", "SH2", "JAK.31",
            ], terminal=True),
        ],
    },
    {
        "code": "SH2",
        "name": "Blok M - Bandara Soekarno-Hatta",
        "service": "transjabodetabek",
        "corridorType": "Transjabodetabek",
        "operator": TRANSAJABODETABEK,
        "status": "operating",
        "serviceHours": "WD+WE, D 05.00-22.00 both directions",
        "officialMapUrl": "https://smk.transjakarta.co.id/aset/berkas/rute/SH2-20260714.jpeg",
        "updatedAt": "2026-06-22",
        "stations": [
            stop("Blok M Jalur 6", transfers=[
                "1", "1C", "1E", "1K", "1M", "1P", "1Q", "1W", "6U", "6N", "6M",
                "6W", "7B", "7Q", "8E", "8D", "B13", "P11", "S61", "T31", "JAK.31",
            ], terminal=True),
            stop("Bundaran Senayan 1"),
            stop("Summitmas"),
            stop("Gelora Bung Karno 1"),
            stop("Sbr. DPR MPR 1"),
            stop("Perpustakaan Riset BPK"),
            stop("Slipi Petamburan 2"),
            stop("Swadaya Slipi"),
            stop("Sekolah Ibu Pertiwi"),
            stop("Bundaran Cargo"),
            stop("Imigrasi SHIA"),
            stop("Stasiun KA Bandara"),
            stop("Perkantoran Soekarno-Hatta", terminal=True),
        ],
        "reverseStops": [
            stop("Blok M Jalur 6", transfers=[
                "1", "1C", "1E", "1K", "1M", "1P", "1Q", "1W", "6U", "6N", "6M",
                "6W", "7B", "7Q", "8E", "8D", "B13", "P11", "S61", "T31", "JAK.31",
            ], terminal=True),
            stop("Bundaran Senayan 2"),
            stop("FX Sudirman"),
            stop("Gelora Bung Karno 2"),
            stop("DPR MPR 1"),
            stop("Slipi Petamburan 3"),
            stop("Sbr. Sowan Wisata Belanja"),
            stop("Jln. Cengkareng Golf Club 1"),
            stop("Soewarna Foodhall 1"),
            stop("Jln. Cengkareng Golf Club 3"),
            stop("Terminal Kargo 1"),
            stop("Terminal Kargo 2"),
            stop("Perkantoran Soekarno-Hatta", terminal=True),
        ],
    },
]


def stop(name: str, code: str | None = None, transfers: list[str] | None = None,
         terminal: bool = False, note: str | None = None) -> dict:
    entry: dict = {"name": name}
    if code:
        entry["code"] = code
    else:
        entry["code"] = None
    entry["transfers"] = transfers if transfers else []
    if terminal:
        entry["terminal"] = True
    if note:
        entry["note"] = note
    return entry


def main() -> int:
    document = {
        "source": SOURCE,
        "retrievedAt": RETRIEVED_AT,
        "corridors": CORRIDORS,
    }
    OUT.write_text(json.dumps(document, indent=2, ensure_ascii=False) + "\n")
    stops = sum(len(c.get("stations", [])) for c in CORRIDORS)
    print(f"{len(CORRIDORS)} koridor, {stops} halte -> {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
