<div class="mx-auto flex max-w-[100vw] flex-col gap-3 p-4">
    @if (session('builder_ok'))
        <div class="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-900" wire:key="ok-{{ now()->timestamp }}">
            {{ session('builder_ok') }}
        </div>
    @endif
    @if (session('builder_err'))
        <div class="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900" wire:key="err-{{ now()->timestamp }}">
            {{ session('builder_err') }}
        </div>
    @endif

    <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="flex flex-wrap items-center gap-3">
            <h1 class="text-xl font-semibold text-slate-800">
                {{ $locale === 'ar' ? 'محرّر التقرير' : 'Report builder' }}
            </h1>
            <a href="{{ route('reports.invoices') }}" wire:navigate class="text-sm text-blue-600 hover:underline">
                {{ $locale === 'ar' ? 'عرض ملخص الفواتير' : 'Invoice summary (viewer)' }}
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

    <p class="text-sm text-slate-600">
        {{ $locale === 'ar'
            ? 'استخدم «حفظ» لتمرير المخطط إلى Laravel؛ «JSON» لتنزيل الملف.'
            : 'Use Save to post the schema to Laravel; JSON downloads the definition.' }}
    </p>

    <div wire:key="builder-wrap-{{ $builderId }}" class="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div wire:ignore class="h-[calc(100vh-14rem)] min-h-[540px] w-full">
            <reports-builder id="{{ $builderId }}" class="block h-full w-full"></reports-builder>
        </div>
    </div>
</div>

@script
<script>
    (async () => {
        const waitMountFn = async () => {
            while (typeof window.mountReportBuilder !== 'function') {
                await new Promise((r) => setTimeout(r, 25));
            }
        };

        const attachBridge = (el) => {
            if (!el || el.dataset.rwLwBridge === '1') return;
            el.dataset.rwLwBridge = '1';
            el.addEventListener('save', (e) => $wire.onBuilderSave(e.detail.schema));
            el.addEventListener('save-error', (e) => $wire.onBuilderSaveError(String(e.detail.error ?? '')));
            el.addEventListener('export-json', (e) => {
                const blob = e.detail.blob;
                const filename = e.detail.filename ?? 'report.json';
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = filename;
                a.click();
                URL.revokeObjectURL(url);
            });
        };

        const syncBuilder = async () => {
            await waitMountFn();
            await window.mountReportBuilder({
                elementId: $wire.builderId,
                schema: $wire.initialSchema,
                sampleRows: $wire.sampleRows,
                locale: $wire.locale,
                dir: $wire.dir,
            });
            attachBridge(document.getElementById($wire.builderId));
        };

        await syncBuilder();
        $wire.$watch('builderId', () => {
            void syncBuilder();
        });
    })();
</script>
@endscript
