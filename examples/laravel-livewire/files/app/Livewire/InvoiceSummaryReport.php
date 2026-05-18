<?php

declare(strict_types=1);

namespace App\Livewire;

use Livewire\Attributes\Layout;
use Livewire\Component;

#[Layout('layouts.reports')]
final class InvoiceSummaryReport extends Component
{
    /** Stable DOM id for <reports-viewer> (new id when locale toggles). */
    public string $viewerId;

    /** @var array<string, mixed> */
    public array $schema;

    /** @var list<array<string, mixed>> */
    public array $rows;

    public string $locale;

    public string $dir;

    public function mount(): void
    {
        $this->locale = str_starts_with(app()->getLocale(), 'ar') ? 'ar' : 'en';
        $this->dir = $this->locale === 'ar' ? 'rtl' : 'ltr';
        $this->viewerId = 'rw-' . uniqid();
        app()->setLocale($this->locale);

        $this->schema = $this->buildSchema();
        $this->rows = $this->sampleRows();
    }

    public function setLocale(string $loc): void
    {
        $this->locale = $loc === 'ar' ? 'ar' : 'en';
        $this->dir = $this->locale === 'ar' ? 'rtl' : 'ltr';
        app()->setLocale($this->locale);
        $this->viewerId = 'rw-' . uniqid();
        $this->syncMeta();
    }

    /** @return array<string, mixed> */
    private function buildSchema(): array
    {
        return [
            'version' => '1',
            'id' => 'invoices-summary',
            'meta' => [
                'name' => 'Invoice summary',
                'locale' => $this->locale,
                'dir' => $this->dir,
            ],
            'page' => [
                'size' => 'A4',
                'orientation' => 'portrait',
                'margins' => ['top' => 15, 'right' => 15, 'bottom' => 15, 'left' => 15],
            ],
            'dataset' => ['adapter' => 'static', 'source' => 'invoices'],
            'fields' => [
                ['name' => 'invoice_no', 'type' => 'string', 'label' => 'Invoice #'],
                ['name' => 'customer', 'type' => 'string', 'label' => 'Customer'],
                ['name' => 'issued_at', 'type' => 'date', 'label' => 'Date'],
                ['name' => 'qty', 'type' => 'number', 'label' => 'Qty'],
                ['name' => 'amount', 'type' => 'number', 'label' => 'Amount'],
                ['name' => 'tax', 'type' => 'number', 'label' => 'Tax'],
                ['name' => 'line_total', 'type' => 'number', 'label' => 'Total'],
            ],
            'bands' => [
                'reportHeader' => [
                    'height' => 16,
                    'elements' => [
                        [
                            'id' => 'rh_title',
                            'kind' => 'text',
                            'value' => 'Invoice summary — ملخص الفواتير',
                            'style' => ['bold' => true, 'fontSize' => 14, 'align' => 'center'],
                            'pos' => ['x' => 0, 'y' => 2, 'w' => 180, 'h' => 8],
                        ],
                        [
                            'id' => 'rh_sub',
                            'kind' => 'text',
                            'value' => 'Laravel Livewire + reports-web',
                            'style' => ['fontSize' => 9, 'align' => 'center', 'color' => '#64748b'],
                            'pos' => ['x' => 0, 'y' => 11, 'w' => 180, 'h' => 4],
                        ],
                    ],
                ],
                'pageHeader' => [
                    'height' => 9,
                    'elements' => [
                        ['id' => 'ph1', 'kind' => 'text', 'value' => 'Invoice #', 'style' => ['bold' => true, 'fontSize' => 8, 'background' => '#f1f5f9'], 'pos' => ['x' => 0, 'y' => 1, 'w' => 28, 'h' => 6]],
                        ['id' => 'ph2', 'kind' => 'text', 'value' => 'Customer', 'style' => ['bold' => true, 'fontSize' => 8, 'background' => '#f1f5f9'], 'pos' => ['x' => 29, 'y' => 1, 'w' => 38, 'h' => 6]],
                        ['id' => 'ph3', 'kind' => 'text', 'value' => 'Date', 'style' => ['bold' => true, 'fontSize' => 8, 'background' => '#f1f5f9'], 'pos' => ['x' => 68, 'y' => 1, 'w' => 28, 'h' => 6]],
                        ['id' => 'ph4', 'kind' => 'text', 'value' => 'Qty', 'style' => ['bold' => true, 'fontSize' => 8, 'align' => 'end', 'background' => '#f1f5f9'], 'pos' => ['x' => 97, 'y' => 1, 'w' => 16, 'h' => 6]],
                        ['id' => 'ph5', 'kind' => 'text', 'value' => 'Amount', 'style' => ['bold' => true, 'fontSize' => 8, 'align' => 'end', 'background' => '#f1f5f9'], 'pos' => ['x' => 114, 'y' => 1, 'w' => 28, 'h' => 6]],
                        ['id' => 'ph6', 'kind' => 'text', 'value' => 'Tax', 'style' => ['bold' => true, 'fontSize' => 8, 'align' => 'end', 'background' => '#f1f5f9'], 'pos' => ['x' => 143, 'y' => 1, 'w' => 18, 'h' => 6]],
                        ['id' => 'ph7', 'kind' => 'text', 'value' => 'Total', 'style' => ['bold' => true, 'fontSize' => 8, 'align' => 'end', 'background' => '#f1f5f9'], 'pos' => ['x' => 162, 'y' => 1, 'w' => 28, 'h' => 6]],
                    ],
                ],
                'detail' => [
                    'height' => 7,
                    'elements' => [
                        ['id' => 'd1', 'kind' => 'field', 'field' => 'invoice_no', 'pos' => ['x' => 0, 'y' => 0, 'w' => 28, 'h' => 6]],
                        ['id' => 'd2', 'kind' => 'field', 'field' => 'customer', 'pos' => ['x' => 29, 'y' => 0, 'w' => 38, 'h' => 6]],
                        ['id' => 'd3', 'kind' => 'field', 'field' => 'issued_at', 'format' => 'date', 'pos' => ['x' => 68, 'y' => 0, 'w' => 28, 'h' => 6]],
                        ['id' => 'd4', 'kind' => 'field', 'field' => 'qty', 'format' => 'integer', 'style' => ['align' => 'end'], 'pos' => ['x' => 97, 'y' => 0, 'w' => 16, 'h' => 6]],
                        ['id' => 'd5', 'kind' => 'field', 'field' => 'amount', 'format' => 'decimal2', 'style' => ['align' => 'end'], 'pos' => ['x' => 114, 'y' => 0, 'w' => 28, 'h' => 6]],
                        ['id' => 'd6', 'kind' => 'field', 'field' => 'tax', 'format' => 'decimal2', 'style' => ['align' => 'end'], 'pos' => ['x' => 143, 'y' => 0, 'w' => 18, 'h' => 6]],
                        ['id' => 'd7', 'kind' => 'field', 'field' => 'line_total', 'format' => 'decimal2', 'style' => ['align' => 'end'], 'pos' => ['x' => 162, 'y' => 0, 'w' => 28, 'h' => 6]],
                    ],
                ],
                'reportFooter' => [
                    'height' => 11,
                    'elements' => [
                        ['id' => 'rf_label', 'kind' => 'text', 'value' => 'Grand total', 'style' => ['bold' => true, 'align' => 'end'], 'pos' => ['x' => 80, 'y' => 2, 'w' => 45, 'h' => 6]],
                        ['id' => 'rf_sum_amount', 'kind' => 'aggregate', 'fn' => 'sum', 'field' => 'amount', 'scope' => 'report', 'format' => 'decimal2', 'style' => ['bold' => true, 'align' => 'end'], 'pos' => ['x' => 114, 'y' => 2, 'w' => 28, 'h' => 6]],
                        ['id' => 'rf_sum_tax', 'kind' => 'aggregate', 'fn' => 'sum', 'field' => 'tax', 'scope' => 'report', 'format' => 'decimal2', 'style' => ['bold' => true, 'align' => 'end'], 'pos' => ['x' => 143, 'y' => 2, 'w' => 18, 'h' => 6]],
                        ['id' => 'rf_sum_total', 'kind' => 'aggregate', 'fn' => 'sum', 'field' => 'line_total', 'scope' => 'report', 'format' => 'decimal2', 'style' => ['bold' => true, 'align' => 'end', 'background' => '#dbeafe'], 'pos' => ['x' => 162, 'y' => 2, 'w' => 28, 'h' => 6]],
                    ],
                ],
            ],
        ];
    }

    private function syncMeta(): void
    {
        $this->schema['meta']['locale'] = $this->locale;
        $this->schema['meta']['dir'] = $this->dir;
    }

    /** @return list<array<string, mixed>> */
    private function sampleRows(): array
    {
        return [
            ['invoice_no' => 'III-2026-001', 'customer' => 'Acme Trading', 'issued_at' => '2026-01-10', 'qty' => 3, 'amount' => 1500, 'tax' => 75, 'line_total' => 1575],
            ['invoice_no' => 'III-2026-002', 'customer' => 'Blue Nile LLC', 'issued_at' => '2026-01-18', 'qty' => 7, 'amount' => 4200, 'tax' => 210, 'line_total' => 4410],
            ['invoice_no' => 'III-2026-003', 'customer' => 'Cedar Foods', 'issued_at' => '2026-02-05', 'qty' => 2, 'amount' => 800, 'tax' => 40, 'line_total' => 840],
            ['invoice_no' => 'III-2026-004', 'customer' => 'Delta Logistics', 'issued_at' => '2026-02-15', 'qty' => 12, 'amount' => 8400, 'tax' => 420, 'line_total' => 8820],
            ['invoice_no' => 'III-2026-005', 'customer' => 'East Pharma', 'issued_at' => '2026-03-01', 'qty' => 5, 'amount' => 2700, 'tax' => 135, 'line_total' => 2835],
            ['invoice_no' => 'III-2026-006', 'customer' => 'Blue Nile LLC', 'issued_at' => '2026-03-12', 'qty' => 4, 'amount' => 1900, 'tax' => 95, 'line_total' => 1995],
            ['invoice_no' => 'III-2026-007', 'customer' => 'Future Tech', 'issued_at' => '2026-03-28', 'qty' => 9, 'amount' => 5500, 'tax' => 275, 'line_total' => 5775],
            ['invoice_no' => 'III-2026-008', 'customer' => 'Acme Trading', 'issued_at' => '2026-04-14', 'qty' => 6, 'amount' => 3300, 'tax' => 165, 'line_total' => 3465],
        ];
    }

    public function render()
    {
        return view('livewire.invoice-summary-report');
    }
}
