#!/usr/bin/env python3
"""Compare the tap in / tap out findings with the fares the app currently ships.

Run with the bundled Python (no third-party packages needed):

    python3 research/tools/ux-visual/verify_fares.py

It reads two files and prints two tables:

  * ``research/data/fares-tap-in-out.json`` - the findings of this research,
    written on 21 October 2026;
  * ``research/data/fares.json`` - the fares the application currently uses.

For every rule in the findings it prints what ``fares.json`` says today, what
the verified source says it should say, and the line in ``fares.json`` that has
to change.  The script only reads: it never writes to ``fares.json``.

Exit status is 0 when every check passes and 1 when something is wrong, so the
script can be used as a gate.
"""

from __future__ import annotations

import json
import os
import re
import sys
from typing import Any, Callable

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
FINDINGS = os.path.join(ROOT, "research", "data", "fares-tap-in-out.json")
FARES = os.path.join(ROOT, "research", "data", "fares.json")

OK = "OK"
SALAH = "SALAH"
TIDAK_ADA = "TIDAK ADA"


# --------------------------------------------------------------------------
# reading and addressing


def read_json(path: str) -> Any:
    with open(path, encoding="utf-8") as handle:
        return json.load(handle)


def resolve(doc: Any, path: str) -> Any:
    """Resolve a dotted path such as ``modes.transjakarta-brt.peak.amount``.

    A list index is written as ``[0]``, so ``integrations[0].id`` works.
    """
    current = doc
    for part in re.split(r"\.(?![^\[]*\])", path):
        match = re.match(r"^([^\[]+)((?:\[\d+\])*)$", part)
        if not match:
            raise KeyError(path)
        name, indices = match.group(1), match.group(2)
        if name:
            current = current[name]
        for index in re.findall(r"\[(\d+)\]", indices):
            current = current[int(index)]
    return current


def line_of(lines: list[str], path: str) -> int:
    """The 1-based line in ``fares.json`` where the last key of ``path`` sits."""
    parts = re.split(r"\.(?![^\[]*\])", path)
    last = re.sub(r"\[\d+\]", "", parts[-1])
    needle = '"%s":' % last
    start = 0
    # Walk the parents so that "price" is found inside the right block.
    for parent in parts[:-1]:
        parent_key = re.sub(r"\[\d+\]", "", parent)
        for index in range(start, len(lines)):
            if '"%s":' % parent_key in lines[index]:
                start = index + 1
                break
    for index in range(start, len(lines)):
        if needle in lines[index]:
            return index + 1
    return 0


def show(value: Any, limit: int = 90) -> str:
    if isinstance(value, str):
        text = value
    else:
        text = json.dumps(value, ensure_ascii=False)
    text = " ".join(text.split())
    if len(text) > limit:
        text = text[: limit - 3] + "..."
    return text


# --------------------------------------------------------------------------
# the checks


class Check:
    def __init__(
        self,
        key: str,
        path: str,
        kind: str,
        expected: Any,
        note: str,
        severity: str,
        rule: str,
    ) -> None:
        self.key = key
        self.path = path
        self.kind = kind
        self.expected = expected
        self.note = note
        self.severity = severity
        self.rule = rule


def build_checks() -> list[Check]:
    """Every check is tied to one rule of the findings file."""
    return [
        # --- the amounts that are already right -------------------------
        Check(
            "A1",
            "modes.transjakarta-brt.peak.amount",
            "equals",
            3500,
            "Tarif reguler Transjakarta BRT masih Rp3.500.",
            "high",
            "tj-flat-fare-per-boarding",
        ),
        Check(
            "A2",
            "modes.transjakarta-brt.offPeak.amount",
            "equals",
            2000,
            "Tarif ekonomis 05.00-07.00 masih Rp2.000.",
            "high",
            "tj-flat-fare-per-boarding",
        ),
        Check(
            "A3",
            "modes.transjakarta-non-brt.peak.amount",
            "equals",
            3500,
            "Non-BRT memakai tarif reguler yang sama.",
            "high",
            "tj-flat-fare-per-boarding",
        ),
        Check(
            "A4",
            "modes.transjakarta-non-brt.offPeak.amount",
            "equals",
            2000,
            "Non-BRT memakai tarif ekonomis yang sama.",
            "high",
            "tj-flat-fare-per-boarding",
        ),
        Check(
            "A5",
            "modes.transjakarta-brt.earlyMorningHours",
            "equals",
            "05:00-07:00",
            "Pita pagi sesuai sumber resmi. Catatan: DKI menulis tarif reguler mulai 07.01.",
            "low",
            "tj-flat-fare-per-boarding",
        ),
        Check(
            "A6",
            "modes.transjakarta-transjabodetabek.peak.amount",
            "equals",
            3500,
            "Transjabodetabek (bukan Transbandara) masih Rp3.500.",
            "high",
            "tj-flat-fare-per-boarding",
        ),
        Check(
            "A7",
            "modes.transjakarta-mikrotrans.structure",
            "equals",
            "free",
            "Mikrotrans masih gratis sampai 21 Oktober 2026.",
            "high",
            "tj-microtrans-free",
        ),
        # --- the multimodal scheme -------------------------------------
        Check(
            "B1",
            "integrations[0].boardingAmount.amount",
            "equals",
            2500,
            "Boarding fee skema multimodal.",
            "high",
            "integration-multimodal-3mode",
        ),
        Check(
            "B2",
            "integrations[0].thenPerKm.amount",
            "equals",
            250,
            "Tarif jarak skema multimodal.",
            "high",
            "integration-multimodal-3mode",
        ),
        Check(
            "B3",
            "integrations[0].price.amount",
            "equals",
            10000,
            "Plafon skema multimodal.",
            "high",
            "integration-multimodal-3mode",
        ),
        Check(
            "B4",
            "integrations[0].durationHours",
            "equals",
            3,
            "Jendela 180 menit.",
            "high",
            "integration-multimodal-3mode",
        ),
        Check(
            "B5",
            "integrations[0].covers",
            "equals",
            ["transjakarta-brt", "mrt-jakarta", "lrt-jakarta"],
            "Cakupan resmi hanya tiga operator: BRT, MRT Jakarta, LRT Jakarta.",
            "high",
            "integration-multimodal-3mode",
        ),
        Check(
            "B6",
            "integrations[0].minimumModes",
            "equals",
            2,
            "Wajib minimal dua MODA BERBEDA. Tanpa field ini, BRT ke BRT ikut masuk skema.",
            "high",
            "integration-multimodal-3mode",
        ),
        Check(
            "B7",
            "integrations[0].includes",
            "contains",
            [
                "boarding fee",
                "not free",
            ],
            "Kaki BRT di dalam paket bukan gratis dan bukan flat Rp2.500.",
            "high",
            "integration-multimodal-3mode",
        ),
        Check(
            "B8",
            "integrations[0].includes",
            "contains",
            [
                "every day",
            ],
            "Skema integrasi tidak punya syarat hari kerja. Keyakinan 'Rp2.500 weekday only' tidak ada dasarnya.",
            "high",
            "integration-multimodal-3mode",
        ),
        Check(
            "B9",
            "integrations[0].sources",
            "contains",
            [
                "jaklingkoindonesia.co.id/syarat-dan-ketentuan",
                "bankmandiri.co.id",
            ],
            "Dua sumber primer ini belum dicatat sebagai sumber skema multimodal.",
            "medium",
            "integration-multimodal-3mode",
        ),
        Check(
            "B10",
            "integrations[1].covers",
            "equals",
            ["transjakarta-brt", "transjakarta-non-brt"],
            "Skema internal Transjakarta menutup BRT dan non-BRT.",
            "high",
            "integration-transjakarta-only-3h",
        ),
        Check(
            "B11",
            "integrations[1].durationHours",
            "equals",
            3,
            "Jendela 180 menit untuk skema internal Transjakarta.",
            "high",
            "integration-transjakarta-only-3h",
        ),
        Check(
            "B12",
            "integrations[1].verified",
            "equals",
            True,
            "VERIFIED. Kanal resmi PT Transjakarta mengonfirmasi skema ini pada 8 Februari 2026, jadi tidak lagi hanya bersandar pada Wikipedia.",
            "high",
            "integration-transjakarta-only-3h",
        ),
        Check(
            "B13",
            "integrations[1].label",
            "contains",
            [
                "Rp5.000",
            ],
            "Label harus menyebut tarif maksimum Rp5.000 dan menyebut ini skema Transjakarta, bukan OKOTRIP.",
            "medium",
            "integration-transjakarta-only-3h",
        ),
        Check(
            "B14",
            "integrations[1].sources",
            "contains",
            [
                "x.com/PT_Transjakarta/status/2020622175766802528",
                "x.com/PT_Transjakarta/status/946911918056280064",
            ],
            "Dua kutipan operator yang memverifikasi skema ini belum dicatat.",
            "high",
            "integration-transjakarta-only-3h",
        ),
        Check(
            "B15",
            "integrations[1].windowAnchor",
            "equals",
            "tapInToTapIn",
            "Jendela skema internal Transjakarta dihitung dari tap-in pertama ke tap-in terakhir.",
            "medium",
            "integration-transjakarta-only-3h",
        ),
        Check(
            "B16",
            "integrations[2].covers",
            "equals",
            [],
            "KRL tidak tercakup skema mana pun.",
            "high",
            "krl-not-integrated",
        ),
        Check(
            "B17",
            "integrations[3].covers",
            "equals",
            [],
            "LRT Jabodebek tidak tercakup skema mana pun.",
            "high",
            "lrt-jabodebek-not-integrated",
        ),
        # --- rules that are missing entirely ----------------------------
        Check(
            "C1",
            "modes.transjakarta-brt.minBalanceIdr",
            "equals",
            5000,
            "Saldo minimum kartu fisik Transjakarta Rp5.000 belum tercatat sama sekali.",
            "medium",
            "tj-min-balance",
        ),
        Check(
            "C2",
            "modes.transjakarta-brt.tapInOut",
            "exists",
            None,
            "Aturan tap in / tap out wajib, kartu terblokir bila lupa tap out, dan penundaan tagihan belum tercatat.",
            "medium",
            "tj-mandatory-tap-in-tap-out",
        ),
        Check(
            "C3",
            "modes.transjakarta-brt.transferRule",
            "contains",
            [
                "new journey",
                "Rp 5,000",
            ],
            "Transfer antar bus harus dinyatakan sebagai perjalanan baru DAN ditutup plafon Rp5.000 dengan kartu JakLingko.",
            "medium",
            "tj-transfer-is-new-boarding",
        ),
        Check(
            "C4",
            "modes.transjakarta-brt.transferRule",
            "contains",
            [
                "tap out",
            ],
            "Kalimat 'kalau lupa tap out, kartu bisa diblokir' hilang dari transferRule.",
            "medium",
            "tj-missing-tap-out-penalty",
        ),
        Check(
            "C5",
            "modes.transjakarta-mikrotrans.note",
            "contains",
            [
                "memutus",
                "skema",
            ],
            "Mikrotrans berada di luar skema multimodal dan memutus sesi integrasi bila di antara dua moda yang tercakup.",
            "medium",
            "tj-microtrans-free",
        ),
        Check(
            "C6",
            "pendingChanges",
            "exists",
            None,
            "Perubahan tarif 1 Januari 2027 belum punya entri terstruktur dengan effectiveFrom dan amounts null.",
            "medium",
            "fare-2027-date-and-scope",
        ),
        # --- claims in the notes that are now wrong ----------------------
        Check(
            "D1",
            "notes",
            "custom",
            None,
            "Catatan lama menyatakan skema Rp5.000 'documented only on id.wikipedia' dan ditandai verified false. Sekarang sudah terverifikasi lewat kanal resmi operator.",
            "high",
            "integration-transjakarta-only-3h",
        ),
        Check(
            "D2",
            "notes",
            "custom",
            None,
            "Catatan lama menulis LRT Jakarta ikut perubahan 1 Januari 2027. Kutipan langsung gubernur: 'Untuk MRT, LRT akan diatur kemudian'. Klaim LRT Jakarta harus ditandai sebagai sumber berkonflik.",
            "high",
            "fare-2027-date-and-scope",
        ),
        Check(
            "D3",
            "integrations[0].includes",
            "custom",
            None,
            "Catatan lama menyebut Integration Multimodal window 180 menit 'runs from the FIRST tap-out to the LAST tap-out'. Ini benar, tetapi syarat minimal dua moda berbeda dan larangan BREAKING oleh non-BRT dan Mikrotrans harus dinyatakan eksplisit di field yang bisa dibaca mesin.",
            "medium",
            "integration-multimodal-3mode",
        ),
        Check(
            "D4",
            "notes",
            "custom",
            None,
            "Tidak ada catatan yang menegaskan skema integrasi berlaku setiap hari, tanpa syarat hari kerja.",
            "medium",
            "integration-multimodal-3mode",
        ),
    ]


def custom_check(key: str, fares: Any, findings: Any) -> tuple[str, str, str]:
    """The checks that read the prose of the notes array.

    Returns the status, the detail, and a needle that locates the note in
    ``fares.json`` so that the report can name the line to change.
    """
    notes = fares.get("notes", [])
    text = "\n".join(notes)

    if key == "D1":
        stale = [
            phrase
            for phrase in (
                "documented only on id.wikipedia",
                "flagged verified: false",
            )
            if phrase in text
        ]
        if stale:
            for note in notes:
                if stale[0] in note:
                    return (
                        SALAH,
                        "Catatan usang masih ada: %s" % show(stale[0], 70),
                        note[:60],
                    )
            return SALAH, "Catatan usang masih ada.", stale[0]
        return OK, "Catatan usang sudah dibuang.", ""

    if key == "D2":
        for note in notes:
            if "LRT Jakarta; MRT tidak ikut" in note:
                return (
                    SALAH,
                    "Catatan menyatakan LRT Jakarta ikut 1 Januari 2027; kutipan gubernur tidak mendukungnya.",
                    note[:60],
                )
        return OK, "Catatan Operator 2027 tidak mengklaim LRT Jakarta.", ""

    if key == "D3":
        includes = ""
        try:
            includes = resolve(fares, "integrations[0].includes")
        except (KeyError, IndexError, TypeError):
            includes = ""
        if "different modes" in includes.lower():
            return OK, "Prose skema menyebut syarat minimal dua moda berbeda.", includes[:60]
        return (
            SALAH,
            "Prose skema tidak menyebut syarat minimal dua moda berbeda.",
            includes[:60],
        )

    if key == "D4":
        for note in notes:
            if "setiap hari" in note.lower():
                return OK, "Catatan menegaskan skema berlaku setiap hari.", note[:60]
        return (
            SALAH,
            "Tidak ada catatan yang menegaskan skema integrasi berlaku setiap hari.",
            '"notes": [',
        )

    return OK, "", ""


# --------------------------------------------------------------------------
# reporting


def run() -> int:
    findings = read_json(FINDINGS)
    fares = read_json(FARES)
    with open(FARES, encoding="utf-8") as handle:
        fares_lines = handle.read().split("\n")

    rule_names = {rule["id"]: rule["name"] for rule in findings.get("rules", [])}
    for pending in findings.get("pendingChanges", []):
        rule_names[pending["id"]] = pending["name"]

    checks = build_checks()
    rows = []

    for check in checks:
        try:
            actual = resolve(fares, check.path)
        except (KeyError, IndexError, TypeError):
            actual = None
            missing = True
        else:
            missing = False

        if check.kind == "custom":
            status, detail, needle = custom_check(check.key, fares, findings)
            line = 0
            actual_text = ""
            if needle:
                for index, raw in enumerate(fares_lines):
                    if needle[:40] in raw:
                        line = index + 1
                        actual_text = show(raw.strip().strip(","), 150)
                        break
            if not actual_text:
                actual_text = show(
                    next(
                        (
                            note
                            for note in fares.get("notes", [])
                            if note.startswith(needle[:40])
                        ),
                        "",
                    ),
                    150,
                )
        elif check.kind == "equals":
            line = line_of(fares_lines, check.path)
            if missing:
                status, detail = TIDAK_ADA, "Path %s tidak ada." % check.path
            elif actual == check.expected:
                status, detail = OK, ""
            else:
                status = SALAH
                detail = "sekarang %s, seharusnya %s" % (
                    show(actual),
                    show(check.expected),
                )
            actual_text = show(actual)
        elif check.kind == "contains":
            line = line_of(fares_lines, check.path)
            text = " ".join(actual.split()) if isinstance(actual, str) else show(actual)
            if missing:
                status, detail = TIDAK_ADA, "Path %s tidak ada." % check.path
            else:
                missing_phrases = [p for p in check.expected if p.lower() not in text.lower()]
                if missing_phrases:
                    status = SALAH
                    detail = "kalimat wajib tidak ada: %s" % show(missing_phrases[0], 70)
                else:
                    status, detail = OK, ""
            actual_text = text
        else:  # exists
            line = line_of(fares_lines, check.path)
            if missing:
                status, detail = TIDAK_ADA, "Path %s tidak ada." % check.path
            else:
                status, detail = OK, ""
            actual_text = show(actual) if not missing else "-"

        rows.append(
            {
                "key": check.key,
                "path": check.path,
                "line": line,
                "status": status,
                "actual": actual_text,
                "expected": check.expected if check.kind != "custom" else "(lihat catatan)",
                "detail": detail,
                "severity": check.severity,
                "rule": check.rule,
                "note": check.note,
            }
        )

    width_path = max(len(r["path"]) for r in rows)
    width_status = max(len(r["status"]) for r in rows)

    print("=" * 118)
    print("Daily Route - verifikasi tarif Transjakarta terhadap research/data/fares.json")
    print("Findings : research/data/fares-tap-in-out.json  (status per 21 Oktober 2026)")
    print("Target   : research/data/fares.json  (read only, skrip ini tidak pernah menulis)")
    print("=" * 118)
    print()

    header = "%-4s %-6s %-8s %-*s %s" % (
        "KEY",
        "STATUS",
        "LINE",
        width_path,
        "PATH DI fares.json",
        "RINGKASAN",
    )
    print(header)
    print("-" * 118)

    for row in rows:
        summary = row["detail"] or row["note"]
        print(
            "%-4s %-*s %-8s %-*s %s"
            % (
                row["key"],
                width_status,
                row["status"],
                row["line"] or "-",
                width_path,
                row["path"],
                show(summary, 120),
            )
        )

    print()
    print("-" * 118)
    print("RINCIAN: sekarang vs seharusnya")
    print("-" * 118)

    for row in rows:
        if row["status"] == OK:
            continue
        print()
        print("[%s] %s  (%s, severity %s)" % (row["key"], row["path"], row["status"], row["severity"]))
        print("    aturan  : %s" % rule_names.get(row["rule"], row["rule"]))
        print("    sekarang: %s" % row["actual"])
        if row["status"] == TIDAK_ADA:
            print("    seharusnya: field ini belum ada, tambahkan")
        else:
            print("    seharusnya: %s" % row["detail"])
        print("    tindakan : %s" % row["note"])

    print()
    print("-" * 118)
    counts = {OK: 0, SALAH: 0, TIDAK_ADA: 0}
    for row in rows:
        counts[row["status"]] = counts.get(row["status"], 0) + 1
    print(
        "RINGKASAN: %d OK, %d SALAH, %d TIDAK ADA, dari %d pemeriksaan"
        % (counts[OK], counts[SALAH], counts[TIDAK_ADA], len(rows))
    )
    print()

    if counts[SALAH] or counts[TIDAK_ADA]:
        print("Baris fares.json yang perlu diubah:")
        touched = []
        for row in rows:
            if row["status"] in (SALAH, TIDAK_ADA) and row["line"]:
                if row["line"] not in [t[0] for t in touched]:
                    touched.append((row["line"], row["path"], row["status"], row["note"]))
        for line, path, status, note in sorted(touched):
            print("  fares.json:%-5d %-9s %s" % (line, status, path))
        print()

    # The model changes that the findings ask for, straight from the findings.
    print("-" * 118)
    print("PERUBAHAN MODEL YANG DIMINTA TEMUAN INI")
    print("-" * 118)
    for change in findings.get("modelImpact", {}).get("changes", []):
        print(
            "%s  %-6s  %s"
            % (change["id"], change["severity"], change["change"])
        )
        print("      model : %s" % change["modelImpact"])
        print("      file  : %s" % ", ".join(change["affects"]))
    print()

    print("-" * 118)
    print("ANGKA YANG TIDAK TERVERIFIKASI (jangan dipakai sebagai tarif aktif)")
    print("-" * 118)
    for item in findings.get("unverified", []):
        print("  - %s" % item["item"])
        print("      status: %s" % item["verdict"])
    print()

    return 1 if (counts[SALAH] or counts[TIDAK_ADA]) else 0


if __name__ == "__main__":
    sys.exit(run())
