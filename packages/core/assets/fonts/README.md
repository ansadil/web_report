# Shared fonts (PDF + UI)

One folder, one manifest. Every font has two files made from the **same source with the same
subsetting** by [`scripts/subset-fonts.py`](../../../../scripts/subset-fonts.py):

- `<Name>.ttf` — used by the PDF exporter (shaped by HarfBuzz, embedded as a subset).
- `<Name>.woff2` — for the UI (`@font-face`). **Provided by the UI PR** (same script with
  `--woff2`); the manifest already names the file, the PDF exporter never reads it.

## `fonts.json`

An array, one entry per face:

```json
[{ "family": "Cairo", "weight": 400, "style": "normal", "ttf": "Cairo-Regular.ttf", "woff2": "Cairo-Regular.woff2" }]
```

| Field | Type | Meaning |
|---|---|---|
| `family` | string | CSS family name (matched case-insensitively against a report's `style.font`) |
| `weight` | integer | CSS weight: `400` regular, `700` bold |
| `style` | `"normal"` \| `"italic"` | CSS font-style (all current faces are `normal`) |
| `ttf` | string | file name of the PDF face, relative to this folder |
| `woff2` | string | file name of the UI face, relative to this folder |

`Noto Sans Arabic` and `Noto Sans` are the PDF default/fallback faces.

## Regenerating

```sh
python3 -m venv .venv-fonts
.venv-fonts/bin/pip install fonttools==4.68.0 brotli==1.2.1
.venv-fonts/bin/python scripts/subset-fonts.py           # TTFs + fonts.json + OFL texts
.venv-fonts/bin/python scripts/subset-fonts.py --woff2   # also the UI .woff2 files
.venv-fonts/bin/python scripts/subset-fonts.py --check   # verify the committed files reproduce
```

Licenses: SIL OFL 1.1, see `OFL-*.txt` here and `THIRD_PARTY_NOTICES.md` at the repo root.
