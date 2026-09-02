#!/usr/bin/env python3
"""Collect legitimate URLs *with real paths* by crawling top-ranked sites.

Why this exists
---------------
Tranco ships bare domains ("google.com"). Pairing those against phishing feeds,
which are full URLs with paths, lets the ``long_url`` and ``many_dots`` rules
separate the classes on dataset construction rather than on phishing behaviour.
This crawler fetches each domain's homepage and keeps a few internal links, so
label-0 rows look like ``https://amazon.in/gp/help/customer/display.html`` and
every rule is evaluated fairly.

Politeness
----------
robots.txt is fetched and honoured for every domain (override only with
``--ignore-robots``), requests carry an identifying User-Agent, one domain is
visited at a time by a given worker, and a delay is applied between requests.
Only each site's homepage is fetched; the collected links are recorded, never
visited.

Usage::

    python crawl_legit.py --tranco-file top-1m.csv.zip --limit-domains 200
    python build_dataset.py --phishing-file feed.txt --legit-file data/legit_urls.txt --balance

Output: one URL per line, written incrementally so an interrupted run keeps
whatever it has already collected.
"""

from __future__ import annotations

import argparse
import os
import random
import sys
import threading
import time
from html.parser import HTMLParser
from typing import Iterable, List, Sequence, Set
from urllib.parse import urldefrag, urljoin, urlparse, urlunparse
from urllib.robotparser import RobotFileParser

try:
    import requests
except ImportError:  # pragma: no cover - dependency guidance
    raise SystemExit(
        "crawl_legit.py needs the 'requests' package.\n"
        "Install it with:  pip install requests"
    )

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_dataset import read_legit_file, registered_domain  # noqa: E402

USER_AGENT = (
    "phishing-url-research/1.0 (academic dataset collection; "
    "homepage fetch only; respects robots.txt)"
)

# Query parameters that carry no information about the page itself.
TRACKING_PARAMS = frozenset({
    "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
    "fbclid", "gclid", "msclkid", "mc_cid", "mc_eid", "ref", "referrer",
})

# Paths that are not representative content pages.
BORING_PATH_PARTS = frozenset({
    "login", "signin", "sign-in", "register", "signup", "sign-up", "logout",
    "account", "cart", "checkout",
})

# Extensions that are assets rather than pages.
ASSET_EXTENSIONS = (
    ".jpg", ".jpeg", ".png", ".gif", ".svg", ".webp", ".ico", ".css", ".js",
    ".pdf", ".zip", ".gz", ".mp4", ".mp3", ".woff", ".woff2", ".ttf", ".xml",
)


class LinkExtractor(HTMLParser):
    """Collect the href of every anchor in a document."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.hrefs: List[str] = []

    def handle_starttag(self, tag: str, attrs) -> None:
        if tag != "a":
            return
        for name, value in attrs:
            if name == "href" and value:
                self.hrefs.append(value)


def extract_hrefs(html: str) -> List[str]:
    """Return every anchor href in ``html``, in document order."""
    parser = LinkExtractor()
    try:
        parser.feed(html)
    except Exception:
        # A malformed document still yields whatever was parsed before the error.
        pass
    return parser.hrefs


def clean_url(url: str) -> str:
    """Drop the fragment and any tracking parameters, and normalise the host."""
    url, _ = urldefrag(url)
    parts = urlparse(url)

    query = parts.query
    if query:
        kept = []
        for pair in query.split("&"):
            if not pair:
                continue
            key = pair.split("=", 1)[0]
            if key.lower() not in TRACKING_PARAMS:
                kept.append(pair)
        query = "&".join(kept)

    netloc = parts.netloc.lower()
    if netloc.endswith(":80") and parts.scheme == "http":
        netloc = netloc[:-3]
    elif netloc.endswith(":443") and parts.scheme == "https":
        netloc = netloc[:-4]

    return urlunparse((parts.scheme, netloc, parts.path, parts.params, query, ""))


def has_useful_path(url: str) -> bool:
    """True when the URL points somewhere below the host and looks like a page."""
    parts = urlparse(url)
    path = parts.path.strip()
    if not path or path == "/":
        return False
    if path.lower().endswith(ASSET_EXTENSIONS):
        return False
    segments = [s for s in path.lower().split("/") if s]
    if not segments:
        return False
    return not any(segment in BORING_PATH_PARTS for segment in segments)


def is_internal(url: str, domain: str) -> bool:
    """True when ``url`` is http(s) and sits on the same registrable domain."""
    parts = urlparse(url)
    if parts.scheme not in ("http", "https"):
        return False
    return registered_domain(url) == registered_domain(f"https://{domain}")


def select_links(html: str, base_url: str, domain: str, limit: int) -> List[str]:
    """Pick up to ``limit`` distinct internal content URLs from a homepage.

    Links are de-duplicated by their path so a page of links to the same
    section does not fill the quota, and are chosen across distinct first path
    segments where possible to spread the sample over the site.
    """
    seen_paths: Set[str] = set()
    by_section: dict = {}

    for href in extract_hrefs(html):
        href = href.strip()
        if not href or href.startswith(("#", "mailto:", "javascript:", "tel:")):
            continue
        absolute = clean_url(urljoin(base_url, href))
        if not is_internal(absolute, domain) or not has_useful_path(absolute):
            continue
        path = urlparse(absolute).path.rstrip("/").lower()
        if path in seen_paths:
            continue
        seen_paths.add(path)
        section = path.lstrip("/").split("/")[0]
        by_section.setdefault(section, []).append(absolute)

    # Round-robin across sections so the sample is not all from one area.
    picked: List[str] = []
    while len(picked) < limit and any(by_section.values()):
        for section in list(by_section):
            if not by_section[section]:
                del by_section[section]
                continue
            picked.append(by_section[section].pop(0))
            if len(picked) >= limit:
                break
    return picked


# --- Network -----------------------------------------------------------------

def build_session() -> "requests.Session":
    session = requests.Session()
    session.headers.update({
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "en",
    })
    return session


def robots_allows(session, domain: str, timeout: float) -> bool:
    """Check robots.txt for the homepage. A missing file means allowed."""
    parser = RobotFileParser()
    for scheme in ("https", "http"):
        try:
            response = session.get(
                f"{scheme}://{domain}/robots.txt", timeout=timeout, allow_redirects=True
            )
        except requests.RequestException:
            continue
        if response.status_code >= 400:
            return True  # no robots.txt published
        parser.parse(response.text.splitlines())
        return parser.can_fetch(USER_AGENT, f"{scheme}://{domain}/")
    return True


def crawl_domain(session, domain: str, links_per_domain: int, timeout: float,
                 respect_robots: bool, include_homepage: bool) -> tuple:
    """Fetch one homepage and return (urls, status) for reporting."""
    if respect_robots and not robots_allows(session, domain, timeout):
        return [], "robots-disallowed"

    url = f"https://{domain}"
    try:
        response = session.get(url, timeout=timeout, allow_redirects=True)
    except requests.RequestException as exc:
        return [], f"error:{type(exc).__name__}"

    if response.status_code >= 400:
        return [], f"http-{response.status_code}"
    if "html" not in response.headers.get("Content-Type", "").lower():
        return [], "not-html"

    final_url = response.url
    links = select_links(response.text, final_url, domain, links_per_domain)

    urls = []
    if include_homepage:
        urls.append(clean_url(final_url))
    urls.extend(links)

    if not links:
        return urls, "no-links"
    return urls, "ok"


def load_domains(path: str, limit: int) -> List[str]:
    """Read domains from a Tranco file, reusing the dataset builder's reader."""
    urls = read_legit_file(path, limit)
    domains = []
    for url in urls:
        host = urlparse(url).netloc or url
        if host:
            domains.append(host.lower())
    return domains


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--tranco-file", required=True,
                        help="Tranco top-1m file (.zip or .csv)")
    parser.add_argument("--limit-domains", type=int, default=200)
    parser.add_argument("--links-per-domain", type=int, default=3)
    parser.add_argument("--out", default="data/legit_urls.txt")
    parser.add_argument("--workers", type=int, default=8)
    parser.add_argument("--delay", type=float, default=1.0,
                        help="seconds to pause after each domain")
    parser.add_argument("--timeout", type=float, default=10.0)
    parser.add_argument("--include-homepage", action="store_true",
                        help="also record each site's homepage (adds bare-domain rows back)")
    parser.add_argument("--ignore-robots", action="store_true",
                        help="do not fetch or honour robots.txt")
    args = parser.parse_args(argv)

    domains = load_domains(args.tranco_file, args.limit_domains)
    if not domains:
        raise SystemExit(f"No domains read from {args.tranco_file}")

    print(f"Crawling {len(domains):,} domains, "
          f"up to {args.links_per_domain} links each", file=sys.stderr)
    print(f"robots.txt: {'ignored' if args.ignore_robots else 'honoured'}", file=sys.stderr)

    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
    lock = threading.Lock()
    statuses: dict = {}
    written = 0

    from concurrent.futures import ThreadPoolExecutor

    def work(domain: str):
        nonlocal written
        session = build_session()
        try:
            urls, status = crawl_domain(
                session, domain, args.links_per_domain, args.timeout,
                not args.ignore_robots, args.include_homepage,
            )
        finally:
            session.close()
        # Jittered delay so workers do not synchronise into bursts.
        time.sleep(args.delay * (0.5 + random.random()))

        with lock:
            statuses[status] = statuses.get(status, 0) + 1
            if urls:
                with open(args.out, "a", encoding="utf-8") as handle:
                    for url in urls:
                        handle.write(url + "\n")
                    handle.flush()
                written += len(urls)
            done = sum(statuses.values())
            # Report often: a long silence reads as a hang, not as progress.
            if done % 10 == 0 or done == len(domains):
                pct = 100 * done / len(domains)
                print(f"  {done}/{len(domains)} domains ({pct:.0f}%), "
                      f"{written} URLs collected", file=sys.stderr, flush=True)

    # Start each run from a clean file so counts match the report.
    open(args.out, "w", encoding="utf-8").close()

    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        list(pool.map(work, domains))

    print("\n" + "=" * 60)
    print("CRAWL SUMMARY")
    print("=" * 60)
    print(f"Domains attempted : {len(domains):,}")
    print(f"URLs collected    : {written:,}")
    print(f"Output            : {args.out}")
    print("\nPer-domain outcome")
    for status, count in sorted(statuses.items(), key=lambda kv: -kv[1]):
        print(f"  {status:<22}: {count:,}")
    if written == 0:
        print("\nNothing was collected. Check network access and the input file.")
        return 1
    print("\nNext:")
    print(f"  python build_dataset.py --phishing-file feed.txt "
          f"--legit-file {args.out} --balance")
    print("=" * 60)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
