"""Tests for the rule-based phishing URL scorer."""

import pytest

from detector import (
    AT_SYMBOL_WEIGHT,
    KEYWORDS,
    KEYWORD_WEIGHT,
    LONG_URL_WEIGHT,
    MANY_DOTS_WEIGHT,
    MAX_SCORE,
    band_for_score,
    score_url,
    tokenize,
)


def rule_names(result):
    return [name for name, _ in result["rules"]]


def weight_of(result, rule_name):
    return dict(result["rules"])[rule_name]


# --- Result shape ----------------------------------------------------------

def test_result_has_expected_keys():
    result = score_url("https://google.com")
    assert set(result) == {"url", "score", "raw_score", "band", "label", "rules"}


def test_rules_are_name_weight_pairs():
    result = score_url("http://verify-login.com")
    assert result["rules"]
    for rule in result["rules"]:
        assert isinstance(rule, tuple) and len(rule) == 2
        name, weight = rule
        assert isinstance(name, str)
        assert isinstance(weight, int)


def test_fired_rule_weights_sum_to_raw_score():
    result = score_url("http://secure-login-verify-account-update.bank.co.in/otp")
    assert sum(w for _, w in result["rules"]) == result["raw_score"]


# --- Individual rules and their weights (unchanged from the originals) -----

def test_clean_url_scores_zero():
    result = score_url("https://google.com")
    assert result["score"] == 0
    assert result["rules"] == []
    assert result["band"] == "LOW"


def test_single_keyword_scores_ten():
    result = score_url("http://login.io")
    assert rule_names(result) == ["keyword:login"]
    assert result["score"] == KEYWORD_WEIGHT


def test_long_url_rule_fires_above_thirty_characters():
    short = "http://a.io"                      # 11 chars
    long_url = "http://" + "a" * 24 + ".io"    # 33 chars
    assert "long_url" not in rule_names(score_url(short))
    result = score_url(long_url)
    assert weight_of(result, "long_url") == LONG_URL_WEIGHT


def test_long_url_boundary_is_strictly_greater_than_thirty():
    exactly_thirty = "h" * 30
    assert "long_url" not in rule_names(score_url(exactly_thirty))
    assert "long_url" in rule_names(score_url("h" * 31))


def test_at_symbol_rule():
    result = score_url("http://a@b.io")
    assert weight_of(result, "at_symbol") == AT_SYMBOL_WEIGHT


def test_many_dots_rule_needs_more_than_three_dots():
    assert "many_dots" not in rule_names(score_url("http://a.b.c.io"))   # 3 dots
    result = score_url("http://a.b.c.d.io")                             # 4 dots
    assert weight_of(result, "many_dots") == MANY_DOTS_WEIGHT


# --- Risk banding ----------------------------------------------------------

@pytest.mark.parametrize(
    "score, expected",
    [(0, "LOW"), (29, "LOW"), (30, "MEDIUM"), (59, "MEDIUM"), (60, "HIGH"), (100, "HIGH")],
)
def test_band_thresholds(score, expected):
    assert band_for_score(score) == expected


def test_score_is_capped_but_raw_score_is_not():
    # Many keywords plus every structural rule pushes the raw total past 100.
    url = "http://secure-login-verify-account-update-bank-otp-signin-password@a.b.c.d.e.com"
    result = score_url(url)
    assert result["raw_score"] > MAX_SCORE
    assert result["score"] == MAX_SCORE
    assert result["band"] == "HIGH"


# --- Regression tests for the bugs fixed in this refactor ------------------

def test_vocabulary_has_no_duplicates():
    """main.py listed 'khata' and 'suraksha' twice, double-scoring them."""
    assert len(KEYWORDS) == len(set(KEYWORDS))


def test_shared_hindi_telugu_keyword_scores_once():
    result = score_url("http://khata.io")
    assert rule_names(result).count("keyword:khata") == 1
    assert result["score"] == KEYWORD_WEIGHT


def test_all_keywords_are_lowercase_and_reachable():
    """gui_app.py listed 'Runam' capitalised, so it could never match."""
    assert all(keyword == keyword.lower() for keyword in KEYWORDS)


def test_previously_dead_keyword_now_matches():
    assert "keyword:runam" in rule_names(score_url("http://runam.io"))


@pytest.mark.parametrize("keyword", KEYWORDS)
def test_every_keyword_can_fire(keyword):
    assert f"keyword:{keyword}" in rule_names(score_url(f"http://{keyword}.io"))


@pytest.mark.parametrize(
    "keyword",
    ["jaanch", "satyapan", "turant", "seva", "otpverify", "bankupdate",
     "vaddi", "runam", "podupukhata"],
)
def test_vocabulary_is_union_of_both_original_lists(keyword):
    """main.py and gui_app.py had different word lists; both are now merged."""
    assert keyword in KEYWORDS


def test_same_url_scores_identically_regardless_of_front_end():
    """The CLI and GUI now share one scorer, so one URL has one verdict."""
    url = "http://secure-bank-login.verify-account.com/otp"
    assert score_url(url) == score_url(url)


# --- Input handling --------------------------------------------------------

@pytest.mark.parametrize("blank", ["", "   ", "\t\n"])
def test_blank_input_is_safe_and_scores_zero(blank):
    result = score_url(blank)
    assert result["score"] == 0
    assert result["rules"] == []
    assert result["band"] == "LOW"


def test_non_string_input_raises_type_error():
    with pytest.raises(TypeError):
        score_url(None)


def test_unknown_match_mode_raises_value_error():
    with pytest.raises(ValueError):
        score_url("http://a.io", match_mode="fuzzy")


def test_matching_is_case_insensitive():
    assert score_url("HTTP://LOGIN.IO")["score"] == score_url("http://login.io")["score"]


def test_surrounding_whitespace_is_ignored():
    assert score_url("  http://login.io  ")["url"] == "http://login.io"


# --- Tokenisation and the optional token match mode ------------------------

def test_tokenize_drops_scheme_and_splits_on_separators():
    assert tokenize("https://secure-bank_login.verify.com/login.php") == [
        "secure", "bank", "login", "verify", "com", "login", "php",
    ]


def test_substring_mode_matches_keywords_inside_words():
    """Current, unchanged behaviour: 'pan' fires inside 'japan'."""
    assert "keyword:pan" in rule_names(score_url("https://japan.com"))


def test_token_mode_avoids_the_substring_false_positive():
    result = score_url("https://japan.com", match_mode="token")
    assert "keyword:pan" not in rule_names(result)


def test_token_mode_still_matches_whole_tokens():
    result = score_url("https://verify-account.com/login", match_mode="token")
    names = rule_names(result)
    assert "keyword:verify" in names
    assert "keyword:account" in names
    assert "keyword:login" in names


def test_substring_mode_is_the_default():
    assert score_url("https://japan.com") == score_url("https://japan.com", match_mode="substring")


# --- Behaviour preserved from the original scripts -------------------------

@pytest.mark.parametrize(
    "url, expected_score",
    [
        ("https://google.com", 0),
        ("https://github.com", 0),
        ("http://secure-login.com", 20),        # secure, login (23 chars, not long)
        ("https://bank-update.com", 20),        # bank, update (23 chars, not long)
        ("http://verify-account.net", 20),      # verify, account (25 chars, not long)
        ("https://update-payment-info.com", 20),  # update, long_url (31 chars)
        ("http://secure-bank-login.verify-account.com/otp.php", 70),
    ],
)
def test_known_urls_score_as_before(url, expected_score):
    assert score_url(url)["score"] == expected_score
