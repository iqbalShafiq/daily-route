#!/usr/bin/env python3
"""Bulk-fetch station facts (code, coords, opened, platforms, tracks) from Wikipedia.

Usage:
  python3 wikibulk.py facts en  "Title A" "Title B" ...
  python3 wikibulk.py facts id  "Title A" "Title B" ...
  python3 wikibulk.py raw   id  "Title A" ...
"""
import json
import re
import sys
import urllib.parse
import urllib.request

UA = "rail-jakarta-research/1.0 (transit data platform research)"
BASES = {"en": "https://en.wikipedia.org/w/api.php",
         "id": "https://id.wikipedia.org/w/api.php"}


def api(base, params):
    params = dict(params)
    params["format"] = "json"
    params["formatversion"] = "2"
    url = BASES[base] + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=90) as r:
        return json.loads(r.read().decode("utf-8"))


def get_wikitext(base, titles):
    out = {}
    titles = list(titles)
    for i in range(0, len(titles), 40):
        chunk = titles[i:i + 40]
        data = api(base, {"action": "query", "prop": "revisions", "rvprop": "content",
                          "rvslots": "main", "titles": "|".join(chunk)})
        for p in data.get("query", {}).get("pages", []):
            if p.get("missing"):
                out[p["title"]] = None
                continue
            try:
                out[p["title"]] = p["revisions"][0]["slots"]["main"]["content"]
            except Exception:
                out[p["title"]] = None
    return out


def field(text, key):
    if not text:
        return None
    m = re.search(r"^\s*\|\s*" + re.escape(key) + r"\s*=\s*(.+?)(?=\n\s*\|\s*[\w ]+\s*=|\n\}\})",
                  text, re.S | re.M)
    if not m:
        return None
    v = " ".join(m.group(1).split())
    v = re.sub(r"^\{\{[^}]*\}\}", "", v).strip()
    return v or None


def coord(text):
    if not text:
        return None
    m = re.search(r"\{\{coord\s*\|([^|}]+)\|([^|}]+)\|([^|}]+)\|([^|}]+)\}\}", text)
    if m:
        lat = float(m.group(1))
        lon = float(m.group(2))
        if m.group(3).strip().lower().startswith("s"):
            lat = -lat
        if m.group(4).strip().lower().startswith("w"):
            lon = -lon
        return (round(lat, 7), round(lon, 7))
    m = re.search(r"\{\{coord\s*\|([^|}]+)\|([^|}]+)\}\}", text)
    if m:
        return (float(m.group(1)), float(m.group(2)))
    m = re.search(r"coordinates\s*=\s*\{\{coord\s*\|([^|}]+)\|([^|}]+)\}", text)
    if m:
        return (float(m.group(1)), float(m.group(2)))
    return None


def facts(text):
    if text is None:
        return {"missing": True}
    return {
        "code": field(text, "code"),
        "opened": field(text, "opened"),
        "platforms": field(text, "platforms"),
        "tracks": field(text, "tracks"),
        "structure": field(text, "structure"),
        "line": field(text, "line"),
        "connections": field(text, "connections"),
        "coords": coord(text),
        "address": field(text, "address"),
        "elevation": field(text, "elevation"),
    }


if __name__ == "__main__":
    mode, base = sys.argv[1], sys.argv[2]
    titles = sys.argv[3:]
    wt = get_wikitext(base, titles)
    for t in titles:
        if mode == "raw":
            print("=" * 20, t)
            print(wt.get(t))
        else:
            print(json.dumps({"title": t, **facts(wt.get(t))}, ensure_ascii=False))
