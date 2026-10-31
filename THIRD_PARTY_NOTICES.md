# Third-party notices

This repository redistributes the following third-party assets. Each keeps its own license;
the full texts are shipped next to the files.

## Fonts — `packages/core/assets/fonts/`

All fonts are licensed under the **SIL Open Font License, Version 1.1** (OFL-1.1). The
files in that folder are *subsets* (Arabic, Arabic Presentation Forms, Basic Latin, Latin-1,
general punctuation, Arabic-Indic digits; all OpenType layout features kept) produced by
`scripts/subset-fonts.py` from the official sources in
[google/fonts](https://github.com/google/fonts) (commit pinned in the script). Under the OFL
a subset is a Modified Version; no Reserved Font Name is declared by these fonts, so the
original family names are kept.

| Family | Files | Copyright | License text |
|---|---|---|---|
| Cairo | `Cairo-Regular.*`, `Cairo-Bold.*` (static 400/700 instances of the variable font) | Copyright 2009 The Cairo Project Authors | `OFL-Cairo.txt` |
| Tajawal | `Tajawal-Regular.*`, `Tajawal-Bold.*` | Copyright 2018 Boutros International | `OFL-Tajawal.txt` |
| Noto Naskh Arabic | `NotoNaskhArabic-Regular.*`, `NotoNaskhArabic-Bold.*` (static 400/700 instances of the variable font) | Copyright 2022 The Noto Project Authors | `OFL-NotoNaskhArabic.txt` |
| Noto Sans, Noto Sans Arabic | `NotoSans-*.ttf`, `NotoSansArabic-*.ttf` (PDF fallback fonts) | Copyright 2022 The Noto Project Authors | `OFL-NotoSans.txt` |

OFL-1.1: https://openfontlicense.org
