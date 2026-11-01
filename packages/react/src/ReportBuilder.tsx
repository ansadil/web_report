'use client';

import { useEffect, useRef } from 'react';
import { ReportsBuilderElement } from '@reports-web/core';
import type { ReportBuilderProps } from './types.js';
import type { ReportSchemaV1 } from '@reports-web/core';

function defineReportsBuilder(): void {
  if (typeof window === 'undefined') return;
  if (!customElements.get('reports-builder')) customElements.define('reports-builder', ReportsBuilderElement);
}

export function ReportBuilder(props: ReportBuilderProps) {
  const ref = useRef<ReportsBuilderElement | null>(null);
  const { schema, dataAdapter, storageAdapter, sampleRows, locale, dir, fontsBaseUrl, onSave, onSaveError, onExportJson, className, style } = props;

  useEffect(() => {
    defineReportsBuilder();
    const el = ref.current;
    if (!el) return;
    el.schema = schema ?? null;
    el.dataAdapter = dataAdapter ?? null;
    el.storageAdapter = storageAdapter ?? null;
    el.sampleRows = (sampleRows ?? null) as readonly import('@reports-web/shared').Row[] | null;
    el.locale = locale;
    el.dir = dir ?? '';
    if (fontsBaseUrl !== undefined) el.fontsBaseUrl = fontsBaseUrl;
  }, [schema, dataAdapter, storageAdapter, sampleRows, locale, dir, fontsBaseUrl]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onSaved = (e: Event) => onSave?.((e as CustomEvent<{ schema: ReportSchemaV1 }>).detail.schema);
    const onErr = (e: Event) => onSaveError?.((e as CustomEvent<{ error: string }>).detail.error);
    const onJson = (e: Event) => onExportJson?.((e as CustomEvent<{ blob: Blob; filename: string }>).detail);
    el.addEventListener('save', onSaved);
    el.addEventListener('save-error', onErr);
    el.addEventListener('export-json', onJson);
    return () => {
      el.removeEventListener('save', onSaved);
      el.removeEventListener('save-error', onErr);
      el.removeEventListener('export-json', onJson);
    };
  }, [onSave, onSaveError, onExportJson]);

  return (
    <reports-builder
      ref={ref as unknown as React.Ref<HTMLElement>}
      className={className}
      style={style}
      {...(fontsBaseUrl != null ? { 'fonts-base-url': fontsBaseUrl } : {})}
    />
  );
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- augment React JSX intrinsic elements
  namespace JSX {
    interface IntrinsicElements {
      'reports-builder': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & { 'fonts-base-url'?: string }, HTMLElement>;
    }
  }
}
