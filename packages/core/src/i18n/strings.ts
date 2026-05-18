import type { Locale } from '@reports-web/shared';

type StringKey =
  | 'export'
  | 'print'
  | 'pdf'
  | 'excel'
  | 'image'
  | 'loading'
  | 'error'
  | 'noData'
  | 'fields'
  | 'toolbox'
  | 'properties'
  | 'preview'
  | 'actions'
  | 'save'
  | 'delete'
  | 'undo'
  | 'redo'
  | 'page'
  | 'reportHeader'
  | 'pageHeader'
  | 'groupHeader'
  | 'detail'
  | 'groupFooter'
  | 'pageFooter'
  | 'reportFooter'
  | 'text'
  | 'field'
  | 'chart'
  | 'expression'
  | 'aggregate'
  | 'line'
  | 'box'
  | 'qr'
  | 'barcode'
  | 'html'
  | 'markdown'
  | 'content'
  | 'fieldPlaceholderHint'
  | 'value'
  | 'errorCorrection'
  | 'symbology'
  | 'displayValue'
  | 'document'
  | 'watermark'
  | 'style'
  | 'enable'
  | 'none'
  | 'paperSize'
  | 'orientation'
  | 'portrait'
  | 'landscape'
  | 'margins'
  | 'top'
  | 'right'
  | 'bottom'
  | 'left'
  | 'color'
  | 'background'
  | 'fontFamily'
  | 'fontSize'
  | 'bold'
  | 'italic'
  | 'underline'
  | 'align'
  | 'padding'
  | 'border'
  | 'thickness'
  | 'opacity'
  | 'rotation'
  | 'src'
  | 'alt'
  | 'fit'
  | 'visibleWhen'
  | 'conditional'
  | 'addRule'
  | 'when'
  | 'description'
  | 'locale'
  | 'direction'
  | 'hide'
  | 'show'
  | 'customize'
  | 'reportBands'
  | 'heightMm'
  | 'pageBreakBefore'
  | 'pageBreakAfter'
  | 'reportGroups'
  | 'groupByField'
  | 'resetPageNumber'
  | 'removeSection'
  | 'zoomOut'
  | 'zoomIn'
  | 'zoomReset'
  | 'fitWidth'
  | 'prevSection'
  | 'nextSection'
  | 'prevPage'
  | 'nextPage'
  | 'multiSelectionHint'
  | 'cut'
  | 'copy'
  | 'paste'
  | 'bringToFront'
  | 'bringForward'
  | 'sendToBack'
  | 'sendBackward';

const en: Record<StringKey, string> = {
  export: 'Export',
  print: 'Print',
  pdf: 'PDF',
  excel: 'Excel',
  image: 'Image',
  loading: 'Loading…',
  error: 'Error',
  noData: 'No data',
  fields: 'Fields',
  toolbox: 'Toolbox',
  properties: 'Properties',
  preview: 'Preview',
  actions: 'Actions',
  save: 'Save',
  delete: 'Delete',
  undo: 'Undo',
  redo: 'Redo',
  page: 'Page',
  reportHeader: 'Report Header',
  pageHeader: 'Page Header',
  groupHeader: 'Group Header',
  detail: 'Detail',
  groupFooter: 'Group Footer',
  pageFooter: 'Page Footer',
  reportFooter: 'Report Footer',
  text: 'Text',
  field: 'Field',
  chart: 'Chart',
  expression: 'Expression',
  aggregate: 'Aggregate',
  line: 'Line',
  box: 'Box',
  qr: 'QR code',
  barcode: 'Barcode',
  html: 'HTML',
  markdown: 'Markdown',
  content: 'Content',
  fieldPlaceholderHint: 'Use <fieldName> to insert row values (e.g. <amount>).',
  value: 'Value',
  errorCorrection: 'Error correction',
  symbology: 'Symbology',
  displayValue: 'Show text',
  document: 'Document',
  watermark: 'Watermark',
  style: 'Style',
  enable: 'Enable',
  none: 'None',
  paperSize: 'Paper Size',
  orientation: 'Orientation',
  portrait: 'Portrait',
  landscape: 'Landscape',
  margins: 'Margins',
  top: 'Top',
  right: 'Right',
  bottom: 'Bottom',
  left: 'Left',
  color: 'Color',
  background: 'Background',
  fontFamily: 'Font Family',
  fontSize: 'Font Size',
  bold: 'Bold',
  italic: 'Italic',
  underline: 'Underline',
  align: 'Align',
  padding: 'Padding',
  border: 'Border',
  thickness: 'Thickness',
  opacity: 'Opacity',
  rotation: 'Rotation',
  src: 'Source',
  alt: 'Alt Text',
  fit: 'Fit',
  visibleWhen: 'Visible When',
  conditional: 'Conditional Formatting',
  addRule: 'Add Rule',
  when: 'When',
  description: 'Description',
  locale: 'Locale',
  direction: 'Direction',
  hide: 'Hide',
  show: 'Show',
  customize: 'Customize',
  reportBands: 'Report bands',
  heightMm: 'Height (mm)',
  pageBreakBefore: 'Page break before',
  pageBreakAfter: 'Page break after',
  reportGroups: 'Grouping',
  groupByField: 'Group by field',
  resetPageNumber: 'Reset page number per group',
  removeSection: 'Remove band',
  zoomOut: 'Zoom out',
  zoomIn: 'Zoom in',
  zoomReset: 'Actual size',
  fitWidth: 'Fit width',
  prevSection: 'Previous section',
  nextSection: 'Next section',
  prevPage: 'Previous page',
  nextPage: 'Next page',
  multiSelectionHint:
    'Drag to move together. Arrow keys nudge position (Shift = 5 mm). Ctrl/Cmd+click toggles; Shift+click selects a range.',
  cut: 'Cut',
  copy: 'Copy',
  paste: 'Paste',
  bringToFront: 'Bring to front',
  bringForward: 'Bring forward',
  sendToBack: 'Send to back',
  sendBackward: 'Send backward',
};

const ar: Record<StringKey, string> = {
  export: 'تصدير',
  print: 'طباعة',
  pdf: 'PDF',
  excel: 'Excel',
  image: 'صورة',
  loading: 'جارٍ التحميل…',
  error: 'خطأ',
  noData: 'لا توجد بيانات',
  fields: 'الحقول',
  toolbox: 'الأدوات',
  properties: 'الخصائص',
  preview: 'معاينة',
  actions: 'الإجراءات',
  save: 'حفظ',
  delete: 'حذف',
  undo: 'تراجع',
  redo: 'إعادة',
  page: 'الصفحة',
  reportHeader: 'رأس التقرير',
  pageHeader: 'رأس الصفحة',
  groupHeader: 'رأس المجموعة',
  detail: 'التفصيل',
  groupFooter: 'تذييل المجموعة',
  pageFooter: 'تذييل الصفحة',
  reportFooter: 'تذييل التقرير',
  text: 'نص',
  field: 'حقل',
  chart: 'رسم بياني',
  expression: 'تعبير',
  aggregate: 'تجميع',
  line: 'خط',
  box: 'إطار',
  qr: 'رمز QR',
  barcode: 'باركود',
  html: 'HTML',
  markdown: 'Markdown',
  content: 'المحتوى',
  fieldPlaceholderHint: 'استخدم <اسم_الحقل> لإدراج قيم الصف (مثل <amount>).',
  value: 'القيمة',
  errorCorrection: 'تصحيح الخطأ',
  symbology: 'نوع الباركود',
  displayValue: 'إظهار النص',
  document: 'المستند',
  watermark: 'علامة مائية',
  style: 'النمط',
  enable: 'تفعيل',
  none: 'بدون',
  paperSize: 'حجم الورق',
  orientation: 'الاتجاه',
  portrait: 'طولي',
  landscape: 'عرضي',
  margins: 'الهوامش',
  top: 'أعلى',
  right: 'يمين',
  bottom: 'أسفل',
  left: 'يسار',
  color: 'اللون',
  background: 'الخلفية',
  fontFamily: 'نوع الخط',
  fontSize: 'حجم الخط',
  bold: 'عريض',
  italic: 'مائل',
  underline: 'تسطير',
  align: 'محاذاة',
  padding: 'حشو',
  border: 'إطار',
  thickness: 'سُمك',
  opacity: 'الشفافية',
  rotation: 'التدوير',
  src: 'المصدر',
  alt: 'نص بديل',
  fit: 'الاحتواء',
  visibleWhen: 'يظهر عندما',
  conditional: 'تنسيق شرطي',
  addRule: 'إضافة قاعدة',
  when: 'عندما',
  description: 'الوصف',
  locale: 'اللغة',
  direction: 'الاتجاه',
  hide: 'إخفاء',
  show: 'إظهار',
  customize: 'تخصيص',
  reportBands: 'أقسام التقرير',
  heightMm: 'الارتفاع (مم)',
  pageBreakBefore: 'فصل صفحة قبل القسم',
  pageBreakAfter: 'فصل صفحة بعد القسم',
  reportGroups: 'التجميع',
  groupByField: 'حقل التجميع',
  resetPageNumber: 'إعادة ترقيم الصفحة عند كل مجموعة',
  removeSection: 'إزالة القسم',
  zoomOut: 'تصغير',
  zoomIn: 'تكبير',
  zoomReset: 'الحجم الفعلي',
  fitWidth: 'ملء العرض',
  prevSection: 'القسم السابق',
  nextSection: 'القسم التالي',
  prevPage: 'الصفحة السابقة',
  nextPage: 'الصفحة التالية',
  multiSelectionHint:
    'اسحب للتحريك معًا. مفاتيح الأسهم تحريك الموضع (Shift = 5 مم). Ctrl/Cmd للتبديل؛ Shift+نقر لتحديد نطاق.',
  cut: 'قص',
  copy: 'نسخ',
  paste: 'لصق',
  bringToFront: 'إحضار للأمام',
  bringForward: 'تقديم',
  sendToBack: 'إرسال للخلف',
  sendBackward: 'تأخير',
};

export function t(locale: Locale, key: StringKey): string {
  return (locale === 'ar' ? ar : en)[key];
}

export type { StringKey };
