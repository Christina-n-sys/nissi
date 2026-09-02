"""Tests for the evaluation harness."""

import pytest

from evaluate import (
    _has_path,
    ablation,
    artifact_diagnostic,
    confusion,
    match_mode_comparison,
    metrics,
    per_rule_stats,
    score_dataset,
    threshold_sweep,
)


# --- Confusion matrix and metrics -----------------------------------------

def test_confusion_counts_each_cell():
    scores = [90, 90, 10, 10]
    labels = [1, 0, 1, 0]
    counts = confusion(scores, labels, threshold=60)
    assert counts == {"tp": 1, "fp": 1, "tn": 1, "fn": 1}


def test_threshold_is_inclusive():
    assert confusion([60], [1], threshold=60)["tp"] == 1
    assert confusion([59], [1], threshold=60)["fn"] == 1


def test_perfect_classifier_metrics():
    result = metrics({"tp": 10, "fp": 0, "tn": 10, "fn": 0})
    assert result["accuracy"] == 1.0
    assert result["precision"] == 1.0
    assert result["recall"] == 1.0
    assert result["specificity"] == 1.0
    assert result["f1"] == 1.0


def test_metrics_handle_empty_denominators():
    result = metrics({"tp": 0, "fp": 0, "tn": 0, "fn": 0})
    assert all(value == 0.0 for value in result.values())


def test_precision_and_recall_differ_correctly():
    # 8 true positives, 2 false positives, 4 false negatives.
    result = metrics({"tp": 8, "fp": 2, "tn": 6, "fn": 4})
    assert result["precision"] == pytest.approx(0.8)
    assert result["recall"] == pytest.approx(8 / 12)
    assert result["f1"] == pytest.approx(2 * 0.8 * (8 / 12) / (0.8 + 8 / 12))


def test_positive_class_is_phishing():
    """A model that calls everything legitimate has zero recall, not zero precision."""
    result = metrics(confusion([0, 0], [1, 1], threshold=60))
    assert result["recall"] == 0.0


# --- Scoring and ablation --------------------------------------------------

def test_score_dataset_returns_one_result_per_row():
    rows = [{"url": "http://login.com"}, {"url": "https://google.com"}]
    assert len(score_dataset(rows)) == 2


def test_excluding_a_rule_lowers_the_score_by_its_weight():
    rows = [{"url": "http://a@b.io"}]
    full = score_dataset(rows)[0]
    without = score_dataset(rows, exclude_rules=["at_symbol"])[0]
    assert full["score"] - without["score"] == 20
    assert "at_symbol" not in dict(without["rules"])


def test_ablation_covers_the_three_variants():
    rows = [{"url": "http://secure-login-verify.com/account"}, {"url": "https://google.com"}]
    labels = [1, 0]
    variants = {row["variant"] for row in ablation(rows, labels, threshold=60)}
    assert variants == {"full", "keywords_only", "structural_only"}


def test_structural_only_variant_drops_all_keyword_rules():
    # Six keywords reach the threshold on their own (6 x 10 = 60); the
    # structural rules alone contribute only long_url (10) and cannot.
    rows = [{"url": "http://secure-login-verify-account-bank.com/otp"}]
    labels = [1]
    structural = next(r for r in ablation(rows, labels, 60) if r["variant"] == "structural_only")
    keywords = next(r for r in ablation(rows, labels, 60) if r["variant"] == "keywords_only")
    # The URL is keyword-rich, so keyword-only must catch it and structural-only must not.
    assert keywords["tp"] == 1
    assert structural["tp"] == 0


def test_ablation_never_exceeds_the_full_rule_set_score():
    rows = [{"url": "http://secure-login.verify-account.com/otp.php"}]
    full = score_dataset(rows)[0]["score"]
    for excluded in (["long_url"], ["at_symbol"], ["many_dots"]):
        assert score_dataset(rows, exclude_rules=excluded)[0]["score"] <= full


# --- Threshold sweep -------------------------------------------------------

def test_sweep_covers_zero_to_max():
    sweep = threshold_sweep([50], [1])
    assert sweep[0]["threshold"] == 0
    assert sweep[-1]["threshold"] == 100


def test_recall_is_monotonically_non_increasing_as_threshold_rises():
    scores = [0, 20, 40, 60, 80, 100]
    labels = [0, 1, 0, 1, 0, 1]
    recalls = [row["recall"] for row in threshold_sweep(scores, labels)]
    assert all(a >= b for a, b in zip(recalls, recalls[1:]))


def test_threshold_zero_predicts_everything_phishing():
    row = threshold_sweep([0, 100], [0, 1])[0]
    assert row["tn"] == 0
    assert row["recall"] == 1.0


# --- Per-rule statistics ---------------------------------------------------

def test_per_rule_counts_split_by_class():
    rows = [{"url": "http://login.com"}, {"url": "http://login.org"}, {"url": "https://a.io"}]
    labels = [1, 0, 0]
    stats = {r["rule"]: r for r in per_rule_stats(score_dataset(rows), labels)}
    assert stats["keyword:login"]["fires_phishing"] == 1
    assert stats["keyword:login"]["fires_legit"] == 1
    assert stats["keyword:login"]["precision_when_fired"] == pytest.approx(0.5)


def test_per_rule_rates_are_relative_to_class_size():
    rows = [{"url": "http://login.com"}, {"url": "https://a.io"}, {"url": "https://b.io"}]
    labels = [1, 0, 0]
    stats = {r["rule"]: r for r in per_rule_stats(score_dataset(rows), labels)}
    assert stats["keyword:login"]["phishing_rate"] == pytest.approx(1.0)
    assert stats["keyword:login"]["legit_rate"] == pytest.approx(0.0)


def test_rules_that_never_fire_are_absent():
    stats = per_rule_stats(score_dataset([{"url": "https://google.com"}]), [0])
    assert stats == []


# --- Match mode comparison -------------------------------------------------

def test_match_mode_comparison_reports_both_modes():
    rows = [{"url": "https://japan.com"}, {"url": "http://verify-login.com/account"}]
    labels = [0, 1]
    modes = {row["match_mode"] for row in match_mode_comparison(rows, labels, 60)}
    assert modes == {"substring", "token"}


def test_token_mode_removes_the_japan_false_positive():
    rows = [{"url": "https://japan.com"}]
    substring = score_dataset(rows, "substring")[0]
    token = score_dataset(rows, "token")[0]
    assert substring["score"] > token["score"]


# --- Artifact diagnostic ---------------------------------------------------

@pytest.mark.parametrize(
    "url, expected",
    [
        ("https://google.com", False),
        ("https://google.com/", False),
        ("https://google.com/search", True),
        ("http://a.com/b/c", True),
    ],
)
def test_has_path(url, expected):
    assert _has_path(url) is expected


def test_diagnostic_detects_the_bare_domain_artifact():
    """Bare-domain legitimate URLs vs pathful phishing URLs is the failure case."""
    rows = [
        {"url": "http://evil.com/login/verify"},
        {"url": "http://bad.com/account/update"},
        {"url": "https://google.com"},
        {"url": "https://youtube.com"},
    ]
    labels = [1, 1, 0, 0]
    diag = artifact_diagnostic(rows, labels)
    assert diag["phishing"]["pct_with_path"] == 100.0
    assert diag["legit"]["pct_with_path"] == 0.0
    assert diag["path_gap"] == 100.0


def test_diagnostic_is_quiet_on_a_balanced_dataset():
    rows = [
        {"url": "http://evil.com/login"},
        {"url": "https://google.com/search"},
    ]
    labels = [1, 0]
    assert artifact_diagnostic(rows, labels)["path_gap"] == 0.0


def test_diagnostic_handles_an_empty_class():
    diag = artifact_diagnostic([{"url": "http://a.com/x"}], [1])
    assert diag["legit"]["n"] == 0
    assert diag["phishing"]["n"] == 1
