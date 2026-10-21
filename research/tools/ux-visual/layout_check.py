#!/usr/bin/env python3
"""Check the Daily Route layout against the layout specification.

The specification is research/ux-layout-patterns.spec.json; the reasoning
behind every number is in research/ux-layout-patterns.md.

Run it from the repository root:

    python3 research/tools/ux-visual/layout_check.py
    python3 research/tools/ux-visual/layout_check.py --json
    python3 research/tools/ux-visual/layout_check.py --only prototypes
    python3 research/tools/ux-visual/layout_check.py --only application
    python3 research/tools/ux-visual/layout_check.py --concept B
    python3 research/tools/ux-visual/layout_check.py --root /path/to/repo

It reports two groups.

*Prototypes* are held to the specification. An error there means a prototype
contradicts a number in the spec file.

*Application* findings describe how far the current source in
apps/web/src/routes/ still is from the concept named by --concept (concept A
by default): a fixed top app bar, a fixed-width grid column, a map cut with
vh instead of dvh, a legend that is still a full-width strip, or a floating
panel whose width is not the one the specification gives.

The script only reads. It never writes, moves or modifies a source file, and
it never touches the database, the network or the build.

Exit code 0 when no error was found, 1 when at least one error was found, 2
when the specification or the files could not be read.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

# --------------------------------------------------------------------------
# Locating the repository, the specification and the files
# --------------------------------------------------------------------------

HERE = Path(__file__).resolve().parent
REPO_ROOT = HERE.parents[2]  # research/tools/ux-visual -> repository root
DEFAULT_SPEC = REPO_ROOT / "research" / "ux-layout-patterns.spec.json"

# --------------------------------------------------------------------------
# Patterns
# --------------------------------------------------------------------------

# A <header> together with its attributes, so the class can be inspected.
HEADER_TAG = re.compile(r"<\s*header\b([^>]*)", re.IGNORECASE)
CLASS_ATTR = re.compile(r"""class(?:Name)?\s*=\s*["']([^"']*)["']""", re.IGNORECASE)

# A class that names a bar across the top of the screen.
APP_BAR_CLASSES = re.compile(
    r"class(?:Name)?\s*=\s*[\"'][^\"']*\b(app-?bar|top-?bar|topbar|toolbar|"
    r"app-?header|site-?header|global-?header)\b",
    re.IGNORECASE,
)

# A <header> that belongs to a floating panel or a sheet is not an app bar.
PANEL_MARKERS = ("sheet", "results", "card", "dock", "panel", "legend", "field", "recents")

# A grid column with a fixed width: the map can never be the whole window.
FIXED_GRID_COLUMN = re.compile(r"grid-cols-\[([^\]]*?(?:px|rem)[^\]]*?)\]", re.IGNORECASE)
# A viewport-height row split used for the mobile map.
VIEWPORT_ROW = re.compile(r"grid-rows-\[([^\]]*?)\]", re.IGNORECASE)
# A floating overlay with a fixed width, for example lg:w-[400px].
OVERLAY_WIDTH = re.compile(r"\b(?:lg:|md:)?w-\[(\d{3,4})px\]")
# A full-width strip pinned to the bottom of the map.
BOTTOM_STRIP = re.compile(r"absolute[^ \"']*\binset-x-0\b[^ \"']*bottom-0")

RADIUS_RE = re.compile(r"border-radius\s*:\s*(\d+(?:\.\d+)?)px", re.IGNORECASE)
FONT_SIZE_RE = re.compile(r"font-size\s*:\s*(\d+(?:\.\d+)?)px", re.IGNORECASE)
HEX_RE = re.compile(r"#[0-9a-fA-F]{3,8}\b")

# Elements that carry the map and the results.
MAP_SELECTORS = ("route-map", 'class="map"', 'class="map ')
RESULTS_SELECTORS = (
    "results",
    "sheet",
    "dock",
    "results-panel",
    "leg-list",
    "itinerary",
    "route-result",
)


class Finding:
    """One observation about one file."""

    __slots__ = ("group", "severity", "rule", "file", "line", "message")

    def __init__(self, group, severity, rule, file, line, message):
        self.group = group
        self.severity = severity
        self.rule = rule
        self.file = file
        self.line = line
        self.message = message

    def as_dict(self):
        return {
            "group": self.group,
            "severity": self.severity,
            "rule": self.rule,
            "file": self.file,
            "line": self.line,
            "message": self.message,
        }


def line_of(text, index):
    return text.count("\n", 0, index) + 1


def is_panel_header(tag_text):
    """True when a <header> belongs to a panel, a sheet, or a card."""
    match = CLASS_ATTR.search(tag_text)
    if not match:
        return False
    classes = match.group(1).lower()
    return any(marker in classes for marker in PANEL_MARKERS)


# --------------------------------------------------------------------------
# Reading the specification
# --------------------------------------------------------------------------


def load_spec(path: Path):
    try:
        with path.open("r", encoding="utf-8") as handle:
            return json.load(handle)
    except FileNotFoundError:
        print(f"spesifikasi tidak ditemukan: {path}", file=sys.stderr)
        return None
    except json.JSONDecodeError as error:
        print(f"spesifikasi tidak bisa dibaca: {path}: {error}", file=sys.stderr)
        return None


# --------------------------------------------------------------------------
# Prototypes
# --------------------------------------------------------------------------


def template_block(text):
    """The markup inside every <template> of a prototype."""
    blocks = []
    for match in re.finditer(r"<template\b[^>]*>(.*?)</template>", text, re.S | re.I):
        blocks.append(match.group(1))
    return "\n".join(blocks)


def check_prototype(concept_id, concept, spec, findings):
    rel = spec["prototypes"][concept_id]
    path = REPO_ROOT / rel
    if not path.exists():
        findings.append(
            Finding(
                "prototypes",
                "error",
                "prototype-missing",
                rel,
                0,
                f"prototipe untuk konsep {concept_id} tidak ada di {rel}",
            )
        )
        return

    text = path.read_text(encoding="utf-8")
    body = template_block(text) or text

    # 1. The prototype must announce which concept it is.
    if f'data-spec="{concept_id}"' not in text:
        findings.append(
            Finding(
                "prototypes",
                "error",
                "prototype-identity",
                rel,
                0,
                f"body harus membawa data-spec=\"{concept_id}\"",
            )
        )

    # 2. The app bar height must match the specification.
    declared = re.search(r'data-spec-appbar="([^"]*)"', text)
    expected = concept.get("appBarHeightPx")
    if declared is None:
        findings.append(
            Finding(
                "prototypes",
                "error",
                "no-top-app-bar",
                rel,
                0,
                "body harus membawa data-spec-appbar",
            )
        )
    else:
        value = declared.group(1)
        if expected is None and value != "null":
            findings.append(
                Finding(
                    "prototypes",
                    "error",
                    "no-top-app-bar",
                    rel,
                    line_of(text, declared.start()),
                    f"app bar harus null pada konsep {concept_id}, berkas menyatakan {value}",
                )
            )
        if expected is not None and value != str(expected):
            findings.append(
                Finding(
                    "prototypes",
                    "error",
                    "no-top-app-bar",
                    rel,
                    line_of(text, declared.start()),
                    f"tinggi app bar harus {expected}, berkas menyatakan {value}",
                )
            )

    # 3. No top app bar element in the prototype.
    for match in HEADER_TAG.finditer(body):
        if is_panel_header(match.group(0)):
            continue
        findings.append(
            Finding(
                "prototypes",
                "error",
                "no-top-app-bar",
                rel,
                line_of(body, match.start()),
                "prototipe memakai elemen app bar; konsep ini tidak memilikinya",
            )
        )
    for match in APP_BAR_CLASSES.finditer(body):
        findings.append(
            Finding(
                "prototypes",
                "error",
                "no-top-app-bar",
                rel,
                line_of(body, match.start()),
                "prototipe memakai kelas app bar; konsep ini tidak memilikinya",
            )
        )

    # 4. No fixed width grid column.
    for match in FIXED_GRID_COLUMN.finditer(body):
        value = match.group(1)
        if "px" in value or "rem" in value:
            findings.append(
                Finding(
                    "prototypes",
                    "error",
                    "no-fixed-width-sidebar",
                    rel,
                    line_of(body, match.start()),
                    f"kolom lebar tetap pada tata letak ({value})",
                )
            )

    # 5. The map must come before the results in the DOM.
    map_index = -1
    for selector in MAP_SELECTORS:
        found = body.find(selector)
        if found != -1 and (map_index == -1 or found < map_index):
            map_index = found
    results_index = -1
    for selector in RESULTS_SELECTORS:
        found = body.find(selector)
        if found != -1 and (results_index == -1 or found < results_index):
            results_index = found
    if map_index == -1:
        findings.append(
            Finding(
                "prototypes",
                "error",
                "map-before-results",
                rel,
                0,
                "peta tidak ditemukan pada kerangka prototipe",
            )
        )
    elif results_index != -1 and results_index < map_index:
        findings.append(
            Finding(
                "prototypes",
                "error",
                "map-before-results",
                rel,
                0,
                "panel hasil muncul sebelum peta dalam urutan DOM",
            )
        )

    # 6. Radii must be on the scale.
    allowed_radius = set(spec["tokens"]["radiusScalePx"])
    for match in RADIUS_RE.finditer(text):
        value = int(float(match.group(1)))
        if value not in allowed_radius:
            findings.append(
                Finding(
                    "prototypes",
                    "error",
                    "radius-on-scale",
                    rel,
                    line_of(text, match.start()),
                    f"radius {value} px tidak ada di skala radius",
                )
            )

    # 7. Font sizes must be on the scale and never below the floor.
    scale = set(spec["tokens"]["typeScalePx"])
    floor = spec["tokens"]["typeScaleFloorPx"]
    for match in FONT_SIZE_RE.finditer(text):
        value = int(float(match.group(1)))
        if value < floor:
            findings.append(
                Finding(
                    "prototypes",
                    "error",
                    "type-on-scale",
                    rel,
                    line_of(text, match.start()),
                    f"ukuran huruf {value} px di bawah lantai {floor} px",
                )
            )
        elif value not in scale:
            findings.append(
                Finding(
                    "prototypes",
                    "error",
                    "type-on-scale",
                    rel,
                    line_of(text, match.start()),
                    f"ukuran huruf {value} px tidak ada di skala tipografi",
                )
            )

    # 8. Colours must be tokens, mode colours, or map greys.
    palette = set(spec["tokens"]["colour"].values())
    palette |= set(spec["tokens"]["mapCanvas"].values())
    for match in HEX_RE.finditer(text):
        value = match.group(0).lower()
        if len(value) == 4:
            value = "#" + "".join(ch * 2 for ch in value[1:])
        if value in palette or value == "#000000":
            continue
        findings.append(
            Finding(
                "prototypes",
                "error",
                "tokens-only",
                rel,
                line_of(text, match.start()),
                f"warna {value} bukan token antarmuka",
            )
        )

    # 9. The sheet detents must match the specification.
    sheet = concept.get("mobile", {}).get("sheet")
    has_sheet = 'class="sheet' in body
    if sheet is None:
        if has_sheet:
            findings.append(
                Finding(
                    "prototypes",
                    "error",
                    "no-draggable-sheet-in-A",
                    rel,
                    0,
                    "konsep ini tidak memakai sheet yang bisa ditarik",
                )
            )
    else:
        if not has_sheet:
            findings.append(
                Finding(
                    "prototypes",
                    "error",
                    "sheet-detents-match-spec",
                    rel,
                    0,
                    "konsep ini seharusnya memakai bottom sheet",
                )
            )
        for key, label in (
            ("peekPercent", "peek"),
            ("halfPercent", "half"),
            ("fullPercent", "full"),
        ):
            wanted = f'{sheet[key]}%'
            if wanted not in text:
                findings.append(
                    Finding(
                        "prototypes",
                        "error",
                        "sheet-detents-match-spec",
                        rel,
                        0,
                        f"detent {label} {wanted} tidak ada di berkas",
                    )
                )

    # 10. The numbers the prototype advertises must match the specification.
    for key, wanted in concept.get("specAttributes", {}).items():
        kebab = re.sub(r"(?<!^)(?=[A-Z])", "-", key).lower()
        attribute = f'data-spec-{kebab}="{wanted}"'
        if attribute not in text:
            findings.append(
                Finding(
                    "prototypes",
                    "error",
                    "prototype-identity",
                    rel,
                    0,
                    f"berkas harus membawa {attribute}",
                )
            )


# --------------------------------------------------------------------------
# The current application source
# --------------------------------------------------------------------------


def check_application(concept_id, concept, spec, app_dir: Path, findings):
    rel_root = "apps/web/src/routes"
    root_path = app_dir / "__root.tsx"
    index_path = app_dir / "index.tsx"

    has_app_bar = False

    # -- the shell ---------------------------------------------------------
    if root_path.exists():
        text = root_path.read_text(encoding="utf-8")
        rel = f"{rel_root}/__root.tsx"
        for match in HEADER_TAG.finditer(text):
            if is_panel_header(match.group(0)):
                continue
            has_app_bar = True
            findings.append(
                Finding(
                    "application",
                    "warning",
                    "no-top-app-bar",
                    rel,
                    line_of(text, match.start()),
                    "shell memakai elemen header sebagai app bar",
                )
            )
        for match in APP_BAR_CLASSES.finditer(text):
            has_app_bar = True
            findings.append(
                Finding(
                    "application",
                    "warning",
                    "no-top-app-bar",
                    rel,
                    line_of(text, match.start()),
                    "shell memakai kelas app bar",
                )
            )
        if has_app_bar and "Daily Route" in text:
            findings.append(
                Finding(
                    "application",
                    "warning",
                    "no-top-app-bar",
                    rel,
                    0,
                    "app bar membawa logo, judul, dan deskripsi sekaligus",
                )
            )
        if has_app_bar and re.search(r"Asisten\s+(aktif|nonaktif|belum aktif)", text):
            findings.append(
                Finding(
                    "application",
                    "warning",
                    "feature-status-not-in-chrome",
                    rel,
                    0,
                    "status fitur yang belum aktif berada di chrome atas",
                )
            )
        if has_app_bar and re.search(r"Ganti tema|toggle", text):
            findings.append(
                Finding(
                    "application",
                    "warning",
                    "feature-status-not-in-chrome",
                    rel,
                    0,
                    "tombol tema berada di chrome atas; ia sebaiknya pindah ke kontrol peta atau pengaturan",
                )
            )
    else:
        findings.append(
            Finding(
                "application",
                "warning",
                "application-missing",
                f"{rel_root}/__root.tsx",
                0,
                "berkas shell aplikasi tidak ditemukan",
            )
        )

    # -- the planner page --------------------------------------------------
    if index_path.exists():
        text = index_path.read_text(encoding="utf-8")
        rel = f"{rel_root}/index.tsx"
        for match in FIXED_GRID_COLUMN.finditer(text):
            value = match.group(1)
            if "px" in value or "rem" in value:
                findings.append(
                    Finding(
                        "application",
                        "warning",
                        "no-fixed-width-sidebar",
                        rel,
                        line_of(text, match.start()),
                        f"kolom kiri lebar tetap ({value}); peta tidak pernah menjadi layar penuh",
                    )
                )
        for match in VIEWPORT_ROW.finditer(text):
            value = match.group(1)
            if "vh" in value:
                findings.append(
                    Finding(
                        "application",
                        "warning",
                        "full-height-uses-dvh",
                        rel,
                        line_of(text, match.start()),
                        f"baris memakai vh ({value}); wilayah setinggi layar memakai dvh",
                    )
                )
        for match in BOTTOM_STRIP.finditer(text):
            findings.append(
                Finding(
                    "application",
                    "warning",
                    "legend-not-a-strip",
                    rel,
                    line_of(text, match.start()),
                    "legenda menjadi strip penuh di bawah peta",
                )
            )

        shell_text = root_path.read_text(encoding="utf-8") if root_path.exists() else ""
        if not re.search(r"\bdvh\b", text) and not re.search(r"\bdvh\b", shell_text):
            findings.append(
                Finding(
                    "application",
                    "warning",
                    "full-height-uses-dvh",
                    rel,
                    0,
                    "wilayah setinggi layar tidak memakai dvh",
                )
            )

        # The floating panel width must be the one the concept gives.
        wanted = concept.get("desktop", {}).get("resultsPanelWidthPx")
        if wanted:
            widths = {int(value) for value in OVERLAY_WIDTH.findall(text)}
            if widths and wanted not in widths:
                findings.append(
                    Finding(
                        "application",
                        "warning",
                        "prototype-identity",
                        rel,
                        0,
                        f"lebar panel mengambang {sorted(widths)}; konsep {concept_id} meminta {wanted} px",
                    )
                )

        # The map must come before the result panel.
        map_index = text.find("RouteMap")
        result_index = text.find("RouteResult")
        if map_index != -1 and result_index != -1 and result_index < map_index:
            findings.append(
                Finding(
                    "application",
                    "warning",
                    "map-before-results",
                    rel,
                    0,
                    "panel hasil muncul sebelum peta dalam urutan DOM",
                )
            )
    else:
        findings.append(
            Finding(
                "application",
                "warning",
                "application-missing",
                f"{rel_root}/index.tsx",
                0,
                "berkas halaman perencana tidak ditemukan",
            )
        )


# --------------------------------------------------------------------------
# Reporting
# --------------------------------------------------------------------------


def print_text(findings, spec, concept_id):
    errors = [f for f in findings if f.severity == "error"]
    warnings = [f for f in findings if f.severity == "warning"]

    print("Pemeriksaan tata letak Daily Route")
    print(f"Spesifikasi: {spec.get('title', 'ux-layout-patterns.spec.json')}")
    print(f"Konsep yang jadi acuan aplikasi: {concept_id}")
    print("")

    for group, title in (
        ("prototypes", "Prototipe"),
        ("application", "Aplikasi saat ini"),
    ):
        items = [f for f in findings if f.group == group]
        print(f"{title} ({len(items)})")
        if not items:
            print("  tidak ada temuan")
            print("")
            continue
        for item in items:
            where = f"{item.file}:{item.line}" if item.line else item.file
            print(f"  [{item.severity}] {item.rule} — {where}")
            print(f"      {item.message}")
        print("")

    print(f"Error: {len(errors)}   Peringatan: {len(warnings)}")
    return 1 if errors else 0


def main(argv=None):
    global REPO_ROOT

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", default=str(REPO_ROOT), help="akar repositori")
    parser.add_argument("--spec", default=str(DEFAULT_SPEC), help="berkas spesifikasi")
    parser.add_argument(
        "--only",
        choices=("prototypes", "application"),
        help="periksa hanya satu kelompok",
    )
    parser.add_argument(
        "--concept",
        default="A",
        help="konsep yang jadi acuan untuk memeriksa aplikasi (A, B, atau C)",
    )
    parser.add_argument("--json", action="store_true", help="keluaran JSON")
    args = parser.parse_args(argv)

    REPO_ROOT = Path(args.root).resolve()
    spec_path = Path(args.spec)
    if not spec_path.is_absolute():
        spec_path = REPO_ROOT / spec_path

    spec = load_spec(spec_path)
    if spec is None:
        return 2

    concepts = spec["concepts"]
    concept_id = args.concept if args.concept in concepts else "A"
    concept = concepts[concept_id]

    findings = []
    if args.only != "application":
        for key, value in concepts.items():
            check_prototype(key, value, spec, findings)
    if args.only != "prototypes":
        app_dir = REPO_ROOT / "apps" / "web" / "src" / "routes"
        check_application(concept_id, concept, spec, app_dir, findings)

    if args.json:
        print(
            json.dumps(
                {
                    "spec": str(spec_path),
                    "concept": concept_id,
                    "errors": sum(1 for f in findings if f.severity == "error"),
                    "warnings": sum(1 for f in findings if f.severity == "warning"),
                    "findings": [f.as_dict() for f in findings],
                },
                ensure_ascii=False,
                indent=2,
            )
        )
    else:
        print_text(findings, spec, concept_id)
    return 1 if any(f.severity == "error" for f in findings) else 0


if __name__ == "__main__":
    sys.exit(main())
