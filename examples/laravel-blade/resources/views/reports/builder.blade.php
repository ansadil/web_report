@extends('layouts.app')

@section('content')
  <div class="rw-host">
    <reports-builder id="rb"
                     locale="ar" dir="rtl"
                     style="display:grid;height:90vh"></reports-builder>
  </div>

  @push('scripts')
    <script type="module">
      import '@reports-web/core';
      import { createRestAdapter, createCallbackStorage } from '@reports-web/core';

      const builder = document.getElementById('rb');
      const csrf = document.querySelector('meta[name="csrf-token"]')?.content;

      builder.dataAdapter = createRestAdapter({
        baseUrl: '/reports/data',
        method: 'POST',
        headers: csrf ? { 'X-CSRF-TOKEN': csrf } : {},
      });

      builder.storageAdapter = createCallbackStorage({
        id: 'laravel',
        load: async (id) => {
          const r = await fetch(`/reports/definitions/${id}`);
          if (!r.ok) throw new Error(`Load failed: ${r.status}`);
          return r.json();
        },
        save: async (id, schema) => {
          const r = await fetch(`/reports/definitions/${id}`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              ...(csrf ? { 'X-CSRF-TOKEN': csrf } : {}),
            },
            body: JSON.stringify(schema),
          });
          if (!r.ok) throw new Error(`Save failed: ${r.status}`);
        },
      });

      builder.schema = @json($schema ?? null);

      builder.addEventListener('save', (e) => {
        console.info('Saved schema id:', e.detail.schema.id);
      });
    </script>
  @endpush
@endsection
