import type { LocaleTag } from '@reports-web/shared';
import { defineComponent, h, onBeforeUnmount, onMounted, ref, watch, type PropType } from 'vue';
import { ReportsViewerElement } from '@reports-web/core';
import type { ReportViewerProps } from './types.js';

if (typeof customElements !== 'undefined' && !customElements.get('reports-viewer')) {
  customElements.define('reports-viewer', ReportsViewerElement);
}

export const ReportViewer = defineComponent({
  name: 'ReportViewer',
  props: {
    schema: { type: Object as PropType<ReportViewerProps['schema']>, default: null },
    rows: { type: Array as PropType<ReportViewerProps['rows']>, default: undefined },
    dataAdapter: { type: Object as PropType<ReportViewerProps['dataAdapter']>, default: undefined },
    chartAdapter: { type: Object as PropType<ReportViewerProps['chartAdapter']>, default: undefined },
    locale: { type: String as PropType<LocaleTag>, default: undefined },
    dir: { type: String as PropType<'rtl' | 'ltr'>, default: undefined },
    noToolbar: { type: Boolean, default: false },
    hideViewControls: { type: Boolean, default: false },
    hidePageBoundaries: { type: Boolean, default: false },
    params: { type: Object as PropType<ReportViewerProps['params']>, default: undefined },
    timeZone: { type: String, default: undefined },
    fontsBaseUrl: { type: String, default: undefined },
  },
  emits: ['rendered', 'export', 'export-error', 'parameters-error', 'time-zone-invalid'],
  setup(props, { emit }) {
    const elRef = ref<ReportsViewerElement | null>(null);

    const apply = () => {
      const el = elRef.value;
      if (!el) return;
      el.schema = props.schema ?? null;
      el.rows = (props.rows ?? null) as readonly import('@reports-web/shared').Row[] | null;
      el.dataAdapter = props.dataAdapter ?? null;
      el.chartAdapter = props.chartAdapter ?? null;
      el.locale = props.locale;
      el.dir = props.dir ?? '';
      el.noToolbar = props.noToolbar;
      el.hideViewControls = props.hideViewControls;
      el.hidePageBoundaries = props.hidePageBoundaries;
      el.params = props.params ?? null;
      el.timeZone = props.timeZone;
      if (props.fontsBaseUrl !== undefined) el.fontsBaseUrl = props.fontsBaseUrl;
    };

    const onRendered = (e: Event) => emit('rendered', (e as CustomEvent).detail);
    const onExport = (e: Event) => emit('export', (e as CustomEvent).detail);
    const onErr = (e: Event) => emit('export-error', (e as CustomEvent).detail);
    const onParamsErr = (e: Event) => emit('parameters-error', (e as CustomEvent).detail);
    const onTzInvalid = (e: Event) => emit('time-zone-invalid', (e as CustomEvent).detail);

    onMounted(() => {
      apply();
      const el = elRef.value;
      el?.addEventListener('report-rendered', onRendered);
      el?.addEventListener('export', onExport);
      el?.addEventListener('export-error', onErr);
      el?.addEventListener('parameters-error', onParamsErr);
      el?.addEventListener('time-zone-invalid', onTzInvalid);
    });
    onBeforeUnmount(() => {
      const el = elRef.value;
      el?.removeEventListener('report-rendered', onRendered);
      el?.removeEventListener('export', onExport);
      el?.removeEventListener('export-error', onErr);
      el?.removeEventListener('parameters-error', onParamsErr);
      el?.removeEventListener('time-zone-invalid', onTzInvalid);
    });

    watch(
      () => [props.schema, props.rows, props.dataAdapter, props.chartAdapter, props.locale, props.dir, props.noToolbar, props.hideViewControls, props.hidePageBoundaries, props.params, props.timeZone, props.fontsBaseUrl],
      () => apply(),
      { deep: true },
    );

    return () => h('reports-viewer', { ref: elRef });
  },
});
