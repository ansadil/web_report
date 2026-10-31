# تدقيق المرحلة 0 — `reports-web`

تاريخ التدقيق: 2026-10-31.  
النطاق: تدقيق فقط. لم يُعدَّل كود المكتبة.  
المنهج: لا يُعتمد `PROJECT_MAP.md` ولا `README.md` كدليل. كل بند أدناه إما نُفِّذ في هذه البيئة أو قُرئ من المصدر.

البيئة الفعلية:

| البند | القيمة |
|---|---|
| Node.js | **v22.23.4** (الخريطة تقول 20.20.0) |
| pnpm | **9.15.9** (مطابق للادعاء) |
| TypeScript المحلول | **5.9.3** |
| المتصفح | Google Chrome headless |
| أمر التثبيت | `pnpm install --frozen-lockfile` — نجح، 246 حزمة |

نسخ الحزم في `package.json` كلها **0.1.0**، وشارة الـ playground في `apps/playground/index.html` هي `v0.1.0`. لا يوجد وسم `v0.4.0` في الكود.

---

## 1. البناء، الأنواع، اللنت، والاختبارات

| الأمر | على شجرة نظيفة قبل `build` | بعد `pnpm build` |
|---|---|---|
| `pnpm install --frozen-lockfile` | exit 0 | — |
| `pnpm test:run` | **exit 1** | **exit 0** |
| `pnpm typecheck` | **exit 2** — 23 خطأ `Cannot find module '@reports-web/shared'` | **exit 0** |
| `pnpm lint` | exit 0، والنص: `None of the selected packages has a "lint" script` | نفسه |
| `pnpm build` | — | **exit 0** (`tsc` + حزمة `esbuild` لـ `render-code.js` بحجم 216.1KB + نسخ خطوط PDF) |
| `pnpm --filter @reports-web/playground build` | — | exit 0 مع تحذيرات (أدناه) |

لا يوجد ESLint ولا Biome ولا ملف إعداد lint. نجاح `pnpm lint` نجاح فارغ.

### الاختبارات قبل البناء

| الحزمة | النتيجة |
|---|---|
| `@reports-web/shared` | 1 ملف، **11** اختبارًا ناجحًا |
| `@reports-web/core` | 24 ملفًا، **140** اختبارًا ناجحًا |
| `@reports-web/react` | فشل تحميل الملف: `Failed to resolve entry for package "@reports-web/core"` لأن `exports` يشير إلى `dist/` غير الموجود |
| `@reports-web/vue` | نفس فشل الـ entry |

المجموع الذي اكتمل: **151** اختبارًا ناجحًا، ومجموعتان لم تُحمَّلا. هذا ليس «118 اختبارًا أخضر».

### الاختبارات بعد البناء

| الحزمة | ملفات | اختبارات |
|---|---:|---:|
| `@reports-web/shared` | 1 | 11 |
| `@reports-web/core` | 24 | 140 |
| `@reports-web/react` | 1 | 3 |
| `@reports-web/vue` | 1 | 3 |
| **المجموع** | **27** | **157** |

كلها ناجحة. السبب أن `tsc -p` مع `composite` project references لا يبني الاعتماد قبل أن يوجد `dist` الخاص بـ `@reports-web/shared`. سكربت `typecheck` هو `tsc --noEmit` وليس `tsc -b`، لذلك النوع والـ wrappers يعتمدان على ترتيب «ابنِ أولًا».

تحذيرات ظهرت أثناء الاختبار ولا تُفشل التشغيل: Lit dev mode، و`reports-viewer` / `reports-builder` يعيدان جدولة update بعد اكتمال update (`change-in-update`).

### حجم بناء الـ playground

`vite build` أنتج chunk واحدًا رئيسيًا:

| الملف | الحجم | gzip |
|---|---:|---:|
| `dist/assets/index-*.js` | **2,482.09 KB** | **935.17 KB** |
| `excel-*.js` | 2.11 KB | 1.11 KB |
| `print-*.js` | 2.21 KB | 1.09 KB |
| `image-*.js` | 13.70 KB | 5.39 KB |
| `NotoSansArabic-Regular-*.ttf` | 240.46 KB | — |
| `NotoSansArabic-Bold-*.ttf` | 248.47 KB | — |

لا يوجد chunk منفصل لـ PDF. Vite حذّر أن `pdf.js` و`render-code.js` مُستورَدان استاتيكيًا من الـ barrel (`exporters/index.js` و`adapters/code/index.js`) لذلك الـ dynamic `import()` داخل الـ Viewer **لا يفصلهما**. كما أُخرِج `node:module` و`node:fs/promises` لأن `pdf.ts` يستدعيهما داخل فرع Node.

الادعاء «playground ‏1.68MB و547KB gzip، وPDF chunk بحجم 4.7KB» غير مطابق.

---

## 2. جدول الادعاء مقابل الواقع

الحكم: **مطابق** = التحقق أكّده. **جزئي** = الكود أو الاختبار موجود والنتيجة أضعف من العلامة. **غير مطابق** = الادعاء يخالف ما نُفِّذ أو ما في المصدر. **لم يُختبر حيًا** = لم يُشغَّل ضد خدمة خارجية في هذه الجولة.

### الحالة والإصدار

| ادعاء `PROJECT_MAP.md` | الحكم | الواقع في 2026-10-31 |
|---|---|---|
| الحالة v0.4.0 بتاريخ 2026-05-12 | غير مطابق | كل `package.json` وشارة الـ playground على **0.1.0**. لا changelog مستقل عن الخريطة |
| 118 اختبارًا أخضر عبر 19 ملفًا و4 حزم | غير مطابق | **157 / 27** بعد البناء. قبل البناء تفشل حزمتا React وVue |
| M0 Foundations: install + build، وLogger ‏10 اختبارات | جزئي | install وbuild ناجحان. Logger فعلاً 10/10. typecheck على شجرة نظيفة يفشل |
| M1 Expression 14، Aggregator 6، Interpreter 6، Schema 6 | جزئي | Aggregator 6 وSchema 6 مطابقان. Expression **15**. Interpreter **8**. الاختبارات ناجحة |
| M2 `<reports-viewer>` مع toolbar وRTL وcharts | جزئي | يعمل في الـ playground: toolbar، zoom إلى 120٪، رسم Chart.js في الـ DOM، أرقام `ar-EG`. RTL في HTML صحيح. PDF عند `locale=ar` يكسر اللاتيني (القسم 4) |
| M3 خمسة Data Adapters + Registry، 13 اختبارًا | جزئي | 13 اختبار وحدة ناجحة (fetch مُحاكى). لم يُختبر REST/GraphQL/SQL-Proxy ضد خادم حي |
| M4 Builder: DnD + Properties + 8 أنواع + Save/Load | جزئي | DnD لأداة Text على شريط Detail نجح (18 عنصرًا ثم 19). لوحة الخصائص عدّلت القيمة إلى نص عربي، والحفظ في `localStorage` ثم إعادة التحميل أعاد القيمة. الأدوات في الواجهة **12** لا 8، لأنواع أكثر من القائمة (القسم 5) |
| M5 PDF متعدد الصفحات + Excel + CSV + PNG + Print، 3 اختبارات + roundtrip ‏5 | جزئي | الملفات تُنتج. PDF العربي الطويل خرج في **3 صفحات**. الاختبارات: exporters **4** لا 3، وroundtrip ‏5. الاختبار لا يفحص تشكيل الحروف ولا محتوى Excel. جودة المخرجات في القسم 4 و6 |
| M6 React + Vue = 6 اختبارات SSR | جزئي | 3+3 تنجح **بعد** البناء فقط. الاختبار يتحقق من وجود اسم الوسم في `renderToString`، لا من رسم تقرير على الخادم |
| M7 playground يُبنى 1.68MB، وأمثلة Laravel وNext | جزئي | البناء ينجح بحجم مختلف (القسم 1). الأمثلة قصاصات وليست تطبيقات قابلة للتشغيل (أدناه) |
| Page Break منفَّذ | جزئي | علم `pageBreakBefore` على `reportFooter` أنتج صفحة PDF ثالثة. HTML يضع `break-before`. لا يوجد محرك صفحات يعيد رأس المجموعة أو يحسب مجاميع الصفحة |
| Theme عبر `--rw-*` و`--rb-*` | مطابق | المتغيرات على `:host`، واختباران يفحصان وجود النص في CSS |
| Templates: blank / tabular / grouped و4 اختبارات | مطابق للاختبار | `TEMPLATES` ثلاثة قوالب و4 اختبارات ناجحة. الـ playground يستخدم تقارير `apps/playground/src/reports.ts` وليس معرض القوالب |
| Watermark نص/صورة | جزئي | النص يظهر في HTML بشكل صحيح (`مسودة`). PDF يرسم نص العلامة بنفس مسار الخط العربي المعطوب. صورة العلامة لا تُرسم في PDF (`drawWatermark` يتجاهل `kind === 'image'`) |
| محرر الخصائص الكامل | جزئي | اللوحة الحية تعرض Document / Page / margins / bands / groups / watermark / خصائص العنصر. لم يُنقَر كل حقل. `resetPageNumber` يُحفظ في المخطط ولا يُطبَّق في `interpret` |
| Toolbar أيقونات و16 SVG | جزئي | الأيقونات ظاهرة. الكود فيه أيقونات إضافية (undo / redo / zoom). الرقم 16 قديم |
| الألواح القابلة للطي | لم يُنقر في المتصفح | مغطى في `toolbar.test.ts` داخل happy-dom |
| `actions` قابلة للتخصيص | جزئي | الافتراضي الفعلي للـ Viewer هو `print, pdf, excel, image` **بدون** `csv`. الخريطة تناقض نفسها في سطر واحد (تذكر csv ثم تقول إن الافتراضي بدونه). CSV يعمل إذا استُدعي `exportTo('csv')` |
| خصائص الأشرطة في الـ Builder | جزئي | التسميات العربية ظاهرة (`فصل صفحة قبل القسم`، `حقل التجميع`). اختبار happy-dom يغيّر ارتفاع Detail |
| Zoom وتنقل الأقسام v0.4.0 | جزئي | Zoom-in أوصل النسبة إلى **120٪**. عينة Sales قصيرة فبقي العداد `1 / 1` ولم يغيّر «التالي» الصفحة. الاختبارات الحية 6 لا 3، وعنوانها أصبح page navigation لا section navigation فقط |

### الاختبارات كما تحصيها الخريطة

| ادعاء العدد | العدد الفعلي بعد البناء | ملاحظة |
|---|---:|---|
| shared `format.test.ts` ‏10 | **11** | |
| Logger 10 | 10 | مطابق |
| Schema 6 | 6 | مطابق |
| Watermark schema 8 | 8 | مطابق |
| Toolbar 8 | **22** | يغطي undo/redo وzoom واختصارات ونسخ ولصق وقائمة سياق |
| Builder sections 4 | 4 | مطابق |
| Viewer view controls 3 | **6** | |
| Expression 14 | **15** | |
| Aggregator 6 | 6 | مطابق |
| Interpreter 6 | **8** | |
| Watermark render 7 | 7 | اختبار PDF يتحقق من Blob لا من شكل الحرف |
| Data adapters 13 | 13 | مطابق |
| Exporters 3 | **4** | أُضيف اختبار عربي لا يفحص الـ glyphs |
| Roundtrip 5 | 5 | لا يفتح PDF ولا يقرأ خلايا Excel |
| Page break 3 | 3 | مطابق |
| Theme 2 | 2 | مطابق |
| Templates 4 | 4 | مطابق |
| React 3 / Vue 3 | 3 / 3 | بعد البناء فقط |
| ملفات غير مذكورة في الخريطة | **10 ملفات** | `render-code`, `code-elements`, `line-element`, `line-layout`, `markdown-html`, `renderer-visual-pages`, `rich-content`, `template-fields` |

### المكدس

| الادعاء | الحكم | الواقع |
|---|---|---|
| Node 20.20.0 هو بيئة التحقق | غير مطابق لهذه الجولة | التشغيل تم على 22.23.4. الحقل `engines` يسمح بـ `>=20.10.0` |
| TypeScript 5.9.3 | مطابق | |
| pnpm 9.15.9 | مطابق | |
| Vite 5.4.21 | مطابق | ظهر في سجل البناء |
| Lit 3.3.2 | مطابق | |
| Chart.js 4.5.1 | مطابق | مستورد استاتيكيًا من الـ Viewer |
| pdf-lib 1.17.1 | مطابق | ومعه `@pdf-lib/fontkit` 1.1.1 غير مذكور |
| ExcelJS 4.4.0 | مطابق | |
| html-to-image 1.11.13 | مطابق | |
| Zod 3.25.x | مطابق | 3.25.76 |
| React 18.3 peer، Vue 3.5 peer | جزئي | peer الفعلي: `react >=18` و`vue ^3.4`. مثال Next يصرّح React 19 |
| Vitest 2.1.9 وhappy-dom 15 | مطابق للاختبارات التي رُصدت | |
| لا Moment / Webpack / jQuery / lodash كاملًا | لم يُعثر عليها في dependencies المباشرة | exceljs قد يسحب تبعيات قديمة بشكل غير مباشر؛ لم يُفحَص القفل بالكامل |
| مكتبات غير مذكورة في الخريطة | موجودة | `bidi-js` 1.0.3، `naqqash` 0.2.0، `jsbarcode` 3.12.3، `qrcode` 1.5.4 |

### الرحلة المعمارية والمبادئ

| الادعاء | الحكم | الواقع |
|---|---|---|
| Viewer: Zod ثم Adapter ثم Aggregates ثم Interpreter ثم HTML ثم Shadow DOM ثم Chart ثم dynamic import للمصدّر | جزئي | هذا هو شكل `reports-viewer.ts`. التصدير الديناميكي يُلغى عمليًا لأن `index.ts` يعيد تصدير المصدّرات استاتيكيًا |
| Builder: 8 أنواع وDnD وSave وJSON | جزئي | `TOOL_KINDS` فيه 12 مدخلًا: text, field, html, markdown, image, chart, aggregate, expr, line, box, qr, barcode. html/markdown كلاهما `kind: 'richtext'` |
| `shared/` ثلاثة ملفات فقط وكلها مستعملة | مطابق | `types.ts`, `format.ts`, `result.ts` |
| حدود السياقات لا تتسرب | غير مطابق | `@reports-web/core` يصدّر الكل من `src/index.ts`: محرك + مكوّنان + adapters + exporters + templates + logger. الـ Builder ملف واحد **2710** سطرًا |
| Schema هو مصدر الحقيقة `ReportSchemaV1` | جزئي | Zod يرفض `version: '2'` ولا توجد دالة migration. أنواع جديدة أُضيفت داخل الإصدار `'1'` بلا سياسة توافق |
| Adapter Pattern صغير | جزئي | الواجهات صغيرة ومقروءة. SQL-Proxy يرسل `{ query, bindings }` من المتصفح؛ الأمان مسؤولية المضيف لكن الاسم يشجّع على إرسال SQL |
| CSS معزول بـ Shadow DOM | مطابق للمكوّنين | Lit يستخدم shadow root الافتراضي. CSS الـ playground نفسه عام، وهذا متوقع لتطبيق الاستضافة |
| Tree-shaking للمصدّرات | غير مطابق | قياس القسم 1. Chart.js داخل حزمة الـ Viewer دائمًا |
| Logger غير حاجب مع إخفاء أسرار و10 اختبارات | مطابق للمراجعة المصدرية | المفاتيح المذكورة في الخريطة موجودة في `logger.ts`. لم يُعد اختبار الإخفاء يدويًا خارج Vitest |
| Expression بلا `eval` وبلا `Function()` ومع `MAX_OPS` | مطابق للمصدر | لا يوجد `eval` ولا `new Function` في `expression.ts`. `MAX_OPS = 10000` |

### المخطط والـ API

| الادعاء | الحكم | الواقع |
|---|---|---|
| 8 أنواع عناصر | غير مطابق | الاتحاد فيه **11**: الأنواع الثمانية زائد `qr` و`barcode` و`richtext` |
| `groups[]` مع header/footer | جزئي | المخطط يقبل مصفوفة. `interpret` وExcel يستعملان **`groups[0]` فقط** |
| `aggregate.scope` يشمل `page` | غير مطابق سلوكيًا | الفرع في `interpreter.ts` يضع القيمة **0** لكل ما ليس `report` أو `group` |
| `resetPageNumber` | غير مطابق سلوكيًا | حقل في Zod وcheckbox في الـ Builder. لا قارئ له في المحرك أو PDF |
| تصدير الصور وQR وbarcode والـ chart إلى PDF | غير مطابق | PDF يرسم مستطيلًا ونص `[image]` / `[QR]` / `[barcode]`. الـ chart أعمدة خام لكل صف لا تجميعًا حسب التصنيف |
| سطح HTML في الخريطة | جزئي | العنصران موجودان. `actions` و`hide-view-controls` و`hide-page-boundaries` غير موثّقة في README |
| استيراد `@reports-web/builder-ui` من README | غير مطابق | الحزمة غير موجودة |
| React/Vue `ReportViewer` و`ReportBuilder` | جزئي | الغلافان رقيقان ويفوّتان `actions`. التسجيل يحمي نفسه بـ `customElements.get` |

### البوابات واليتامى والأمثلة

| الادعاء | الحكم | الواقع |
|---|---|---|
| `tsc --noEmit` بلا أخطاء دائمًا | غير مطابق لشجرة نظيفة | 23 خطأ قبل البناء، 0 بعده |
| اختبارات ≥ 50 والواقع 88 | غير مطابق | 157 بعد البناء، والرقم 88 قديم |
| Bundle الـ Viewer أقل من 200KB gzip | غير مُقاس كمدخل منفصل | مدخل الـ playground العام **935KB gzip** بلا PDF منفصل، زائد خطي TTF |
| تسرّب الذاكرة: `_destroyCharts` في `disconnectedCallback` | موجود في المصدر | لم يُقس تسربًا بأداة ذاكرة |
| `[ORPHANS & PENDING]` فارغ | غير مطابق | فجوات القسم 6 ما زالت مفتوحة، وبعضها مُعلَن كمنفَّذ |
| OP-03 Sub-reports مؤجّل | مطابق | لا nested reports في المحرك |
| OP-04 Conditional formatting منفَّذ | جزئي | القواعد تُطبَّق في الـ Viewer (مبالغ خضراء فوق العتبة ظاهرة في اللقطة). لا تغطية بصرية في PDF لمدى مطابقة اللون لكل قاعدة |
| OP-05 RBAC خارج النطاق | مطابق كقرار | لا طبقة صلاحيات، وهذا مقبول إذا بقي العقد كذلك |
| OP-07 Page break منفَّذ | جزئي | انظر أعلى |
| OP-01 SSR للتقارير الضخمة مؤجّل | مطابق | لا runtime على Node لترقيم عشرات آلاف الصفوف. غُلُف React/Vue ليست SSR للتقرير |
| أمثلة Laravel Blade وNext جاهزة للدمج | غير مطابق | Blade ملفات عرض + README. Livewire قصاصات نسخ. Next بلا `layout.tsx` وبلا `tsconfig` وبلا `next.config`. لا مثال Angular ولا Nuxt رغم هدف «أي مشروع» |
| RTL في Chart.js وPDF «حُلّ» | غير مطابق لـ PDF | `dir` يصل إلى Chart.js. PDF لا يحل العربية المختلطة (القسم 4) |
| خطر البطء فوق ~5K صف مرصود فقط | لم يُقس | لا حد فعلي في الكود يرفض التقرير؛ التعليق في الخريطة فقط |
| 5 حزم منشورة | غير مطابق | الحزم خاصة بالـ workspace (`private` على الجذر). لا `publishConfig` ولا `LICENSE` رغم `"license": "MIT"`. خطوط Noto داخل المستودع بلا ملف OFL |
| i18n عربي/إنجليزي صحيح في كل الطبقات | غير مطابق | واجهة الـ Viewer والـ HTML صحيحان. PDF وExcel ليسا كذلك (القسم 4) |
| 118 اختبارًا وplayground جاهز للنشر | غير مطابق | الأرقام والحجم في القسم 1 |

---

## 3. ما الذي فُحص في الـ playground

التشغيل: `pnpm playground` على `http://127.0.0.1:5173/`.

| السيناريو | النتيجة |
|---|---|
| Viewer بالإنجليزية، تقرير Sales by Region | يرسم الرأس والمجموعات الأربع والإجمالي. `canvas` للـ chart واحد في الـ DOM. الشاشة الأولى لا تُظهر الأعمدة لأنها تحت الطي |
| Zoom | الزر أوصل التسمية إلى 120٪ |
| تنقل الصفحات | العداد `1 / 1` لأن العينة أقصر من صفحة A4. الزر موجود ولا ينتقل |
| التبديل إلى العربية | `dir=rtl` على المستند وعلى الـ Viewer. أرقام الكميات والمبالغ تصبح أرقامًا عربية-هندية عبر `ar-EG`. نصوص القالب الإنجليزية تبقى إنجليزية لأن العينة لا تترجم `value` |
| PDF من شريط الـ Viewer بعد العربية | نجح، 234115 بايت، صفحة واحدة. اللاتيني مربعات مفقودة (القسم 4) |
| Excel | نجح، 7456 بايت، ملف xlsx صالح |
| CSV | نجح عبر `exportTo('csv')` رغم غياب الزر من الشريط. يبدأ بـ BOM `EF BB BF` ثم `Region` |
| PNG | نجح، 217330 بايت، حوالي 1588×2246. النص الإنجليزي والأرقام الهندية ظاهران. **لا بكسلات زرقاء للـ chart** في الثلث السفلي؛ `html-to-image` لم يلتقط `canvas` |
| Print | الحدث `export` بلا Blob، وظهرت رسالة «طُلبت print». لم يظهر حوار طباعة في Chrome headless، لذلك الحوار نفسه غير مؤكَّد بصريًا |
| Builder بالعربي | 5 أشرطة، 12 أداة، قائمة حقول، لوحة خصائص المستند |
| سحب Text إلى Detail | عبر أحداث السحب في Chrome: العدد من 18 إلى 19، وظهر عنصر `text Text` |
| تعديل القيمة إلى `نص عربي Audit` ثم Save | الحفظ أعاد المخطط وفيه النص. بعد إعادة تحميل الصفحة وفتح المحفوظ من الشريط الجانبي (`reports-web:<id>`) بقي النص |
| خصائص الأشرطة | عناوين «فصل صفحة قبل/بعد» و«حقل التجميع» ظاهرة. لم يُؤكد تبديل الـ checkbox بقراءة المخطط في هذه الجولة |
| Undo في المتصفح | لم يُنقَر. الأزرار والكومة موجودان في المصدر، واختبار happy-dom يغطيهما |

لقطات هذه الجولة محفوظة كآثار تشغيل وليست داخل Git: `playground_viewer_en.png`, `playground_viewer_ar.png`, `playground_viewer_zoomed.png`, `playground_builder_ar.png`, `playground_builder_property_edit.png`, `playground_builder_reloaded.png`, `playground_export_png.png`, `playground_pdf_page1.png`.

---

## 4. العربية و RTL — الحكم على الفرضية

بُني تقرير من 48 صفًا: عنوان عربي، سطر مختلط `Invoice فاتورة — Reports Web — فرع الرياض`، أرقام عربية-هندية `١٠/٠١/٢٠٢٦` و`١٬٢٣٤٫٥٠`، جدول متكرر مع تجميع، و`pageBreakBefore` على تذييل التقرير.

الملفات: `arabic_report.pdf` (241335 بايت، **3 صفحات**)، `arabic_report.xlsx` (9216 بايت)، `arabic_report.csv`، `arabic_html_preview.png`، `arabic_pdf_page1.png` … `arabic_pdf_page3.png`.

### الفرضية

«`pdf-lib` لا يشكّل العربية ولا يطبّق bidi، إذن PDF العربي مكسور.»

**الحكم: الفرضية صحيحة على مكتبة `pdf-lib` نفسها، وخاطئة كوصف وحيد للكود الحالي، والنتيجة العملية ما زالت PDF غير صالح للعربية المختلطة.**

`pdf-lib` يرسم glyphs من اليسار إلى اليمين ولا يشغّل OpenType Arabic. المشروع لفّ ذلك في `packages/core/src/exporters/pdf.ts`:

1. `naqqash` يحوّل الحروف إلى Arabic Presentation Forms (مثال العنوان يبدأ بـ `U+FE97`).
2. `bidi-js` يعيد ترتيب السلسلة.
3. عند وجود أي حرف عربي **أو** `locale === 'ar'` يُستبدَل Helvetica بملف `NotoSansArabic` عبر fontkit، مع `subset: false`.

هذا ليس «لا معالجة». المعالجة لا تكفي:

| الفحص | HTML في المتصفح | PDF |
|---|---|---|
| عنوان `تقرير المبيعات الشهري` | متصل وبالترتيب الطبيعي | اللقطة لا تطابق تشكيل المتصفح؛ النص مرمَّز كـ presentation forms لا كمخرج `font.layout()` |
| سطر مختلط عربي/إنجليزي | `Invoice` و`Reports Web` ظاهران | cmap الخط لا يحتوي Basic Latin ولا `U+2014` ولا `/`. الحروف اللاتينية `.notdef`. في تصدير الـ playground بعد `locale=ar` تحوّل `Sales by Region` إلى مربعات، وبقي الرقم `2026` |
| الأرقام الهندية | صحيحة في المعاينة (`٣٠٦٫٠٠`، `١٠/٠١/٢٠٢٦`) | الأرقام الهندية موجودة في استخراج النص. الشرطة المائلة في التاريخ `.notdef` فظهرت فواصل تالفة |
| علامة مائية `مسودة` | ظاهرة ومائلة ومقروءة | تُرسم بنفس مسار التشكيل الضعيف |
| ترتيب الصفحة | اتجاه RTL صحيح (عمود المنتج يمينًا) | محاذاة RTL للإطارات موجودة في الكود؛ جودة الحرف لا تجعل ذلك كافيًا |

اختبار `embeds Arabic / Eastern Arabic numerals without WinAnsi errors` يتأكد فقط أن الـ Blob أكبر من 2000 بايت ويبدأ بـ `%PDF`. هذا يتجنب خطأ WinAnsi ولا يثبت الربط ولا الترتيب ولا النص المختلط.

سبب تقني مباشر: `Noto Sans Arabic` خط عربي بلا لاتيني. اختياره لكل تقرير `locale=ar` يحذف الإنجليزية حتى لو كانت بيانات المنتج لاتينية. `font.layout()` على نفس الملف ينتج glyphs سياقية (`uni064A` …) مختلفة عن سلسلة `naqqash`. المسار الحالي لا يستعمل ذلك الـ layout.

### Excel و CSV

| الفحص | النتيجة |
|---|---|
| نص عربي في الخلايا | مخزَّن بالترتيب المنطقي: `تقرير المبيعات الشهري`، `حاسوب محمول 1`، `Mixed بند 1 / Item`. Excel نفسه يشكّل هذا بشكل صحيح |
| `views[0].rightToLeft` | **true** |
| أرقام عربية-هندية | **لا**. القيم أعداد JS (`25`, `262`). التنسيق `#,##0.00` على خلية الإجمالي فقط |
| مطابقة تخطيط المصمم | **لا**. المصدّر يفرغ `fields[]` كجدول. رؤوس المجموعات نص `category: الأجهزة`. كلمة الإجمالي الإنجليزية ثابتة: `TOTAL` |
| عمود الإجمالي | **منزاحة**. صف البيانات يضع `amount` في العمود 7. صف `Σ` وصف `TOTAL` يضعان 5889 و14820 في **العمود 8** (`excel.ts`: البادئة `Σ`، و`getCell(fieldIdx + 2)`) |
| CSV | BOM ثم ترويسات عربية منطقية. مناسب كنص، وليس تقريرًا منسقًا |

---

## 5. الحدود والحزم والـ API

ما يعمل ويستحق الإبقاء:

- Web Components بـ Lit مع Shadow DOM، وموضوع عبر متغيرات على `:host`.
- مخطط Zod واحد، ومُفسِّر نطاقات، ومُقيِّم تعبيرات بلا `eval`.
- Viewer HTML يرسم RTL ويجمع المستوى الأول من `groups` ويطبّق تنسيقًا شرطيًا بسيطًا.
- غُلُف React وVue رقيقة وواضحة.
- مسارات adapter صغيرة وسهلة الاستبدال.

ما يمنع الاستخدام كمكتبة تُدمج في أي مضيف:

1. **مدخل واحد سمين.** `export *` من `src/index.ts` يسحب الـ Builder والـ Viewer وChart.js وExcelJS وpdf-lib وخطوط TTF. حزم `./viewer` و`./builder` موجودة في `exports` لكن الـ playground والتوثيق يستوردان الجذر.
2. **ESM فقط.** لا شرط `require`، ولا `sideEffects`، ولا `types` منفصل عن حاجة البناء المسبق. المستهلك الذي يشغّل Vitest على المصدر يفشل حتى يُبنى `dist`.
3. **تبعيات ثقيلة ليست اختيارية.** `lit` و`chart.js` و`exceljs` و`pdf-lib` و`zod` و`jsbarcode` و`qrcode` كلها `dependencies`. المضيف لا يستطيع إسقاط PDF أو Excel.
4. **البناء ليس `tsc` نقيًا.** `render-code.js` يُستبدل بحزمة esbuild، والخطوط تُنسخ بسكربت. نسيان إحدى الخطوتين ينتج PDF بلا خط أو QR مكسور.
5. **لا CI ولا lint ولا `LICENSE`.**
6. **التوثيق يكذب بالنسخة والعدد واسم حزمة `@reports-web/builder-ui`.**
7. **الأمثلة لا تُشغَّل.** Next بلا `app/layout.tsx` وبلا إعداد Next. Laravel وصف لا مشروع. لا Angular ولا Nuxt.
8. **الـ Builder ملف إله.** 2710 سطرًا تجمع اللوحة والسحب والتاريخ والخصائص والقوائم. الاختبارات تغطي سلوكًا كثيرًا داخل happy-dom، وهذا جيد، لكنه لا يعوّض حدود الحزم.
9. **لا ترحيل مخطط.** الإصدار حرفي `'1'`. إضافة `qr` داخل نفس الرقم تعني أن عميلًا قديمًا يرى `kind` لا يعرفه ويفشل `safeParse`، بلا مسار upgrade.
10. **HTML غني بلا تعقيم.** `richtext` في وضع `html` يُحقن عبر `unsafeHTML` بعد استبدال الحقول. Markdown يُهرَّب. مخطط من مستخدم غير موثوق هو XSS داخل الـ shadow root.
11. **غُلُف الإطارات لا تمرّر `actions`.** ولا يوجد غلاف Angular.

`ReportSchemaV1` كعقد داخلي مفهوم، وكعقد عام غير منضبط: حقول واجهة بلا سلوك (`scope: 'page'`, `resetPageNumber`, مجموعات بعد الأولى)، وسلوك بلا توثيق في الخريطة (`undo`, `richtext`, `qr`).

---

## 6. فجوات مصمم التقارير

| القدرة | الحالة |
|---|---|
| Barcode / QR | في المخطط والـ toolbox والـ Viewer (data URL). PDF عنصر نائب |
| جدول / crosstab | لا شبكة جدولية ولا pivot. التخطيط مطلق بالمليمتر، والصف تكرار لشريط Detail |
| Sub-reports | غير موجودة، ومُعلَنة كمؤجلة. هذا الجزء من الخريطة صادق |
| Parameters UI | `dataset.params` حقل حر بلا نموذج للمستخدم النهائي |
| Undo / redo | **موجود** (كومة حتى 100، Ctrl+Z / Ctrl+Y، واختبار وحدة). ليس فجوة غياب؛ ينقصه اختبار متصفح وتاريخ يغطي السحب المستمر |
| SSR / ترقيم تقارير كبيرة | غير موجود. كل الصفوف تُفسَّر في المتصفح دفعة واحدة |
| ترويسات صفحات متكررة في HTML | `pageHeader` قسم واحد في الشجرة. `chunkSectionsForVisualPages` لا يعيد رسمه على كل ورقة. PDF يعيد رسمه بإحداثيات ثابتة، فيظهر حتى على صفحة الإجمالي |
| `{page}` | PDF يستبدل النص المطابق تمامًا `{page}` أو `{صفحة}`. HTML والـ PNG يعرضان الحرفي `Page {page}` |
| مجاميع الصفحة | دائمًا 0. في صفحة الإجمالي العربية ظهر `٠` بجانب «عدّ الصفحة» |
| مجموعات متداخلة | تُتجاهل بعد الأولى |
| إعادة ترقيم الصفحات لكل مجموعة | واجهة فقط |
| Chart حسب فئة | الـ chart في تذييل Sales يرسم **عمودًا لكل صف** (حوالي 12) لا أربعة أعمدة للمناطق. PDF يعيد رسم تلك القيم كمستطيلات لا كـ Chart.js |
| صور في PDF | عنصر نائب |
| علامة مائية صورية في PDF | تُهمل |
| خط عربي يغطي العربية واللاتيني | غير موجود |
| تعقيم HTML، ومعاملات، وصلاحيات | انظر أعلاه. RBAC مؤجَّل بقرار صريح ويمكن أن يبقى كذلك |

---

## 7. الأخطاء والفجوات حسب الشدة

### حرجة

1. **PDF غير صالح للنص المختلط وللتقرير ذي `locale=ar`.** خط عربي بلا Latin، وتشكيل presentation forms بدل OpenType، واختبار لا يرى ذلك. HTML نفسه سليم، فالمستخدم يرى معاينة صحيحة ثم يصدّر ملفًا مختلفًا.
2. **المكتبة لا تُستهلك كما يصف التوثيق.** نسخة 0.1.0 مقابل ادعاء 0.4.0، و`typecheck` واختبارات الأغلفة تفشل قبل البناء، و`lint` لا يفحص شيئًا، والمدخل العام 935KB gzip، وREADME يشير إلى حزمة غير موجودة.
3. **المصدّرات لا تمثّل التقرير.** Excel جدول منزاح الإجمالي وبكلمة `TOTAL`. PNG يسقط الـ canvas. PDF يسقط الصورة وQR وbarcode ويرسم chartًا غير مُجمَّع. `{page}` يبقى حرفيًا في المعاينة.

### عالية

4. **`groups[0]` فقط** بينما المخطط والواجهة يوحيان بتعدد المجموعات.
5. **`scope: 'page'` يعيد 0** و`resetPageNumber` لا يؤثر.
6. **ترويسة الصفحة في HTML لا تتكرر** كنموذج شريط حقيقي؛ التقسيم بصري على الارتفاع فقط.
7. **لا CI ولا رخصة ولا سياسة نشر.** الخط مضمّن بلا ملف ترخيص OFL بجانب الـ TTF.
8. **`richtext` HTML بلا تعقيم** داخل مكوّن يُدمج في مواقع المضيف.
9. **الـ Builder كتلة واحدة 2710 سطرًا** مع تحذير Lit بإعادة جدولة التحديث.

### متوسطة

10. لا ترحيل لمخطط الإصدار `'1'` مع أنواع أُضيفت بصمت (`qr`, `barcode`, `richtext`).
11. SQL-Proxy يسمي الحقل `query` ويرسله من المتصفح.
12. أغلفة React/Vue لا تمرر `actions`، ولا يوجد Angular، وأمثلة Next وLaravel غير قابلة للتشغيل كما هي.
13. CSV مخفي عن الشريط الافتراضي رغم وجود المصدّر.
14. صورة العلامة المائية والصور العامة غائبة عن PDF بلا خطأ للمستخدم.
15. الاختبارات لا تقارن صورة PDF ولا خلية Excel بنتيجة متوقعة؛ الباب الأخضر لا يحمي regressions البصرية.

### منخفضة

16. شارة playground `v0.1.0` بينما الخريطة تتحدث عن 0.4.0 — العرض أصدق من الخريطة، وكلاهما بلا مصدر واحد للنسخة.
17. تحذيرات Lit dev mode و`change-in-update`.
18. تعبير `str(today())` في PDF العربي يخلط تاريخًا إنجليزيًا طويلًا مع حروف ناقصة، فيصبح سطر الطباعة غير مقروء.
19. الخريطة تسرد ميزات أقدم من الكود (لا تذكر undo ولا QR) وأحدث مما يثبته التشغيل (v0.4.0 مكتمل).

---

## 8. التوصية

**إعادة هيكلة الحزم مع الإبقاء على المحرك والمخطط والاختبارات. ليست إعادة كتابة من الصفر، وليست ترقيعًا داخل الحدود الحالية فقط.**

إعادة الكتابة من الصفر تضيّع ما ثبت أنه يعمل: Viewer HTML، RTL في المتصفح، المُقيِّم، المجاميع من المستوى الأول، الـ DnD، والحفظ، و157 اختبارًا. الترقيع داخل `@reports-web/core` لا ينتج مكتبة تُدمج في HTML أو Vue أو React أو Laravel: المدخل الواحد وملف الـ Builder وحزمة المصدّرات الاستاتيكية هي شكل المنتج لا تفصيلة داخلية.

الهدف المقترح:

```text
packages/
  schema/                 @reports-web/schema
    src/v1.ts             ReportSchemaV1 كما هو، مع freeze
    src/migrate.ts        مدخل الترحيل حتى لو كان no-op موثّقًا
  engine/                 @reports-web/engine
    interpreter, aggregator, expression, render-model
    بلا DOM وبلا pdf-lib وبلا chart.js
  viewer/                 @reports-web/viewer
    reports-viewer.ts     Lit، peer: lit
    chart adapter اختياري عبر حقن، لا استيراد Chart.js من الجذر
  builder/                @reports-web/builder
    canvas/  toolbox/  properties/  history/  commands/
    peer: lit
  export-pdf/             اختياري. peer: pdf-lib, @pdf-lib/fontkit
  export-xlsx/            اختياري. peer: exceljs
  export-image/           اختياري. peer: html-to-image
  react/                  peer: react, react-dom
  vue/                    peer: vue
  shared/                 types + format فقط
apps/
  playground/             يستورد viewer وbuilder والمصدّرات التي يريدها صراحة
examples/
  html/  react-next/  vue-nuxt/  laravel/     تطبيقات تُبنى في CI أو تُعلَّم كـ snippets بلا ادعاء التشغيل
```

عقد عام صغير: `ReportSchema`، `DataAdapter`، `StorageAdapter`، `ChartAdapter`، عنصر `reports-viewer`، عنصر `reports-builder`، ودوال `exportPdf` / `exportExcel` من مداخلها لا من برميل واحد. `sideEffects` يصرّح بتسجيل الـ custom elements فقط. شرط `import` و`require` أو قرار صريح «ESM only» مكتوب في README بعد ما يصبح صحيحًا.

إصلاح PDF يبقى داخل `export-pdf`: تشغيل `font.layout` (أو HarfBuzz) على خط يغطي العربية **واللاتيني** (Noto Naskh Arabic أو زوج Noto Sans + Noto Sans Arabic مع تقسيم الـ runs)، وإثبات ذلك بلقطة وصفحة نص لا بحجم الـ Blob.

---

## 9. خطة إعادة البناء حسب الدور

المراحل متسلسلة حيث يعتمد اللاحق على عقد السابق. لا تقدير زمني.

### المرحلة أ — Lead / packaging

- تجميد عقد عام مكتوب من الرموز المصدَّرة فعلًا، وحذف `@reports-web/builder-ui` من README.
- رفع النسخة في مكان واحد. إيقاف اعتبار `PROJECT_MAP.md` مصدر حقيقة حتى يُولَّد من الكود أو يُختصر إلى قرار معماري.
- تقسيم الحزم كما في القسم 8 دون تغيير سلوك الـ Viewer HTML في نفس المرحلة.
- `tsc -b` للأنواع حتى ينجح `typecheck` على شجرة نظيفة. جعل اختبارات React/Vue تستورد المصدر عبر alias في Vitest حتى لا تعتمد على `dist`.
- `exports` مع `types`، و`sideEffects`، و`files`، و`LICENSE`، وملف OFL بجانب الخطوط إن بقيت موزَّعة.
- تبعيات اختيارية: Chart وPDF وExcel وQR لا تدخل مدخل الـ Viewer الافتراضي.
- CI: `pnpm install --frozen-lockfile` ثم typecheck ثم test ثم build الـ playground، ويفشل إذا غاب سكربت lint بعد إضافته (ESLint أو Biome على `packages`).
- قرار ESM-only أو إضافة CJS. اليوم الواقع ESM فقط ويجب أن يقوله التوثيق بعد إصلاح الـ exports لا قبله.

### المرحلة ب — Data and export

- مسار نص PDF جديد مع خط ثنائي التغطية، وقياس على التقرير العربي الموجود: عنوان متصل، سطر مختلط مقروء، تاريخ `١٠/٠١/٢٠٢٦` بشرطة مائلة، جدول 48 صفًا، ثلاث صفحات.
- تكرار `pageHeader` / `pageFooter` في نموذج الصفحات المستهلَك من HTML وPDF معًا، واستبدال `{page}` في HTML.
- تنفيذ `scope: 'page'` أو حذفه من المخطط والواجهة. تنفيذ `resetPageNumber` أو حذفه. حلقة على كل `groups[]` أو رفض المصفوفة الأطول من 1 في Zod.
- Chart: تجميع حسب `labelsField` قبل الرسم. PNG يحوّل `canvas` إلى صورة قبل الالتقاط. PDF إما يضمّن تلك الصورة أو يرفض العنصر برسالة، لا بمستطيل صامت. نفس القاعدة للصورة وQR وbarcode والعلامة المائية الصورية.
- Excel: إما مصدّر جدولي موثّق (ويُصلَح عمود الإجمالي وتُترجم `TOTAL`) أو محاولة لتخطيط الأعمدة من مواضع العناصر. الأرقام تبقى أعدادًا مع `numFmt`، والنص العربي المنطقي يبقى كما هو لأنه صحيح.
- حد واضح للصفوف في المتصفح وخطأ يمكن للمضيف التقاطه، إلى أن يوجد runtime خادمي.

### المرحلة ج — Frontend / designer

- تفتيت `reports-builder.ts` إلى أوامر (إضافة عنصر، تحريك، خصائص، تاريخ) مع بقاء الاختبارات الحالية خضراء.
- إبقاء undo/redo وربطه بكل أمر ينتج عن السحب، لا عن النقرة فقط.
- لوحة معاملات للمستخدم النهائي فوق `dataset.params`، منفصلة عن مصمم الحقول.
- قرار crosstab: نوع عنصر جديد في المخطط، أو إعلان أنه خارج الإصدار. لا checkbox ميت آخر.
- QR/barcode جاهزان في الـ Viewer؛ العمل المتبقي تصديرهما (المرحلة ب) وخصائصهما الموجودة أصلًا.
- تعقيم HTML للـ `richtext` (قائمة وسوم) قبل `unsafeHTML`.
- تمرير `actions` و`hideViewControls` من React وVue كما هي على العنصر. غلاف Angular لاحقًا إن بقي هدف «أي مضيف» حرفيًا؛ Web Component يكفي لمضيف Angular إلى أن يُطلب غلاف.
- جعل الأمثلة تُبنى: Next مع `layout` وإعداد، وصفحة HTML واحدة بلا إطار، وNuxt عندما يستقر مدخل Vue.

### المرحلة د — QA

- إبقاء اختبارات الوحدة الحالية ونقلها مع الحزم.
- إضافة إثباتات فاشلة اليوم عن قصد حتى تُصلح: PDF العربي يحتوي glyphs اللاتيني `Invoice` ولا يحتوي سلسلة `.notdef` للنص المختلط؛ خلية Excel للإجمالي في عمود المبلغ؛ `{page}` غير ظاهر حرفيًا في HTML؛ `scope:page` ليس 0 على تقرير من صفحتين؛ المجموعة الثانية تغيّر الشجرة أو يرفضها Zod.
- مقارنة بصرية: لقطة HTML ولقطة PDF لنفس التقرير العربي في CI (العتبة على النص المستخرج لا على الصورة كاملة فقط).
- مسار متصفح قصير للـ playground: تبديل AR، تصدير PDF/Excel/PNG، سحب أداة، حفظ وإعادة فتح. happy-dom لا يرى الخط ولا الـ canvas.
- عدم رفع العدد في التوثيق يدويًا. طباعة الملخص من Vitest.

### ترتيب الاعتماد

Lead يقفل الحدود والعقد أولًا حتى لا تُصلح PDF داخل ملف سيُنقل. Data/export يصلح المصدّرات والعقد الكاذبة في المخطط. Frontend يفتّت المصمم على العقد الجديد. QA يقفل كل مرحلة باختبار كان أحمر.

---

## 10. آثار هذه الجولة

ليست جزءًا من commit المستودع. أُنتجت أثناء التدقيق:

| الملف | ماذا يثبت |
|---|---|
| `arabic_report.pdf` / `arabic_pdf_page1.png` … `page3.png` | PDF عربي طويل من 3 صفحات ونص مختلط تالف |
| `arabic_html_preview.png` | نفس التقرير في HTML: عربي متصل ومختلط صحيح |
| `arabic_report.xlsx` / `arabic_report.csv` | Excel منطقي مع RTL وعمود إجمالي منزاح؛ CSV نصي |
| `arabic_glyph_report.json` | code points لـ naqqash وglyphs الناقصة في Noto Sans Arabic |
| `playground_viewer_ar.png` / `playground_viewer_en.png` / `playground_viewer_zoomed.png` | Viewer حي، RTL، zoom |
| `playground_builder_ar.png` / `playground_builder_property_edit.png` / `playground_builder_reloaded.png` | Builder، تعديل خاصية، حفظ |
| `playground_export_pdf.pdf` / `playground_pdf_page1.png` | تصدير المتصفح بعد العربية: لاتيني مفقود |
| `playground_export_excel.xlsx` / `playground_export_csv.csv` / `playground_export_png.png` | بقية المصدّرات؛ PNG بلا أعمدة chart |
| `playground_audit_log.json` | سجل أرقام الجولة (أحجام الـ Blob وأحداث التصدير) |
