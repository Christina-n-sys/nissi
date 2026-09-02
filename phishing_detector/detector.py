"""Rule-based multilingual phishing URL scorer.

Single source of truth for the detection logic. The CLI (``main.py``), the
Tkinter GUI (``gui_app.py``) and the Streamlit dashboard (``app.py``) all call
:func:`score_url` so that one URL always produces one verdict, whichever
front-end asked.

Scoring is deliberately unchanged from the original scripts: every matched
keyword is worth 10, a long URL 10, an ``@`` 20, and more than three dots 10,
with the reported score capped at 100.
"""

from __future__ import annotations

import re
from typing import Dict, List, Tuple

# --- Vocabulary ------------------------------------------------------------
# Suspicious keywords grouped by the language they target. Entries are stored
# lowercase because matching happens against a lowercased URL.
#
# "khata" and "suraksha" are shared between Hindi and Telugu; they are listed
# once, under Hindi, so that they cannot score twice for a single URL.
KEYWORDS_BY_LANGUAGE: Dict[str, Tuple[str, ...]] = {
    "english": (
        "login", "verify", "secure", "account", "update",
        "bank", "otp", "signin", "password",
    ),
    "hindi": (
        "kyc", "aadhaar", "pan", "banking", "verifyotp",
        "suraksha",        # security
        "khata",           # account
        "jaanch",          # verify / check
        "satyapan",        # verification
        "turant",          # urgent / immediate
        "seva",            # service
    ),
    "tamil": (
        "vangi",           # bank
        "kanakku",         # account
        "urudhi",          # verify
        "puduppi",         # update
        "paathukaappu",    # security
        "seyal",           # action
        "udanadi",         # urgent
        "otpverify",       # mixed usage
        "bankupdate",      # mixed pattern
    ),
    "telugu": (
        "dhruvikarinchu",  # verify
        "vaddi",           # interest
        "runam",           # loan
        "podupukhata",     # savings account
    ),
}


def _build_vocabulary() -> Tuple[str, ...]:
    """Flatten the per-language keywords into one ordered, de-duplicated tuple."""
    seen: Dict[str, None] = {}
    for words in KEYWORDS_BY_LANGUAGE.values():
        for word in words:
            seen.setdefault(word.lower(), None)
    return tuple(seen)


KEYWORDS: Tuple[str, ...] = _build_vocabulary()

# --- Weights ---------------------------------------------------------------
# Unchanged from the original main.py / gui_app.py implementations.
KEYWORD_WEIGHT = 10
LONG_URL_WEIGHT = 10
AT_SYMBOL_WEIGHT = 20
MANY_DOTS_WEIGHT = 10

LONG_URL_THRESHOLD = 30   # characters, measured on the raw URL
MANY_DOTS_THRESHOLD = 3   # a URL scores when it has *more* dots than this
MAX_SCORE = 100

# --- Risk bands ------------------------------------------------------------
# Thresholds taken from gui_app.py, which was the version described in the
# paper. main.py previously called any score above 0 "suspicious"; that
# disagreement is resolved here in favour of the banded scheme.
HIGH_RISK_THRESHOLD = 60
MEDIUM_RISK_THRESHOLD = 30

BAND_LABELS = {
    "HIGH": "High Risk (Phishing)",
    "MEDIUM": "Medium Risk (Suspicious)",
    "LOW": "Low Risk (Safe)",
}

# Separators used to split a URL into tokens in "token" match mode.
_TOKEN_SPLIT = re.compile(r"[^a-z0-9]+")
_SCHEME = re.compile(r"^[a-z][a-z0-9+.-]*://")


def tokenize(url: str) -> List[str]:
    """Split a URL into lowercase alphanumeric tokens.

    Drops the scheme, then splits on every non-alphanumeric character, which
    is the preprocessing step the paper describes.
    """
    lowered = _SCHEME.sub("", url.strip().lower())
    return [token for token in _TOKEN_SPLIT.split(lowered) if token]


def band_for_score(score: int) -> str:
    """Map a score onto ``HIGH`` / ``MEDIUM`` / ``LOW``."""
    if score >= HIGH_RISK_THRESHOLD:
        return "HIGH"
    if score >= MEDIUM_RISK_THRESHOLD:
        return "MEDIUM"
    return "LOW"


def score_url(url: str, match_mode: str = "substring") -> dict:
    """Score a URL and explain every rule that fired.

    Args:
        url: The URL to analyse. Leading and trailing whitespace is ignored.
        match_mode: ``"substring"`` (default) matches a keyword anywhere in the
            URL, reproducing the original behaviour. ``"token"`` requires the
            keyword to be a whole token, which removes matches like "pan"
            inside "japan.com".

    Returns:
        A dict with the original ``url``, the capped ``score``, the uncapped
        ``raw_score``, the ``band`` and its human-readable ``label``, and
        ``rules``: a list of ``(rule_name, weight)`` pairs, one per fired rule.

    Raises:
        TypeError: If ``url`` is not a string.
        ValueError: If ``match_mode`` is not a recognised mode.
    """
    if not isinstance(url, str):
        raise TypeError(f"url must be a string, got {type(url).__name__}")
    if match_mode not in ("substring", "token"):
        raise ValueError(f"unknown match_mode: {match_mode!r}")

    url = url.strip()
    lowered = url.lower()
    rules: List[Tuple[str, int]] = []

    if not url:
        return {
            "url": url,
            "score": 0,
            "raw_score": 0,
            "band": "LOW",
            "label": BAND_LABELS["LOW"],
            "rules": rules,
        }

    # Keyword rules. KEYWORDS is de-duplicated, so no keyword can score twice.
    haystack = set(tokenize(url)) if match_mode == "token" else lowered
    for keyword in KEYWORDS:
        if keyword in haystack:
            rules.append((f"keyword:{keyword}", KEYWORD_WEIGHT))

    # Structural rules.
    if len(url) > LONG_URL_THRESHOLD:
        rules.append(("long_url", LONG_URL_WEIGHT))
    if "@" in url:
        rules.append(("at_symbol", AT_SYMBOL_WEIGHT))
    if url.count(".") > MANY_DOTS_THRESHOLD:
        rules.append(("many_dots", MANY_DOTS_WEIGHT))

    raw_score = sum(weight for _, weight in rules)
    score = min(raw_score, MAX_SCORE)
    band = band_for_score(score)

    return {
        "url": url,
        "score": score,
        "raw_score": raw_score,
        "band": band,
        "label": BAND_LABELS[band],
        "rules": rules,
    }


def format_result(result: dict) -> str:
    """Render a :func:`score_url` result as plain text for a terminal or GUI."""
    lines = [
        f"URL: {result['url']}",
        f"Score: {result['score']}%",
        f"Status: {result['label']}",
    ]
    if result["rules"]:
        reasons = ", ".join(f"{name} (+{weight})" for name, weight in result["rules"])
        lines.append(f"Reasons: {reasons}")
    else:
        lines.append("Reasons: no suspicious indicators found")
    return "\n".join(lines)
