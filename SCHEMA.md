# finance-data.json — shared schema (v1)

One file feeds both Sharma apps:

- **Sharma AR** (`sharma-ar`) reads `meta` + `invoices`.
- **Sharma P&L** (`sharma-pnl`) reads `meta` + `pnl` (and may read `invoices` for a "billed this month" cross-check).

Nobody types a number twice. Jarvis edits only this JSON. The apps never hold numbers in code.

**Single source of truth:** `https://sharmaelechvac.github.io/sharma-ar/finance-data.json`
(repo `Sharmaelechvac/sharma-ar`, file `finance-data.json` at repo root). The P&L app fetches that
URL with `cache: 'no-store'`. GitHub Pages sends `Access-Control-Allow-Origin: *`, so a
cross-repo fetch works. Do not keep a second copy in `sharma-pnl`.

Files in this folder:

- `finance-data.json` — the empty template (ship as-is; Jarvis fills it).
- `finance-data.schema.json` — JSON Schema (draft 2020-12) for validation.
- `SCHEMA.md` — this page.

## Top level

```json
{
  "meta": {
    "schemaVersion": 1,
    "company": "Sharma Electric & HVAC",
    "asOf": "",
    "currency": "USD",
    "updatedBy": ""
  },
  "invoices": [],
  "pnl": {
    "divisions": ["electrical", "hvac"],
    "months": []
  }
}
```

| Field | Type | Notes |
|---|---|---|
| meta.schemaVersion | integer | `1`. Bump only if a field changes meaning. |
| meta.company | string | `"Sharma Electric & HVAC"` |
| meta.asOf | string | `YYYY-MM-DD` (or `YYYY-MM-DDTHH:MM-05:00`). Empty until filled. Shown as "Data as of". |
| meta.currency | string | `"USD"` |
| meta.updatedBy | string | Who last edited, e.g. `"Jarvis"`. |

## invoices[] — exactly these 11 fields

| Field | Type | Rule |
|---|---|---|
| id | string | Unique, never reused. |
| number | string | Invoice number as printed (string, keeps leading zeros). |
| client | string | Builder/client. Spell it the same every time — it is the grouping key. |
| jobAddress | string | Street address of the job. |
| trade | `"electrical"` \| `"hvac"` | Lowercase. |
| amount | number | Invoice total in dollars, retainage included. No `$`, no commas. |
| dateSent | `"YYYY-MM-DD"` \| null | Date the invoice went to the client. null only for `undelivered` not yet sent. |
| dueTerms | integer | Net days. `30` = Net 30. `0` = due on receipt. |
| status | `"sent"` \| `"paid"` \| `"overdue"` \| `"undelivered"` | See status rules. |
| datePaid | `"YYYY-MM-DD"` \| null | Required when status is `paid`, else null. |
| retainage | number | Dollars the builder is holding on this invoice. `0` if none. |

### Status and math rules (both apps use these)

- **Outstanding** = sum of `amount` for every invoice whose status is not `paid`.
- **Days outstanding** = today − `dateSent`.
- **Due date** = `dateSent` + `dueTerms` days.
- **Overdue** = status `overdue`, **or** status `sent` and today is past the due date. The AR app
  computes this itself, so a `sent` invoice turns overdue on its own; Jarvis does not have to flip it.
  Days overdue = today − due date.
- **Undelivered** = the client never got it (bounced email, wrong contact). Counts in outstanding,
  shown as "NOT DELIVERED", never counted as overdue until resent and marked `sent`.
- **Aging buckets** (0–30 / 31–60 / 61–90 / 90+) use days outstanding (from `dateSent`) on unpaid
  invoices. An unpaid invoice with no `dateSent` goes in 0–30.
- **Average days to pay** (per client) = mean of `datePaid − dateSent` over that client's `paid`
  invoices. "—" if none.
- **Retainage held** = sum of `retainage` on unpaid invoices. It is part of `amount`, not added on top.
- Partial payments are not in v1. If a builder pays part, Jarvis either keeps the invoice open at the
  full amount or (preferred) records the paid part and the unpaid balance as two invoice rows with
  distinct `id`s, same `number` with a suffix (e.g. `3085-A`, `3085-B`).

### Example invoice object — EXAMPLE SHAPE ONLY, NOT DATA

```json
{
  "id": "EXAMPLE-0001",
  "number": "0000",
  "client": "Example Builder LLC",
  "jobAddress": "123 Example St, Orlando FL",
  "trade": "electrical",
  "amount": 0,
  "dateSent": "2026-01-01",
  "dueTerms": 30,
  "status": "sent",
  "datePaid": null,
  "retainage": 0
}
```

## pnl.months[] — one object per month

Each month has the same block for `electrical`, `hvac` and `totals`:

| Field | Type | Rule |
|---|---|---|
| month | `"YYYY-MM"` | One entry per month, sorted oldest first. |
| <div>.revenue | number | Revenue booked to that division that month. |
| <div>.costs.materials | number | Material cost. |
| <div>.costs.labor | number | Crew labor, meter labor included. |
| <div>.costs.other | number | Permits, equipment, anything else. |
| <div>.costs.total | number | materials + labor + other. |
| <div>.profit | number | revenue − costs.total. |
| totals.* | number | electrical + hvac for each field. |

Jarvis writes `costs.total`, `profit` and `totals` explicitly so the file reads on its own; apps
should recompute and show a warning line if a stored total does not match.

### Example month object — EXAMPLE SHAPE ONLY, NOT DATA

```json
{
  "month": "2026-01",
  "electrical": { "revenue": 0, "costs": { "materials": 0, "labor": 0, "other": 0, "total": 0 }, "profit": 0 },
  "hvac":       { "revenue": 0, "costs": { "materials": 0, "labor": 0, "other": 0, "total": 0 }, "profit": 0 },
  "totals":     { "revenue": 0, "costs": { "materials": 0, "labor": 0, "other": 0, "total": 0 }, "profit": 0 }
}
```

## pnl — P&L fields (revenueBasis, marginFloor, jobs, sources, notes)

The old P&L canvas works job by job, so the P&L app needs a per-job list. Everything below sits
under `pnl`. Nothing in `meta`, `invoices` or `pnl.months` changes. These are merged into
finance-data.schema.json (`pnl.revenueBasis` is required).

| Field | Type | Rule |
|---|---|---|
| pnl.revenueBasis | `"billed"` | Fixed. pnl.months[].revenue ties to invoices by dateSent month and trade. |
| pnl.marginFloor | number | Margin floor as a fraction. Canvas used `0.25`. App defaults to 0.25 if missing. |
| pnl.jobs | array | One row per job or cost line on the P&L sheet. |
| pnl.jobs[].id | string | Unique, never reused. |
| pnl.jobs[].date | string | `YYYY-MM-DD` (or `YYYY-MM` if the sheet has no day). |
| pnl.jobs[].month | `"YYYY-MM"` | Month tab the row belongs to (Nov tab can hold a 10-31 date). |
| pnl.jobs[].name | string | Job name as shown. Text before " — " is the short label on the profit bars. |
| pnl.jobs[].detail | string | Address, invoice #s, how revenue was figured. |
| pnl.jobs[].division | `"electrical"` \| `"hvac"` | Lowercase, same as invoices[].trade. |
| pnl.jobs[].houses | integer \| null | |
| pnl.jobs[].revenue | number \| null | **Billed** revenue on the job's invoices (accrual, Sanjay 2026-11-15). null = not entered. 0 for cost-only rows. |
| pnl.jobs[].material | number \| null | null = not entered. |
| pnl.jobs[].labor | number \| null | Crew labor incl. meter labor. |
| pnl.jobs[].other | number \| null | Permit / other. |
| pnl.jobs[].totalCost | number \| null | null = cost TBD (job left out of profit and margin). |
| pnl.jobs[].note | string | "" if none. |
| pnl.jobs[].flag | `""` \| `"tbd"` \| `"unassigned"` \| `"costOnly"` | Under-floor is computed by the app, not stored. |
| pnl.sources | string[] | Source lines shown in the footer. |
| pnl.notes | string | Free text shown under "Notes". |

Suggested JSON Schema fragment for `properties.pnl.properties`:

```json
"revenueBasis": { "const": "billed" },
"marginFloor": { "type": "number", "minimum": 0, "maximum": 1 },
"sources": { "type": "array", "items": { "type": "string" } },
"notes": { "type": "string" },
"jobs": {
  "type": "array",
  "items": {
    "type": "object",
    "required": ["id","date","month","name","detail","division","houses","revenue","material","labor","other","totalCost","note","flag"],
    "additionalProperties": false,
    "properties": {
      "id": { "type": "string" },
      "date": { "type": "string", "pattern": "^\\d{4}-\\d{2}(-\\d{2})?$" },
      "month": { "type": "string", "pattern": "^\\d{4}-\\d{2}$" },
      "name": { "type": "string" },
      "detail": { "type": "string" },
      "division": { "enum": ["electrical", "hvac"] },
      "houses": { "type": ["integer", "null"] },
      "revenue": { "type": ["number", "null"] },
      "material": { "type": ["number", "null"] },
      "labor": { "type": ["number", "null"] },
      "other": { "type": ["number", "null"] },
      "totalCost": { "type": ["number", "null"] },
      "note": { "type": "string" },
      "flag": { "enum": ["", "tbd", "unassigned", "costOnly"] }
    }
  }
}
```

How the app uses months vs jobs: job list drives the filters, totals, bars and job cards. The
"Month by month" table uses `pnl.months` when it has entries (and warns if a stored total does not
add up); if `pnl.months` is empty it adds up `pnl.jobs` instead.

Revenue basis: SCHEMA.md open decision 1 is now settled as **billed**. pnl.months[].<div>.revenue =
sum of invoices[].amount with that trade and dateSent in that month. The P&L app warns on a mismatch.

## Open decisions (Sanjay / Jarvis)

1. **P&L revenue basis — SETTLED: billed** (Sanjay, 2026-11-15). Revenue is booked when invoiced.
   `pnl.months[].<div>.revenue` = sum of `invoices[].amount` (retainage included) with that trade and
   `dateSent` in that month. `pnl.revenueBasis` is fixed to `"billed"`.
2. **Partial payments.** v1 has no `amountPaid` field. Use split rows (above) or approve a v2 field.
3. **Retainage release.** When retainage is billed later, bill it as its own invoice row.
4. **Clients spelling.** Jarvis keeps one exact spelling per builder; two spellings show up as two builders.

## Validation before every commit

- `python3 -m json.tool finance-data.json` passes (valid JSON).
- Validate against `finance-data.schema.json` (e.g. `npx ajv-cli validate -s finance-data.schema.json -d finance-data.json --spec=draft2020`).
- Every `id` unique; `paid` has a `datePaid`; amounts are plain numbers.
- Update `meta.asOf` and `meta.updatedBy` on every edit.
