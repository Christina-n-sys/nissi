#!/usr/bin/env python3
"""Evaluate the rule-based detector against a labelled URL dataset.

Reads a CSV produced by ``build_dataset.py`` (columns: url, label, source,
registered_domain) and emits the tables an evaluation section needs:

  * headline metrics at the operating threshold
  * a threshold sweep, so the chosen cut-off can be justified rather than asserted
  * per-rule firing rates, showing which keywords actually discriminate
  * an ablation over rule groups (keywords vs structural features)
  * a substring-vs-token matching comparison
  * a dataset artifact diagnostic (see below)

The artifact diagnostic exists because a dataset that pairs bare domains
(e.g. Tranco's "google.com") against full phishing URLs with paths lets the
length and dot-count rules separate the classes for reasons unrelated to
phishing. The diagnostic measures that imbalance directly and warns when it is
large enough to invalidate the headline numbers.

Usage::

    python evaluate.py --data data/urls.csv --out results/
"""

from __future__ import annotations

import argparse
import csv
import os
import sys
from collections import defaultdict
from typing import Dict, List, Sequence

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "phishing_detector"))

from detector import (  # noqa: E402
    HIGH_RISK_THRESHOLD,
    MAX_SCORE,
    score_url,
)

STRUCTURAL_RULES = ("long_url", "at_symbol", "many_dots")


# --- Metrics ---------------------------------------------------------------

def confusion(scores: Sequence[int], labels: Sequence[int], threshold: int) -> Dict[str, int]:
    """Count TP/FP/TN/FN treating phishing (label 1) as the positive class."""
    counts = {"tp": 0, "fp": 0, "tn": 0, "fn": 0}
    for score, label in zip(scores, labels):
        predicted = 1 if score >= threshold else 0
        if label == 1 and predicted == 1:
            counts["tp"] += 1
        elif label == 0 and predicted == 1:
            counts["fp"] += 1
        elif label == 0 and predicted == 0:
            counts["tn"] += 1
        else:
            counts["fn"] += 1
    return counts


def metrics(counts: Dict[str, int]) -> Dict[str, float]:
    """Derive accuracy, precision, recall, specificity and F1 from a confusion matrix."""
    tp, fp, tn, fn = counts["tp"], counts["fp"], counts["tn"], counts["fn"]
    total = tp + fp + tn + fn

    def ratio(numerator: int, denominator: int) -> float:
        return numerator / denominator if denominator else 0.0

    precision = ratio(tp, tp + fp)
    recall = ratio(tp, tp + fn)
    return {
        "accuracy": ratio(tp + tn, total),
        "precision": precision,
        "recall": recall,
        "specificity": ratio(tn, tn + fp),
        "f1": ratio(2 * precision * recall, precision + recall) if (precision + recall) else 0.0,
    }


def score_dataset(rows: List[dict], match_mode: str = "substring",
                  exclude_rules: Sequence[str] = ()) -> List[dict]:
    """Score every row, optionally ignoring a set of rules.

    Rules are dropped after scoring and the total recomputed, so an ablation
    never re-runs the matching logic and cannot drift from the real scorer.
    """
    excluded = set(exclude_rules)
    results = []
    for row in rows:
        result = score_url(row["url"], match_mode=match_mode)
        if excluded:
            kept = [(name, weight) for name, weight in result["rules"]
                    if name not in excluded]
            raw = sum(weight for _, weight in kept)
            result = dict(result, rules=kept, raw_score=raw, score=min(raw, MAX_SCORE))
        results.append(result)
    return results


def keyword_rule_names(results: List[dict]) -> List[str]:
    names = set()
    for result in results:
        for name, _ in result["rules"]:
            if name.startswith("keyword:"):
                names.add(name)
    return sorted(names)


# --- Analyses --------------------------------------------------------------

def threshold_sweep(scores: Sequence[int], labels: Sequence[int]) -> List[dict]:
    rows = []
    for threshold in range(0, MAX_SCORE + 10, 10):
        counts = confusion(scores, labels, threshold)
        rows.append({"threshold": threshold, **counts, **metrics(counts)})
    return rows


def per_rule_stats(results: List[dict], labels: Sequence[int]) -> List[dict]:
    """How often each rule fires on each class, and its precision when it fires."""
    fired = defaultdict(lambda: {"phishing": 0, "legit": 0})
    for result, label in zip(results, labels):
        for name, _ in result["rules"]:
            fired[name]["phishing" if label == 1 else "legit"] += 1

    n_phishing = sum(1 for label in labels if label == 1) or 1
    n_legit = sum(1 for label in labels if label == 0) or 1

    rows = []
    for name, counts in fired.items():
        support = counts["phishing"] + counts["legit"]
        rows.append({
            "rule": name,
            "fires_phishing": counts["phishing"],
            "fires_legit": counts["legit"],
            "support": support,
            "phishing_rate": counts["phishing"] / n_phishing,
            "legit_rate": counts["legit"] / n_legit,
            "precision_when_fired": counts["phishing"] / support if support else 0.0,
        })
    rows.sort(key=lambda r: (-r["support"], r["rule"]))
    return rows


def ablation(rows: List[dict], labels: Sequence[int], threshold: int,
             match_mode: str = "substring") -> List[dict]:
    """Compare the full rule set against keyword-only and structural-only variants."""
    all_keywords = keyword_rule_names(score_dataset(rows, match_mode))
    variants = {
        "full": (),
        "keywords_only": STRUCTURAL_RULES,
        "structural_only": tuple(all_keywords),
    }

    out = []
    for name, excluded in variants.items():
        results = score_dataset(rows, match_mode, excluded)
        scores = [r["score"] for r in results]
        counts = confusion(scores, labels, threshold)
        out.append({"variant": name, **counts, **metrics(counts)})
    return out


def match_mode_comparison(rows: List[dict], labels: Sequence[int],
                          threshold: int) -> List[dict]:
    out = []
    for mode in ("substring", "token"):
        results = score_dataset(rows, mode)
        scores = [r["score"] for r in results]
        counts = confusion(scores, labels, threshold)
        out.append({"match_mode": mode, **counts, **metrics(counts)})
    return out


def artifact_diagnostic(rows: List[dict], labels: Sequence[int]) -> dict:
    """Measure structural differences between the classes that are not about phishing.

    If legitimate URLs are bare domains and phishing URLs carry paths, the
    length and dot rules separate the classes trivially. This quantifies that.
    """
    def summarise(label_value: int) -> dict:
        urls = [r["url"] for r, label in zip(rows, labels) if label == label_value]
        if not urls:
            return {"n": 0, "mean_length": 0.0, "pct_with_path": 0.0, "mean_dots": 0.0}
        with_path = sum(1 for u in urls if _has_path(u))
        return {
            "n": len(urls),
            "mean_length": sum(len(u) for u in urls) / len(urls),
            "pct_with_path": 100.0 * with_path / len(urls),
            "mean_dots": sum(u.count(".") for u in urls) / len(urls),
        }

    phishing = summarise(1)
    legit = summarise(0)
    return {
        "phishing": phishing,
        "legit": legit,
        "path_gap": abs(phishing["pct_with_path"] - legit["pct_with_path"]),
        "length_gap": abs(phishing["mean_length"] - legit["mean_length"]),
    }


def _has_path(url: str) -> bool:
    """True when the URL has a path component beyond the host."""
    without_scheme = url.split("://", 1)[-1]
    path = without_scheme.partition("/")[2]
    return bool(path.strip())


# --- I/O -------------------------------------------------------------------

def load_dataset(path: str) -> List[dict]:
    if not os.path.exists(path):
        raise SystemExit(
            f"{path} does not exist.\n"
            "Build the dataset first, for example:\n"
            "  python build_dataset.py --phishing-file feed.txt "
            "--legit-file top-1m.csv.zip --balance"
        )
    with open(path, newline="", encoding="utf-8") as handle:
        rows = list(csv.DictReader(handle))
    if not rows:
        raise SystemExit(f"{path} contains no rows")
    missing = {"url", "label"} - set(rows[0])
    if missing:
        raise SystemExit(f"{path} is missing required column(s): {', '.join(sorted(missing))}")
    for row in rows:
        row["label"] = int(row["label"])
    return rows


def write_csv(rows: List[dict], path: str) -> None:
    if not rows:
        return
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)


def _fmt(row: dict, keys: Sequence[str]) -> str:
    parts = []
    for key in keys:
        value = row[key]
        parts.append(f"{value:>10.3f}" if isinstance(value, float) else f"{str(value):>10}")
    return "".join(parts)


def _table(title: str, rows: List[dict], keys: Sequence[str]) -> None:
    print(f"\n{title}")
    print("".join(f"{k:>10}" for k in keys))
    print("-" * (10 * len(keys)))
    for row in rows:
        print(_fmt(row, keys))


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--data", default="data/urls.csv")
    parser.add_argument("--out", default="results")
    parser.add_argument("--threshold", type=int, default=HIGH_RISK_THRESHOLD)
    parser.add_argument("--match-mode", default="substring", choices=["substring", "token"])
    args = parser.parse_args(argv)

    rows = load_dataset(args.data)
    labels = [row["label"] for row in rows]
    results = score_dataset(rows, args.match_mode)
    scores = [r["score"] for r in results]

    n_phishing = sum(labels)
    n_legit = len(labels) - n_phishing

    print("=" * 70)
    print("EVALUATION")
    print("=" * 70)
    print(f"Dataset      : {args.data}")
    print(f"Rows         : {len(rows):,}  (phishing {n_phishing:,} / legitimate {n_legit:,})")
    print(f"Match mode   : {args.match_mode}")
    print(f"Threshold    : score >= {args.threshold} classified as phishing")

    counts = confusion(scores, labels, args.threshold)
    head = metrics(counts)
    print(f"\nConfusion matrix at threshold {args.threshold}")
    print(f"  TP {counts['tp']:>6}   FP {counts['fp']:>6}")
    print(f"  FN {counts['fn']:>6}   TN {counts['tn']:>6}")
    print("\nHeadline metrics")
    for name in ("accuracy", "precision", "recall", "specificity", "f1"):
        print(f"  {name:<12}: {head[name]:.4f}")

    sweep = threshold_sweep(scores, labels)
    _table("Threshold sweep", sweep,
           ["threshold", "tp", "fp", "tn", "fn", "precision", "recall", "f1"])

    # The operating threshold can be so badly calibrated that every variant
    # scores zero, which makes the ablation uninformative. Report it at the
    # best-F1 threshold as well, where the comparison actually discriminates.
    best = max(sweep, key=lambda r: (r["f1"], -r["threshold"]))
    best_threshold = int(best["threshold"])
    print(f"\nBest F1 on the sweep: {best['f1']:.4f} at threshold {best_threshold}"
          f"  (operating threshold is {args.threshold})")
    if best_threshold != args.threshold:
        print("  The operating threshold is not the best available; both are "
              "reported below.")

    thresholds = [args.threshold]
    if best_threshold != args.threshold:
        thresholds.append(best_threshold)

    abl_rows, mode_rows = [], []
    for threshold in thresholds:
        for row in ablation(rows, labels, threshold, args.match_mode):
            abl_rows.append({"threshold": threshold, **row})
        for row in match_mode_comparison(rows, labels, threshold):
            mode_rows.append({"threshold": threshold, **row})

    _table("Ablation by rule group", abl_rows,
           ["threshold", "variant", "tp", "fp", "tn", "fn", "accuracy",
            "precision", "recall", "f1"])

    _table("Substring vs token matching", mode_rows,
           ["threshold", "match_mode", "tp", "fp", "tn", "fn", "accuracy",
            "precision", "recall", "f1"])
    abl, modes = abl_rows, mode_rows

    rules = per_rule_stats(results, labels)
    _table("Per-rule statistics (top 25 by support)", rules[:25],
           ["rule", "fires_phishing", "fires_legit", "phishing_rate", "legit_rate",
            "precision_when_fired"])

    diag = artifact_diagnostic(rows, labels)
    print("\nDataset artifact diagnostic")
    print(f"{'':<22}{'phishing':>12}{'legitimate':>12}")
    for key, label in (("mean_length", "mean URL length"),
                       ("pct_with_path", "% with a path"),
                       ("mean_dots", "mean dot count")):
        print(f"  {label:<20}{diag['phishing'][key]:>12.1f}{diag['legit'][key]:>12.1f}")

    if diag["path_gap"] > 50:
        print(f"\n  WARNING: the two classes differ by {diag['path_gap']:.0f} percentage points")
        print("  in how often they carry a URL path. The long_url and many_dots rules")
        print("  are separating the classes on dataset construction, not on phishing")
        print("  behaviour. Compare the 'keywords_only' ablation row against 'full':")
        print("  if 'full' is much better, the gain is an artifact and must not be")
        print("  reported as detection performance.")

    write_csv(sweep, os.path.join(args.out, "threshold_sweep.csv"))
    write_csv(rules, os.path.join(args.out, "per_rule.csv"))
    write_csv(abl, os.path.join(args.out, "ablation.csv"))
    write_csv(modes, os.path.join(args.out, "match_mode.csv"))
    write_csv([{"threshold": args.threshold, **counts, **head}],
              os.path.join(args.out, "headline.csv"))
    print(f"\nWrote CSVs to {args.out}/")
    print("=" * 70)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
