#!/usr/bin/env python3
"""Generate the paper's figures in black and white.

Figure 1 (the detection pipeline) needs no data and is always produced. The
result figures are drawn from results/, so they appear only once the evaluation
harness has actually been run; nothing here invents values.

Everything is greyscale for print: series are distinguished by line style,
marker and hatch rather than by hue, so no figure depends on colour.

Usage::

    python paper/make_figures.py
"""

from __future__ import annotations

import csv
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
from matplotlib.patches import FancyArrowPatch, Rectangle  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
FIGDIR = os.path.join(HERE, "figures")
RESULTS = os.path.join(ROOT, "results")

BLACK, GREY, LIGHT, WHITE = "#000000", "#555555", "#bbbbbb", "#ffffff"

COL_W = 3.63   # IEEE single-column width, inches

plt.rcParams.update({
    "font.family": "serif",
    "font.serif": ["Times New Roman", "DejaVu Serif"],
    "font.size": 8,
    "axes.labelsize": 8,
    "legend.fontsize": 7,
    "xtick.labelsize": 7,
    "ytick.labelsize": 7,
    "figure.facecolor": WHITE,
    "axes.facecolor": WHITE,
    "savefig.facecolor": WHITE,
    "axes.edgecolor": BLACK,
    "axes.linewidth": 0.7,
    "grid.color": LIGHT,
    "grid.linewidth": 0.4,
    "xtick.color": BLACK,
    "ytick.color": BLACK,
    "text.color": BLACK,
    "axes.labelcolor": BLACK,
    "hatch.linewidth": 0.6,
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


def best_threshold_rows(rows):
    """Pick the threshold group that actually discriminates."""
    if rows and "threshold" in rows[0]:
        groups = {}
        for row in rows:
            groups.setdefault(row["threshold"], []).append(row)
        return max(groups.values(),
                   key=lambda g: max(float(r["f1"]) for r in g))
    return rows


# --- Figure 1: detection pipeline ------------------------------------------

def figure_pipeline() -> None:
    fig, ax = plt.subplots(figsize=(COL_W, 3.6))
    ax.set_xlim(0, 10)
    ax.set_ylim(0, 13.2)
    ax.axis("off")

    def box(y, h, text, dashed=False, bold=False):
        ax.add_patch(Rectangle(
            (0.4, y), 9.2, h, linewidth=0.9, edgecolor=BLACK,
            facecolor=WHITE, linestyle="--" if dashed else "-", zorder=2))
        ax.text(5.0, y + h / 2, text, ha="center", va="center",
                fontsize=7.2, color=BLACK, zorder=3,
                fontweight="bold" if bold else "normal", linespacing=1.35)

    def arrow(y0, y1):
        ax.add_patch(FancyArrowPatch(
            (5.0, y0), (5.0, y1), arrowstyle="-|>", mutation_scale=8,
            linewidth=0.8, color=BLACK, zorder=1))

    # (bottom y, height, text, dashed, bold), laid out top to bottom with a
    # 0.5-unit gap between boxes for the connecting arrow.
    stages = [
        (11.95, 1.0, "URL input", False, True),
        (10.45, 1.0, "Normalise: lowercase, trim", False, False),
        (8.05, 1.9, "Multilingual keyword matching\n33 terms: EN, HI, TA, TE\n+10 per matched term",
         True, False),
        (5.65, 1.9, "Structural features\nlength, '@', dot count\n+10 / +20 / +10",
         True, False),
        (3.75, 1.4, "Weighted sum\nS(u) = min(sum of w_i, 100)", False, True),
        (2.05, 1.2, "Risk band\nLow < 30 <= Medium < 60 <= High", False, False),
        (0.15, 1.4, "Output: score, band,\nand every rule that fired", False, True),
    ]
    for y, h, text, dashed, bold in stages:
        box(y, h, text, dashed, bold)

    tops = [s[0] for s in stages]
    heights = [s[1] for s in stages]
    for i in range(len(tops) - 1):
        arrow(tops[i], tops[i + 1] + heights[i + 1])

    save(fig, "fig1_pipeline")


# --- Figure 2: threshold sweep ---------------------------------------------

def figure_threshold_sweep() -> bool:
    rows = read_csv("threshold_sweep.csv")
    if not rows:
        return False

    x = [int(r["threshold"]) for r in rows]
    series = [
        ("Precision", [float(r["precision"]) for r in rows], "-", "o", BLACK),
        ("Recall", [float(r["recall"]) for r in rows], "--", "s", GREY),
        ("F1", [float(r["f1"]) for r in rows], "-.", "^", BLACK),
    ]

    fig, ax = plt.subplots(figsize=(COL_W, 2.2))
    for label, y, style, marker, colour in series:
        ax.plot(x, y, label=label, color=colour, linestyle=style,
                marker=marker, markersize=3.2, linewidth=1.2,
                markerfacecolor=WHITE, markeredgewidth=0.8, zorder=3)

    ax.axvline(60, color=GREY, linewidth=0.8, linestyle=":", zorder=2)
    ax.text(61.5, 0.52, "configured\nthreshold", fontsize=6.2, color=BLACK,
            ha="left", va="bottom", linespacing=1.2)

    f1 = [float(r["f1"]) for r in rows]
    best = max(range(len(f1)), key=lambda i: f1[i])
    ax.annotate(f"best F1 = {f1[best]:.2f}\nat threshold {x[best]}",
                xy=(x[best], f1[best]), xytext=(x[best] + 13, f1[best] + 0.18),
                fontsize=6.2, color=BLACK, linespacing=1.25,
                arrowprops=dict(arrowstyle="-", linewidth=0.6, color=BLACK))

    ax.set_xlabel("Score threshold")
    ax.set_ylabel("Score")
    ax.set_xticks(range(0, 101, 20))
    ax.set_ylim(-0.03, 1.22)
    tidy(ax)
    ax.legend(frameon=False, ncol=3, loc="lower center",
              bbox_to_anchor=(0.5, 1.01), columnspacing=1.4, handlelength=2.0,
              borderaxespad=0.0)
    save(fig, "fig2_threshold_sweep")
    return True


# --- Figure 3: rule-group ablation -----------------------------------------

def figure_ablation() -> bool:
    rows = read_csv("ablation.csv")
    if not rows:
        return False

    labels = {"full": "All rules", "keywords_only": "Vocabulary\nonly",
              "structural_only": "Structural\nonly"}
    order = ["full", "keywords_only", "structural_only"]
    rows = best_threshold_rows(rows)
    rows = sorted(rows, key=lambda r: order.index(r["variant"])
                  if r["variant"] in order else 99)

    metrics = [("precision", "Precision", WHITE, ""),
               ("recall", "Recall", WHITE, "////"),
               ("f1", "F1", LIGHT, "....")]

    fig, ax = plt.subplots(figsize=(COL_W, 2.2))
    width = 0.26
    positions = range(len(rows))

    for i, (key, label, fill, hatch) in enumerate(metrics):
        offset = (i - 1) * width
        values = [float(r[key]) for r in rows]
        bars = ax.bar([p + offset for p in positions], values, width * 0.9,
                      label=label, facecolor=fill, edgecolor=BLACK,
                      linewidth=0.8, hatch=hatch, zorder=3)
        for bar, value in zip(bars, values):
            ax.text(bar.get_x() + bar.get_width() / 2, value + 0.02,
                    f"{value:.2f}", ha="center", va="bottom",
                    fontsize=5.8, color=BLACK, zorder=4)

    ax.set_xticks(list(positions))
    ax.set_xticklabels([labels.get(r["variant"], r["variant"]) for r in rows])
    ax.set_ylabel("Score")
    ax.set_ylim(0, 1.08)
    tidy(ax)
    ax.legend(frameon=False, ncol=3, loc="lower center",
              bbox_to_anchor=(0.5, 1.01), columnspacing=1.4, handlelength=1.4,
              borderaxespad=0.0)
    save(fig, "fig3_ablation")
    return True


# --- Figure 4: per-rule firing rates ---------------------------------------

def figure_per_rule(top: int = 8) -> bool:
    rows = read_csv("per_rule.csv")
    if not rows:
        return False

    rows = sorted(rows, key=lambda r: -float(r["phishing_rate"]))[:top]
    rows.reverse()

    names = [r["rule"].replace("keyword:", "") for r in rows]
    phishing = [float(r["phishing_rate"]) for r in rows]
    legit = [float(r["legit_rate"]) for r in rows]

    fig, ax = plt.subplots(figsize=(COL_W, max(1.9, 0.24 * len(rows) + 0.6)))
    y = range(len(rows))
    height = 0.38

    ax.barh([i + height / 2 for i in y], phishing, height * 0.9,
            label="Phishing", facecolor=LIGHT, edgecolor=BLACK,
            linewidth=0.8, zorder=3)
    ax.barh([i - height / 2 for i in y], legit, height * 0.9,
            label="Legitimate", facecolor=WHITE, edgecolor=BLACK,
            linewidth=0.8, hatch="////", zorder=3)

    ax.set_yticks(list(y))
    ax.set_yticklabels(names, fontsize=6.8)
    ax.set_xlabel("Firing rate within class")
    ax.set_xlim(0, 1.02)
    tidy(ax, grid_axis="x")
    ax.legend(frameon=False, loc="lower right", handlelength=1.4,
              borderaxespad=0.3)
    save(fig, "fig4_per_rule")
    return True


def main() -> int:
    print("Figure 1: detection pipeline")
    figure_pipeline()

    print("\nResult figures (require results/):")
    produced = 0
    for name, fn in (("Figure 2: threshold sweep", figure_threshold_sweep),
                     ("Figure 3: rule-group ablation", figure_ablation),
                     ("Figure 4: per-rule firing rates", figure_per_rule)):
        print(name)
        if fn():
            produced += 1
        else:
            print("  skipped: no data in results/")

    print()
    if produced < 3:
        print("Some figures were skipped because the evaluation has not been run.")
        print("Run  python run_pipeline.py  then re-run this script.")
    else:
        print("All figures written to paper/figures/.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
