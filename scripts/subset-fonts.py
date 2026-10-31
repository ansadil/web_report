#!/usr/bin/env python3
"""
Reproducible font subsetting for @reports-web/core.

Builds, for every font in FONTS, two subsets from the SAME source with the SAME subsetting
options into packages/core/assets/fonts/:

  <Name>.ttf    PDF export (embedded via HarfBuzz + CidFontWriter)   always
  <Name>.woff2  UI (@font-face), owned by the frontend                with --woff2

and writes packages/core/assets/fonts/fonts.json:
  [{ "family", "weight", "style", "ttf", "woff2" }]   (paths relative to that folder)

The manifest always names the .woff2 file. The .woff2 files themselves are generated and
committed by the UI PR (same script, `--woff2`); the PDF exporter never reads them.

Sources are the official OFL fonts from github.com/google/fonts, pinned to one commit and
checked by SHA-256. Variable sources (Cairo, Noto Naskh Arabic) are instanced to static
400 / 700 first.

The Noto Sans / Noto Sans Arabic PDF fallback fonts that already ship with the package are
kept byte-for-byte (their TTFs are not re-subset); only their .woff2 is derived from the
committed .ttf (same glyph set).

Setup (pinned, see requirements in this docstring):
    python3 -m venv .venv-fonts
    .venv-fonts/bin/pip install fonttools==4.65.0 brotli==1.2.1
    .venv-fonts/bin/python scripts/subset-fonts.py            # download + build the TTFs
    .venv-fonts/bin/python scripts/subset-fonts.py --woff2    # … and the UI .woff2 files
    .venv-fonts/bin/python scripts/subset-fonts.py --check    # rebuild into a temp dir, diff

fonttools is pinned to 4.65.0, the version the committed TTFs are verified against (`--check`
in a fresh venv); QA saw different bytes with 4.68.0, so the script refuses any other version
unless --any-fonttools is given.

Options:
    --sources DIR   download cache (default: .cache/font-sources, git-ignored)
    --out DIR       output folder (default: packages/core/assets/fonts)
    --woff2         also write <Name>.woff2 (same subset, WOFF2 flavor)
    --check         build into a temp dir and fail if any output differs from --out
    --any-fonttools skip the fonttools version check (outputs will likely differ)
"""
from __future__ import annotations

import argparse
import filecmp
import hashlib
import io
import json
import shutil
import sys
import tempfile
import urllib.request
from pathlib import Path

import fontTools
from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

ROOT = Path(__file__).resolve().parent.parent
FONTTOOLS_VERSION = "4.65.0"  # the committed outputs are verified (--check) against this version
GOOGLE_FONTS_COMMIT = "6c1dbe27dcf7d817d4b62cec033ba77fa8e2a5ec"  # google/fonts main, 2026-10-30
RAW = f"https://raw.githubusercontent.com/google/fonts/{GOOGLE_FONTS_COMMIT}/"

# path in google/fonts -> sha256 (filled from the pinned commit; verified on every run)
SOURCES: dict[str, str] = {
    "ofl/cairo/Cairo[slnt,wght].ttf": "667c987182391c91f4e57a2f455b1794fb5e3ee6ca4ef3383e86bb690fa9c964",
    "ofl/cairo/OFL.txt": "a4554e1799d42e1405924b61eb0e0722ae1623b1f1f07f995348f96c496362a9",
    "ofl/tajawal/Tajawal-Regular.ttf": "6882892da3e03527d5db2bbab3b48bde6ef2e878a43f522d1a4eebda90010a19",
    "ofl/tajawal/Tajawal-Bold.ttf": "0342ab6b74b6bd1b4b5bf7beda45a9734a2b3147a31e8a3a45b6a3417a52d9d7",
    "ofl/tajawal/OFL.txt": "9b584984f9db0ee30347391a76eff9c0a6b03dc450c3c6afe3757a2cb3a4db87",
    "ofl/notonaskharabic/NotoNaskhArabic[wght].ttf": "67b5a525a661b607971fbd3f96a81b89d3a768e74534fca84f18ac97e6fab72f",
    "ofl/notonaskharabic/OFL.txt": "a7a5a25eb188bf1cd96982030d53e23c33485c69b1044a562254226857ee13af",
}

# family, weight, output base name, source, variable-axis location (None = static source)
FONTS = [
    ("Cairo", 400, "Cairo-Regular", "ofl/cairo/Cairo[slnt,wght].ttf", {"wght": 400, "slnt": 0}),
    ("Cairo", 700, "Cairo-Bold", "ofl/cairo/Cairo[slnt,wght].ttf", {"wght": 700, "slnt": 0}),
    ("Tajawal", 400, "Tajawal-Regular", "ofl/tajawal/Tajawal-Regular.ttf", None),
    ("Tajawal", 700, "Tajawal-Bold", "ofl/tajawal/Tajawal-Bold.ttf", None),
    ("Noto Naskh Arabic", 400, "NotoNaskhArabic-Regular", "ofl/notonaskharabic/NotoNaskhArabic[wght].ttf", {"wght": 400}),
    ("Noto Naskh Arabic", 700, "NotoNaskhArabic-Bold", "ofl/notonaskharabic/NotoNaskhArabic[wght].ttf", {"wght": 700}),
]
# Existing PDF fallback fonts (kept as-is; woff2 derived from the committed ttf).
PREBUILT = [
    ("Noto Sans Arabic", 400, "NotoSansArabic-Regular"),
    ("Noto Sans Arabic", 700, "NotoSansArabic-Bold"),
    ("Noto Sans", 400, "NotoSans-Regular"),
    ("Noto Sans", 700, "NotoSans-Bold"),
]
LICENSES = {
    "OFL-Cairo.txt": "ofl/cairo/OFL.txt",
    "OFL-Tajawal.txt": "ofl/tajawal/OFL.txt",
    "OFL-NotoNaskhArabic.txt": "ofl/notonaskharabic/OFL.txt",
}

UNICODES = [
    (0x0020, 0x007E),  # Basic Latin
    (0x00A0, 0x00FF),  # Latin-1 Supplement (NBSP, ×, ÷, «», …)
    (0x0600, 0x06FF),  # Arabic (incl. Arabic-Indic digits ٠-٩, ٫ U+066B, ٬ U+066C, ، ؛ ؟, tatweel, harakat)
    (0x0750, 0x077F),  # Arabic Supplement
    (0x08A0, 0x08FF),  # Arabic Extended-A
    (0xFB50, 0xFDFF),  # Arabic Presentation Forms-A (incl. ﷼ U+FDFC)
    (0xFE70, 0xFEFE),  # Arabic Presentation Forms-B
    (0x2000, 0x206F),  # General Punctuation: ZWNJ/ZWJ/LRM/RLM U+200C-200F, dashes, quotes, …, bidi controls
    (0x20AC, 0x20AC),  # €
    (0x20C1, 0x20C1),  # Saudi Riyal sign (kept if the source has it)
    (0x2212, 0x2212),  # minus
    (0x25CC, 0x25CC),  # dotted circle (HarfBuzz uses it for stray marks)
]

SUBSET_ARGS = [
    "--layout-features=*",   # keep every OpenType feature (init/medi/fina/isol/rlig/liga/mark/mkmk/kern/…)
    "--layout-closure",      # glyphs reachable through GSUB are kept
    "--notdef-outline",
    "--notdef-glyph",
    "--name-IDs=*",          # keep copyright / license / version names
    "--name-languages=*",
    "--no-prune-unicode-ranges",
    "--drop-tables-=",       # drop nothing extra (GDEF/GSUB/GPOS are kept by default)
    # No --recalc-timestamp: head.modified stays from the source, so output is reproducible.
]


def sha256(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def fetch(path: str, cache: Path) -> bytes:
    local = cache / GOOGLE_FONTS_COMMIT / path
    if not local.exists():
        local.parent.mkdir(parents=True, exist_ok=True)
        print(f"download {path}", file=sys.stderr)
        with urllib.request.urlopen(RAW + urllib.request.quote(path)) as r:
            local.write_bytes(r.read())
    data = local.read_bytes()
    want = SOURCES[path]
    got = sha256(data)
    if want and want != got:
        raise SystemExit(f"sha256 mismatch for {path}: {got} != {want}")
    return data


def instance(data: bytes, loc: dict[str, int] | None, family: str, weight: int) -> TTFont:
    font = TTFont(io.BytesIO(data), recalcTimestamp=False)
    if loc is not None:
        font = instancer.instantiateVariableFont(font, loc, inplace=False)
    style = "Bold" if weight >= 700 else "Regular"
    ps = f"{family.replace(' ', '')}-{style}"
    name = font["name"]
    # RIBBI naming: family + Regular/Bold, so OS font pickers and PDF viewers agree.
    for rec_id in (16, 17, 21, 22, 25):
        name.removeNames(nameID=rec_id)
    name.setName(family, 1, 3, 1, 0x409)
    name.setName(style, 2, 3, 1, 0x409)
    name.setName(f"{family} {style}" if style != "Regular" else family, 4, 3, 1, 0x409)
    name.setName(ps, 6, 3, 1, 0x409)
    name.setName(f"{ps};{GOOGLE_FONTS_COMMIT[:7]}", 3, 3, 1, 0x409)
    for rec in list(name.names):  # drop Mac-platform duplicates that could disagree
        if rec.platformID == 1 and rec.nameID in (1, 2, 4, 6):
            name.removeNames(nameID=rec.nameID, platformID=1)
    os2 = font["OS/2"]
    os2.usWeightClass = weight
    bold = weight >= 700
    os2.fsSelection = (os2.fsSelection & ~0b1100001) | (0b100000 if bold else 0b1000000)  # BOLD / REGULAR bits
    font["head"].macStyle = (font["head"].macStyle & ~0b11) | (1 if bold else 0)
    return font


def subset_font(font: TTFont, out: Path, flavor: str | None) -> None:
    opts = subset.Options()
    parsed = subset.parse_unicodes(",".join(f"{a:04X}-{b:04X}" for a, b in UNICODES))
    opts.parse_opts(SUBSET_ARGS)
    opts.flavor = flavor
    f = TTFont(io.BytesIO(_save(font)), recalcTimestamp=False)
    s = subset.Subsetter(options=opts)
    s.populate(unicodes=parsed)
    s.subset(f)
    f.flavor = flavor
    f.save(str(out), reorderTables=True)


def _save(font: TTFont) -> bytes:
    b = io.BytesIO()
    font.save(b, reorderTables=True)
    return b.getvalue()


def build(out: Path, cache: Path, woff2: bool) -> None:
    out.mkdir(parents=True, exist_ok=True)
    manifest = []
    for family, weight, base, src, loc in FONTS:
        font = instance(fetch(src, cache), loc, family, weight)
        subset_font(font, out / f"{base}.ttf", None)
        if woff2:
            subset_font(font, out / f"{base}.woff2", "woff2")
        manifest.append({"family": family, "weight": weight, "style": "normal", "ttf": f"{base}.ttf", "woff2": f"{base}.woff2"})
    for family, weight, base in PREBUILT:
        ttf = ROOT / "packages/core/assets/fonts" / f"{base}.ttf"
        if out.resolve() != ttf.parent.resolve():
            shutil.copyfile(ttf, out / f"{base}.ttf")
        if woff2:
            f = TTFont(str(ttf), recalcTimestamp=False)
            f.flavor = "woff2"
            f.save(str(out / f"{base}.woff2"), reorderTables=True)
        manifest.append({"family": family, "weight": weight, "style": "normal", "ttf": f"{base}.ttf", "woff2": f"{base}.woff2"})
    for dest, src in LICENSES.items():
        # LF line endings (upstream Cairo/Tajawal OFL.txt are CRLF; patches/`git am` strip CR)
        (out / dest).write_bytes(fetch(src, cache).replace(b"\r\n", b"\n"))
    (out / "fonts.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--sources", type=Path, default=ROOT / ".cache/font-sources")
    ap.add_argument("--out", type=Path, default=ROOT / "packages/core/assets/fonts")
    ap.add_argument("--woff2", action="store_true")
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--any-fonttools", action="store_true")
    a = ap.parse_args()
    if fontTools.version != FONTTOOLS_VERSION and not a.any_fonttools:
        raise SystemExit(
            f"fonttools {fontTools.version} found, {FONTTOOLS_VERSION} required "
            f"(pip install fonttools=={FONTTOOLS_VERSION} brotli==1.2.1), or pass --any-fonttools"
        )
    if not a.check:
        build(a.out, a.sources, a.woff2)
        for p in sorted(a.out.iterdir()):
            print(f"{p.stat().st_size:>9}  {p.name}")
        return
    with tempfile.TemporaryDirectory() as tmp:
        t = Path(tmp)
        build(t, a.sources, a.woff2)
        bad = [p.name for p in sorted(t.iterdir()) if not (a.out / p.name).exists() or not filecmp.cmp(p, a.out / p.name, shallow=False)]
        if bad:
            raise SystemExit(f"outputs differ from {a.out}: {bad}")
        print("all outputs reproduce byte-for-byte")


if __name__ == "__main__":
    main()
