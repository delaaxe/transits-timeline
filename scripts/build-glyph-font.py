#!/usr/bin/env python3
"""Builds the vendored astrological glyph font and inlines it into index.html.

Not part of `npm run build`: the output is committed, and this only runs when
the glyph set changes. Requires fonttools and brotli, which are not project
dependencies - run it in a throwaway virtualenv:

    python3 -m venv /tmp/fontenv && /tmp/fontenv/bin/pip install fonttools brotli
    /tmp/fontenv/bin/python scripts/build-glyph-font.py

Why vendor at all: these symbols are the app's alphabet, and the platforms
disagree about them. Android has no Chiron (U+26B7) in its default fallback and
renders it as tofu, and both Android and iOS hand U+2640 and U+2642 to the
colour emoji font, so Venus and Mars arrive as pictures in the middle of a
line of text. A 3KB subset with a unicode-range settles it everywhere.

Noto splits the glyphs across two families, so this takes what it needs from
each and merges them: the planets and the aspect symbols are in Noto Sans
Symbols, while the sun, the square and the trine are in Noto Sans Symbols 2.
"""

import base64
import hashlib
import io
import re
import sys
import urllib.request
from pathlib import Path

from fontTools.merge import Merger
from fontTools.subset import Subsetter
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parent.parent
VENDOR = ROOT / "vendor" / "fonts"
INDEX = ROOT / "index.html"

NOTO = "https://raw.githubusercontent.com/notofonts/notofonts.github.io/main/fonts"

# Every codepoint the app draws, and which upstream file carries it. Checked
# rather than assumed: the build fails if one is missing from its source.
SOURCES = [
    (
        "NotoSansSymbols-Regular.ttf",
        f"{NOTO}/NotoSansSymbols/hinted/ttf/NotoSansSymbols-Regular.ttf",
        # moon mercury venus mars jupiter saturn uranus neptune pluto node
        # chiron conjunction sextile opposition quincunx
        [0x263E, 0x263F, 0x2640, 0x2642, 0x2643, 0x2644, 0x2645, 0x2646,
         0x2647, 0x260A, 0x26B7, 0x260C, 0x26B9, 0x260D, 0x26BB],
    ),
    (
        "NotoSansSymbols2-Regular.ttf",
        f"{NOTO}/NotoSansSymbols2/hinted/ttf/NotoSansSymbols2-Regular.ttf",
        # sun, square, trine
        [0x2609, 0x25A1, 0x25B3],
    ),
]

FAMILY = "Transit Glyphs"


def fetch(url, path):
    if path.exists():
        return path.read_bytes()
    data = urllib.request.urlopen(url, timeout=60).read()
    path.write_bytes(data)
    return data


def subset(path, codepoints):
    font = TTFont(path)
    cmap = font.getBestCmap()
    missing = [f"U+{c:04X}" for c in codepoints if c not in cmap]
    if missing:
        raise SystemExit(f"{path.name} is missing {', '.join(missing)}")
    sub = Subsetter()
    sub.populate(unicodes=codepoints)
    sub.subset(font)
    return font


def main():
    VENDOR.mkdir(parents=True, exist_ok=True)
    cache = Path(sys.argv[1]) if len(sys.argv) > 1 else VENDOR / ".cache"
    cache.mkdir(parents=True, exist_ok=True)

    parts = []
    provenance = []
    every_codepoint = []
    for name, url, codepoints in SOURCES:
        raw = fetch(url, cache / name)
        provenance.append((name, url, hashlib.sha256(raw).hexdigest(), len(codepoints)))
        every_codepoint.extend(codepoints)
        out = cache / f"subset-{name}"
        subset(cache / name, codepoints).save(out)
        parts.append(str(out))

    merged_path = cache / "merged.ttf"
    Merger().merge(parts).save(merged_path)
    font = TTFont(merged_path)

    # One family name, and line metrics that will not stretch a line box the
    # symbols merely sit inside. Noto Sans Symbols declares an ascent of 1480
    # against a 1000 unit em, which would push the tooltip title's line apart.
    y_max = max(font["glyf"][g].yMax for g in font.getGlyphOrder()
                if getattr(font["glyf"][g], "numberOfContours", 0) != 0)
    y_min = min(font["glyf"][g].yMin for g in font.getGlyphOrder()
                if getattr(font["glyf"][g], "numberOfContours", 0) != 0)
    ascent, descent = max(int(y_max), 800), min(int(y_min), -200)
    font["hhea"].ascent, font["hhea"].descent, font["hhea"].lineGap = ascent, descent, 0
    font["OS/2"].sTypoAscender, font["OS/2"].sTypoDescender, font["OS/2"].sTypoLineGap = ascent, descent, 0
    font["OS/2"].usWinAscent, font["OS/2"].usWinDescent = ascent, abs(descent)
    for record in font["name"].names:
        if record.nameID in (1, 4, 16):
            record.string = FAMILY
        elif record.nameID == 6:
            record.string = FAMILY.replace(" ", "")

    buf = io.BytesIO()
    font.flavor = "woff2"
    font.save(buf)
    woff2 = buf.getvalue()
    (VENDOR / "transit-glyphs.woff2").write_bytes(woff2)

    ranges = ", ".join(f"U+{c:04X}" for c in sorted(every_codepoint))
    b64 = base64.b64encode(woff2).decode()

    html = INDEX.read_text(encoding="utf8")
    src = f'      src: url("data:font/woff2;base64,{b64}") format("woff2");'
    rng = f"      unicode-range: {ranges};"
    html, n_src = re.subn(r'      src: url\("data:font/woff2;base64,[^"]*"\) format\("woff2"\);', src, html)
    html, n_rng = re.subn(r"      unicode-range: U\+[^;]*;", rng, html)
    if n_src != 1 or n_rng != 1:
        raise SystemExit(f"index.html has {n_src} src and {n_rng} unicode-range lines to replace; expected 1 each")
    INDEX.write_text(html, encoding="utf8")

    lines = ["# Vendored fonts", "",
             f"`transit-glyphs.woff2` is a {len(woff2)} byte subset built by",
             "`scripts/build-glyph-font.py` and inlined into `index.html` as a data URI,",
             "so it ships with the page rather than as a request, and never has a frame",
             "where the glyphs are wrong. This directory is the provenance; nothing here",
             "is deployed.", "",
             "Sources, both under the SIL Open Font License 1.1 (see `OFL.txt`):", ""]
    for name, url, digest, count in provenance:
        lines += [f"- **{name}** — {count} glyphs", f"  - {url}", f"  - sha256 `{digest}`"]
    lines += ["", f"Codepoints: {ranges}", ""]
    (VENDOR / "README.md").write_text("\n".join(lines), encoding="utf8")

    print(f"{len(woff2)} bytes woff2, {len(b64)} base64 chars, {len(every_codepoint)} glyphs")
    print(f"ascent {ascent} descent {descent}")


if __name__ == "__main__":
    main()
