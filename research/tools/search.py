#!/usr/bin/env python3
"""Minimal web-search helper (Bing HTML scrape) used because the built-in
web_search tool is misconfigured in this session.

Usage: python3 search.py "query one" "query two" ...
"""
import html
import re
import subprocess
import sys


def fetch(url):
    return subprocess.run(
        ["curl", "-sS", "-m", "35", "-A",
         "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
         "(KHTML, like Gecko) Chrome/124.0 Safari/537.36", url],
        capture_output=True, text=True, errors="replace").stdout


def strip(t):
    t = re.sub(r"<[^>]+>", " ", t)
    return html.unescape(re.sub(r"\s+", " ", t)).strip()


def bing(q, n=8):
    raw = fetch("https://www.bing.com/search?q=" + __import__("urllib.parse", fromlist=["quote"]).quote(q))
    out = []
    for m in re.finditer(r'<li class="b_algo".*?</li>', raw, re.S):
        blk = m.group(0)
        hm = re.search(r'<h2[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>(.*?)</a>', blk, re.S)
        if not hm:
            continue
        sn = re.search(r'<p[^>]*>(.*?)</p>', blk, re.S)
        out.append((hm.group(1), strip(hm.group(2)), strip(sn.group(1)) if sn else ""))
        if len(out) >= n:
            break
    return out


if __name__ == "__main__":
    for q in sys.argv[1:]:
        print("#" * 10, q)
        res = bing(q)
        if not res:
            print("  (no parsed results)")
        for u, t, s in res:
            print(f"- {t}\n  {u}\n  {s[:320]}")
