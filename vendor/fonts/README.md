# Vendored fonts

`transit-glyphs.woff2` is a 4432 byte subset built by
`scripts/build-glyph-font.py` and inlined into `index.html` as a data URI,
so it ships with the page rather than as a request, and never has a frame
where the glyphs are wrong. This directory is the provenance; nothing here
is deployed.

Sources, both under the SIL Open Font License 1.1 (see `OFL.txt`):

- **NotoSansSymbols-Regular.ttf** — 15 glyphs
  - https://raw.githubusercontent.com/notofonts/notofonts.github.io/main/fonts/NotoSansSymbols/hinted/ttf/NotoSansSymbols-Regular.ttf
  - sha256 `d0e98e9a2c046594c5021437273943be7e79e0fd980fde125279e22302212595`
- **NotoSansSymbols2-Regular.ttf** — 3 glyphs
  - https://raw.githubusercontent.com/notofonts/notofonts.github.io/main/fonts/NotoSansSymbols2/hinted/ttf/NotoSansSymbols2-Regular.ttf
  - sha256 `c4a0a80f0041ce4be81e2478faad22776d23edb98ae3f0d19bd37044820ecf9d`

Codepoints: U+25A1, U+25B3, U+2609, U+260A, U+260C, U+260D, U+263E, U+263F, U+2640, U+2642, U+2643, U+2644, U+2645, U+2646, U+2647, U+26B7, U+26B9, U+26BB
