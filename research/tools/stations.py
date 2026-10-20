#!/usr/bin/env python3
"""Harvest station facts for Indonesian/Wikipedia articles:
- official 3-letter KAI/MRT code (`kode` or `code` field)
- coordinates (article {{coord}} first, Wikidata P625 fallback)
- opening date, platform/track info, address

Usage: python3 stations.py <wiki: en|id> <titles-file-or-args...>
"""
import json
import os
import time
import re
import sys
import urllib.parse
import urllib.request

UA = "rail-jakarta-research/1.0 (transit data platform research)"
BASES = {"en": "https://en.wikipedia.org/w/api.php",
         "id": "https://id.wikipedia.org/w/api.php",
         "wd": "https://www.wikidata.org/w/api.php"}


def api(base, params):
    params = dict(params)
    params["format"] = "json"
    params["formatversion"] = "2"
    url = BASES[base] + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    last = None
    for attempt in range(6):
        try:
            with urllib.request.urlopen(req, timeout=90) as r:
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            last = e
            if e.code in (429, 503, 500):
                time.sleep(4 * (attempt + 1))
                continue
            raise
        except Exception as e:
            last = e
            time.sleep(3 * (attempt + 1))
    raise last


def wikitexts(base, titles):
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


def field(text, *keys):
    if not text:
        return None
    for key in keys:
        m = re.search(r"^\s*\|\s*" + re.escape(key) + r"\s*=\s*(.+?)(?=\n\s*\|\s*[\w \-]+\s*=|\n\}\})",
                      text, re.S | re.M)
        if m:
            v = " ".join(m.group(1).split())
            v = re.sub(r"^\{\{[^{}]*\}\}", "", v).strip()
            v = re.sub(r"<ref[^>]*>.*?</ref>|<ref[^>]*/>", "", v, flags=re.S).strip()
            if v and v not in ("-", "—"):
                return v
    return None


def coord_from_text(text):
    """Parse {{coord|...}} templates of any shape (with/without NS/EW tokens)."""
    if not text:
        return None
    for m in re.finditer(r"\{\{\s*coord\s*\|([^}]*)\}\}", text):
        parts = [p.strip() for p in m.group(1).split("|")]
        nums = [p for p in parts if re.fullmatch(r"-?\d+\.\d+", p)]
        hemi = [p.upper() for p in parts if p.upper() in ("N", "S", "E", "W")]
        if len(nums) >= 2:
            lat, lon = float(nums[0]), float(nums[1])
            if "S" in hemi:
                lat = -abs(lat)
            if "W" in hemi:
                lon = -abs(lon)
            if "N" in hemi:
                lat = abs(lat)
            if "E" in hemi:
                lon = abs(lon)
            return (round(lat, 6), round(lon, 6))
    m = re.search(r"coordinates\s*=\s*\{\{coord\s*\|([^|}]+)\|([^|}]+)", text)
    if m:
        try:
            return (round(float(m.group(1)), 6), round(float(m.group(2)), 6))
        except ValueError:
            return None
    return None


def harvest(base, titles, with_wd=True):
    wt = wikitexts(base, titles)
    # wikidata ids
    qids = {}
    if with_wd:
        for i in range(0, len(titles), 40):
            chunk = [t for t in titles[i:i + 40] if t in wt]
            if not chunk:
                continue
            data = api(base, {"action": "query", "prop": "pageprops", "ppprop": "wikibase_item",
                              "titles": "|".join(chunk)})
            for p in data.get("query", {}).get("pages", []):
                q = (p.get("pageprops") or {}).get("wikibase_item")
                if q:
                    qids[p["title"]] = q
    wdc = {}
    qlist = sorted(set(qids.values()))
    for i in range(0, len(qlist), 45):
        data = api("wd", {"action": "wbgetentities", "ids": "|".join(qlist[i:i + 45]),
                          "props": "claims"})
        for q, e in data.get("entities", {}).items():
            cl = e.get("claims", {}).get("P625", [])
            if cl:
                v = cl[0]["mainsnak"]["datavalue"]["value"]
                wdc[q] = (round(v["latitude"], 6), round(v["longitude"], 6))
    rows = []
    for t in titles:
        text = wt.get(t)
        c = coord_from_text(text)
        src = "article" if c else None
        if not c:
            q = qids.get(t)
            c = wdc.get(q)
            if c:
                src = "wikidata"
        rows.append({
            "title": t,
            "missing": text is None,
            "kode": field(text, "kode", "code"),
            "coords": c,
            "coord_source": src,
            "opened": field(text, "opened", "start", "opening"),
            "platforms": field(text, "platforms"),
            "tracks": field(text, "tracks"),
            "structure": field(text, "structure", "elevated", "layout"),
            "address": field(text, "address"),
            "line": field(text, "line", "lines"),
            "connections": field(text, "connections"),
            "elevation": field(text, "elevation"),
        })
    return rows


if __name__ == "__main__":
    base = sys.argv[1]
    args = sys.argv[2:]
    titles = []
    for a in args:
        if os.path.exists(a):
            with open(a, encoding="utf-8") as fh:
                titles += [ln.strip() for ln in fh if ln.strip()]
        else:
            titles.append(a)
    rows = harvest(base, titles)
    json.dump(rows, sys.stdout, ensure_ascii=False, indent=1)
