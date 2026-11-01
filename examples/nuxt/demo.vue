<template>
  <section>
    <ReportViewer :schema="schema" locale="ar" dir="rtl" :rows="rows" fonts-base-url="/fonts/" style="height: 420px" />
    <ReportBuilder :schema="schema" locale="ar" dir="rtl" fonts-base-url="/fonts/" style="height: 520px" />
  </section>
</template>

<script setup lang="ts">
import { ReportBuilder, ReportViewer } from '@reports-web/vue';
import type { ReportSchemaV1 } from '@reports-web/core';

const rows = [{ amount: 120 }];
const schema: ReportSchemaV1 = {
  version: '1',
  id: 'ssr-ar',
  meta: { name: 'تقرير المبيعات', locale: 'ar', dir: 'rtl' },
  page: { size: 'A4', orientation: 'portrait', margins: { top: 15, right: 15, bottom: 15, left: 15 } },
  dataset: { adapter: 'static', source: 'sales' },
  fields: [{ name: 'amount', type: 'number', label: 'المبلغ' }],
  groups: [],
  bands: {
    reportHeader: {
      height: 12,
      elements: [{ id: 'title', kind: 'text', value: 'تقرير المبيعات الشهري', style: { bold: true, fontSize: 16, align: 'center' }, pos: { x: 0, y: 1, w: 180, h: 8 } }],
    },
    detail: {
      height: 8,
      elements: [{ id: 'amount', kind: 'field', field: 'amount', format: 'decimal2', pos: { x: 0, y: 1, w: 80, h: 6 } }],
    },
  },
};
</script>
