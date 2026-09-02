#!/usr/bin/env python3
"""Capture screenshots of the system's real output for the paper.

Every image produced here is the actual output of this code: the dashboard is
driven in a real browser, and the terminal figures render stdout captured from
running the commands. Nothing is mocked up or typeset by hand.

Produces:
    fig2_dashboard_phishing.png   dashboard classifying a phishing URL
    fig3_dashboard_legitimate.png dashboard classifying a legitimate URL
    fig4_cli.png                  command-line output for both cases
    fig5_hashing.png              the file-hashing feature

Usage::

    python paper/capture_outputs.py
"""

from __future__ import annotations

import html
import os
import socket
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
APP = os.path.join(ROOT, "phishing_detector", "app.py")
FIGDIR = os.path.join(HERE, "figures")

PHISHING_URL = "http://secure-login.verify-khata.sbi-suraksha.co.in/otp/update"
LEGIT_URL = "https://wikipedia.org/wiki/Phishing"

CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"

HIDE_CHROME = """
    header[data-testid="stHeader"], [data-testid="stToolbar"],
    [data-testid="stDecoration"], [data-testid="stStatusWidget"],
    footer { display: none !important; }
"""


# --- helpers ---------------------------------------------------------------

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


def trim_bottom(path: str, margin: int = 30) -> None:
    """Crop the empty page below the content."""
    try:
        from PIL import Image
    except ImportError:
        return
    image = Image.open(path).convert("RGB")
    width, height = image.size
    background = image.getpixel((int(width * 0.75), height - 5))
    last = height - 1
    for y in range(height - 1, -1, -1):
        if any(image.getpixel((px, y)) != background
               for px in range(int(width * 0.30), width, 25)):
            last = y
            break
    bottom = min(height, last + margin)
    if bottom < height:
        image.crop((0, 0, width, bottom)).save(path)


# --- terminal rendering ----------------------------------------------------

def render_terminal(page, lines: list, out_name: str, title: str) -> None:
    """Render captured stdout as a terminal window and screenshot it."""
    body = html.escape("\n".join(lines))
    page.set_content(f"""
    <html><body style="margin:0;background:#f4f4f2;padding:18px;width:860px;
                       font-family:'DejaVu Sans',sans-serif">
      <div style="border:1px solid #c9c9c4;border-radius:7px;overflow:hidden;
                  box-shadow:0 1px 3px rgba(0,0,0,.10);background:#1e1e1e">
        <div style="background:#e8e8e4;padding:7px 12px;font-size:12px;
                    color:#3a3a38;border-bottom:1px solid #c9c9c4">
          <span style="color:#e05252">●</span>
          <span style="color:#e0a52e">●</span>
          <span style="color:#3ea655">●</span>
          <span style="margin-left:10px">{html.escape(title)}</span>
        </div>
        <pre style="margin:0;padding:14px 16px;color:#e8e8e4;font-size:13px;
                    line-height:1.5;font-family:'DejaVu Sans Mono',monospace;
                    white-space:pre-wrap;word-break:break-word">{body}</pre>
      </div>
    </body></html>""")
    page.wait_for_timeout(400)
    element = page.locator("div").first
    element.screenshot(path=os.path.join(FIGDIR, out_name))
    print(f"  wrote figures/{out_name}")


def run_cli(url: str) -> list:
    """Run the CLI on a URL and return the command plus its real output."""
    result = subprocess.run(
        [sys.executable, "main.py", url],
        cwd=os.path.join(ROOT, "phishing_detector"),
        capture_output=True, text=True,
    )
    out = [line for line in result.stdout.splitlines()]
    return [f"$ python main.py \"{url}\""] + out


# --- captures --------------------------------------------------------------

def capture_url(page, port: int, url: str, out_name: str) -> None:
    page.goto(f"http://127.0.0.1:{port}", wait_until="networkidle")
    page.wait_for_timeout(3000)
    page.add_style_tag(content=HIDE_CHROME)
    page.get_by_label("Enter URL").fill(url)
    page.get_by_role("button", name="Analyze URL").click()
    page.wait_for_timeout(3000)
    path = os.path.join(FIGDIR, out_name)
    page.screenshot(path=path, full_page=True)
    trim_bottom(path)
    print(f"  wrote figures/{out_name}   ({url})")


def capture_hashing(page, port: int, out_name: str) -> None:
    sample = os.path.join(ROOT, "requirements.txt")
    page.goto(f"http://127.0.0.1:{port}", wait_until="networkidle")
    page.wait_for_timeout(3000)
    page.add_style_tag(content=HIDE_CHROME)

    page.get_by_label("Select Feature").click()
    page.wait_for_timeout(700)
    page.get_by_text("File Hashing", exact=True).click()
    page.wait_for_timeout(2500)

    page.locator('input[type="file"]').set_input_files(sample)
    page.wait_for_timeout(2500)
    page.get_by_role("button", name="Generate Hash").click()
    page.wait_for_timeout(2500)

    path = os.path.join(FIGDIR, out_name)
    page.screenshot(path=path, full_page=True)
    trim_bottom(path)
    print(f"  wrote figures/{out_name}")


def main() -> int:
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("Needs playwright:  pip install playwright", file=sys.stderr)
        return 1

    os.makedirs(FIGDIR, exist_ok=True)

    # Real CLI output, captured before the browser work.
    cli_lines = run_cli(PHISHING_URL) + [""] + run_cli(LEGIT_URL)

    port = free_port()
    env = dict(os.environ)
    env["PYTHONPATH"] = os.path.join(ROOT, "phishing_detector")
    server = subprocess.Popen(
        [sys.executable, "-m", "streamlit", "run", APP,
         "--server.port", str(port), "--server.headless", "true",
         "--server.fileWatcherType", "none",
         "--browser.gatherUsageStats", "false", "--theme.base", "light"],
        env=env, stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT, text=True,
    )

    try:
        if not wait_for_port(port):
            print("Streamlit did not start", file=sys.stderr)
            return 1
        time.sleep(4)

        launch = {"executable_path": CHROME} if os.path.exists(CHROME) else {}
        with sync_playwright() as pw:
            browser = pw.chromium.launch(**launch)
            page = browser.new_page(viewport={"width": 1150, "height": 1250},
                                    device_scale_factor=2)

            capture_url(page, port, PHISHING_URL, "fig2_dashboard_phishing.png")
            capture_url(page, port, LEGIT_URL, "fig3_dashboard_legitimate.png")
            capture_hashing(page, port, "fig5_hashing.png")

            term = browser.new_page(viewport={"width": 900, "height": 700},
                                    device_scale_factor=2)
            render_terminal(term, cli_lines, "fig4_cli.png",
                            "Command Prompt — phishing_detector")
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
