import { useEffect, useRef } from 'react';
import { ReportsViewerElement } from '@reports-web/core';
import type { ParameterIssue } from '@reports-web/core';
import type { ReportViewerProps, ExportPayload, ExportKind } from './types.js';

if (typeof customElements !== 'undefined' && !customElements.get('reports-viewer')) {
  customElements.define('reports-viewer', ReportsViewerElement);
}

export function ReportViewer(props: ReportViewerProps) {
  const ref = useRef<ReportsViewerElement | null>(null);
  const { schema, rows, dataAdapter, chartAdapter, locale, dir, noToolbar, hideViewControls, hidePageBoundaries, params, timeZone, fontsBaseUrl, onRendered, onExport, onExportError, onParametersError, onTimeZoneInvalid, className, style } = props;

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
    el.params = params ?? null;
    el.timeZone = timeZone;
    if (fontsBaseUrl !== undefined) el.fontsBaseUrl = fontsBaseUrl;
  }, [schema, rows, dataAdapter, chartAdapter, locale, dir, noToolbar, hideViewControls, hidePageBoundaries, params, timeZone, fontsBaseUrl]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onRender = (e: Event) => onRendered?.((e as CustomEvent<{ sections: number; rows: number }>).detail);
    const onExp = (e: Event) => onExport?.((e as CustomEvent<ExportPayload>).detail);
    const onErr = (e: Event) => onExportError?.((e as CustomEvent<{ kind: ExportKind; error: string }>).detail);
    el.addEventListener('report-rendered', onRender);
    el.addEventListener('export', onExp);
    const onParams = (e: Event) => onParametersError?.((e as CustomEvent<{ error: string; issues: readonly ParameterIssue[] }>).detail);
    el.addEventListener('export-error', onErr);
    el.addEventListener('parameters-error', onParams);
    const onTz = (e: Event) => onTimeZoneInvalid?.((e as CustomEvent<{ timeZone: string; fallback: string }>).detail);
    el.addEventListener('time-zone-invalid', onTz);
    return () => {
      el.removeEventListener('report-rendered', onRender);
      el.removeEventListener('export', onExp);
      el.removeEventListener('export-error', onErr);
      el.removeEventListener('parameters-error', onParams);
      el.removeEventListener('time-zone-invalid', onTz);
    };
  }, [onRendered, onExport, onExportError, onParametersError, onTimeZoneInvalid]);

  return <reports-viewer ref={ref as unknown as React.Ref<HTMLElement>} className={className} style={style} />;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- augment React JSX intrinsic elements
  namespace JSX {
    interface IntrinsicElements {
      'reports-viewer': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
    }
  }
}
