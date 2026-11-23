#!/usr/bin/env python3
"""Convert the pre-PR regression checklist (markdown) to a PDF and open it.

Usage:
  md_to_pdf_open.py <checklist.md> --no-open     build the PDF only (prints its path)
  md_to_pdf_open.py <checklist.md> --open-only   open the already-built PDF (the very last step)
  md_to_pdf_open.py <checklist.md>               build and open

- No third-party Python packages needed.
- Needs a Chromium-based browser (Chrome, Edge, Brave, Chromium) to print the PDF.
- Refuses to write inside a git repository: the checklist must never become part of a PR.
- Exit codes: 0 ok, 2 bad input / unsafe location, 3 no browser found, 4 PDF generation failed,
  5 PDF built but longer than one page (shorten the checklist and run again).
"""
import html
import os
import pathlib
import platform
import re
import shutil
import subprocess
import sys
import tempfile

CSS = """
@page { size: A4; margin: 16mm 14mm; }
body { font-family: -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif; font-size: 10.5pt;
       line-height: 1.45; color: #1a1a1a; }
h1 { font-size: 20pt; border-bottom: 2px solid #222; padding-bottom: 6px; margin-top: 0; }
h2 { font-size: 14pt; margin-top: 22px; border-bottom: 1px solid #ccc; padding-bottom: 3px; }
h3 { font-size: 12pt; margin-top: 16px; }
h4 { font-size: 11pt; margin-top: 12px; }
code { font-family: Menlo, Consolas, monospace; font-size: 9pt; background: #f1f1f1;
       padding: 1px 4px; border-radius: 3px; }
pre { background: #f6f6f6; padding: 8px; border-radius: 4px; overflow-wrap: anywhere; white-space: pre-wrap; }
pre code { background: none; padding: 0; }
ul, ol { margin: 4px 0 4px 0; padding-left: 22px; }
li { margin: 2px 0; }
li.task { list-style: none; margin-left: -18px; }
li.task .box { display: inline-block; width: 13px; height: 13px; border: 1.5px solid #333;
               border-radius: 2px; margin-right: 7px; vertical-align: -2px; }
hr { border: 0; border-top: 1px solid #bbb; margin: 18px 0; }
p { margin: 6px 0; }
h2, h3, h4 { page-break-after: avoid; }
li, pre { page-break-inside: avoid; }
"""


def inline(text: str) -> str:
    text = html.escape(text, quote=False)
    text = re.sub(r"`([^`]+)`", r"<code>\1</code>", text)
    text = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", text)
    text = re.sub(r"(?<![*\w])\*([^*\n]+)\*(?![*\w])", r"<em>\1</em>", text)
    return text


def md_to_html(md: str, title: str) -> str:
    out, para, stack = [], [], []  # stack: list of (indent, tag)
    in_code = False

    def flush_para():
        if para:
            out.append("<p>" + inline(" ".join(para)) + "</p>")
            para.clear()

    def close_lists(to_indent=-1):
        while stack and stack[-1][0] > to_indent:
            out.append(f"</li></{stack.pop()[1]}>")

    for raw in md.splitlines():
        line = raw.rstrip("\n")

        if line.strip().startswith("```"):
            flush_para()
            close_lists()
            out.append("</code></pre>" if in_code else "<pre><code>")
            in_code = not in_code
            continue
        if in_code:
            out.append(html.escape(line, quote=False))
            continue

        if not line.strip():
            flush_para()
            continue

        m = re.match(r"^(#{1,6})\s+(.*)$", line)
        if m:
            flush_para()
            close_lists()
            n = len(m.group(1))
            out.append(f"<h{n}>{inline(m.group(2))}</h{n}>")
            continue

        if re.match(r"^\s*---+\s*$", line):
            flush_para()
            close_lists()
            out.append("<hr>")
            continue

        m = re.match(r"^(\s*)([-*]|\d+\.)\s+(.*)$", line)
        if m:
            flush_para()
            indent = len(m.group(1))
            tag = "ol" if m.group(2)[0].isdigit() else "ul"
            body = m.group(3)
            if not stack or indent > stack[-1][0]:
                out.append(f"<{tag}>")
                stack.append((indent, tag))
            else:
                close_lists(indent)
                if stack and stack[-1][0] == indent:
                    out.append("</li>")
                else:
                    out.append(f"<{tag}>")
                    stack.append((indent, tag))
            task = re.match(r"^\[( |x|X)\]\s+(.*)$", body)
            if task:
                out.append('<li class="task"><span class="box"></span>' + inline(task.group(2)))
            else:
                out.append("<li>" + inline(body))
            continue

        if stack and line.startswith(" "):  # continuation text of a list item
            out.append(" " + inline(line.strip()))
            continue

        close_lists()
        para.append(line.strip())

    flush_para()
    close_lists()
    if in_code:
        out.append("</code></pre>")
    return (f"<!doctype html><html><head><meta charset='utf-8'><title>{html.escape(title)}</title>"
            f"<style>{CSS}</style></head><body>{''.join(x + chr(10) for x in out)}</body></html>")


def find_browser():
    env = os.environ.get("PRE_PR_BROWSER")
    if env and os.path.exists(env):
        return env
    candidates = [
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
        "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
        "/Applications/Chromium.app/Contents/MacOS/Chromium",
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    ]
    for c in candidates:
        if os.path.exists(c):
            return c
    for name in ("google-chrome", "google-chrome-stable", "chromium", "chromium-browser",
                 "microsoft-edge", "brave-browser"):
        p = shutil.which(name)
        if p:
            return p
    return None


def inside_git_repo(path: str) -> bool:
    try:
        top = subprocess.run(["git", "-C", os.path.dirname(path), "rev-parse", "--show-toplevel"],
                             capture_output=True, text=True).stdout.strip()
    except Exception:
        return False
    if not top:
        return False
    top = os.path.realpath(top)
    real = os.path.realpath(path)
    return real == top or real.startswith(top + os.sep)


def open_file(path: str) -> None:
    system = platform.system()
    if system == "Darwin":
        subprocess.run(["open", path], check=False)
    elif system == "Windows":
        os.startfile(path)  # type: ignore[attr-defined]
    else:
        subprocess.run(["xdg-open", path], check=False)


def main() -> int:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if len(args) != 1 or not os.path.isfile(args[0]):
        print("usage: md_to_pdf_open.py <checklist.md> [--no-open]", file=sys.stderr)
        return 2
    md_path = os.path.abspath(args[0])
    if inside_git_repo(md_path):
        print(f"REFUSED: {md_path} is inside a git repository. Move the checklist outside the repo first.",
              file=sys.stderr)
        return 2

    browser = find_browser()
    if not browser:
        print("NO_BROWSER: install Chrome/Edge/Brave/Chromium, or set PRE_PR_BROWSER to its executable.",
              file=sys.stderr)
        return 3

    base = os.path.splitext(md_path)[0]
    html_path, pdf_path = base + ".html", base + ".pdf"

    if "--open-only" in sys.argv:  # final step: just show the already-generated PDF
        if not os.path.isfile(pdf_path):
            print(f"NO_PDF: {pdf_path} does not exist yet.", file=sys.stderr)
            return 4
        open_file(pdf_path)
        print(pdf_path)
        return 0

    with open(md_path, encoding="utf-8") as f:
        doc = md_to_html(f.read(), "Pre-PR Validation")
    with open(html_path, "w", encoding="utf-8") as f:
        f.write(doc)

    profile = tempfile.mkdtemp(prefix="pre-pr-chrome-")  # isolated profile: works even if Chrome is open
    cmd = [browser, "--headless=new", "--disable-gpu", "--no-sandbox", "--no-pdf-header-footer",
           f"--user-data-dir={profile}", f"--print-to-pdf={pdf_path}", pathlib.Path(html_path).as_uri()]
    try:
        subprocess.run(cmd, capture_output=True, timeout=90)
    except subprocess.TimeoutExpired:
        pass
    shutil.rmtree(profile, ignore_errors=True)

    if not os.path.isfile(pdf_path) or os.path.getsize(pdf_path) == 0:
        print("PDF_FAILED: the browser did not produce a PDF. The markdown file is still available at "
              + md_path, file=sys.stderr)
        return 4

    with open(pdf_path, "rb") as f:
        pages = len(re.findall(rb"/Type\s*/Page[^s]", f.read()))
    if pages > 1:
        print(f"TOO_LONG: the checklist is {pages} pages. It must fit ONE page. Cut items and run again.",
              file=sys.stderr)

    print(pdf_path)
    if "--no-open" not in sys.argv and pages <= 1:
        open_file(pdf_path)
    return 5 if pages > 1 else 0


if __name__ == "__main__":
    sys.exit(main())
