<?php

declare(strict_types=1);

namespace App\Livewire;

use Livewire\Attributes\Layout;
use Livewire\Component;

#[Layout('layouts.reports')]
final class ReportBuilderDemo extends Component
{
    public string $builderId;

    /** @var list<array<string, mixed>> */
    public array $sampleRows;

    /** @var array<string, mixed>|null Initial schema; `null` starts from the builder default template. */
    public ?array $initialSchema = null;

    public string $locale;

    public string $dir;

    public function mount(): void
    {
        $this->locale = str_starts_with(app()->getLocale(), 'ar') ? 'ar' : 'en';
        $this->dir = $this->locale === 'ar' ? 'rtl' : 'ltr';
        app()->setLocale($this->locale);
        $this->builderId = 'rb-' . uniqid();
        $this->sampleRows = $this->demoRows();
        $this->initialSchema = null;
    }

    public function setLocale(string $loc): void
    {
        $this->locale = $loc === 'ar' ? 'ar' : 'en';
        $this->dir = $this->locale === 'ar' ? 'rtl' : 'ltr';
        app()->setLocale($this->locale);
        $this->builderId = 'rb-' . uniqid();
    }

    /** Wire from JS: `$wire.onBuilderSave(schema)` */
    public function onBuilderSave(array $schema): void
    {
        $name = (string) ($schema['meta']['name'] ?? $schema['id'] ?? 'report');
        session()->flash('builder_ok', 'Report «' . $name . '» validated — connect `onBuilderSave` to your DB or files.');
    }

    public function onBuilderSaveError(string $error): void
    {
        session()->flash('builder_err', $error);
    }

    /** @return list<array<string, mixed>> */
    private function demoRows(): array
    {
        return [
            ['sku' => 'SKU-1', 'label' => 'Widget A', 'qty' => 10, 'price' => 25.5],
            ['sku' => 'SKU-2', 'label' => 'Widget B', 'qty' => 3, 'price' => 80.0],
            ['sku' => 'SKU-3', 'label' => 'Service', 'qty' => 1, 'price' => 150.0],
        ];
    }

    public function render()
    {
        return view('livewire.report-builder-demo');
    }
}
