"""Tests for the legitimate-URL crawler.

Most of these cover the pure functions that decide which links are kept, which
is where dataset quality is decided. The fetch tests at the end drive
``crawl_domain`` with a stubbed session, so robots.txt handling and error paths
are covered without touching the network.
"""

import pytest

from crawl_legit import (
    clean_url,
    crawl_domain,
    extract_hrefs,
    has_useful_path,
    is_internal,
    select_links,
)


# --- Link extraction -------------------------------------------------------

def test_extracts_hrefs_in_document_order():
    html = '<a href="/a">A</a><p><a href="/b">B</a></p>'
    assert extract_hrefs(html) == ["/a", "/b"]


def test_ignores_anchors_without_href():
    assert extract_hrefs('<a name="top">x</a><a href="/a">A</a>') == ["/a"]


def test_ignores_non_anchor_tags():
    html = '<link href="/style.css"><img src="/x.png"><a href="/a">A</a>'
    assert extract_hrefs(html) == ["/a"]


def test_malformed_html_still_yields_earlier_links():
    html = '<a href="/a">A</a><div <<< broken'
    assert "/a" in extract_hrefs(html)


def test_empty_document_yields_nothing():
    assert extract_hrefs("") == []


# --- URL cleaning ----------------------------------------------------------

def test_fragment_is_removed():
    assert clean_url("https://a.com/page#section") == "https://a.com/page"


def test_tracking_parameters_are_dropped():
    cleaned = clean_url("https://a.com/p?utm_source=x&id=7&fbclid=y")
    assert cleaned == "https://a.com/p?id=7"


def test_query_is_removed_entirely_when_only_tracking_remains():
    assert clean_url("https://a.com/p?utm_medium=email") == "https://a.com/p"


def test_meaningful_query_is_preserved():
    assert clean_url("https://a.com/search?q=phishing") == "https://a.com/search?q=phishing"


def test_host_is_lowercased():
    assert clean_url("https://EXAMPLE.com/Path") == "https://example.com/Path"


def test_default_ports_are_stripped():
    assert clean_url("https://a.com:443/p") == "https://a.com/p"
    assert clean_url("http://a.com:80/p") == "http://a.com/p"


# --- Path filtering --------------------------------------------------------

@pytest.mark.parametrize("url", [
    "https://a.com",
    "https://a.com/",
])
def test_homepages_have_no_useful_path(url):
    assert has_useful_path(url) is False


@pytest.mark.parametrize("url", [
    "https://a.com/gp/help/customer/display.html",
    "https://a.com/news/2026/story",
    "https://a.com/wiki/Phishing",
])
def test_content_paths_are_useful(url):
    assert has_useful_path(url) is True


@pytest.mark.parametrize("url", [
    "https://a.com/logo.png",
    "https://a.com/style.css",
    "https://a.com/app.js",
    "https://a.com/paper.pdf",
])
def test_asset_urls_are_rejected(url):
    assert has_useful_path(url) is False


@pytest.mark.parametrize("url", [
    "https://a.com/login",
    "https://a.com/account/settings",
    "https://a.com/cart",
])
def test_authentication_paths_are_rejected(url):
    """Keeping these would put phishing-flavoured words in the legitimate class."""
    assert has_useful_path(url) is False


# --- Internal-link detection -----------------------------------------------

def test_same_domain_is_internal():
    assert is_internal("https://amazon.in/gp/help", "amazon.in") is True


def test_subdomain_is_internal():
    assert is_internal("https://www.amazon.in/gp/help", "amazon.in") is True


def test_other_domain_is_external():
    assert is_internal("https://facebook.com/x", "amazon.in") is False


def test_non_http_schemes_are_external():
    assert is_internal("mailto:a@b.com", "a.com") is False
    assert is_internal("ftp://a.com/x", "a.com") is False


def test_multi_part_suffix_domains_match():
    assert is_internal("https://www.hdfc.co.in/loans", "hdfc.co.in") is True


# --- Link selection --------------------------------------------------------

HOMEPAGE = """
<a href="/news/story-one">1</a>
<a href="/news/story-two">2</a>
<a href="/help/faq">3</a>
<a href="/shop/books">4</a>
<a href="https://other.com/x">external</a>
<a href="/login">login</a>
<a href="/logo.png">asset</a>
<a href="/">home</a>
"""


def test_selects_only_internal_content_links():
    links = select_links(HOMEPAGE, "https://a.com/", "a.com", limit=10)
    assert all(link.startswith("https://a.com/") for link in links)
    assert not any("other.com" in link for link in links)
    assert not any(link.endswith("/login") for link in links)
    assert not any(link.endswith(".png") for link in links)


def test_respects_the_limit():
    assert len(select_links(HOMEPAGE, "https://a.com/", "a.com", limit=2)) == 2


def test_spreads_across_sections_before_repeating_one():
    links = select_links(HOMEPAGE, "https://a.com/", "a.com", limit=3)
    sections = [link.split("/")[3] for link in links]
    assert len(set(sections)) == 3


def test_duplicate_paths_are_collapsed():
    html = '<a href="/news/x">a</a><a href="/news/x/">b</a><a href="/news/x#c">c</a>'
    assert len(select_links(html, "https://a.com/", "a.com", limit=10)) == 1


def test_relative_links_are_resolved_against_the_final_url():
    html = '<a href="story">s</a>'
    links = select_links(html, "https://a.com/news/", "a.com", limit=5)
    assert links == ["https://a.com/news/story"]


def test_protocol_relative_links_are_handled():
    html = '<a href="//a.com/news/x">s</a>'
    assert select_links(html, "https://a.com/", "a.com", limit=5) == ["https://a.com/news/x"]


def test_page_with_no_usable_links_yields_nothing():
    html = '<a href="/">home</a><a href="https://other.com/x">ext</a>'
    assert select_links(html, "https://a.com/", "a.com", limit=5) == []


def test_selected_urls_all_have_paths():
    """The whole point: every collected URL must carry a path."""
    links = select_links(HOMEPAGE, "https://a.com/", "a.com", limit=10)
    assert links
    assert all(has_useful_path(link) for link in links)


# --- Fetch behaviour (HTTP stubbed) ----------------------------------------

HOMEPAGE_HTML = (
    '<a href="/news/one">1</a><a href="/help/faq">2</a>'
    '<a href="/shop/x">3</a><a href="/login">no</a>'
)


class _Response:
    def __init__(self, text="", status=200, ctype="text/html", url="https://a.com/"):
        self.text = text
        self.status_code = status
        self.url = url
        self.headers = {"Content-Type": ctype}


class _Session:
    """Serves a permissive robots.txt and one homepage."""

    robots = "User-agent: *\nAllow: /\n"
    page = _Response(HOMEPAGE_HTML)

    def get(self, url, **kwargs):
        if url.endswith("robots.txt"):
            return _Response(self.robots)
        return self.page

    def close(self):
        pass


class _DisallowAll(_Session):
    robots = "User-agent: *\nDisallow: /\n"


class _NoRobots(_Session):
    def get(self, url, **kwargs):
        if url.endswith("robots.txt"):
            return _Response("", status=404)
        return self.page


class _ServerError(_NoRobots):
    page = _Response("", status=503)


class _NotHtml(_NoRobots):
    page = _Response("{}", ctype="application/json")


def test_collects_links_from_a_homepage():
    urls, status = crawl_domain(_Session(), "a.com", 3, 5, True, False)
    assert status == "ok"
    assert urls == [
        "https://a.com/news/one", "https://a.com/help/faq", "https://a.com/shop/x",
    ]


def test_homepage_is_excluded_by_default():
    urls, _ = crawl_domain(_Session(), "a.com", 3, 5, True, False)
    assert "https://a.com/" not in urls


def test_homepage_can_be_included():
    urls, _ = crawl_domain(_Session(), "a.com", 2, 5, True, True)
    assert urls[0] == "https://a.com/"


def test_robots_disallow_is_honoured():
    urls, status = crawl_domain(_DisallowAll(), "a.com", 3, 5, True, False)
    assert urls == []
    assert status == "robots-disallowed"


def test_robots_can_be_overridden():
    _, status = crawl_domain(_DisallowAll(), "a.com", 3, 5, False, False)
    assert status == "ok"


def test_missing_robots_means_allowed():
    _, status = crawl_domain(_NoRobots(), "a.com", 3, 5, True, False)
    assert status == "ok"


def test_http_error_is_reported_not_raised():
    urls, status = crawl_domain(_ServerError(), "a.com", 3, 5, True, False)
    assert urls == []
    assert status == "http-503"


def test_non_html_responses_are_skipped():
    urls, status = crawl_domain(_NotHtml(), "a.com", 3, 5, True, False)
    assert urls == []
    assert status == "not-html"


def test_network_errors_are_caught():
    import requests

    class _Broken(_NoRobots):
        def get(self, url, **kwargs):
            if url.endswith("robots.txt"):
                return _Response("", status=404)
            raise requests.RequestException("boom")

    urls, status = crawl_domain(_Broken(), "a.com", 3, 5, True, False)
    assert urls == []
    assert status.startswith("error:")
