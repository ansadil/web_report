# Report expressions reference

Expressions are used in **Expression** elements, **visibleWhen** rules, **conditional formatting**, **watermarks**, and **QR/barcode** payloads. They share the same evaluator (`packages/core/src/engine/expression.ts`).

## Quick start: print date/time

1. Add an **Expression** element (e.g. on **Page footer**).
2. Set **Expression** to `now()`.
3. Set **Format** to `datetime`.

Example with a label (use **Format** `datetime` on the element, not inside `concat`):

| Expression | Format | Result |
|------------|--------|--------|
| `now()` | `datetime` | Formatted print date and time |
| `concat("Printed: ", str(now()))` | *(empty)* | Text label + default date string |

> **Tip:** For dates, prefer `now()` + **Format** `datetime`. Using `concat(..., now())` without `str()` may show a long browser date string instead of a locale-formatted value.

---

## Where expressions run

| Place | Row data | Report variables | Aggregates |
|-------|----------|------------------|------------|
| Detail band | Current row | Yes | Yes |
| Page / report header & footer | No | Yes | Yes |
| Group header / footer | First row in group (where applicable) | Yes | Yes |
| Watermark | No | Yes | Yes |
| `visibleWhen` / conditional rules | Same as parent element | Yes | Yes |

---

## Literals and operators

### Literals

```text
42
3.14
"hello"
'world'
true
false
null
```

### Arithmetic

| Operator | Example |
|----------|---------|
| `+` `-` `*` `/` `%` | `amount * 1.15` |
| Unary `-` | `-balance` |

`+` concatenates strings if either side is a string: `"Total: " + amount`.

### Comparison

`==` `!=` `<` `<=` `>` `>=`

```text
amount > 100
status == "paid"
```

### Logical

| Operator | Example |
|----------|---------|
| `&&` | `amount > 0 && region == "N"` |
| OR (`||`) | `discount > 0 || isVip` |
| `!` | `!isVoid` |

### Ternary

```text
amount > 0 ? "Due" : "Paid"
```

### Grouping

```text
(2 + 3) * 4
```

### Property and index access

```text
user.name
items[0]
meta.name
```

Resolution order for identifiers: **vars** → **aggregates** → **current row**.

---

## Report variables (`vars`)

Available on every band via `buildReportEvalVars()`:

| Name | Description | Example |
|------|-------------|---------|
| `meta` | Report metadata (`name`, `locale`, `dir`, …) | `meta.name` |
| `page` | Page size, orientation, margins | `page.size` |
| `dataset` | Dataset adapter config | `dataset.source` |
| `printedAt` | Print/render timestamp (`Date`) | Use with **Format** `datetime` |
| `__rows__` | All data rows (array) | Advanced use |

### Date/time

| Function / variable | Returns | Notes |
|---------------------|---------|--------|
| `now()` | `Date` | Uses `printedAt` when the report is rendered with that option |
| `today()` | `Date` | Midnight on the print day (from `now()` / `printedAt`) |
| `printedAt` | `Date` | Same instant as `now()` |

```text
now()
```

```text
meta.name + " — " + str(now())
```

Pass a fixed time from your app when rendering (optional):

```ts
interpret({ schema, rows, printedAt: '2024-06-15T14:30:00Z' });
```

---

## Row fields

Use dataset field names directly in **detail** (and group bands with a row context):

```text
amount
region
user.email
```

```text
amount * 1.15
```

```text
upper(customerName)
```

---

## Aggregates

Report-scope aggregates are computed when an **Aggregate** element exists with `scope: report`. The expression name is:

```text
{fn}_{field}
```

| Aggregate element | Expression name | Example value |
|-------------------|-----------------|-----------------|
| `sum` on `amount` | `sum_amount` | `1250.5` |
| `count` on `id` | `count_id` | `42` |
| `avg` on `amount` | `avg_amount` | `29.77` |

```text
sum_amount / count_id
```

```text
if(count_id > 0, sum_amount / count_id, 0)
```

Group-scope aggregates are only available on **group footer** elements (via the Aggregate element), not as global expression names.

---

## Built-in functions

Names are **case-insensitive** (`NOW()` = `now()`).

### Date/time

| Function | Arguments | Description | Example |
|----------|-----------|-------------|---------|
| `now` | — | Print/render time | `now()` |
| `today` | — | Date at 00:00:00 | `today()` |

### Math

| Function | Arguments | Description | Example |
|----------|-----------|-------------|---------|
| `abs` | `x` | Absolute value | `abs(-7)` → `7` |
| `round` | `x` | Round to nearest integer | `round(2.7)` → `3` |
| `ceil` | `x` | Round up | `ceil(2.1)` → `3` |
| `floor` | `x` | Round down | `floor(2.9)` → `2` |
| `min` | `a, b, …` | Minimum | `min(a, b, 0)` |
| `max` | `a, b, …` | Maximum | `max(price, 0)` |

### Text

| Function | Arguments | Description | Example |
|----------|-----------|-------------|---------|
| `len` | `x` | Length of string or array | `len(name)` |
| `lower` | `x` | Lowercase | `lower(code)` |
| `upper` | `x` | Uppercase | `upper(region)` |
| `trim` | `x` | Trim whitespace | `trim(note)` |
| `concat` | `a, b, …` | Join values as strings | `concat("Order ", orderId)` |
| `str` | `x` | Convert to string | `str(now())` |

### Logic / utility

| Function | Arguments | Description | Example |
|----------|-----------|-------------|---------|
| `if` | `cond, yes, no` | Conditional | `if(amount > 0, "Due", "OK")` |
| `coalesce` | `a, b, …` | First non-null value | `coalesce(nickname, name, "—")` |
| `not` | `x` | Logical not | `not(isVoid)` |
| `num` | `x` | Convert to number | `num(qty)` |

---

## Output formatting (Expression element)

Set **Format** on the element (Properties panel). The evaluator returns a value; **Format** turns it into display text (locale-aware).

### Numbers

| Format | Example input | English output (approx.) |
|--------|---------------|---------------------------|
| `integer` | `1234.6` | `1,235` |
| `decimal2` | `3.1` | `3.10` |
| `percent` | `0.25` | `25%` |
| `currency:USD` | `99.5` | `$99.50` |
| `currency:EUR` | `10` | `€10.00` |

### Dates (use with `now()`, `today()`, or date fields)

| Format | Description |
|--------|-------------|
| `datetime` | Medium date + short time |
| `date` | Medium date |
| `date:short` | Short date |
| `date:long` | Long date |

If the value is a `Date` and **Format** is empty, a default datetime style is used.

### Examples

| Expression | Format | Typical use |
|------------|--------|-------------|
| `now()` | `datetime` | Printed at |
| `today()` | `date` | Report date only |
| `amount * 1.15` | `decimal2` | Line calculation |
| `sum_amount` | `currency:USD` | Report total |

---

## Common recipes

### Printed timestamp (footer)

```text
now()
```

**Format:** `datetime`

### Report title from metadata

```text
meta.name
```

### Conditional label

```text
if(amount > 1000, "Large order", "Standard")
```

### Safe division

```text
if(count_id > 0, sum_amount / count_id, 0)
```

**Format:** `decimal2`

### Watermark text

```text
"DRAFT — " + meta.name
```

### Show element only when amount is positive (`visibleWhen`)

```text
amount > 0
```

### Arabic / English locale

Formatting follows `meta.locale` (`ar` or `en`) on the report schema.

---

## Errors and limits

- Unknown function: `Unknown function: foo`
- Invalid syntax: parse errors (unclosed string, etc.)
- Complexity limit: very large expressions may throw `Expression too complex`
- Missing field: identifier resolves to `undefined` (often shown as empty after formatting)
- Division by zero: `1/0` → `NaN`

---

## JSON example (Expression element)

```json
{
  "id": "printed-at",
  "kind": "expr",
  "expression": "now()",
  "format": "datetime",
  "pos": { "x": 10, "y": 2, "w": 80, "h": 6 }
}
```

---

## Source code

| File | Purpose |
|------|---------|
| `packages/core/src/engine/expression.ts` | Parser, evaluator, functions |
| `packages/core/src/engine/interpreter.ts` | `buildReportEvalVars`, band rendering |
| `packages/shared/src/format.ts` | `applyPattern` / format strings |
