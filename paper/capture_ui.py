#!/usr/bin/env python3
"""Capture a screenshot of the Streamlit dashboard classifying a URL.

Starts the app on a local port, drives it with a headless browser, and saves
the rendered result to paper/figures/. The URL analysed is a real phishing-style
string; the verdict and the per-rule breakdown in the screenshot are produced by
the detector itself, not mocked up.

Usage::

    python paper/capture_ui.py
"""

from __future__ import annotations

import os
import socket
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
APP = os.path.join(ROOT, "phishing_detector", "app.py")
FIGDIR = os.path.join(HERE, "figures")

DEMO_URL = "http://secure-login.verify-khata.sbi-suraksha.co.in/otp/update"


def free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def wait_for_port(port: int, timeout: float = 90.0) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        with socket.socket() as sock:
            sock.settimeout(1.0)
            if sock.connect_ex(("127.0.0.1", port)) == 0:
                return True
        time.sleep(0.5)
    return False


def _trim_bottom(path: str, margin: int = 40) -> None:
    """Crop the empty page below the content, keeping a small margin."""
    try:
        from PIL import Image
    except ImportError:
        return

    image = Image.open(path).convert("RGB")
    width, height = image.size
    # The main panel starts right of the sidebar; sample a column inside it.
    x = int(width * 0.75)
    background = image.getpixel((x, height - 5))

    last_content = height - 1
    for y in range(height - 1, -1, -1):
        row = [image.getpixel((px, y))
               for px in range(int(width * 0.30), width, 25)]
        if any(pixel != background for pixel in row):
            last_content = y
            break

    bottom = min(height, last_content + margin)
    if bottom < height:
        image.crop((0, 0, width, bottom)).save(path)


def main() -> int:
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("Needs playwright:  pip install playwright", file=sys.stderr)
        return 1

    os.makedirs(FIGDIR, exist_ok=True)
    port = free_port()

    env = dict(os.environ)
    env["PYTHONPATH"] = os.path.join(ROOT, "phishing_detector")
    server = subprocess.Popen(
        [sys.executable, "-m", "streamlit", "run", APP,
         "--server.port", str(port),
         "--server.headless", "true",
         "--server.fileWatcherType", "none",
         "--browser.gatherUsageStats", "false",
         "--theme.base", "light"],
        env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
    )

    try:
        if not wait_for_port(port):
            print("Streamlit did not start. Server output:", file=sys.stderr)
            server.terminate()
            print(server.stdout.read()[-3000:], file=sys.stderr)
            return 1
        time.sleep(4)  # let the first render settle

        # The bundled browser build may not match what this playwright release
        # expects, so point at it explicitly rather than downloading another.
        chrome = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"
        launch = {"executable_path": chrome} if os.path.exists(chrome) else {}

        with sync_playwright() as pw:
            browser = pw.chromium.launch(**launch)
            page = browser.new_page(viewport={"width": 1150, "height": 1250},
                                    device_scale_factor=2)
            page.goto(f"http://127.0.0.1:{port}", wait_until="networkidle")
            page.wait_for_timeout(3500)

            # Hide Streamlit's own chrome; it is not part of the system.
            page.add_style_tag(content="""
                header[data-testid="stHeader"],
                [data-testid="stToolbar"],
                [data-testid="stDecoration"],
                [data-testid="stStatusWidget"],
                footer { display: none !important; }
                [data-testid="stAppViewContainer"] > .main { padding-top: 1rem; }
            """)
            page.wait_for_timeout(500)

            page.get_by_label("Enter URL").fill(DEMO_URL)
            page.get_by_role("button", name="Analyze URL").click()
            page.wait_for_timeout(3500)

            path = os.path.join(FIGDIR, "fig2_dashboard.png")
            page.screenshot(path=path, full_page=True)
            _trim_bottom(path)
            print(f"  wrote figures/fig2_dashboard.png")
            print(f"  URL analysed: {DEMO_URL}")
            browser.close()
        return 0
    finally:
        server.terminate()
        try:
            server.wait(timeout=10)
        except subprocess.TimeoutExpired:
            server.kill()


if __name__ == "__main__":
    raise SystemExit(main())
