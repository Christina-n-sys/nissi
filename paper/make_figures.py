#!/usr/bin/env python3
"""Generate the paper's figures.

Figure 1 (system architecture) needs no data and is always produced. The
remaining figures are drawn from results/, so they appear only once the
evaluation harness has actually been run; nothing here invents values.

Output goes to paper/figures/ as both PDF (vector, for the manuscript) and PNG
(300 dpi, for previewing).

Usage::

    python paper/make_figures.py
"""

from __future__ import annotations

import csv
import os
import sys

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
from matplotlib.patches import FancyArrowPatch, FancyBboxPatch  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
FIGDIR = os.path.join(HERE, "figures")
RESULTS = os.path.join(ROOT, "results")

# Validated categorical slots (see the palette validator). Identity never rides
# on hue alone here: every series also carries a line style, marker or hatch so
# the figures survive greyscale printing.
BLUE, ORANGE, GREEN = "#2a78d6", "#eb6834", "#1baf7a"
INK, MUTED, GRID = "#0b0b0b", "#898781", "#e1e0d9"
SURFACE = "#fcfcfb"

COL_W = 3.63   # IEEE single-column width, inches

plt.rcParams.update({
    "font.family": "serif",
    "font.serif": ["Times New Roman", "DejaVu Serif"],
    "font.size": 8,
    "axes.labelsize": 8,
    "axes.titlesize": 8,
    "legend.fontsize": 7,
    "xtick.labelsize": 7,
    "ytick.labelsize": 7,
    "figure.facecolor": SURFACE,
    "axes.facecolor": SURFACE,
    "savefig.facecolor": SURFACE,
    "axes.edgecolor": "#c3c2b7",
    "axes.linewidth": 0.6,
    "grid.color": GRID,
    "grid.linewidth": 0.5,
    "xtick.color": MUTED,
    "ytick.color": MUTED,
    "text.color": INK,
    "axes.labelcolor": INK,
})


def save(fig, name: str) -> None:
    os.makedirs(FIGDIR, exist_ok=True)
    for ext in ("pdf", "png"):
        fig.savefig(os.path.join(FIGDIR, f"{name}.{ext}"),
                    dpi=300, bbox_inches="tight", pad_inches=0.02)
    plt.close(fig)
    print(f"  wrote figures/{name}.pdf and .png")


def read_csv(name: str):
    path = os.path.join(RESULTS, name)
    if not os.path.exists(path):
        return None
    with open(path, newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def tidy(ax, *, grid_axis="y"):
    ax.grid(True, axis=grid_axis, zorder=0)
    ax.set_axisbelow(True)
    for side in ("top", "right"):
        ax.spines[side].set_visible(False)


# --- Figure 1: system architecture -----------------------------------------

def figure_architecture() -> None:
    fig, ax = plt.subplots(figsize=(COL_W, 3.5))
    ax.set_xlim(0, 10)
    ax.set_ylim(0, 13.2)
    ax.axis("off")

    def box(y, h, text, fill, edge, bold=False):
        ax.add_patch(FancyBboxPatch(
            (0.6, y), 8.8, h,
            boxstyle="round,pad=0.08,rounding_size=0.18",
            linewidth=0.8, edgecolor=edge, facecolor=fill, zorder=2))
        ax.text(5.0, y + h / 2, text, ha="center", va="center",
                fontsize=7.5, color=INK, zorder=3,
                fontweight="bold" if bold else "normal", linespacing=1.35)

    def arrow(y0, y1):
        ax.add_patch(FancyArrowPatch(
            (5.0, y0), (5.0, y1), arrowstyle="-|>", mutation_scale=8,
            linewidth=0.8, color=MUTED, zorder=1))

    stages = [
        (11.6, 1.2, "URL Input", "#ffffff", "#c3c2b7", True),
        (9.9, 1.2, "Normalisation\n(lowercase, trim)", "#ffffff", "#c3c2b7", False),
        (7.7, 1.7, "Multilingual Keyword Matching\n33 terms · EN · HI · TA · TE\n+10 per term",
         "#eaf2fd", BLUE, False),
        (5.5, 1.7, "Structural Feature Extraction\nlength · '@' · dot count\n+10 / +20 / +10",
         "#fdeee7", ORANGE, False),
        (3.6, 1.3, "Weighted Sum\nS(u) = min(Σ wᵢ δᵢ, 100)", "#ffffff", "#c3c2b7", True),
        (1.9, 1.2, "Risk Banding\nLow < 30 ≤ Medium < 60 ≤ High", "#ffffff", "#c3c2b7", False),
        (0.1, 1.3, "Explainable Output\nscore · band · every fired rule",
         "#e8f7f1", GREEN, True),
    ]
    for y, h, text, fill, edge, bold in stages:
        box(y, h, text, fill, edge, bold)

    tops = [11.6, 9.9, 7.7, 5.5, 3.6, 1.9, 0.1]
    heights = [1.2, 1.2, 1.7, 1.7, 1.3, 1.2, 1.3]
    for i in range(len(tops) - 1):
        arrow(tops[i], tops[i + 1] + heights[i + 1])

    save(fig, "fig1_architecture")


# --- Figure 6: threshold sweep ---------------------------------------------

def figure_threshold_sweep() -> bool:
    rows = read_csv("threshold_sweep.csv")
    if not rows:
        return False

    x = [int(r["threshold"]) for r in rows]
    series = [
        ("Precision", [float(r["precision"]) for r in rows], BLUE, "-", "o"),
        ("Recall", [float(r["recall"]) for r in rows], ORANGE, "--", "s"),
        ("F1", [float(r["f1"]) for r in rows], GREEN, "-.", "^"),
    ]

    fig, ax = plt.subplots(figsize=(COL_W, 2.3))
    for label, y, colour, style, marker in series:
        ax.plot(x, y, label=label, color=colour, linestyle=style,
                marker=marker, markersize=3.2, linewidth=1.4, zorder=3)

    ax.axvline(60, color=MUTED, linewidth=0.8, linestyle=":", zorder=2)
    ax.text(61, 0.04, "operating\nthreshold", fontsize=6.2, color=MUTED,
            ha="left", va="bottom", linespacing=1.2)

    ax.set_xlabel("Score threshold")
    ax.set_ylabel("Score")
    ax.set_xticks(range(0, 101, 20))
    ax.set_ylim(-0.03, 1.05)
    tidy(ax)
    ax.legend(frameon=False, loc="lower left", ncol=3,
              columnspacing=1.0, handlelength=2.2, borderaxespad=0.2)
    save(fig, "fig6_threshold_sweep")
    return True


# --- Figure 7: rule-group ablation -----------------------------------------

def figure_ablation() -> bool:
    rows = read_csv("ablation.csv")
    if not rows:
        return False

    labels = {"full": "All rules", "keywords_only": "Vocabulary\nonly",
              "structural_only": "Structural\nonly"}
    order = ["full", "keywords_only", "structural_only"]
    rows = sorted(rows, key=lambda r: order.index(r["variant"])
                  if r["variant"] in order else 99)

    metrics = [("precision", "Precision", BLUE, ""),
               ("recall", "Recall", ORANGE, "///"),
               ("f1", "F1", GREEN, "...")]

    fig, ax = plt.subplots(figsize=(COL_W, 2.3))
    n = len(rows)
    width = 0.26
    positions = range(n)

    for i, (key, label, colour, hatch) in enumerate(metrics):
        offset = (i - 1) * width
        values = [float(r[key]) for r in rows]
        bars = ax.bar([p + offset for p in positions], values, width * 0.92,
                      label=label, color=colour, edgecolor=SURFACE,
                      linewidth=1.0, hatch=hatch, zorder=3)
        for bar, value in zip(bars, values):
            ax.text(bar.get_x() + bar.get_width() / 2, value + 0.02,
                    f"{value:.2f}", ha="center", va="bottom",
                    fontsize=5.8, color=INK, zorder=4)

    ax.set_xticks(list(positions))
    ax.set_xticklabels([labels.get(r["variant"], r["variant"]) for r in rows])
    ax.set_ylabel("Score")
    ax.set_ylim(0, 1.08)
    tidy(ax)
    # Above the axes, so it cannot collide with the value labels on tall bars.
    ax.legend(frameon=False, ncol=3, loc="lower center",
              bbox_to_anchor=(0.5, 1.01), columnspacing=1.4, handlelength=1.4,
              borderaxespad=0.0)
    save(fig, "fig7_ablation")
    return True


# --- Figure 8: per-rule firing rates ---------------------------------------

def figure_per_rule(top: int = 12) -> bool:
    rows = read_csv("per_rule.csv")
    if not rows:
        return False

    rows = sorted(rows, key=lambda r: -float(r["phishing_rate"]))[:top]
    rows.reverse()

    names = [r["rule"].replace("keyword:", "") for r in rows]
    phishing = [float(r["phishing_rate"]) for r in rows]
    legit = [float(r["legit_rate"]) for r in rows]

    fig, ax = plt.subplots(figsize=(COL_W, max(2.2, 0.22 * len(rows) + 0.7)))
    y = range(len(rows))
    height = 0.38

    ax.barh([i + height / 2 for i in y], phishing, height * 0.92,
            label="Phishing", color=BLUE, edgecolor=SURFACE, linewidth=1.0, zorder=3)
    ax.barh([i - height / 2 for i in y], legit, height * 0.92,
            label="Legitimate", color=ORANGE, edgecolor=SURFACE, linewidth=1.0,
            hatch="///", zorder=3)

    ax.set_yticks(list(y))
    ax.set_yticklabels(names, fontsize=6.5)
    ax.set_xlabel("Firing rate within class")
    ax.set_xlim(0, 1.05)
    tidy(ax, grid_axis="x")
    ax.legend(frameon=False, loc="lower right", handlelength=1.4,
              borderaxespad=0.2)
    save(fig, "fig8_per_rule")
    return True


def main() -> int:
    print("Figure 1: system architecture")
    figure_architecture()

    produced = []
    print("\nResult figures (require results/):")
    for name, fn in (("Figure 6: threshold sweep", figure_threshold_sweep),
                     ("Figure 7: rule-group ablation", figure_ablation),
                     ("Figure 8: per-rule firing rates", figure_per_rule)):
        print(f"{name}")
        if fn():
            produced.append(name)
        else:
            print("  skipped: no data in results/")

    print()
    if len(produced) < 3:
        print("Some figures were skipped because the evaluation has not been run.")
        print("Run  python run_pipeline.py  then re-run this script.")
    else:
        print("All figures written to paper/figures/.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
