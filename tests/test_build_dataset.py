"""Tests for the dataset builder's deduplication and conflict reporting."""

import pytest

from build_dataset import balance, build, normalise, registered_domain


def build_rows(phishing, legit, **kwargs):
    return build(phishing, legit, "phish-src", "legit-src", **kwargs)


# --- Domain extraction -----------------------------------------------------

@pytest.mark.parametrize(
    "url, expected",
    [
        ("https://google.com", "google.com"),
        ("http://drive.google.com/a/b", "google.com"),
        ("https://kyc.sbi-suraksha.co.in/otp", "sbi-suraksha.co.in"),
        ("https://WWW.Example.COM/Path", "example.com"),
        ("not a url at all", ""),
    ],
)
def test_registered_domain(url, expected):
    assert registered_domain(url) == expected


def test_multi_part_suffix_is_handled():
    """co.in is a public suffix, so the registrable domain is one label above it."""
    assert registered_domain("https://a.b.hdfc.co.in/x") == "hdfc.co.in"


# --- Normalisation ---------------------------------------------------------

@pytest.mark.parametrize(
    "a, b",
    [
        ("http://a.com/x", "http://a.com/x/"),
        ("http://A.com/X", "http://a.com/x"),
        ("  http://a.com/x  ", "http://a.com/x"),
    ],
)
def test_urls_that_should_normalise_together(a, b):
    assert normalise(a) == normalise(b)


# --- Deduplication ---------------------------------------------------------

def test_exact_duplicates_are_dropped_once():
    rows, stats = build_rows(["http://a.com/x", "http://a.com/x/"], [])
    assert stats["dropped_exact_duplicate"] == 1
    assert len(rows) == 1


def test_domain_duplicates_are_dropped_by_default():
    rows, stats = build_rows(["http://a.com/x", "http://a.com/y"], [])
    assert stats["dropped_domain_duplicate"] == 1
    assert len(rows) == 1


def test_domain_dedup_can_be_disabled():
    rows, stats = build_rows(["http://a.com/x", "http://a.com/y"], [], dedup_domain=False)
    assert stats["dropped_domain_duplicate"] == 0
    assert len(rows) == 2


def test_subdomains_collapse_to_one_registered_domain():
    rows, _ = build_rows(["http://a.evil.com/1", "http://b.evil.com/2"], [])
    assert len(rows) == 1


def test_unparseable_urls_are_dropped_and_counted():
    rows, stats = build_rows(["not a url", "http://a.com"], [])
    assert stats["dropped_no_domain"] == 1
    assert len(rows) == 1


# --- Cross-class conflicts -------------------------------------------------

def test_shared_domain_is_reported_as_a_conflict():
    _, stats = build_rows(["http://drive.google.com/phish"], ["https://google.com"])
    assert stats["cross_class_domains"] == ["google.com"]


def test_identical_url_in_both_classes_is_reported():
    _, stats = build_rows(["https://bit.ly"], ["https://bit.ly"])
    assert stats["cross_class_exact_urls"] == ["https://bit.ly"]


def test_conflicting_domains_are_dropped_from_both_classes_by_default():
    rows, stats = build_rows(
        ["http://drive.google.com/phish", "http://evil.com/x"],
        ["https://google.com", "https://safe.com"],
    )
    domains = {r["registered_domain"] for r in rows}
    assert "google.com" not in domains
    assert domains == {"evil.com", "safe.com"}
    assert stats["dropped_cross_class_rows"] == 2


def test_conflicts_can_be_kept():
    rows, stats = build_rows(
        ["http://drive.google.com/phish"], ["https://google.com"], drop_cross_class=False
    )
    assert stats["dropped_cross_class_rows"] == 0
    # Still reported even though nothing was dropped.
    assert stats["cross_class_domains"] == ["google.com"]
    # Domain dedup still applies, so only the first row for google.com survives.
    assert len(rows) == 1


def test_conflicts_are_detected_before_deduplication():
    """A conflict must be found even if the colliding row would be deduped away."""
    _, stats = build_rows(
        ["http://a.google.com/1", "http://b.google.com/2"], ["https://google.com"]
    )
    assert stats["cross_class_domains"] == ["google.com"]


# --- Labels, sources and counts -------------------------------------------

def test_labels_and_sources_are_assigned():
    rows, _ = build_rows(["http://evil.com"], ["https://safe.com"])
    by_domain = {r["registered_domain"]: r for r in rows}
    assert by_domain["evil.com"]["label"] == 1
    assert by_domain["evil.com"]["source"] == "phish-src"
    assert by_domain["safe.com"]["label"] == 0
    assert by_domain["safe.com"]["source"] == "legit-src"


def test_rows_have_exactly_the_output_columns():
    rows, _ = build_rows(["http://evil.com"], [])
    assert set(rows[0]) == {"url", "label", "source", "registered_domain"}


def test_final_counts_match_the_rows():
    rows, stats = build_rows(
        ["http://e1.com", "http://e2.com"], ["https://s1.com"]
    )
    assert stats["final_total"] == len(rows) == 3
    assert stats["final_phishing"] == 2
    assert stats["final_legit"] == 1


def test_raw_counts_include_everything_read():
    _, stats = build_rows(["http://a.com", "http://a.com/", "junk"], ["https://b.com"])
    assert stats["raw_phishing"] == 3
    assert stats["raw_legit"] == 1


def test_blank_lines_are_ignored_entirely():
    _, stats = build_rows(["", "   ", "http://a.com"], [])
    assert stats["raw_phishing"] == 1


# --- Balancing -------------------------------------------------------------

def test_balance_truncates_the_majority_class():
    rows, _ = build_rows(
        ["http://e1.com", "http://e2.com", "http://e3.com"], ["https://s1.com"]
    )
    balanced = balance(rows)
    assert sum(1 for r in balanced if r["label"] == 1) == 1
    assert sum(1 for r in balanced if r["label"] == 0) == 1
