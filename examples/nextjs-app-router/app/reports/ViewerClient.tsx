'use client';

import { useMemo } from 'react';
import { ReportViewer } from '@reports-web/react';
import { createRestAdapter } from '@reports-web/core';
import type { ReportSchemaV1 } from '@reports-web/core';

export function ViewerClient({ schema }: { schema: ReportSchemaV1 }) {
  const adapter = useMemo(() => createRestAdapter({ baseUrl: '/api/reports/data', method: 'POST' }), []);

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <ReportViewer
      schema={schema}
      dataAdapter={adapter}
      locale="en"
      dir="ltr"
      onExport={(p) => {
        if (p.blob && p.filename) downloadBlob(p.blob, p.filename);
      }}
      onExportError={(e) => console.error('Export error', e)}
      style={{ height: '100%' }}
    />
  );
}
