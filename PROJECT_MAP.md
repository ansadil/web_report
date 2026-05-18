# Reports Web — PROJECT_MAP

> الذاكرة الخارجية للمشروع. مصدر الحقيقة الوحيد للقرارات المعمارية.
> آخر تحديث: 2026-05-12 · المالك: Tech Lead · الحالة: **v0.4.0 — Viewer: تكبير/تصغير + تنقل بين أقسام العرض، 118 اختبار أخضر**

---

## [STATUS]

| Milestone | الحالة | الدليل |
|---|---|---|
| M0 — Foundations | ✅ | `pnpm install` + `pnpm -r build` ينجح؛ Logger: 10 اختبارات خضراء |
| M1 — Engine Core | ✅ | Expression evaluator: 14 اختبار · Aggregator: 6 · Interpreter: 6 · Schema: 6 |
| M2 — `<reports-viewer>` | ✅ | Web Component مع toolbar/RTL/charts؛ playground يعرضه |
| M3 — Data + Storage + Chart Adapters | ✅ | REST + GraphQL + SQL-Proxy + Static + Custom + Registry: 13 اختبار |
| M4 — `<reports-builder>` WYSIWYG | ✅ | DnD + Properties Panel + 8/8 element kinds + Save/Load |
| M5 — Exporters | ✅ | PDF (multi-page, page-breaks) + Excel + CSV + PNG + Print: 3 اختبارات + روند تريب 5 |
| M6 — React + Vue wrappers | ✅ | 3 + 3 = 6 اختبارات SSR/تسجيل WC |
| M7 — Playground + أمثلة | ✅ | Vite playground ينبني (1.68MB)؛ Laravel Blade + Next.js App Router examples |
| Page Break | ✅ | اختبار يولّد PDF متعدد الصفحات |
| Theme System | ✅ | CSS variables `--rw-*` و `--rb-*` |
| Templates | ✅ | blank / tabular / grouped (مع 4 اختبارات) |
| **Watermark (v0.2)** | ✅ | text/image، literal أو expression، 8+7 اختبار جديد، يُرسم في HTML + PDF |
| **Full Property Editor (v0.2)** | ✅ | Document/Page/Watermark + كل خصائص العنصر (font, underline, padding, border × 4, conditional rules editor) |
| **Icon-driven Toolbar (v0.3)** | ✅ | 16 SVG icon inline (No deps)، أزرار `currentColor` theme-aware في Viewer + Builder |
| **Collapsible Panels (v0.3)** | ✅ | Left (Toolbox) + Right (Properties) قابلان للطي إلى rail 40px مع keyboard-accessible toggles |
| **Customizable Toolbar Actions (v0.3)** | ✅ | `actions` property على Viewer (`['print','pdf','excel','csv','image']`) و Builder (`['save','json','preview']`) + قائمة Customize تفاعلية بالـ ⚙ cog |
| **Band properties in Builder (v0.3.1)** | ✅ | خصائص المستند تشمل كل أشرطة التقرير (ارتفاع، فصل صفحة قبل/بعد، تفعيل/إزالة اختيارية) + مجموعات (حقل التجميع، إعادة ترقيم صفحة، رأس/تذييل مجموعة)؛ `reports-builder-sections.test.ts` |
| **Viewer zoom + section nav (v0.4.0)** | ✅ | شريط العارض: تصغير/تكبير (50٪–200٪)، عرض النسبة، ملء العرض، تنقل سابق/تالي بين `section.rw-section` مع عدّاد «i / n»؛ طباعة تعيد zoom=1؛ `hide-view-controls`؛ `viewer-view-controls.test.ts` |

**إجمالي الاختبارات: 118 (Pass) عبر 19 ملف اختبار، 4 حزم.**

---

## [TECH_STACK]

> تاريخ التحقق: 2026-05-11. الإصدارات هي **التي تم اعتمادها فعلياً** بعد ترقية أحدث مستقر متاح للبيئة (Windows + Node 20 LTS — Node 24 لم يكن متاحاً محلياً وتم توثيق الانتقال).

| الطبقة | التقنية | الإصدار الفعلي | الدور |
|---|---|---|---|
| Runtime | Node.js | **20.20.0 LTS** (Active LTS until Apr 2026) | بيئة البناء |
| Language | TypeScript | **5.9.3** (auto-resolved من `^5.7.2`) | strict mode |
| Package Manager | pnpm | **9.15.9** | Monorepo workspaces |
| Bundler (apps) | Vite | **5.4.21** | playground build |
| Type Compiler | tsc | 5.9 (composite project references) | حزم npm |
| Core (WC) | Lit | **3.3.2** | Web Components + Shadow DOM |
| Charts | Chart.js | **4.5.1** (registered tree-shakeable) | خلف ChartAdapter |
| PDF | pdf-lib | **1.17.1** | banded brutal-pagination |
| Excel | ExcelJS | **4.4.0** | xlsx output + RTL |
| Image | html-to-image | **1.11.13** | PNG snapshot |
| Schema | Zod | **3.25.x** | typed validation |
| React Wrapper | React | **18.3.x** (peer) | thin component |
| Vue Wrapper | Vue | **3.5.x** (peer) | thin component |
| Testing | Vitest | **2.1.9** | unit + integration |
| DOM (tests) | happy-dom | **15.x** | WC tests |

**استبعادات Deprecated:** Moment.js، Webpack، CRA، Babel runtime، jQuery، lodash كاملاً، rimraf<5، uuid<10 (الأخيرتان transitive في exceljs/pdf-lib، خارج سيطرتنا).

---

## [SYSTEM_FLOW]

### رحلة العارض (Viewer)

```
Host App
   │
   ▼ <reports-viewer schema dataAdapter locale dir>
[1] Schema validation (Zod safeParse) ─── fail → error event
[2] DataAdapter.fetch(query)            ─── 5 adapters supported
[3] Engine.computeAggregates()           ─── sum/count/avg/min/max
[4] Interpreter.interpret()              ─── Schema + rows → RenderTree
[5] renderHtml()                          ─── RenderTree → HTML + chart placeholders
[6] Shadow DOM render (RTL-aware) + **عرض: تكبير (zoom/scale) وتنقل بين أقسام HTML (`rw-section`)**
[7] Chart adapter renders into <canvas>
[8] User exports → dynamic import:
      pdf.js  → exportPdf()    → application/pdf Blob
      excel.js → exportExcel() → xlsx Blob
      image.js → exportPng()   → png Blob
      print.js → window.print()
```

**أهداف Viewer قابلة للتحقق:** ✅ كلها مغطاة بـ `roundtrip.test.ts` + `page-break.test.ts`.

### رحلة الباني (Builder)

```
Host opens <reports-builder schema? dataAdapter storageAdapter onSave>
   │
   ▼
[1] introspect fields (DataAdapter or sampleRows)
[2] Banded Canvas: ReportHeader/PageHeader/Detail/PageFooter/ReportFooter
[3] Toolbox: 8 element kinds (text/field/image/chart/aggregate/expr/line/box)
[4] HTML5 DnD: tool/field → band → element created at drop coords (RTL-aware)
[5] Pointer events: move + resize handles
[6] Properties Panel: عند عدم اختيار عنصر — Document/Page/Watermark + **خصائص كل شريط تقرير (Band)** ومجموعات؛ عند الاختيار — id/pos/style + حقول حسب نوع العنصر
[7] Save → validateReport → onSave event + StorageAdapter.save (if attached)
[8] JSON export button → ExportJson event with blob
```

**أهداف Builder قابلة للتحقق:** ✅ Schema roundtrip (يحفظ في باني، يفتح في عارض → نفس المخرج) مغطى ضمن `roundtrip.test.ts`.

---

## [ARCHITECTURE]

```
reports_web/
├── packages/
│   ├── shared/                       @reports-web/shared
│   │   └── src/{types, format, result}.ts        # types + Intl-based format helpers
│   ├── core/                          @reports-web/core
│   │   └── src/
│   │       ├── engine/               # interpreter, aggregator, expression, renderer-html
│   │       ├── components/           # reports-viewer.ts, reports-builder.ts (Lit WC)
│   │       ├── adapters/
│   │       │   ├── data/             # rest, graphql, sql-proxy, static, custom, registry
│   │       │   ├── storage/          # callback, local (StorageAdapter)
│   │       │   └── chart/            # chartjs (default), abstract types
│   │       ├── exporters/            # pdf, excel (xlsx+csv), image, print
│   │       ├── schema/               # ReportSchemaV1 (Zod)
│   │       ├── i18n/                 # ar/en strings
│   │       ├── logging/              # async logger (Protocol 4)
│   │       └── templates/            # blank, tabular, grouped
│   ├── react/                         @reports-web/react   (thin wrapper)
│   └── vue/                           @reports-web/vue     (thin wrapper)
│
├── apps/
│   └── playground/                    Vite sandbox مع EN/AR + Viewer/Builder toggle
│
├── examples/
│   ├── laravel-blade/                 Blade views + controllers description
│   └── nextjs-app-router/             Next 15 App Router pages (Viewer + Builder)
│
├── PROJECT_MAP.md                     ← هذا الملف
├── README.md
├── package.json (workspace root)
├── pnpm-workspace.yaml
├── tsconfig.base.json                 strict + isolatedModules + bundler resolution
└── .npmrc                              auto-install-peers, no shameful hoist
```

### مبادئ مطبقة

1. **Simplicity First**: Lit بدل bespoke WC، Zod بدل validators يدوية، tsc composite بدل bundler متعدد.
2. **Surgical Shared**: `shared/` يحتوي **3 ملفات فقط** (types, format, result) — كلها مستعملة في ≥ 2 حزمة.
3. **Bounded Contexts**: engine ≠ exporters ≠ adapters ≠ components ≠ schema. لا تسرّب.
4. **Schema as Truth**: `ReportSchemaV1` (Zod) مصدر الحقيقة لكل المكونات.
5. **Adapter Pattern**: Data (5)، Storage (callback/local)، Chart (chartjs). كلها واجهات صغيرة.
6. **No Micro-files**: لا ملف بـ 5 أسطر؛ يتم تجميع الـ utilities داخل الملف ذو الصلة.
7. **CSS Isolation**: Viewer/Builder = Shadow DOM (Lit) — لا تسرّب أنماط للمضيف.
8. **Tree-Shakable Exporters**: dynamic `import()` لكل مصدِّر داخل `<reports-viewer>` — bundle Viewer لا يحمل PDF/Excel إلا عند الحاجة. (دليل: playground يولّد chunks منفصلة: print 0.1KB، excel 2.1KB، pdf 4.7KB، image 13.7KB.)

---

## [LOGGING] — البروتوكول الرابع

`Logger` بطابور + `queueMicrotask` لتفريغ غير متزامن. صفر تأثير على Render Path. تفاصيل:

- **Sinks**: `ConsoleSink` (default)، `MemorySink` (للاختبار)، أي `LogSink` مخصص (المضيف).
- **Redaction**: `password|token|authorization|secret|apikey|api_key|cookie` تستبدل بـ `[REDACTED]` recursively.
- **Levels**: `debug | info | warn | error | silent`. التحويل قابل في الـ runtime.
- **Sink Safety**: استثناء داخل `sink.write` يُبتلع — لا يكسر التطبيق.
- **اختبارات**: 10/10 (مستوى، redaction، failure، runtime change).

---

## [SCHEMA] — ReportSchemaV1

النقاط الأساسية (Zod):

- `version: '1'`, `id`, `meta { name, locale, dir, description?, createdAt?, updatedAt? }`
- `page { size: A4|A5|Letter, orientation, margins }`
- `dataset { adapter, source, params? }`
- `fields[] { name, type: string|number|date|bool, label? }`
- `groups[] { key, header?, footer?, resetPageNumber? }` — يدعم Group Header/Footer
- `bands { reportHeader?, pageHeader?, detail (required), pageFooter?, reportFooter? }`
- `Band { height, elements[], pageBreakBefore?, pageBreakAfter? }`
- 8 أنواع عناصر (discriminated union): `text | field | image | chart | aggregate | line | box | expr`
- لكل عنصر: `id`, `pos {x,y,w,h}`, `style?`, `visibleWhen?`, `cond[]?` (Conditional Formatting)
- **`watermark?`** (v0.2): `discriminatedUnion('kind', [text, image])`
  - `text`: `{ text, expression?, fontSize, color, opacity, rotation }` — `expression` يحسب النص في وقت العرض
  - `image`: `{ src, opacity, rotation, width }`

---

## [API_SURFACE]

```ts
// HTML
<reports-viewer locale="ar" dir="rtl"></reports-viewer>
<reports-builder locale="ar" dir="rtl"></reports-builder>

// Programmatic (TypeScript)
import {
  // viewer/builder
  ReportsViewerElement, ReportsBuilderElement,

  // engine
  validateReport, interpret, renderHtml, computeAggregates, evaluate,

  // adapters
  createRestAdapter, createGraphQLAdapter, createSqlProxyAdapter,
  createStaticAdapter, createCustomAdapter, DataAdapterRegistry,
  createCallbackStorage, createLocalStorageAdapter,
  createChartJsAdapter,

  // exporters
  exportPdf, exportExcel, exportCsv, exportPng, triggerPrint,

  // templates
  TEMPLATES, getTemplate,

  // logging
  Logger, ConsoleSink, MemorySink, logger,

  // schema types
  type ReportSchemaV1,
} from '@reports-web/core';

// React
import { ReportViewer, ReportBuilder } from '@reports-web/react';

// Vue
import { ReportViewer, ReportBuilder } from '@reports-web/vue';
```

---

## [HOW_TO_RUN]

```bash
# تثبيت
pnpm install

# اختبارات كل الحزم
pnpm test:run

# بناء كل الحزم
pnpm build

# تشغيل الـ playground (مع EN/AR + Viewer/Builder)
pnpm playground
# http://127.0.0.1:5173
```

---

## [QUALITY_GATES] — حالة فعلية

| البند | الحد | الحالة |
|---|---|---|
| `tsc --noEmit` (كل الحزم) | 0 أخطاء | ✅ 0 |
| اختبارات Engine + Schema + Adapters + Exporters + Components | ≥ 50 | ✅ 88 |
| Bundle viewer-only (مع شجرة hoisting) | < 200KB gz | playground bundle 547KB gz يشمل Builder + Chart.js + ExcelJS — code-splitting يحمّل الإكسبورتر فقط عند الاستخدام |
| Memory leaks (chart disposal) | لا تسرّب | ✅ `_destroyCharts` في `disconnectedCallback` |
| Sink failure | لا انهيار | ✅ مغطى باختبار |
| Expression evaluator security | لا `eval`، لا `Function()` | ✅ Lexer + Parser + tree-walk + MAX_OPS guard |

---

## [ORPHANS & PENDING]

> **فارغ — كل بند تم حلّه (تنفيذ / قرار صريح / out-of-scope بمبرر).**

### قرارات حُسمت

| البند الأصلي | الحالة | الموقع |
|---|---|---|
| OP-03 Sub-reports / Nested reports | **مؤجل لـ v1.1 رسمياً** | [ROADMAP](#roadmap) |
| OP-04 Conditional Formatting DSL | **مُنفَّذ** عبر `Element.cond[]` (rule.when + rule.style) | `schema/report-schema.ts`، يُطبَّق في `interpreter.ts → applyConditional` |
| OP-05 Row-level Security / RBAC | **خارج النطاق بمبرر** — مسؤولية المضيف (يتم عبر DataAdapter scoping) | — |
| OP-07 Page Break edge cases | **مُنفَّذ** (`pageBreakBefore/After` يُطبَّق في HTML + PDF) | `engine/page-break.test.ts` |
| OP-06 Template Gallery | **مُنفَّذ** (3 قوالب: blank/tabular/grouped) | `templates/index.ts` |
| OP-09 Theme System | **مُنفَّذ** عبر CSS variables `--rw-*` للعارض و `--rb-*` للباني | `theme.test.ts` |

### [ROADMAP] — خارج نطاق v1.0 (بقرار صريح)

| البند | مبرر التأجيل | متى |
|---|---|---|
| OP-01 Server-side Rendering للتقارير الضخمة | host-only architecture بقرار المالك؛ يضيف runtime منفصل خارج عقد v1.0 | v1.1 (Node Runtime اختياري) |
| OP-02 Real-time / Streaming datasets | يحتاج WebSocket adapter جديد + lifecycle changes؛ غير ضمن MVP | v1.2 |
| OP-08 توسيع التدويل (fr/es/ur) | البنية جاهزة (i18n module)؛ الإضافة لغوية بحتة | v1.1 |
| OP-10 Caching layer للتقارير المتكررة | مسؤولية مشتركة (مضيف يكاش الـ data؛ Adapter قابل للحقن) | v1.1 (Cache decorator حول DataAdapter) |

كل بنود الـ Roadmap موثقة بمسار ترقية واضح ولا تخل بـ API surface الحالي.

---

## [TESTS] — حصر فعلي

```
@reports-web/shared    1 file   10 tests
@reports-web/core     16 files 102 tests
@reports-web/react     1 file    3 tests
@reports-web/vue       1 file    3 tests
──────────────────────────────────────
Total                 19 files 118 tests       PASS
```

### تغطية بالميزة

| الميزة | ملف الاختبار | عدد |
|---|---|---|
| Logger (async, redact, levels, sink safety) | `logging/logger.test.ts` | 10 |
| Format helpers (Intl, patterns, HTML escape) | `format.test.ts` | 10 |
| Schema validation (Zod) | `schema/report-schema.test.ts` | 6 |
| **Watermark schema (v0.2)** | `schema/watermark.test.ts` | 8 |
| **Toolbar UX (v0.3): actions filter + collapsible panels + a11y** | `components/toolbar.test.ts` | 8 |
| **Builder: root + group band props UI (v0.3.1)** | `components/reports-builder-sections.test.ts` | 4 |
| **Viewer: zoom + section toolbar (v0.4.0)** | `components/viewer-view-controls.test.ts` | 3 |
| Expression evaluator | `engine/expression.test.ts` | 14 |
| Aggregator + groupRows | `engine/aggregator.test.ts` | 6 |
| Interpreter (bands, groups, visibleWhen, expr) | `engine/interpreter.test.ts` | 6 |
| **Watermark render (interpreter+HTML+PDF+escape, v0.2)** | `engine/watermark-render.test.ts` | 7 |
| Data Adapters (5) + Registry | `adapters/data/adapters.test.ts` | 13 |
| Exporters PDF/Excel/CSV | `exporters/exporters.test.ts` | 3 |
| End-to-end roundtrip (Schema→Tree→HTML→PDF→Excel→CSV) | `components/roundtrip.test.ts` | 5 |
| Page-break support | `engine/page-break.test.ts` | 3 |
| Theme variables | `engine/theme.test.ts` | 2 |
| Templates | `templates/templates.test.ts` | 4 |
| React wrappers (Viewer + Builder + WC registration) | `react/.../wrapper.test.tsx` | 3 |
| Vue wrappers (Viewer + Builder + WC registration) | `vue/.../wrapper.test.ts` | 3 |

---

## [INTEGRATION_EXAMPLES]

### Laravel Blade

```html
<reports-viewer dir="rtl" locale="ar" style="height:90vh"></reports-viewer>
<script type="module">
  import '@reports-web/core';
  import { createRestAdapter } from '@reports-web/core';
  const v = document.querySelector('reports-viewer');
  v.dataAdapter = createRestAdapter({ baseUrl: '/reports/data', method: 'POST',
    headers: { 'X-CSRF-TOKEN': '{{ csrf_token() }}' } });
  v.schema = @json($schema);
</script>
```

ملف كامل: `examples/laravel-blade/resources/views/reports/sales.blade.php` (+ نسخة باني).

### Next.js (App Router)

```tsx
// app/reports/page.tsx (server)
import { ViewerClient } from './ViewerClient';
export default async function Page() {
  const schema = await loadSchema();
  return <ViewerClient schema={schema} />;
}

// app/reports/ViewerClient.tsx ('use client')
import { ReportViewer } from '@reports-web/react';
import { createRestAdapter } from '@reports-web/core';
export function ViewerClient({ schema }) {
  const adapter = createRestAdapter({ baseUrl: '/api/reports/data', method: 'POST' });
  return <ReportViewer schema={schema} dataAdapter={adapter} dir="ltr" locale="en" />;
}
```

ملفات كاملة: `examples/nextjs-app-router/app/reports/{page,ViewerClient,builder/page,builder/BuilderClient}.tsx`.

---

## [RISK_REVIEW]

| المخاطرة الأصلية | الحالة | الإجراء |
|---|---|---|
| PDF تصدير Client-side بطيء على تقارير ضخمة | مرصودة | حدّ ~5K سطر، route ترقية → Node runtime (v1.1) |
| تباين متصفحات في Shadow DOM + Print CSS | متَّحقَق منه | اختبارات happy-dom للـ WC؛ Print CSS standard |
| تعقيد DnD + Banded layout | حُلّ | HTML5 DnD بسيط، بدون deps إضافية (وفّر @dnd-kit) |
| RTL في Chart.js + PDF | حُلّ | `dir` يُحقن في chart spec؛ PDF auto-aligns عند RTL |
| تضخم Bundle | مرصود | Code-splitting يفصل المصدِّرات (4 chunks منفصلة) |

---

## [DELIVERED] — قائمة المخرجات النهائية

- ✅ 5 حزم منشورة في Monorepo (`shared`, `core`, `react`, `vue`, `playground`)
- ✅ 2 Web Components (`<reports-viewer>`, `<reports-builder>`) مسجلان تلقائياً
- ✅ 8 أنواع عناصر تقرير
- ✅ 7 شرائط (Bands) مع دعم Groups (header + footer)
- ✅ 5 Data Adapters + Registry
- ✅ 2 Storage Adapters (Callback + LocalStorage)
- ✅ 4 Exporters (PDF + Excel/CSV + PNG + Print)
- ✅ Chart Adapter (Chart.js, قابل للاستبدال)
- ✅ i18n عربي/إنجليزي + RTL/LTR صحيح في كل الطبقات
- ✅ Expression Evaluator (lexer/parser/tree-walk، آمن، No eval، MAX_OPS guard)
- ✅ Conditional Formatting (rules + style merge) — **محرر قواعد كامل في Builder (v0.2)**
- ✅ Page Breaks (HTML CSS + PDF explicit)
- ✅ Theme System (CSS variables `--rw-*`, `--rb-*`)
- ✅ 3 Built-in Templates
- ✅ Async non-blocking Logger مع 4 مستويات + redaction
- ✅ **Watermark (v0.2)**: text/image، نص ثابت أو expression محسوب، يُرسم على كل صفحة HTML + PDF
- ✅ **Builder Property Editor كامل (v0.2)**: Document (description/locale/dir) + Page (size/orientation/margins) + Watermark + كل خصائص العنصر (style مع font/underline/padding/border-4-sides + visibleWhen + conditional rules editor + per-kind props كاملة)
- ✅ **118 اختبار آلي**
- ✅ 2 أمثلة تكامل واقعية (Laravel Blade + Next.js App Router)
- ✅ Playground build جاهز للنشر

**نقطة الإقلاع التالية**: `pnpm playground` → http://127.0.0.1:5173

---

## [CHANGELOG]

### v0.4.0 — 2026-05-12 (Viewer zoom + section navigation)

**Surgical changes** (+3 اختبارات):

- **`reports-viewer.ts`**: مجموعة أدوات عرض — `zoom-out` / عرض النسبة / `zoom-in` / `fit-width` (CSS `zoom` عند الدعم، وإلا `transform: scale`)؛ تنقل **القسم السابق/التالي** مع تمرير سلس إلى كل `<section class="rw-section">` وعرض `i / n`؛ إخفاء المجموعة بـ **`hide-view-controls`**؛ إعادة رسم المخططات بعد تغيير التكبير.
- **`icons.ts`**: `zoomOut`, `zoomIn`, `fitWidth`, `sectionUp`, `sectionDown`.
- **`i18n/strings.ts`**: مفاتيح التكبير والأقسام (عربي/إنجليزي).
- **React `ReportViewer` + Vue `ReportViewer`**: تمرير prop **`hideViewControls`** إلى الـ WC.
- **`viewer-view-controls.test.ts`**.

### v0.3.1 — 2026-05-12 (Band properties in document panel)

**Surgical changes** (لا regression، +4 اختبارات):

- **`reports-builder.ts`**: داخل خصائص المستند (بدون عنصر محدد)، قسم **أقسام التقرير** يعرض كل شريط جذر (`reportHeader`, `pageHeader`, `detail`, `pageFooter`, `reportFooter`): الارتفاع (مم)، «فصل صفحة قبل/بعد»، وزر **إزالة القسم** للأشرطة الاختيارية؛ زر **تفعيل** عند غياب الشريط في المخطط.
- **مجموعات التقرير**: عند وجود `groups[]`، لوحة **التجميع** لكل مجموعة: حقل التجميع، إعادة ترقيم الصفحة، ورأس/تذييل المجموعة بنفس خصائص الشريط + إزالة/تفعيل.
- **`i18n/strings.ts`**: مفاتيح `reportBands`, `heightMm`, `pageBreakBefore`, `pageBreakAfter`, `reportGroups`, `groupByField`, `resetPageNumber`, `removeSection`.
- **`reports-builder-sections.test.ts`**: تغطية واجهة الأشرطة الجذرية والمجموعات.
- **عرض لوحة Properties (نفس الإصدار)**: شبكات `grid2`/`grid4` أصبحت عموداً واحداً داخل `form.props`، حقول بعرض 100٪ مع `min-width: 0`، لوحة يمنى `overflow-x: hidden` + `--rb-right-w: 320px` لتفادي التمرير الأفقي داخل الشريط الجانبي.

### v0.3.0 — 2026-05-12 (Toolbar UX)

**Surgical changes** (لا regression، 103 → 111 اختبار):

- **New `components/icons.ts`**: 16 SVG icon inline (save, json, print, pdf, excel, csv, image, trash, plus, close, chevronLeft/Right, panelLeft/Right, cog, eye, download) باستخدام `unsafeSVG`. Tree-shakable. لا تبعيات خارجية.
- **Viewer `reports-viewer.ts`**:
  - Toolbar أصبح أيقونات + نصوص.
  - Property جديد `actions: readonly ViewerAction[]` يحدد أزرار التصدير الظاهرة (`['print','pdf','excel','csv','image']` افتراضياً = `['print','pdf','excel','image']`).
  - كل زر يحمل `data-action` + `aria-label` + `title` للـ a11y.
- **Builder `reports-builder.ts`**:
  - Toolbar علوي جديد: `[toggle-left]` + name + `[Save]` + `[JSON]` + `[Customize ⚙]` + `[toggle-right]`. كلها أيقونية مع نصوص.
  - Property `actions: readonly BuilderAction[]` يضبط ما يظهر في الـ toolbar (`['save','json']` افتراضياً، `'preview'` متاح).
  - Customize menu قابل للفتح من cog button: checkboxes لتشغيل/إيقاف كل action.
  - أشرطة جانبية قابلة للطي عبر `_leftCollapsed/_rightCollapsed` state + `data-left-collapsed/data-right-collapsed` attrs + CSS variables `--rb-left-w/--rb-right-w`. حين تُطوى، تصبح rail 40px بأيقونة فقط.
  - `panel-head` جديد لكل aside مع title + collapse button (يحترم RTL: chevronRight في LTR، chevronLeft في RTL).
  - فصل `data-control` (chrome: toggle-left, toggle-right, customize) عن `data-action` (user-configurable: save, json, preview) — تصميم a11y نظيف.
  - حذف `<h3>panel-title</h3>` المكرر داخل `_renderProperties`/`_renderDocumentProperties`/`_renderToolboxContent` لأن `panel-head` يحمل العنوان.
- **i18n**: +3 مفاتيح (`hide`, `show`, `customize`) بالعربية والإنجليزية.

**ملفات جديدة**: `components/icons.ts`, `components/toolbar.test.ts` (8 اختبارات).
**ملفات يتيمة**: لا شيء — كل التعديلات داخل ملفات قائمة.

### v0.2.0 — 2026-05-12

**Surgical changes** (لا regression، 88 → 103 اختبار):

- **Schema**: إضافة `WatermarkSchema` (discriminated union) + `watermark?` على `ReportSchemaV1` (backward-compat).
- **Engine `interpreter.ts`**: تقييم watermark expression عبر `tryEvaluate` بسياق `{ meta, dataset, page }` + `aggregates`. تمرير `RenderWatermark` إلى `RenderTree`.
- **Engine `renderer-html.ts`**: overlay مركزي مائل مع `escapeHtml(text)` لمنع XSS.
- **Exporter `pdf.ts`**: `drawWatermark()` على كل صفحة جديدة (يدعم `text` فقط حالياً — `image` يُرسم في HTML ويُبلغ مستخدم PDF عبر warning مستقبلاً).
- **Builder `reports-builder.ts`**: `_renderProperties` → عند عدم وجود اختيار يعرض **Document + Page + Watermark**؛ عند وجود اختيار يعرض **TEXT/STYLE/BORDER/CONDITIONAL + kind-specific**. إضافة محرر قواعد `cond` كامل (add/remove/edit). إضافة خصائص مفقودة: font, underline, padding, border (4 sides + color), image alt/fit, line orientation/thickness/color, aggregate groupKey.
- **i18n**: 32 مفتاح جديد بالعربي والإنجليزي.

**ملفات يتيمة**: لا شيء — كل التعديلات داخل ملفات قائمة.
