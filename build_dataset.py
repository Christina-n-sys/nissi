#!/usr/bin/env python3
"""Build a labelled phishing/legitimate URL dataset.

Sources
-------
Phishing (label 1)
    OpenPhish community feed  https://openphish.com/feed.txt   (plain text, one URL per line)
    PhishTank                 http://data.phishtank.com/data/<APP_KEY>/online-valid.csv.gz

Legitimate (label 0)
    Tranco top sites          https://tranco-list.eu/top-1m.csv.zip  (rank,domain)

Both feeds change daily, so the fetch date is recorded in the run report and
raw downloads are cached to keep a build reproducible.

Usage
-----
Fetch live::

    python build_dataset.py --fetch --limit-legit 5000

Use files downloaded elsewhere (e.g. when egress is restricted)::

    python build_dataset.py --phishing-file feed.txt --legit-file top-1m.csv

Output
------
``data/urls.csv`` with columns: url, label, source, registered_domain
"""

from __future__ import annotations

import argparse
import csv
import gzip
import io
import os
import sys
import urllib.request
import zipfile
from collections import Counter
from datetime import datetime, timezone
from typing import Dict, Iterable, List, Tuple

import tldextract

OPENPHISH_URL = "https://openphish.com/feed.txt"
PHISHTANK_URL = "http://data.phishtank.com/data/{key}/online-valid.csv.gz"
TRANCO_URL = "https://tranco-list.eu/top-1m.csv.zip"

# tldextract is pinned to its bundled public-suffix snapshot so that a build is
# reproducible and does not silently depend on network access.
_EXTRACT = tldextract.TLDExtract(suffix_list_urls=())


# --- Fetching --------------------------------------------------------------

def _download(url: str, cache_dir: str | None, cache_name: str) -> bytes:
    """Download ``url``, reusing a cached copy when one exists."""
    cache_path = os.path.join(cache_dir, cache_name) if cache_dir else None
    if cache_path and os.path.exists(cache_path):
        print(f"  using cached {cache_path}", file=sys.stderr)
        with open(cache_path, "rb") as handle:
            return handle.read()

    print(f"  fetching {url}", file=sys.stderr)
    request = urllib.request.Request(url, headers={"User-Agent": "phishing-url-research/1.0"})
    with urllib.request.urlopen(request, timeout=120) as response:
        payload = response.read()

    if cache_path:
        os.makedirs(cache_dir, exist_ok=True)
        with open(cache_path, "wb") as handle:
            handle.write(payload)
    return payload


def fetch_openphish(cache_dir: str | None) -> List[str]:
    payload = _download(OPENPHISH_URL, cache_dir, "openphish_feed.txt")
    return _read_url_lines(payload.decode("utf-8", errors="replace"))


def fetch_phishtank(app_key: str, cache_dir: str | None) -> List[str]:
    payload = _download(PHISHTANK_URL.format(key=app_key), cache_dir, "phishtank.csv.gz")
    text = gzip.decompress(payload).decode("utf-8", errors="replace")
    return [row["url"] for row in csv.DictReader(io.StringIO(text)) if row.get("url")]


def fetch_tranco(cache_dir: str | None, limit: int) -> List[str]:
    payload = _download(TRANCO_URL, cache_dir, "tranco_top1m.csv.zip")
    with zipfile.ZipFile(io.BytesIO(payload)) as archive:
        name = archive.namelist()[0]
        text = archive.read(name).decode("utf-8", errors="replace")
    return _read_tranco_rows(text, limit)


# --- Local file readers ----------------------------------------------------

def _read_url_lines(text: str) -> List[str]:
    """Read a plain-text feed: one URL per line, ignoring blanks and comments."""
    urls = []
    for line in text.splitlines():
        line = line.strip()
        if line and not line.startswith("#"):
            urls.append(line)
    return urls


def _read_tranco_rows(text: str, limit: int) -> List[str]:
    """Read Tranco's ``rank,domain`` CSV and synthesise an https:// URL per domain."""
    urls = []
    for row in csv.reader(io.StringIO(text)):
        if len(row) < 2:
            continue
        domain = row[1].strip()
        if domain:
            urls.append(f"https://{domain}")
        if limit and len(urls) >= limit:
            break
    return urls


ZIP_MAGIC = b"PK\x03\x04"
GZIP_MAGIC = b"\x1f\x8b"


class BadFeedError(SystemExit):
    """A downloaded feed is not the file it claims to be."""


def _looks_like_html(payload: bytes) -> bool:
    head = payload[:512].lstrip().lower()
    return head.startswith(b"<!doctype html") or head.startswith(b"<html") or b"<title" in head


def _check_download(path: str, payload: bytes) -> None:
    """Fail loudly when a feed is empty, truncated, or an HTML redirect page.

    Downloading a redirecting URL without following it (``curl`` without
    ``-L``) saves the redirect page under the expected filename, which
    otherwise surfaces much later as an unrelated parse error.
    """
    if not payload.strip():
        raise BadFeedError(f"{path} is empty — the download did not produce any data.")
    if _looks_like_html(payload):
        raise BadFeedError(
            f"{path} contains an HTML page, not feed data ({len(payload):,} bytes).\n"
            "The download most likely followed a redirect that was not saved.\n"
            "Re-download with curl's -L flag, e.g.:\n"
            "  curl -L -o top-1m.csv.zip https://tranco-list.eu/top-1m.csv.zip"
        )


def _decompress(path: str, payload: bytes) -> bytes:
    """Transparently unwrap a zip or gzip payload, detected by magic bytes."""
    if payload.startswith(ZIP_MAGIC):
        with zipfile.ZipFile(io.BytesIO(payload)) as archive:
            names = [n for n in archive.namelist() if not n.endswith("/")]
            if not names:
                raise BadFeedError(f"{path} is an empty zip archive.")
            return archive.read(names[0])
    if payload.startswith(GZIP_MAGIC):
        return gzip.decompress(payload)
    if path.endswith((".zip", ".gz")):
        raise BadFeedError(
            f"{path} is named like a compressed archive but is not one "
            f"({len(payload):,} bytes).\n"
            "The download is probably incomplete or was saved without following a\n"
            "redirect. Re-download with curl's -L flag, e.g.:\n"
            "  curl -L -o top-1m.csv.zip https://tranco-list.eu/top-1m.csv.zip"
        )
    return payload


def read_phishing_file(path: str) -> List[str]:
    """Read a local phishing feed: plain text, .gz, .zip, or CSV with a ``url`` column."""
    with open(path, "rb") as handle:
        payload = handle.read()
    _check_download(path, payload)
    text = _decompress(path, payload).decode("utf-8", errors="replace")

    lines = text.splitlines()
    first_line = lines[0] if lines else ""
    if "," in first_line and "url" in first_line.lower():
        urls = [row["url"] for row in csv.DictReader(io.StringIO(text)) if row.get("url")]
    else:
        urls = _read_url_lines(text)

    if not any(u.lower().startswith(("http://", "https://")) for u in urls):
        raise BadFeedError(
            f"{path} contains no http(s) URLs, so it is not a phishing feed.\n"
            f"First line was: {first_line[:120]!r}"
        )
    return urls


def read_legit_file(path: str, limit: int) -> List[str]:
    """Read a local Tranco-style ``rank,domain`` CSV (or a plain URL list)."""
    with open(path, "rb") as handle:
        payload = handle.read()
    _check_download(path, payload)
    text = _decompress(path, payload).decode("utf-8", errors="replace")

    lines = text.splitlines()
    first_line = lines[0] if lines else ""
    if "," in first_line:
        urls = _read_tranco_rows(text, limit)
    else:
        urls = _read_url_lines(text)
        urls = urls[:limit] if limit else urls

    if not urls:
        raise BadFeedError(
            f"{path} produced no domains.\n"
            f"Expected Tranco's 'rank,domain' rows; first line was: {first_line[:120]!r}"
        )
    return urls


# --- Normalisation and deduplication --------------------------------------

def registered_domain(url: str) -> str:
    """Return the registrable domain (eTLD+1), or "" when there isn't one."""
    parsed = _EXTRACT(url)
    # tldextract renamed this property; support both spellings.
    domain = getattr(parsed, "top_domain_under_public_suffix", None)
    if domain is None:
        domain = parsed.registered_domain
    return domain.lower()


def normalise(url: str) -> str:
    """Key used for exact-duplicate detection: lowercased, no trailing slash."""
    return url.strip().rstrip("/").lower()


def build(
    phishing_urls: Iterable[str],
    legit_urls: Iterable[str],
    phishing_source: str,
    legit_source: str,
    dedup_domain: bool = True,
    drop_cross_class: bool = True,
) -> Tuple[List[dict], dict]:
    """Combine, deduplicate and label the two URL lists.

    Returns the surviving rows and a stats dict describing what was dropped.
    """
    stats: Dict[str, object] = {
        "raw_phishing": 0,
        "raw_legit": 0,
        "dropped_no_domain": 0,
        "dropped_exact_duplicate": 0,
        "dropped_domain_duplicate": 0,
        "cross_class_exact_urls": [],
        "cross_class_domains": [],
        "dropped_cross_class_rows": 0,
    }

    candidates: List[dict] = []
    for urls, label, source, counter in (
        (phishing_urls, 1, phishing_source, "raw_phishing"),
        (legit_urls, 0, legit_source, "raw_legit"),
    ):
        for url in urls:
            url = url.strip()
            if not url:
                continue
            stats[counter] += 1
            domain = registered_domain(url)
            if not domain:
                stats["dropped_no_domain"] += 1
                continue
            candidates.append({
                "url": url,
                "label": label,
                "source": source,
                "registered_domain": domain,
                "_key": normalise(url),
            })

    # Cross-class conflicts, detected before any deduplication so the report
    # reflects the real overlap between the two feeds.
    urls_by_label: Dict[int, set] = {0: set(), 1: set()}
    domains_by_label: Dict[int, set] = {0: set(), 1: set()}
    for row in candidates:
        urls_by_label[row["label"]].add(row["_key"])
        domains_by_label[row["label"]].add(row["registered_domain"])

    conflicting_urls = urls_by_label[0] & urls_by_label[1]
    conflicting_domains = domains_by_label[0] & domains_by_label[1]
    stats["cross_class_exact_urls"] = sorted(conflicting_urls)
    stats["cross_class_domains"] = sorted(conflicting_domains)

    rows: List[dict] = []
    seen_urls: set = set()
    seen_domains: set = set()

    for row in candidates:
        if drop_cross_class and row["registered_domain"] in conflicting_domains:
            stats["dropped_cross_class_rows"] += 1
            continue
        if row["_key"] in seen_urls:
            stats["dropped_exact_duplicate"] += 1
            continue
        seen_urls.add(row["_key"])
        if dedup_domain:
            if row["registered_domain"] in seen_domains:
                stats["dropped_domain_duplicate"] += 1
                continue
            seen_domains.add(row["registered_domain"])
        rows.append({k: v for k, v in row.items() if not k.startswith("_")})

    stats["final_total"] = len(rows)
    stats["final_phishing"] = sum(1 for r in rows if r["label"] == 1)
    stats["final_legit"] = sum(1 for r in rows if r["label"] == 0)
    return rows, stats


def balance(rows: List[dict]) -> List[dict]:
    """Truncate the majority class so both classes have equal counts."""
    phishing = [r for r in rows if r["label"] == 1]
    legit = [r for r in rows if r["label"] == 0]
    keep = min(len(phishing), len(legit))
    return phishing[:keep] + legit[:keep]


def write_csv(rows: List[dict], path: str) -> None:
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(
            handle, fieldnames=["url", "label", "source", "registered_domain"]
        )
        writer.writeheader()
        writer.writerows(rows)


def print_report(rows: List[dict], stats: dict, path: str) -> None:
    total = stats["final_total"] or 1
    print("\n" + "=" * 68)
    print("DATASET SUMMARY")
    print("=" * 68)
    print(f"Built at              : {datetime.now(timezone.utc).isoformat(timespec='seconds')}")
    print(f"Output                : {path}")
    print()
    print("Input")
    print(f"  phishing URLs read  : {stats['raw_phishing']:,}")
    print(f"  legitimate URLs read: {stats['raw_legit']:,}")
    print()
    print("Dropped")
    print(f"  unparseable domain  : {stats['dropped_no_domain']:,}")
    print(f"  exact duplicates    : {stats['dropped_exact_duplicate']:,}")
    print(f"  domain duplicates   : {stats['dropped_domain_duplicate']:,}")
    print(f"  cross-class rows    : {stats['dropped_cross_class_rows']:,}")
    print()
    print("Final")
    print(f"  total rows          : {stats['final_total']:,}")
    print(f"  phishing (label 1)  : {stats['final_phishing']:,} "
          f"({100 * stats['final_phishing'] / total:.1f}%)")
    print(f"  legitimate (label 0): {stats['final_legit']:,} "
          f"({100 * stats['final_legit'] / total:.1f}%)")
    print(f"  unique domains      : {len({r['registered_domain'] for r in rows}):,}")
    for source, count in sorted(Counter(r["source"] for r in rows).items()):
        print(f"  source {source:<13}: {count:,}")

    print()
    print("Cross-class conflicts (appear in BOTH classes)")
    exact = stats["cross_class_exact_urls"]
    domains = stats["cross_class_domains"]
    print(f"  identical URLs      : {len(exact):,}")
    for url in exact[:10]:
        print(f"      {url}")
    if len(exact) > 10:
        print(f"      ... and {len(exact) - 10:,} more")
    print(f"  shared domains      : {len(domains):,}")
    for domain in domains[:10]:
        print(f"      {domain}")
    if len(domains) > 10:
        print(f"      ... and {len(domains) - 10:,} more")
    print("=" * 68)


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--fetch", action="store_true",
                        help="download the feeds over the network")
    parser.add_argument("--phishing-file", help="local phishing feed (.txt, .csv, .gz)")
    parser.add_argument("--legit-file", help="local Tranco-style CSV (.csv, .zip)")
    parser.add_argument("--phishtank-key", default=os.environ.get("PHISHTANK_APP_KEY"),
                        help="PhishTank application key (else OpenPhish only)")
    parser.add_argument("--limit-legit", type=int, default=5000,
                        help="how many Tranco domains to take (0 = all)")
    parser.add_argument("--out", default="data/urls.csv")
    parser.add_argument("--cache-dir", default="data/raw")
    parser.add_argument("--no-dedup-domain", action="store_true",
                        help="keep every URL, even several per registered domain")
    parser.add_argument("--keep-cross-class", action="store_true",
                        help="report but do not drop domains appearing in both classes")
    parser.add_argument("--balance", action="store_true",
                        help="truncate the majority class to equal size")
    args = parser.parse_args(argv)

    if not args.fetch and not (args.phishing_file and args.legit_file):
        parser.error("use --fetch, or supply both --phishing-file and --legit-file")

    phishing_source = "openphish"
    if args.phishing_file:
        print(f"Reading phishing URLs from {args.phishing_file}", file=sys.stderr)
        phishing = read_phishing_file(args.phishing_file)
        phishing_source = "local-phishing"
    elif args.phishtank_key:
        print("Fetching PhishTank...", file=sys.stderr)
        phishing = fetch_phishtank(args.phishtank_key, args.cache_dir)
        phishing_source = "phishtank"
    else:
        print("Fetching OpenPhish...", file=sys.stderr)
        phishing = fetch_openphish(args.cache_dir)

    if args.legit_file:
        print(f"Reading legitimate URLs from {args.legit_file}", file=sys.stderr)
        legit = read_legit_file(args.legit_file, args.limit_legit)
        legit_source = "local-legit"
    else:
        print("Fetching Tranco...", file=sys.stderr)
        legit = fetch_tranco(args.cache_dir, args.limit_legit)
        legit_source = "tranco"

    rows, stats = build(
        phishing, legit, phishing_source, legit_source,
        dedup_domain=not args.no_dedup_domain,
        drop_cross_class=not args.keep_cross_class,
    )

    if args.balance:
        rows = balance(rows)
        stats["final_total"] = len(rows)
        stats["final_phishing"] = sum(1 for r in rows if r["label"] == 1)
        stats["final_legit"] = sum(1 for r in rows if r["label"] == 0)

    write_csv(rows, args.out)
    print_report(rows, stats, args.out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
