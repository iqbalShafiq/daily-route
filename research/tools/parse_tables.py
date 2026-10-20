#!/usr/bin/env python3
"""Extract ordered station lists (name + JakRSN code) from Indonesian Wikipedia
wikitext station tables for KRL commuter lines.

Usage: python3 parse_tables.py <wikitext-file> [<wikitext-file> ...]
"""
import re
import sys

ROW_RE = re.compile(r"^\|-.*$", re.M)


def clean(s):
    s = re.sub(r"<ref[^>]*?/>", "", s, flags=re.S)
    s = re.sub(r"<ref[^>]*>.*?</ref>", "", s, flags=re.S)
    s = re.sub(r"\{\{[^{}]*\}\}", "", s)
    s = re.sub(r"\[\[([^\[\]|]*)\|([^\[\]]*)\]\]", r"\2", s)
    s = re.sub(r"\[\[([^\[\]]*)\]\]", r"\1", s)
    s = re.sub(r"'''?", "", s)
    s = re.sub(r"<[^>]+>", "", s)
    return re.sub(r"\s+", " ", s).strip()


def extract(text):
    """Return list of (code, name, row_text) for each table row that has a JakRSN badge."""
    out = []
    rows = ROW_RE.split(text)
    for row in rows[1:]:
        codes = re.findall(r"\{\{JakRSN\|([A-Za-z]+)\|([0-9A-Za-z]*)\|?size=\d+\}\}", row)
        if not codes:
            continue
        # first wikilink in the row that points to a Stadion/Stasiun article
        name = None
        m = re.search(r"\[\[(Stasiun [^\]|]+)\|([^\]]+)\]\]", row)
        if m:
            name = clean(m.group(2))
        if not name:
            m = re.search(r"^\|(.+)$", row, re.M)
            if m:
                cand = clean(m.group(1))
                if cand and cand not in ("-", ""):
                    name = cand
        codelist = [f"{p}{n}" for p, n in codes]
        out.append((codelist, name, clean(row)[:400]))
    return out


if __name__ == "__main__":
    for f in sys.argv[1:]:
        print("#" * 30, f)
        t = open(f, encoding="utf-8").read()
        i = t.find("Stasiun pemberhentian")
        if i < 0:
            i = t.find("== Daftar stasiun")
        if i < 0:
            i = 0
        seg = t[i:]
        for codes, name, rowtxt in extract(seg):
            print(f"{'/'.join(codes):14} | {name}")
