'use client';

import { useMemo, useState } from 'react';
import { ReportBuilder } from '@reports-web/react';
import { createRestAdapter, createCallbackStorage } from '@reports-web/core';
import type { ReportSchemaV1 } from '@reports-web/core';

export function BuilderClient() {
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const dataAdapter = useMemo(() => createRestAdapter({ baseUrl: '/api/reports/data', method: 'POST' }), []);
  const storage = useMemo(
    () =>
      createCallbackStorage({
        id: 'nextjs',
        load: async (id) => {
          const r = await fetch(`/api/reports/definitions/${id}`);
          if (!r.ok) throw new Error(`Load failed: ${r.status}`);
          return r.json();
        },
        save: async (id, schema) => {
          const r = await fetch(`/api/reports/definitions/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(schema),
          });
          if (!r.ok) throw new Error(`Save failed: ${r.status}`);
        },
      }),
    [],
  );

  const onSave = (schema: ReportSchemaV1) => {
    setSavedAt(new Date().toLocaleTimeString());
    console.info('Saved schema', schema.id);
  };

  return (
    <>
      {savedAt ? <div style={{ padding: 8, background: '#dcfce7', fontSize: 12 }}>Saved at {savedAt}</div> : null}
      <ReportBuilder
        dataAdapter={dataAdapter}
        storageAdapter={storage}
        locale="en"
        dir="ltr"
        onSave={onSave}
        onSaveError={(err) => console.error('Save error', err)}
        style={{ height: '100%' }}
      />
    </>
  );
}
