#!/usr/bin/env python3
"""Check the Daily Route front end against the transit-craft specification.

The specification is research/ux-transit-craft.spec.json; the reasoning behind
every number is in research/ux-transit-craft.md.

Run it from the repository root:

    python3 research/tools/ux-visual/typography_check.py
    python3 research/tools/ux-visual/typography_check.py --json
    python3 research/tools/ux-visual/typography_check.py --root apps/web/src
    python3 research/tools/ux-visual/typography_check.py --only-copy

It reports, per file:

  * font sizes outside the type scale, below the 12 px floor, or only
    near the scale;
  * line heights and letter spacing outside the approved lists;
  * spacing values off the 4 px scale (and sub-scale values);
  * radii outside the radius scale;
  * hex colours written inside a component instead of a token;
  * emoji, exclamation marks and em-dashes in the copy;
  * sentences that a copy rule in the specification says must change;
  * numbers that are compared with other numbers but are not tabular.

The script only reads. It never writes, moves or modifies a source file, and
it never touches the database, the network or the build.

Exit code 0 when nothing is wrong, 1 when at least one error was found, 2
when the specification or the source tree could not be read.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

# --------------------------------------------------------------------------
# Locating the repository, the specification and the source tree
# --------------------------------------------------------------------------

HERE = Path(__file__).resolve().parent
REPO_ROOT = HERE.parents[2]  # research/tools/ux-visual -> repository root
DEFAULT_SPEC = REPO_ROOT / "research" / "ux-transit-craft.spec.json"
DEFAULT_SOURCE = REPO_ROOT / "apps" / "web" / "src"

SOURCE_SUFFIXES = {".tsx", ".ts", ".css"}

# --------------------------------------------------------------------------
# Patterns
# --------------------------------------------------------------------------

# Utilities whose value is a padding, a margin or a gap. Their rhythm is the
# 4 px scale.
SPACING_PREFIXES = (
    "p",
    "px",
    "py",
    "pt",
    "pr",
    "pb",
    "pl",
    "m",
    "mx",
    "my",
    "mt",
    "mr",
    "mb",
    "ml",
    "gap",
    "gap-x",
    "gap-y",
    "space-x",
    "space-y",
)

# Utilities whose value is a position offset. The rhythm is less strict here,
# so these are only reported as warnings.
INSET_PREFIXES = ("top", "right", "bottom", "left", "inset", "inset-x", "inset-y")

_FONT_SIZE_ARBITRARY = re.compile(r"text-\[(\d+(?:\.\d+)?)px\]")
_FONT_SIZE_NAMED = re.compile(r"\btext-(xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|6xl|7xl|8xl|9xl)\b")
_LINE_HEIGHT_ARBITRARY = re.compile(r"leading-\[(\d+(?:\.\d+)?)\]")
_LINE_HEIGHT_NAMED = re.compile(r"\bleading-(none|tight|snug|normal|relaxed|loose)\b")
_LINE_HEIGHT_PX = re.compile(r"\bleading-(\d{1,2})\b")
_TRACKING_ARBITRARY = re.compile(r"tracking-\[([^\]\"']+)\]")
_TRACKING_NAMED = re.compile(r"\btracking-(tighter|tight|normal|wide|wider|widest)\b")
_RADIUS_ARBITRARY = re.compile(r"rounded-\[(\d+(?:\.\d+)?)px\]")
_RADIUS_NAMED = re.compile(r"\brounded-(none|sm|md|lg|xl|2xl|3xl|full)\b")

_SPACING_RE = re.compile(
    r"\b(" + "|".join(sorted(SPACING_PREFIXES, key=len, reverse=True)) + r")-(\d+(?:\.\d+)?)\b"
)
_SPACING_ARBITRARY_RE = re.compile(
    r"\b(" + "|".join(sorted(SPACING_PREFIXES, key=len, reverse=True)) + r")-\[(-?\d+(?:\.\d+)?)px\]"
)
_INSET_RE = re.compile(
    r"\b(" + "|".join(sorted(INSET_PREFIXES, key=len, reverse=True)) + r")-(\d+(?:\.\d+)?)\b"
)

_HEX_COLOR = re.compile(r"#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b")

# Emoji blocks, plus the variation selector. Arrows and other typographic
# marks are deliberately excluded.
_EMOJI = re.compile(
    "[\U0001F300-\U0001FAFF\U0001F1E6-\U0001F1FF\U00002600-\U000027BF\uFE0F]"
)

# A quoted string. Backticks are included because the copy lives in template
# literals as often as in quoted strings.
_QUOTED = re.compile(r"\"([^\"\\\n]{1,400})\"|'([^'\\\n]{1,400})'|`([^`\\]{1,400})`")
# Text between two tags, which is where a reader sees a sentence. A text node
# never spans a line break, and never contains code punctuation, so the
# pattern cannot wander into the surrounding JavaScript.
_JSX_TEXT = re.compile(r">([^\n<>{}]{1,200})<")
# An opening tag with its attributes.
_JSX_TAG = re.compile(r"<[A-Za-z][^<>]*>")

# Punctuation that means a matched span is code, not copy.
_CODE_MARKERS = (";", "=", "(", ")", "&&", "||", "=>", "?")

# A text node that contains a digit.
_JSX_NUMBER_TEXT = re.compile(r">([^\n<>{}]{1,200}\d[^\n<>{}]{0,200})<")


# --------------------------------------------------------------------------
# Reporting
# --------------------------------------------------------------------------


class Report:
    """Collects findings, grouped by file."""

    def __init__(self) -> None:
        self.findings: list[dict] = []

    def add(self, path: Path, line: int, rule: str, severity: str, message: str) -> None:
        self.findings.append(
            {
                "file": str(path),
                "line": line,
                "rule": rule,
                "severity": severity,
                "message": message,
            }
        )

    @property
    def errors(self) -> int:
        return sum(1 for f in self.findings if f["severity"] == "error")

    @property
    def warnings(self) -> int:
        return sum(1 for f in self.findings if f["severity"] == "warn")


def line_of(text: str, index: int) -> int:
    return text.count("\n", 0, index) + 1


# --------------------------------------------------------------------------
# Rules
# --------------------------------------------------------------------------


def check_type_scale(text: str, path: Path, spec: dict, report: Report) -> None:
    typography = spec["typography"]
    allowed = set(typography["allowedFontSizesPx"])
    near = set(typography["nearScaleFontSizesPx"])
    forbidden = set(typography["forbiddenFontSizesPx"])
    named = spec["tailwindNamed"]
    allowed_list = ", ".join(str(value) for value in sorted(allowed, reverse=True))

    for match in _FONT_SIZE_ARBITRARY.finditer(text):
        size = float(match.group(1))
        line = line_of(text, match.start())
        floor = typography.get("minimumLabelPx", 12)
        if size in forbidden or size < floor:
            report.add(
                path,
                line,
                "type.size.floor",
                "error",
                f"text-[{match.group(1)}px] — {size:g} px di bawah lantai {floor} px; "
                f"label, metadata, dan kode minimal {floor} px",
            )
        elif size in allowed:
            continue
        elif size in near:
            report.add(
                path,
                line,
                "type.size.warn",
                "warn",
                f"text-[{match.group(1)}px] — {size:g} px bukan anggota skala "
                f"({allowed_list}); pakai 13 atau 15 sebagai pengganti terdekat",
            )
        else:
            report.add(
                path,
                line,
                "type.size",
                "error",
                f"text-[{match.group(1)}px] — {size:g} px di luar skala tipografi "
                f"({allowed_list})",
            )

    for match in _FONT_SIZE_NAMED.finditer(text):
        token = match.group(0)
        size = named.get(token)
        if size is None:
            continue
        line = line_of(text, match.start())
        if size in allowed:
            continue
        if size in near:
            report.add(
                path,
                line,
                "type.size.warn",
                "warn",
                f"{token} — {size} px bukan anggota skala ({allowed_list}); "
                f"pakai kelas ukuran eksplisit yang anggota skaalanya",
            )
        else:
            report.add(
                path,
                line,
                "type.size",
                "error",
                f"{token} — {size} px di luar skala tipografi ({allowed_list})",
            )


def check_line_height(text: str, path: Path, spec: dict, report: Report) -> None:
    allowed = set(spec["typography"]["allowedLineHeights"])
    named = spec["tailwindNamed"]
    allowed_px = {16, 20, 24, 28, 32, 40}

    for match in _LINE_HEIGHT_ARBITRARY.finditer(text):
        value = float(match.group(1))
        line = line_of(text, match.start())
        if value in allowed:
            continue
        report.add(
            path,
            line,
            "type.lineHeight",
            "warn",
            f"leading-[{match.group(1)}] — {value:g} di luar daftar line-height "
            f"({', '.join(str(v) for v in sorted(allowed))})",
        )

    for match in _LINE_HEIGHT_NAMED.finditer(text):
        token = match.group(0)
        value = named.get(token)
        if value is None:
            continue
        line = line_of(text, match.start())
        if value in allowed:
            continue
        report.add(
            path,
            line,
            "type.lineHeight",
            "warn",
            f"{token} — line-height {value:g} di luar daftar yang diizinkan",
        )

    for match in _LINE_HEIGHT_PX.finditer(text):
        pixels = int(match.group(1)) * 4
        if pixels in allowed_px:
            continue
        report.add(
            path,
            line_of(text, match.start()),
            "type.lineHeight",
            "warn",
            f"{match.group(0)} — line-height {pixels} px di luar daftar "
            f"({', '.join(str(v) for v in sorted(allowed_px))})",
        )


def check_tracking(text: str, path: Path, spec: dict, report: Report) -> None:
    allowed = set(spec["typography"]["allowedTracking"])
    named = spec["tailwindNamed"]

    for match in _TRACKING_ARBITRARY.finditer(text):
        value = match.group(1).strip()
        line = line_of(text, match.start())
        if value in allowed:
            continue
        report.add(
            path,
            line,
            "type.tracking",
            "warn",
            f"tracking-[{value}] — di luar daftar tracking "
            f"({', '.join(sorted(allowed))})",
        )

    for match in _TRACKING_NAMED.finditer(text):
        token = match.group(0)
        value = named.get(token)
        if value is None:
            continue
        line = line_of(text, match.start())
        if value in allowed:
            continue
        report.add(
            path,
            line,
            "type.tracking",
            "warn",
            f"{token} — tracking {value} di luar daftar yang diizinkan",
        )


def spacing_px(value: str) -> float:
    """A Tailwind spacing step to pixels. The step is 0.25 rem = 4 px."""
    number = float(value)
    if number.is_integer():
        return number * 4
    return number * 4


def check_spacing(text: str, path: Path, spec: dict, report: Report) -> None:
    spacing = spec["spacing"]
    allowed = set(spacing["allowedPx"])
    near = set(spacing["nearPx"])
    sub = set(spacing["subScalePx"])
    half = set(spacing.get("halfStepPx", []))

    def judge(size: float, line: int, token: str) -> None:
        if size in allowed:
            return
        if size in half:
            report.add(
                path,
                line,
                "space.scale",
                "warn",
                f"{token} — {size:g} px adalah setengah langkah 4 px; boleh hanya "
                f"untuk jarak optis di dalam satu komponen, bukan antar blok",
            )
            return
        if size in sub:
            report.add(
                path,
                line,
                "space.subscale",
                "warn",
                f"{token} — {size:g} px di bawah langkah 4 px; pakai "
                f"{4 if size < 4 else 8} px atau biarkan kosong",
            )
            return
        if size in near:
            report.add(
                path,
                line,
                "space.scale",
                "warn",
                f"{token} — {size:g} px bukan anggota skala spasi "
                f"({', '.join(str(v) for v in sorted(allowed))})",
            )
            return
        report.add(
            path,
            line,
            "space.scale",
            "error",
            f"{token} — {size:g} px di luar skala spasi "
            f"({', '.join(str(v) for v in sorted(allowed))})",
        )

    for match in _SPACING_ARBITRARY_RE.finditer(text):
        size = abs(float(match.group(2)))
        judge(size, line_of(text, match.start()), match.group(0))

    for match in _SPACING_RE.finditer(text):
        size = spacing_px(match.group(2))
        judge(size, line_of(text, match.start()), match.group(0))

    for match in _INSET_RE.finditer(text):
        size = spacing_px(match.group(2))
        if size in allowed:
            continue
        report.add(
            path,
            line_of(text, match.start()),
            "space.inset",
            "warn",
            f"{match.group(0)} — offset {size:g} px bukan anggota skala spasi",
        )


def check_radius(text: str, path: Path, spec: dict, report: Report) -> None:
    radius = spec["radius"]
    allowed = set(radius["allowedPx"])
    near = set(radius["nearPx"])
    named = spec["tailwindNamed"]

    for match in _RADIUS_ARBITRARY.finditer(text):
        size = float(match.group(1))
        line = line_of(text, match.start())
        if size in allowed:
            continue
        if size in near:
            report.add(
                path,
                line,
                "radius.near",
                "warn",
                f"{match.group(0)} — {size:g} px bukan anggota skala radius "
                f"({', '.join(str(v) for v in sorted(allowed))})",
            )
        else:
            report.add(
                path,
                line,
                "radius.scale",
                "error",
                f"{match.group(0)} — {size:g} px di luar skala radius "
                f"({', '.join(str(v) for v in sorted(allowed))})",
            )

    for match in _RADIUS_NAMED.finditer(text):
        token = match.group(0)
        size = named.get(token)
        if size is None:
            continue
        line = line_of(text, match.start())
        if size in allowed:
            continue
        if size in near:
            report.add(
                path,
                line,
                "radius.near",
                "warn",
                f"{token} — {size:g} px bukan anggota skala radius",
            )
        else:
            report.add(
                path,
                line,
                "radius.scale",
                "error",
                f"{token} — {size:g} px di luar skala radius",
            )


def check_hex_colour(text: str, path: Path, report: Report) -> None:
    for match in _HEX_COLOR.finditer(text):
        report.add(
            path,
            line_of(text, match.start()),
            "colour.hexInComponent",
            "error",
            f"{match.group(0)} — warna ditulis langsung; pakai token dari styles.css",
        )


def check_copy_punctuation(text: str, path: Path, report: Report) -> None:
    def inspect(chunk: str, index: int) -> None:
        line = line_of(text, index)
        if _EMOJI.search(chunk):
            report.add(
                path,
                line,
                "copy.emoji",
                "error",
                "emoji di dalam copy; aplikasi ini tidak memakai emoji",
            )
        if "!" in chunk and "!=" not in chunk and "!==" not in chunk:
            report.add(
                path,
                line,
                "copy.exclamation",
                "error",
                "tanda seru di dalam copy; tulis kalimat biasa",
            )
        if "\u2014" in chunk or "\u2013" in chunk:
            report.add(
                path,
                line,
                "copy.emDash",
                "warn",
                "em-dash atau en-dash di dalam copy Indonesia; pakai koma atau titik",
            )

    for match in _QUOTED.finditer(text):
        chunk = match.group(1) or match.group(2) or match.group(3) or ""
        if chunk:
            inspect(chunk, match.start())
    for match in _JSX_TEXT.finditer(text):
        chunk = match.group(1)
        if not chunk.strip():
            continue
        if any(marker in chunk for marker in _CODE_MARKERS):
            continue
        inspect(chunk, match.start())


def check_tabular_numbers(text: str, path: Path, report: Report) -> None:
    for match in _JSX_NUMBER_TEXT.finditer(text):
        chunk = match.group(1)
        if len(chunk.strip()) < 2:
            continue
        if any(marker in chunk for marker in _CODE_MARKERS):
            continue
        before = text[: match.start()]
        tags = list(_JSX_TAG.finditer(before))
        if not tags:
            continue
        tag = tags[-1].group(0)
        if "tabular-nums" in tag:
            continue
        if "font-mono" in tag:
            continue
        report.add(
            path,
            line_of(text, match.start()),
            "numeric.tabular",
            "warn",
            f"angka '{chunk.strip()}' tanpa tabular-nums pada elemen induknya",
        )


def check_copy_rules(
    text: str, path: Path, spec: dict, report: Report, files_by_name: dict[str, Path]
) -> None:
    for rule in spec["copy"]["rules"]:
        if rule.get("direction") != "change":
            continue
        before = rule.get("before", "")
        if not before:
            continue
        surface = rule.get("surface", "")
        target = files_by_name.get(Path(surface).name) if surface else None
        if target is not None and target != path:
            continue
        if before.startswith("re:"):
            try:
                pattern = re.compile(before[3:])
            except re.error:
                continue
            for match in pattern.finditer(text):
                report.add(
                    path,
                    line_of(text, match.start()),
                    "copy.terminology",
                    "error",
                    f"{rule['id']} — '{match.group(0)}' harus '{rule['after']}'",
                )
        else:
            start = 0
            while True:
                index = text.find(before, start)
                if index == -1:
                    break
                report.add(
                    path,
                    line_of(text, index),
                    "copy.terminology",
                    "error",
                    f"{rule['id']} — '{before}' harus '{rule['after']}'",
                )
                start = index + len(before)


# --------------------------------------------------------------------------
# Main
# --------------------------------------------------------------------------


def collect_files(root: Path) -> list[Path]:
    files: list[Path] = []
    for path in sorted(root.rglob("*")):
        if path.is_file() and path.suffix in SOURCE_SUFFIXES:
            files.append(path)
    return files


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Periksa apps/web/src terhadap research/ux-transit-craft.spec.json"
    )
    parser.add_argument(
        "--spec",
        type=Path,
        default=DEFAULT_SPEC,
        help="berkas spesifikasi (default: research/ux-transit-craft.spec.json)",
    )
    parser.add_argument(
        "--root",
        type=Path,
        default=DEFAULT_SOURCE,
        help="direktori sumber yang diperiksa (default: apps/web/src)",
    )
    parser.add_argument("--json", action="store_true", help="keluaran JSON")
    parser.add_argument(
        "--only-copy",
        action="store_true",
        help="hanya memeriksa aturan copy, tanpa pemeriksaan tipografi",
    )
    parser.add_argument(
        "--no-copy",
        action="store_true",
        help="lewati pemeriksaan aturan copy",
    )
    parser.add_argument(
        "--warnings-as-errors",
        action="store_true",
        help="perlakukan peringatan sebagai galat",
    )
    args = parser.parse_args(argv)

    try:
        spec = json.loads(args.spec.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        print(f"tidak bisa membaca spesifikasi: {error}", file=sys.stderr)
        return 2

    root = args.root
    if not root.exists():
        print(f"direktori sumber tidak ditemukan: {root}", file=sys.stderr)
        return 2

    files = collect_files(root)
    if not files:
        print(f"tidak ada berkas sumber di {root}", file=sys.stderr)
        return 2

    files_by_name = {path.name: path for path in files}
    report = Report()

    for path in files:
        try:
            text = path.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            continue
        if not args.only_copy:
            check_type_scale(text, path, spec, report)
            check_line_height(text, path, spec, report)
            check_tracking(text, path, spec, report)
            check_spacing(text, path, spec, report)
            check_radius(text, path, spec, report)
            if path.suffix in {".tsx", ".ts"}:
                check_hex_colour(text, path, report)
            check_copy_punctuation(text, path, report)
            if path.suffix == ".tsx":
                check_tabular_numbers(text, path, report)
        if not args.no_copy:
            check_copy_rules(text, path, spec, report, files_by_name)

    report.findings.sort(key=lambda f: (f["file"], f["line"], f["rule"]))

    if args.json:
        payload = {
            "spec": str(args.spec),
            "root": str(root),
            "filesScanned": len(files),
            "errors": report.errors,
            "warnings": report.warnings,
            "findings": report.findings,
        }
        print(json.dumps(payload, indent=2, ensure_ascii=False))
    else:
        current = None
        for finding in report.findings:
            if finding["file"] != current:
                current = finding["file"]
                print()
                print(current)
            marker = "ERROR" if finding["severity"] == "error" else "warn "
            print(
                f"  {finding['line']:>4}  [{marker}] {finding['rule']:<22} {finding['message']}"
            )
        print()
        print(
            f"{len(report.findings)} temuan pada {len(files)} berkas: "
            f"{report.errors} galat, {report.warnings} peringatan."
        )
        if report.findings:
            print("Spesifikasi: " + str(args.spec))

    failed = report.errors > 0 or (args.warnings_as_errors and report.warnings > 0)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
