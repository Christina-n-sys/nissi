#!/usr/bin/env python3
"""Run the whole pipeline in one command: check inputs, crawl, build, evaluate.

Each stage is verified before the next begins, so a bad download fails
immediately with the fix rather than surfacing later as an unrelated error.

Usage::

    python run_pipeline.py

Options let you skip the crawl (``--no-crawl``), redo it (``--recrawl``), or
point at differently-named inputs.
"""

from __future__ import annotations

import argparse
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

MIN_TRANCO_BYTES = 1_000_000   # the real top-1m file is ~10-12 MB
MIN_FEED_BYTES = 1_000


def fail(message: str) -> "NoReturn":  # type: ignore[valid-type]
    print(f"\nSTOPPED: {message}", file=sys.stderr)
    raise SystemExit(1)


def step(number: int, total: int, title: str) -> None:
    print(f"\n{'=' * 66}\nSTEP {number}/{total}: {title}\n{'=' * 66}", flush=True)


def run(args: list) -> None:
    """Run a pipeline stage in this interpreter, failing loudly on error."""
    print(f"$ python {' '.join(args)}\n", flush=True)
    result = subprocess.run([sys.executable] + args, cwd=HERE)
    if result.returncode != 0:
        fail(f"'{args[0]}' exited with code {result.returncode}. See the error above.")


def check_inputs(phishing_file: str, tranco_file: str) -> None:
    """Verify both downloads exist and are plausibly complete before doing work."""
    for path, minimum, hint in (
        (phishing_file, MIN_FEED_BYTES,
         "curl -L -o feed.txt https://openphish.com/feed.txt"),
        (tranco_file, MIN_TRANCO_BYTES,
         "curl -L -o top-1m.csv.zip https://tranco-list.eu/top-1m.csv.zip"),
    ):
        if not os.path.exists(path):
            fail(f"{path} not found. Download it first:\n  {hint}")
        size = os.path.getsize(path)
        if size < minimum:
            fail(
                f"{path} is only {size:,} bytes, which is too small to be the real "
                f"file.\nThe download probably did not follow its redirect. Re-run:\n"
                f"  {hint}"
            )
        print(f"  OK  {path}  ({size:,} bytes)")

    # Reuse the real readers so a malformed file is caught here, not mid-run.
    from build_dataset import read_legit_file, read_phishing_file

    phishing = read_phishing_file(phishing_file)
    print(f"  OK  {phishing_file} parsed: {len(phishing):,} phishing URLs")
    if len(phishing) < 50:
        print(f"  WARNING: only {len(phishing)} phishing URLs. The feed lists live "
              f"URLs only,\n  so a small count is normal but makes for a small dataset.")

    domains = read_legit_file(tranco_file, 10)
    print(f"  OK  {tranco_file} parsed: first domain is {domains[0]}")


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--phishing-file", default="feed.txt")
    parser.add_argument("--tranco-file", default="top-1m.csv.zip")
    parser.add_argument("--limit-domains", type=int, default=200)
    parser.add_argument("--links-per-domain", type=int, default=3)
    parser.add_argument("--no-crawl", action="store_true",
                        help="skip the crawl and use bare Tranco domains "
                             "(faster, but reintroduces the structural artifact)")
    parser.add_argument("--recrawl", action="store_true",
                        help="crawl again even if data/legit_urls.txt already exists")
    args = parser.parse_args(argv)

    crawled = os.path.join("data", "legit_urls.txt")
    total = 3 if args.no_crawl else 4

    step(1, total, "Checking input files")
    check_inputs(args.phishing_file, args.tranco_file)

    if args.no_crawl:
        legit_file = args.tranco_file
        dedup_scope = "both"
        print("\n  Skipping the crawl. Legitimate URLs will be bare domains, so the")
        print("  evaluation will report a structural artifact. Use the keywords_only")
        print("  ablation row as the headline result if you go this route.")
    else:
        step(2, total, "Crawling legitimate URLs with real paths")
        have_crawl = os.path.exists(crawled) and os.path.getsize(crawled) > 0
        if have_crawl and not args.recrawl:
            with open(crawled, encoding="utf-8") as handle:
                count = sum(1 for line in handle if line.strip())
            print(f"  {crawled} already exists with {count:,} URLs. Reusing it.")
            print("  Pass --recrawl to collect them again.")
        else:
            run(["crawl_legit.py",
                 "--tranco-file", args.tranco_file,
                 "--limit-domains", str(args.limit_domains),
                 "--links-per-domain", str(args.links_per_domain),
                 "--out", crawled])
            if not os.path.exists(crawled) or os.path.getsize(crawled) == 0:
                fail("The crawl collected nothing. Check your network connection, "
                     "or re-run with --no-crawl to proceed without it.")
        legit_file = crawled
        dedup_scope = "phishing"

    step(total - 1, total, "Building the dataset")
    run(["build_dataset.py",
         "--phishing-file", args.phishing_file,
         "--legit-file", legit_file,
         "--dedup-domain-scope", dedup_scope,
         "--balance"])

    step(total, total, "Evaluating")
    run(["evaluate.py"])

    # Figures are a convenience, not part of the measurement: a missing plotting
    # dependency must not invalidate a completed evaluation.
    print("\nGenerating figures...", flush=True)
    figures = subprocess.run([sys.executable, os.path.join("paper", "make_figures.py")],
                             cwd=HERE)
    if figures.returncode != 0:
        print("  Figures could not be generated (is matplotlib installed?).")
        print("  The evaluation above is unaffected; run:")
        print("    pip install matplotlib && python paper/make_figures.py")

    print("\n" + "=" * 66)
    print("PIPELINE COMPLETE")
    print("=" * 66)
    print("Produced:")
    print("  data/urls.csv           the labelled dataset")
    print("  results/headline.csv    accuracy, precision, recall, F1")
    print("  results/ablation.csv    keywords vs structural rules")
    print("  results/threshold_sweep.csv")
    print("  results/per_rule.csv    which keywords actually fire")
    print("  results/match_mode.csv  substring vs token matching")
    print("\nSend back the DATASET SUMMARY and EVALUATION output above.")
    print("=" * 66)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
