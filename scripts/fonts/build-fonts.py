#!/usr/bin/env python3
"""Builds the self-hosted web fonts (E1-01) from the upstream OFL sources.

Not run in CI: the output is committed. To rebuild, with fonttools and brotli installed
(`pip install fonttools brotli`):

    python3 scripts/fonts/build-fonts.py <dir with the downloaded sources>

The sources are the variable TTFs from https://github.com/google/fonts (ofl/bricolagegrotesque,
ofl/atkinsonhyperlegiblenext, ofl/atkinsonhyperlegiblemono). Each is limited to the axis ranges we
use and subset to CHARSET, then written as WOFF2 to src/app/styles/fonts/. None of the three
licences declares a Reserved Font Name, so the subsets keep their family names.
"""
import hashlib
import io
import sys
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "src/app/styles/fonts"

# Basic Latin, Latin-1, a few Latin Extended letters, general punctuation, and the arrows and marks
# the UI uses (→ ↑ ↓ ← ▸ ▴ ▾ ✓ ·). Glyphs a font lacks are skipped.
CHARSET = (
    "U+0020-007E,U+00A0-00FF,U+0131,U+0152-0153,U+0160-0161,U+0178,U+017D-017E,U+02C6,U+02DA,U+02DC,"
    "U+2010-2015,U+2018-201E,U+2020-2022,U+2026,U+2030,U+2032-2033,U+2039-203A,U+2044,U+20AC,U+2122,"
    "U+2190-2195,U+2212,U+2264-2265,U+25B4,U+25B8,U+25BE,U+2713,U+FFFD"
)

FONTS = [
    # (source file, output file, axis limits)
    ("bricolagegrotesque/BricolageGrotesque[opsz,wdth,wght].ttf", "bricolage-grotesque.woff2",
     {"opsz": 36, "wdth": 100, "wght": (600, 800)}),
    ("atkinsonhyperlegiblenext/AtkinsonHyperlegibleNext[wght].ttf", "atkinson-hyperlegible-next.woff2",
     {"wght": (400, 700)}),
    ("atkinsonhyperlegiblenext/AtkinsonHyperlegibleNext-Italic[wght].ttf",
     "atkinson-hyperlegible-next-italic.woff2", {"wght": (400, 700)}),
    ("atkinsonhyperlegiblemono/AtkinsonHyperlegibleMono[wght].ttf", "atkinson-hyperlegible-mono.woff2",
     {"wght": (400, 700)}),
]


def unicodes(spec: str) -> list[int]:
    out = []
    for part in spec.split(","):
        a, _, b = part.removeprefix("U+").partition("-")
        out.extend(range(int(a, 16), int(b or a, 16) + 1))
    return out


def main(src: Path) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for source, target, axes in FONTS:
        path = src / source
        font = TTFont(path, lazy=False)
        font = instancer.instantiateVariableFont(font, axes)
        # Reload the instanced font, so the subsetter sees consistent tables.
        buf = io.BytesIO()
        font.save(buf)
        buf.seek(0)
        font = TTFont(buf)
        opts = subset.Options()
        opts.flavor = "woff2"
        opts.layout_features = ["*"]
        opts.name_IDs = ["*"]
        opts.notdef_outline = True
        sub = subset.Subsetter(opts)
        sub.populate(unicodes=unicodes(CHARSET))
        sub.subset(font)
        font.flavor = "woff2"
        font.save(OUT / target)
        sha = hashlib.sha256(path.read_bytes()).hexdigest()[:16]
        print(f"{target}: {(OUT / target).stat().st_size:,} bytes (source sha256 {sha}…)")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(Path(sys.argv[1]))
