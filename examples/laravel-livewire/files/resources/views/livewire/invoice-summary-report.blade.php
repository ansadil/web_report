@php
    $viewerId = 'invoice-summary-' . Str::random(8);
@endphp
<div class="mx-auto max-w-6xl space-y-4 p-4">
    <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="flex flex-wrap items-center gap-3">
            <h1 class="text-xl font-semibold text-slate-800">
                {{ $locale === 'ar' ? 'ملخص الفواتير' : 'Invoice summary' }}
            </h1>
            <a href="{{ route('reports.builder') }}" wire:navigate class="text-sm text-blue-600 hover:underline">
                {{ $locale === 'ar' ? 'محرّر التقرير' : 'Report builder' }}
            </a>
        </div>
        <div class="flex gap-2">
            <button type="button"
                    wire:click="setLocale('en')"
                    class="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm shadow-sm hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 {{ $locale === 'en' ? 'ring-2 ring-blue-500' : '' }}">
                English
            </button>
            <button type="button"
                    wire:click="setLocale('ar')"
                    class="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm shadow-sm hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 {{ $locale === 'ar' ? 'ring-2 ring-blue-500' : '' }}">
                العربية
            </button>
        </div>
    </div>

    <div wire:key="viewer-{{ $viewerId }}" class="overflow-hidden rounded-lg bg-white shadow ring-1 ring-slate-200">
        <reports-viewer id="{{ $viewerId }}" class="block min-h-[520px]"></reports-viewer>
    </div>
</div>

@script
<script>
    const payload = {
        elementId: @js($viewerId),
        schema: @js($schema),
        rows: @js($rows),
        locale: @js($locale),
        dir: @js($dir),
    };
    const tryMount = () => {
        if (typeof window.mountInvoiceReportViewer === 'function') {
            window.mountInvoiceReportViewer(payload);
            return true;
        }
        return false;
    };
    if (!tryMount()) {
        let n = 0;
        const t = setInterval(() => {
            if (tryMount() || ++n > 80) clearInterval(t);
        }, 25);
    }
</script>
@endscript
