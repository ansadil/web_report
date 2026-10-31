import { useEffect, useRef } from 'react';
import { ReportsViewerElement } from '@reports-web/core';
import type { ReportViewerProps, ExportPayload, ExportKind } from './types.js';

if (typeof customElements !== 'undefined' && !customElements.get('reports-viewer')) {
  customElements.define('reports-viewer', ReportsViewerElement);
}

export function ReportViewer(props: ReportViewerProps) {
  const ref = useRef<ReportsViewerElement | null>(null);
  const { schema, rows, dataAdapter, chartAdapter, locale, dir, noToolbar, hideViewControls, hidePageBoundaries, onRendered, onExport, onExportError, className, style } = props;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.schema = schema ?? null;
    el.rows = (rows ?? null) as readonly import('@reports-web/shared').Row[] | null;
    el.dataAdapter = dataAdapter ?? null;
    el.chartAdapter = chartAdapter ?? null;
    el.locale = locale;
    el.dir = dir ?? '';
    el.noToolbar = !!noToolbar;
    el.hideViewControls = !!hideViewControls;
    el.hidePageBoundaries = !!hidePageBoundaries;
  }, [schema, rows, dataAdapter, chartAdapter, locale, dir, noToolbar, hideViewControls, hidePageBoundaries]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onRender = (e: Event) => onRendered?.((e as CustomEvent<{ sections: number; rows: number }>).detail);
    const onExp = (e: Event) => onExport?.((e as CustomEvent<ExportPayload>).detail);
    const onErr = (e: Event) => onExportError?.((e as CustomEvent<{ kind: ExportKind; error: string }>).detail);
    el.addEventListener('report-rendered', onRender);
    el.addEventListener('export', onExp);
    el.addEventListener('export-error', onErr);
    return () => {
      el.removeEventListener('report-rendered', onRender);
      el.removeEventListener('export', onExp);
      el.removeEventListener('export-error', onErr);
    };
  }, [onRendered, onExport, onExportError]);

  return <reports-viewer ref={ref as unknown as React.Ref<HTMLElement>} className={className} style={style} />;
}

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'reports-viewer': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
    }
  }
}
