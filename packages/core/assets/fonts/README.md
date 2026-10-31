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

## Using the folder (one source of truth)

`@reports-web/core` exports the helpers the PDF exporter itself uses, so the UI picks exactly
the same files:

```ts
import { DEFAULT_FONTS_BASE_URL, loadFontManifest, resolveFontUrl, type FontManifestEntry } from '@reports-web/core';

const manifest: FontManifestEntry[] = await loadFontManifest(fontsBaseUrl);      // cached per base URL
const url = await resolveFontUrl({ family: '"Cairo", sans-serif', weight: 700 },  // stack, case-insensitive,
                                 { format: 'woff2', fontsBaseUrl });              // nearest weight → URL | null
```

- `fontsBaseUrl` defaults to `DEFAULT_FONTS_BASE_URL` (this folder, resolved from the module URL).
  When an app bundler moves the core modules, copy this folder to the app's static assets and
  pass its URL (`exportPdf({ schema, rows, fontsBaseUrl })` and the helpers above).
- Accepted base URLs: `file://…` (Node — read from disk with `node:fs`, offline, no `fetch`),
  `http(s)://…` (fetched), or relative (`/fonts/`: page-relative + fetched in a browser; in Node a
  filesystem path resolved against `process.cwd()`). The `node:` modules are loaded with dynamic
  `import()` on the Node path only, so browser bundles are unaffected.
- PDF: a text element's `style.font` picks the family (first match of the stack), `style.bold`
  the 700 face; unknown families use Noto Sans Arabic + Noto Sans. Fonts are read on the first
  PDF export only — `fonts.json` plus the TTFs the report uses, nothing outside `fontsBaseUrl`.

## Regenerating

```sh
python3 -m venv .venv-fonts
.venv-fonts/bin/pip install fonttools==4.65.0 brotli==1.2.1
.venv-fonts/bin/python scripts/subset-fonts.py           # TTFs + fonts.json + OFL texts
.venv-fonts/bin/python scripts/subset-fonts.py --woff2   # also the UI .woff2 files
.venv-fonts/bin/python scripts/subset-fonts.py --check   # verify the committed files reproduce
```

fonttools is pinned to **4.65.0**, the version the committed TTFs are verified against
(`--check` in a fresh venv; QA saw different bytes with 4.68.0). The script refuses other
versions unless `--any-fonttools` is passed.

Licenses: SIL OFL 1.1, see `OFL-*.txt` here and `THIRD_PARTY_NOTICES.md` at the repo root.
