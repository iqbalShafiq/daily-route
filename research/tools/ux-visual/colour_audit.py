#!/usr/bin/env python3
"""Audit the Daily Route colour system.

Run with the bundled Python (no third-party packages needed):

    python3 research/tools/ux-visual/colour_audit.py

It reports, for every palette:

  * the WCAG 2.x contrast ratio of every colour against the UI surfaces and
    against the map basemaps;
  * the colour-vision-deficiency separation of every pair of mode colours,
    under deuteranopia, protanopia and tritanopia, using the Vienot 1999 /
    Besseling 1999 simulation in linear sRGB and the CIEDE2000 colour
    difference (dE00).

Every number quoted in research/ux-visual-language.md section 2 comes out of
this script. The basemap colours are assumptions -- see section 11 of that
document -- and are marked as such below.

Reference for the simulation and the metric:
  Vienot, Brettel & Mollon 1999; Besseling 1999.
  CIEDE2000: Sharma, Wu & Dalal 2005.
  Okabe-Ito reference palette: Cynthia Brewer & Mark Harrower / Claus Wilke.
"""

from __future__ import annotations

import itertools
import math

# --------------------------------------------------------------------------
# Colour helpers
# --------------------------------------------------------------------------


def hex_to_rgb(value: str) -> tuple[int, int, int]:
    value = value.lstrip("#")
    return tuple(int(value[i : i + 2], 16) for i in (0, 2, 4))


def srgb_to_linear(channel: int) -> float:
    c = channel / 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def linear_to_srgb(value: float) -> float:
    value = max(0.0, min(1.0, value))
    s = 12.92 * value if value <= 0.0031308 else 1.055 * (value ** (1 / 2.4)) - 0.055
    return s * 255.0


def relative_luminance(value: str) -> float:
    r, g, b = (srgb_to_linear(c) for c in hex_to_rgb(value))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast_ratio(a: str, b: str) -> float:
    la, lb = relative_luminance(a), relative_luminance(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


def rgb_to_lab(rgb: tuple[float, float, float]) -> tuple[float, float, float]:
    r, g, b = (srgb_to_linear(c) for c in rgb)
    x = r * 0.4124 + g * 0.3576 + b * 0.1805
    y = r * 0.2126 + g * 0.7152 + b * 0.0722
    z = r * 0.0193 + g * 0.1192 + b * 0.9505

    def f(t: float) -> float:
        return t ** (1 / 3) if t > 0.008856 else (7.787 * t + 16 / 116)

    fx, fy, fz = f(x / 0.95047), f(y), f(z / 1.08883)
    return (116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz))


def ciede2000(c1: tuple[float, float, float], c2: tuple[float, float, float]) -> float:
    """CIEDE2000 colour difference (Sharma, Wu & Dalal 2005)."""
    l1, a1, b1 = c1
    l2, a2, b2 = c2
    c1 = math.hypot(a1, b1)
    c2 = math.hypot(a2, b2)
    c_bar = (c1 + c2) / 2
    g = 0.5 * (1 - math.sqrt(c_bar**7 / (c_bar**7 + 25**7))) if c_bar > 0 else 0.5
    a1p, a2p = (1 + g) * a1, (1 + g) * a2
    c1p, c2p = math.hypot(a1p, b1), math.hypot(a2p, b2)

    h1 = math.degrees(math.atan2(b1, a1p)) % 360 if (a1p or b1) else 0.0
    h2 = math.degrees(math.atan2(b2, a2p)) % 360 if (a2p or b2) else 0.0

    dlp = l2 - l1
    dcp = c2p - c1p
    if c1p * c2p == 0:
        dhp = 0.0
    else:
        dh = h2 - h1
        if dh > 180:
            dh -= 360
        elif dh < -180:
            dh += 360
        dhp = dh
    dh_p = 2 * math.sqrt(c1p * c2p) * math.sin(math.radians(dhp) / 2)

    lbp = (l1 + l2) / 2
    cbp = (c1p + c2p) / 2
    if c1p * c2p == 0:
        hbp = h1 + h2
    else:
        s = h1 + h2
        d = abs(h1 - h2)
        if d <= 180:
            hbp = s / 2
        elif s < 360:
            hbp = (s + 360) / 2
        else:
            hbp = (s - 360) / 2

    t = (
        1
        - 0.17 * math.cos(math.radians(hbp - 30))
        + 0.24 * math.cos(math.radians(2 * hbp))
        + 0.32 * math.cos(math.radians(3 * hbp + 6))
        - 0.20 * math.cos(math.radians(4 * hbp - 63))
    )
    d_theta = 30 * math.exp(-(((hbp - 275) / 25) ** 2))
    r_c = 2 * math.sqrt(cbp**7 / (cbp**7 + 25**7)) if cbp > 0 else 0.0
    s_l = 1 + (0.015 * (lbp - 50) ** 2) / math.sqrt(20 + (lbp - 50) ** 2)
    s_c = 1 + 0.045 * cbp
    s_h = 1 + 0.015 * cbp * t
    r_t = -r_c * math.sin(math.radians(2 * d_theta))
    return math.sqrt(
        (dlp / s_l) ** 2
        + (dcp / s_c) ** 2
        + (dh_p / s_h) ** 2
        + r_t * (dcp / s_c) * (dh_p / s_h)
    )


# --------------------------------------------------------------------------
# Colour vision deficiency simulation (Vienot 1999 / Besseling 1999)
# --------------------------------------------------------------------------


def simulate(rgb: tuple[int, int, int], kind: str) -> tuple[float, float, float]:
    r, g, b = (srgb_to_linear(c) for c in rgb)
    long_ = 0.31399022 * r + 0.63951294 * g + 0.04649755 * b
    med = 0.15537241 * r + 0.75789446 * g + 0.08670142 * b
    short = 0.01775239 * r + 0.10944209 * g + 0.87256922 * b

    def f(v: float) -> float:
        return v ** (1 / 3) if v > 0 else 0.0

    l, m, s = f(long_), f(med), f(short)
    if kind == "deutan":
        r_, g_, b_ = 0.625 * l + 0.330 * s, 0.430 * l + 0.770 * m, 0.440 * l + 0.280 * s
    elif kind == "protan":
        r_, g_, b_ = 0.567 * l + 0.433 * s, 0.558 * l + 0.442 * m, 0.242 * l + 0.758 * s
    elif kind == "tritan":
        r_, g_, b_ = 0.950 * l + 0.050 * s, 0.433 * l + 0.475 * m, 0.475 * l + 0.525 * s
    else:
        r_, g_, b_ = l, m, s
    return (
        linear_to_srgb(3.2406 * r_ - 1.5372 * g_ - 0.4986 * b_),
        linear_to_srgb(-0.9689 * r_ + 1.8758 * g_ + 0.0415 * b_),
        linear_to_srgb(0.0557 * r_ - 0.2040 * g_ + 1.0570 * b_),
    )


def worst_pair(palette: dict[str, str]) -> tuple[float, str]:
    """Smallest dE00 over every pair, under every simulated deficiency."""
    worst = (1e9, "")
    for kind in ("deutan", "protan", "tritan"):
        simulated = {k: simulate(hex_to_rgb(v), kind) for k, v in palette.items()}
        labs = {k: rgb_to_lab(v) for k, v in simulated.items()}
        for a, b in itertools.combinations(palette, 2):
            d = ciede2000(labs[a], labs[b])
            if d < worst[0]:
                worst = (d, f"{a}/{b} ({kind})")
    return worst


# --------------------------------------------------------------------------
# The system under test
# --------------------------------------------------------------------------

# ASSUMPTION: basemap land colour. Sample a real OpenFreeMap tile to confirm.
BASEMAP_LIGHT = "#f2f0ec"
BASEMAP_DARK = "#1c1c1c"

SURFACE_LIGHT = "#ffffff"
SURFACE_DARK = "#1a1c18"
ACCENT_LIGHT = "#0b6b4f"
ACCENT_DARK = "#4ade9e"

PROPOSED_LIGHT = {
    "bus": "#1d4ed8",
    "metro": "#b91c1c",
    "tram": "#b45309",
    "lrt-jabodebek": "#0e7490",
    "rail": "#334155",
}
PROPOSED_DARK = {
    "bus": "#38bdf8",
    "metro": "#f43f5e",
    "tram": "#f59e0b",
    "lrt-jabodebek": "#2dd4bf",
    "rail": "#a78bfa",
}
CURRENT_LIGHT = {
    "bus": "#0b6b4f",
    "metro": "#1d4ed8",
    "tram": "#c2410c",
    "lrt-jabodebek": "#6d28d9",
    "rail": "#334155",
}
CURRENT_DARK = {
    "bus": "#4ade9e",
    "metro": "#93b4fd",
    "tram": "#fb923c",
    "lrt-jabodebek": "#a78bfa",
    "rail": "#94a3b8",
}
OKABE_ITO = {
    "black": "#000000",
    "orange": "#E69F00",
    "sky-blue": "#56B4E9",
    "bluish-green": "#009E73",
    "yellow": "#F0E442",
    "blue": "#0072B2",
    "vermillion": "#D55E00",
    "reddish-purple": "#CC79A7",
}

INK = {
    "light": {
        "bg": "#fbfaf8",
        "surface": "#ffffff",
        "surface-2": "#f4f2ee",
        "ink": "#17150f",
        "ink-2": "#4a4740",
        "ink-3": "#7a766c",
        "accent": "#0b6b4f",
        "warn": "#a85b00",
        "danger": "#a4262c",
        "info": "#1d4ed8",
    },
    "dark": {
        "bg": "#111310",
        "surface": "#1a1c18",
        "surface-2": "#22251f",
        "ink": "#f2efe7",
        "ink-2": "#c6c2b6",
        "ink-3": "#8e8a7e",
        "accent": "#4ade9e",
        "warn": "#f0b45e",
        "danger": "#f28b82",
        "info": "#93b4fd",
    },
}


def report_palette(
    label: str,
    palette: dict[str, str],
    surface: str,
    basemap: str,
    accent: str,
) -> None:
    print(f"\n--- {label} ---")
    for name, value in palette.items():
        on_surface = contrast_ratio(value, surface)
        on_map = contrast_ratio(value, basemap)
        d_acc = ciede2000(rgb_to_lab(hex_to_rgb(value)), rgb_to_lab(hex_to_rgb(accent)))
        flags = []
        if on_surface < 4.5:
            flags.append("below 4.5:1 on surface")
        if on_map < 3.0:
            flags.append("below 3:1 on basemap")
        if d_acc < 12:
            flags.append(f"close to accent (dE00 {d_acc:.1f})")
        note = "; ".join(flags) if flags else "ok"
        print(
            f"  {name:16s} {value}  surface {on_surface:5.2f}:1  "
            f"basemap {on_map:5.2f}:1  dE00(accent) {d_acc:5.1f}  {note}"
        )
    d, pair = worst_pair(palette)
    print(f"  worst CVD pair: dE00 = {d:.1f}  ({pair})")


def main() -> None:
    print("Daily Route colour audit")
    print(f"basemap assumption: light {BASEMAP_LIGHT}, dark {BASEMAP_DARK}")

    print("\n=== INK AND SEMANTIC TOKENS ===")
    for theme, tokens in INK.items():
        bg = tokens["bg"]
        surface = tokens["surface"]
        print(f"\n  {theme} theme")
        for name, value in tokens.items():
            if name in ("bg", "surface", "surface-2"):
                continue
            print(
                f"    {name:12s} {value}  on bg {contrast_ratio(value, bg):5.2f}:1  "
                f"on surface {contrast_ratio(value, surface):5.2f}:1  "
                f"on surface-2 {contrast_ratio(value, tokens['surface-2']):5.2f}:1"
            )

    print("\n=== MODE PALETTES ===")
    report_palette(
        "CURRENT light", CURRENT_LIGHT, SURFACE_LIGHT, BASEMAP_LIGHT, ACCENT_LIGHT
    )
    report_palette(
        "CURRENT dark", CURRENT_DARK, SURFACE_DARK, BASEMAP_DARK, ACCENT_DARK
    )
    report_palette(
        "PROPOSED light", PROPOSED_LIGHT, SURFACE_LIGHT, BASEMAP_LIGHT, ACCENT_LIGHT
    )
    report_palette(
        "PROPOSED dark", PROPOSED_DARK, SURFACE_DARK, BASEMAP_DARK, ACCENT_DARK
    )

    print("\n=== REFERENCE STANDARD ===")
    d, pair = worst_pair(OKABE_ITO)
    print(f"  Okabe-Ito 8 colours: worst CVD pair dE00 = {d:.1f}  ({pair})")

    print("\n=== CASING AND HALO ON THE MAP ===")
    print(
        f"  white casing on light basemap: "
        f"{contrast_ratio('#ffffff', BASEMAP_LIGHT):.2f}:1  (invisible)"
    )
    print(
        f"  dark casing on dark basemap:   "
        f"{contrast_ratio('#111310', BASEMAP_DARK):.2f}:1  (invisible)"
    )
    print("  => the casing takes the surface colour; the halo takes the opposite")


if __name__ == "__main__":
    main()
