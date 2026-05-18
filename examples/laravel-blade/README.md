# Laravel Blade Integration Example

This shows how to embed `<reports-viewer>` and `<reports-builder>` inside any Laravel Blade view.

## Install

```bash
cd resources/js
npm install @reports-web/core
```

In your Vite entry (`resources/js/app.js`):

```js
import '@reports-web/core';
```

## Use in a Blade view

See `resources/views/reports/sales.blade.php`.

## Backend route

```php
// routes/web.php
use App\Http\Controllers\ReportsController;

Route::get('/reports/sales', [ReportsController::class, 'salesView']);
Route::post('/reports/data', [ReportsController::class, 'data']);
```

```php
// app/Http/Controllers/ReportsController.php
public function salesView()
{
    return view('reports.sales');
}

public function data(Request $request)
{
    return response()->json(
        DB::table('sales')->select(
            'region','product','qty','unit_price as unitPrice','amount','date'
        )->get()
    );
}
```
