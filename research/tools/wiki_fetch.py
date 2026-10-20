#!/usr/bin/env python3
"""Fetch wikitext for a list of Wikipedia page titles and extract station facts.

Usage:
  python3 wiki_fetch.py raw "Page A" "Page B" ...      -> print wikitext
  python3 wiki_fetch.py facts "Page A" "Page B" ...    -> print code/coords/opened/etc.
"""
import json
import sys
import urllib.parse
import urllib.request

API = "https://en.wikipedia.org/w/api.php"
UA = "rail-jakarta-research/1.0 (transit data platform research)"


def api(params):
    params = dict(params)
    params["format"] = "json"
    params["formatversion"] = "2"
    url = API + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode("utf-8"))


def get_wikitext(titles):
    out = {}
    titles = list(titles)
    for i in range(0, len(titles), 40):
        chunk = titles[i:i + 40]
        data = api({
            "action": "query",
            "prop": "revisions",
            "rvprop": "content",
            "rvslots": "main",
            "titles": "|".join(chunk),
        })
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
    """Extract |key = value from an infobox wikitext block (first match)."""
    if not text:
        return None
    import re
    m = re.search(r"^\s*\|\s*" + re.escape(key) + r"\s*=\s*(.+?)(?=\n\s*\|\s*\w+\s*=|\n\}\})",
                  text, re.S | re.M)
    if not m:
        return None
    return " ".join(m.group(1).split())


def coord(text):
    if not text:
        return None
    import re
    m = re.search(r"\{\{coord\s*\|([^|}]+)\|([^|}]+)\|([^|}]+)\|([^|}]+)\}\}", text)
    if m:
        lat = float(m.group(1))
        lon = float(m.group(2))
        if m.group(3).strip().lower().startswith("s"):
            lat = -lat
        if m.group(4).strip().lower().startswith("w"):
            lon = -lon
        return round(lat, 7), round(lon, 7)
    m = re.search(r"\{\{coord\s*\|([^|}]+)\|([^|}]+)\}\}", text)
    if m:
        return float(m.group(1)), float(m.group(2))
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
    }


if __name__ == "__main__":
    mode = sys.argv[1]
    titles = sys.argv[2:]
    wt = get_wikitext(titles)
    if mode == "raw":
        for t in titles:
            print("=" * 20, t)
            print(wt.get(t))
    else:
        rows = []
        for t in titles:
            f = facts(wt.get(t))
            rows.append((t, f))
        for t, f in rows:
            print(json.dumps({"title": t, **f}, ensure_ascii=False))
