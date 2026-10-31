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
  PDF export only — `fonts.json` plus the TTFs the report uses, nothing outside `fontsBaseUrl`
  (except the bundled fallback below).

### Fallback to the bundled fonts (`onWarning`)

With a custom `fontsBaseUrl`, two problems no longer fail the PDF export; the bundled faces
(`DEFAULT_FONTS_BASE_URL`, read from disk in Node) are embedded instead and `onWarning` is called
**once per face (family + weight) per export**:

| `code` (`PdfWarningCode`) | when | `family` | `url` |
| --- | --- | --- | --- |
| `FONT_FILE_UNAVAILABLE` | `fonts.json` lists the face but its TTF is missing (ENOENT / HTTP 404 …) or not a TrueType/OpenType font. The bundled face of the same family/weight is used; if the bundled folder has no such family, the bundled Noto Sans Arabic / Noto Sans. | the family | the TTF that failed |
| `FONT_FALLBACK_MISSING` | `fonts.json` has no Noto Sans Arabic or Noto Sans face (the PDF fallback fonts). The bundled one is used. | `Noto Sans Arabic` / `Noto Sans` | the custom `fonts.json` |

```ts
import { exportPdf, PdfWarningCode, type PdfWarning } from '@reports-web/core';

await exportPdf({ schema, rows, fontsBaseUrl: '/fonts/', onWarning: (w: PdfWarning) => {
  if (w.code === PdfWarningCode.FONT_FILE_UNAVAILABLE) report(`font ${w.family} fell back (${w.url})`);
} });
```

- Default `onWarning`: `console.warn`.
- The export still rejects when the bundled fonts cannot be loaded either, when the bundled
  folder itself is the one that is broken (no fallback from the bundled folder), and when the
  custom folder's `fonts.json` cannot be read or parsed (a folder-level error, not a face).
- Unknown families are not a problem: they use Noto Sans Arabic + Noto Sans without a warning.

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
