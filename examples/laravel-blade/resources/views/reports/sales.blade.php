@extends('layouts.app')

@section('content')
  <div class="rw-host">
    <reports-viewer id="rv-sales"
                    locale="ar"
                    dir="rtl"
                    style="display:block;height:90vh"></reports-viewer>
  </div>

  @push('scripts')
    <script type="module">
      import '@reports-web/core';
      import { createRestAdapter } from '@reports-web/core';

      const viewer = document.getElementById('rv-sales');

      const csrf = document.querySelector('meta[name="csrf-token"]')?.content;
      viewer.dataAdapter = createRestAdapter({
        baseUrl: '/reports/data',
        method: 'POST',
        headers: csrf ? { 'X-CSRF-TOKEN': csrf } : {},
      });

      viewer.schema = @json($schema ?? null);

      viewer.addEventListener('export', (e) => {
        const { kind, blob, filename } = e.detail;
        if (!blob || !filename) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      });

      viewer.addEventListener('export-error', (e) => {
        console.error('Export failed', e.detail);
      });
    </script>
  @endpush
@endsection
