import type { LocaleTag } from '@reports-web/shared';
import { defineComponent, h, onBeforeUnmount, onMounted, ref, watch, type PropType } from 'vue';
import { ReportsBuilderElement } from '@reports-web/core';
import type { ReportBuilderProps } from './types.js';

function defineReportsBuilder(): void {
  if (typeof window === 'undefined') return;
  if (!customElements.get('reports-builder')) customElements.define('reports-builder', ReportsBuilderElement);
}

export const ReportBuilder = defineComponent({
  name: 'ReportBuilder',
  props: {
    schema: { type: Object as PropType<ReportBuilderProps['schema']>, default: null },
    dataAdapter: { type: Object as PropType<ReportBuilderProps['dataAdapter']>, default: undefined },
    storageAdapter: { type: Object as PropType<ReportBuilderProps['storageAdapter']>, default: undefined },
    sampleRows: { type: Array as PropType<ReportBuilderProps['sampleRows']>, default: undefined },
    locale: { type: String as PropType<LocaleTag>, default: undefined },
    dir: { type: String as PropType<'rtl' | 'ltr'>, default: undefined },
    fontsBaseUrl: { type: String, default: undefined },
  },
  emits: ['save', 'save-error', 'export-json'],
  setup(props, { emit }) {
    const elRef = ref<ReportsBuilderElement | null>(null);

    const apply = () => {
      const el = elRef.value;
      if (!el) return;
      el.schema = props.schema ?? null;
      el.dataAdapter = props.dataAdapter ?? null;
      el.storageAdapter = props.storageAdapter ?? null;
      el.sampleRows = (props.sampleRows ?? null) as readonly import('@reports-web/shared').Row[] | null;
      el.locale = props.locale;
      el.dir = props.dir ?? '';
      if (props.fontsBaseUrl !== undefined) el.fontsBaseUrl = props.fontsBaseUrl;
    };

    const onSave = (e: Event) => emit('save', (e as CustomEvent).detail.schema);
    const onErr = (e: Event) => emit('save-error', (e as CustomEvent).detail.error);
    const onJson = (e: Event) => emit('export-json', (e as CustomEvent).detail);

    onMounted(() => {
      defineReportsBuilder();
      apply();
      const el = elRef.value;
      el?.addEventListener('save', onSave);
      el?.addEventListener('save-error', onErr);
      el?.addEventListener('export-json', onJson);
    });
    onBeforeUnmount(() => {
      const el = elRef.value;
      el?.removeEventListener('save', onSave);
      el?.removeEventListener('save-error', onErr);
      el?.removeEventListener('export-json', onJson);
    });

    watch(
      () => [props.schema, props.dataAdapter, props.storageAdapter, props.sampleRows, props.locale, props.dir, props.fontsBaseUrl],
      () => apply(),
      { deep: true },
    );

    return () => h('reports-builder', { ref: elRef, ...(props.fontsBaseUrl != null ? { 'fonts-base-url': props.fontsBaseUrl } : {}) });
  },
});
