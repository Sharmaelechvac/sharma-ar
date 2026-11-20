# Sharma Finance (AR · P&L · Budget · Collections · Material Costs)

One phone-first app for Sharma Electric & HVAC, one code screen, five tabs. Front end only. **Owner-only**: everything sits behind the office code, and no figure from this app renders anywhere else (the single exception is the counts-only feed below). **All numbers come from the shared finance file**, published encrypted as `finance-data.enc.json` and unlocked with the office code. Nothing is typed into the code. Unlock once per data file; the derived keys are kept per file for this browser tab, so switching tabs does not ask again.

Live: `https://sharmaelechvac.github.io/sharma-ar/`

| Tab | Path | Reads |
|---|---|---|
| **AR** — what every builder owes us, overdue, aging | `/sharma-ar/` | `meta`, `invoices` |
| **P&L** — profit by job (moved here from the `sharma-pnl` repo, 2026-11-17) | `/sharma-ar/pnl/` | `meta`, `pnl` |
| **Budget** — budget vs actual by job | `/sharma-ar/budget/` | `meta`, `pnl.jobs`, `invoices`, `budgets` |
| **Collections** — follow up today / overdue, notes, tap-to-call/email, crew links, We owe | `/sharma-ar/collections/` | `meta`, `invoices`, `collections` |
| **Material Costs** — distributor prices we pay, photo catalog, re-check list (added 2026-11-20, lean plan app 3) | `/sharma-ar/materials/` | the Material Pricing app's `prices.enc.json` + `photos.json`, read from that app — see below |

## Material Costs data — one source, read from the pricing app

The Materials tab does **not** keep a copy of any price. It fetches the same
encrypted `prices.enc.json` the Material Pricing app publishes
(`https://sharmaelechvac.github.io/sharma-material-pricing/prices.enc.json`,
same office code, same `sharma-enc-v1` envelope) plus that app's public
`photos.json`/`img/`, and renders them inside Finance. Price updates keep
flowing through the price tracker → `sharma-material-pricing` publish; this
tab picks them up on the next load. Headline tiles are counts only — no
money-sum tiles, and no per-house cost rollup. The standalone Material
Pricing app stays live for now; retiring it is a separate drop decision.

## The one outward feed: `finance-counts.json`

`finance-counts.json` (repo root, public) holds exactly one number:
`openInvoices`, plus the data `asOf` date. No amounts, no client names,
ever. It exists so Sharma Home can show an open-invoice count — the only
Finance figure allowed outside the code screen. `tools/encrypt.py`
regenerates it from the same plain data on every publish, so it cannot
drift. Nothing else leaves this app: no Finance numbers on Home tiles, TV
mode, or any client/crew page.

Old links: `https://sharmaelechvac.github.io/sharma-pnl/` redirects to the P&L tab. `/sharma-ar/#pnl`, `#budget`, `#collections` open those tabs. The old Collections worker app is no longer on Sharma Home; its data was folded into the `collections` section on 2026-11-17 (it had 0 invoices and 5 We owe rows).

`shell.css` is the shared header + tab bar. Each tab keeps its own logic and look.

## Files

| File | What it is |
|---|---|
| `index.html` | AR page shell |
| `styles.css` | Sharma standard: navy/gold, flat, 4px corners, 16px min text, 48px taps |
| `app.js` | AR: loads the encrypted file through `lock.js`, does the math, draws the page |
| `lock.js` | Code screen + WebCrypto decrypt, shared by all five tabs. Derived keys are kept per data file (keyed by salt), so the finance file and the prices file each unlock once per session. Wrong-code alerts are labeled per app. |
| `finance-data.enc.json` | **The data file, encrypted.** The schema requires `budgets.jobs` (empty until entered) inside this file. The app treats a missing section as empty until the next encrypt. |
| `finance-counts.json` | Counts-only outward feed (open-invoice count + as-of date). Written by `tools/encrypt.py` on every publish. |
| `materials/` | Material Costs tab (catalog UI; reads the pricing app's published files, holds no data of its own) |
| `tools/encrypt.py` | Schema check + encrypt (and `--decrypt` for editing); also regenerates `finance-counts.json` |
| `.gitignore` | Keeps the plain `finance-data.json` out of git |
| `SCHEMA.md` | Field-by-field rules for the data file |
| `finance-data.schema.json` | JSON Schema to validate the data file |
| `assets/logo.png` | Real Sharma Electric & HVAC horizontal logo (same art as the ACH sheet) |
| `budget/` | Budget tab (list, job detail, totals by division) |
| `pnl/` | P&L tab (code moved from `sharma-pnl`, same logic and look; same fonts, loaded like the other tabs) |
| `collections/` | Collections tab (follow-ups, notes, contacts, crew links, We owe) |
| `shell.css` | Shared Sharma Finance header and tab bar |
| `budget/finance-data.example.json` | Fake jobs for screenshots and tests. The published app does not load it. |

## Where the data lives

- Repo: `Sharmaelechvac/sharma-ar`, file `finance-data.enc.json` at the repo root.
- URL: `https://sharmaelechvac.github.io/sharma-ar/finance-data.enc.json`
- The page fetches it on every load with `cache: 'no-store'`. Re-encrypt, commit the `.enc.json`,
  wait for Pages to publish (about a minute), reload. No code change, ever.
- The old plain URL `.../sharma-ar/finance-data.json` is gone (404).

## How AR, P&L, and Budget share it (one source of truth)

**This file is the only copy.** The Sharma P&L app (`sharma-pnl`) fetches
`https://sharmaelechvac.github.io/sharma-ar/finance-data.enc.json` instead of keeping its own.
GitHub Pages allows cross-origin reads, so this works with no server.

- AR reads `meta` + `invoices`.
- P&L reads `meta` + `pnl` (`months`, `jobs`, `revenueBasis`, `marginFloor`, `sources`, `notes`) (and can read `invoices` to show "billed this month" as a check).
- Budget reads `meta` + `pnl.jobs` (actual cost) + `invoices` (billed, paid, outstanding, retainage) + `budgets` (contract price and lines). It does not keep a second copy of any number.
- Same file, same numbers. Nothing typed twice. Do not copy the JSON into `sharma-pnl`.
- If Sanjay wants the data in its own repo later (e.g. `sharma-finance-data`), move the file
  there and change the one `DATA_URL` line at the top of `app.js` in each app.

## Schema (v1)

Full rules: `finance-data.schema.json` and `SCHEMA.md` (both in this repo). P&L revenue is **billed** basis (Sanjay, 2026-11-15).

```json
{
  "meta": { "schemaVersion": 1, "company": "Sharma Electric & HVAC", "asOf": "", "currency": "USD", "updatedBy": "" },
  "invoices": [],
  "pnl": { "divisions": ["electrical", "hvac"], "months": [] },
  "budgets": { "jobs": [] }
}
```

`budgets.jobs` is one budget per `pnl.jobs[].id` (`jobId`). Each budget has `contractPrice`, `houses`, and lines for material, labor, permit, and other, split by phase (underground, rough-in, trim) and by division. A line is never both electrical and HVAC. A site with both trades is two P&L jobs and two budgets. Null means not entered; the Budget app does not treat null as 0. `schemaVersion` stays 1.

Projected margin = (contract price − budget) / contract price. Profit margin = (revenue − cost) / revenue. A job is flagged when projected margin is below `pnl.marginFloor` (default 0.25).

Invoices match a job only when `trade` equals the job's division, and then only if the street address or the client name appears on that job. If two jobs tie, the invoice is left unmatched. The full rule is in `SCHEMA.md`.

Invoice fields: `id`, `number`, `client`, `jobAddress`, `trade` (`electrical`|`hvac`|`null`),
`amount` (number), `dateSent` (`YYYY-MM-DD`), `dueTerms` (integer days), `status`
(`sent`|`paid`|`overdue`|`undelivered`), `datePaid` (`YYYY-MM-DD` or `null`), `retainage` (number, `0` if none).
Optional: `description`, `warning` (text). `trade` may be `null` when the source invoice states no trade (not guessed).
Optional top-level `warnings`, `handoffNotes`, and `unbilledDrafts` (unsent Jobber drafts — never counted in any AR total).
Optional: `livingSF` / `underRoofSF` (integer or `null`; absent or `null` = not on file — the apps show
"not on file" and never invent a figure). The same two optional fields are accepted on `pnl.jobs[]` and
`budgets.jobs[]`; AR shows them on each invoice row, Budget on each job (list, table, and detail), and P&L on each job card.

**Example invoice — EXAMPLE SHAPE ONLY, NOT DATA:**

```json
{ "id": "EXAMPLE-0001", "number": "0000", "client": "Example Builder LLC", "jobAddress": "123 Example St, Orlando FL",
  "trade": "electrical", "amount": 0, "dateSent": "2026-01-01", "dueTerms": 30, "status": "sent",
  "datePaid": null, "retainage": 0 }
```

**Example P&L month — EXAMPLE SHAPE ONLY, NOT DATA:**

```json
{ "month": "2026-01",
  "electrical": { "revenue": 0, "costs": { "materials": 0, "labor": 0, "other": 0, "total": 0 }, "profit": 0 },
  "hvac":       { "revenue": 0, "costs": { "materials": 0, "labor": 0, "other": 0, "total": 0 }, "profit": 0 },
  "totals":     { "revenue": 0, "costs": { "materials": 0, "labor": 0, "other": 0, "total": 0 }, "profit": 0 } }
```

## Passcode lock and encryption

The data is **encrypted**. Only `finance-data.enc.json` is published; the plain
`finance-data.json` is a local working copy, listed in `.gitignore`, and is never committed.

- Format: AES-GCM 256. Key = PBKDF2-HMAC-SHA256(office code, random 16-byte salt,
  600,000 iterations). Random 12-byte IV. Fresh salt and IV on every encrypt.
  The `.enc.json` holds `format`, `kdf`, `hash`, `iterations`, `cipher`, `salt`, `iv`,
  `ciphertext` (base64).
- `lock.js` (same file in sharma-ar and sharma-pnl) shows the code screen, derives the key in
  the browser with WebCrypto and decrypts. Wrong code shows "Wrong code". After unlock only the
  derived key is kept, in `sessionStorage` (this tab only, gone when the tab closes). The code
  itself is never stored. The "Lock" button at the bottom clears it.
- The office code is **not** in this repo, its history, or any doc. Sanjay gives it out directly.
- This is static hosting: anyone can download the `.enc.json`. A short numeric code can be
  guessed offline by someone determined, so treat this as a lock on the door, not a vault.

## Updating the numbers (Jarvis)

```bash
pip install cryptography jsonschema
git pull                                   # latest main
python3 tools/encrypt.py --decrypt         # .enc.json -> local finance-data.json (never committed)
# edit finance-data.json
python3 tools/encrypt.py                   # schema check, then writes finance-data.enc.json
git add finance-data.enc.json && git commit -m "Data: <what changed>" && git push
```

The code comes from the `SHARMA_PASSCODE` environment variable or a hidden prompt. Never put
it in a file, a commit message, a script or a chat log. `tools/encrypt.py` refuses to write if
the schema check fails, and checks that its output decrypts back to the same data.

## How the page does the math

- Outstanding = every invoice not `paid`. Paid invoices sit in a closed "Paid" section.
- Days out = today − `dateSent`. Due date = `dateSent` + `dueTerms`.
- Overdue = `status: "overdue"`, or `sent` and past the due date (the page flips it on its own).
  Shown as a dark navy tag: `OVERDUE — 45 DAYS` (days past due), with a gold bar on the row.
- `undelivered` counts in outstanding, tagged `NOT DELIVERED`, never counted as overdue.
- Aging 0–30 / 31–60 / 61–90 / 90+ = days out on unpaid invoices.
- Per builder: owed, oldest open invoice (days), average days to pay from that builder's paid
  invoices (`datePaid − dateSent`), "—" when there is no paid history.
- Retainage held = sum of `retainage` on unpaid invoices (already inside `amount`).
- Builders with overdue money sort first.

## Rules for Jarvis when editing the data

1. Edit only the data (decrypt, edit, re-encrypt — see above). Pull latest `main` first.
2. Plain numbers: `1250.5`, not `"$1,250.50"`. Dates `YYYY-MM-DD`.
3. One exact spelling per builder — the name is the grouping key.
4. `paid` needs `datePaid`. Unique `id` per row.
5. Update `meta.asOf` and `meta.updatedBy` every time.
6. `tools/encrypt.py` validates against `finance-data.schema.json` before it writes. Commit only
   `finance-data.enc.json`. Never commit the plain `finance-data.json`.
7. Never put test or sample rows in the data.

The page survives missing or bad fields (blank client, text amounts, bad dates) without
crashing, but the numbers are only right if the file follows the schema.

AR and Budget both use `lock.js`. After unlock, only the derived key is kept in `sessionStorage` for this tab. Five wrong tries on Budget send the same office alert as AR, labeled `Sharma Budget`. The code is not in this repo.

## Shared nav

AR and Budget have a plain-text tab bar (gold bar on the current app). To add that bar in `sharma-pnl`, paste only the markup below after `</header>`, plus the CSS. Do not change P&L's `lock.js` or its `DATA_URL`.

```html
<nav class="apps" aria-label="Sharma apps">
  <a href="https://sharmaelechvac.github.io/sharma-ar/">AR</a>
  <a href="https://sharmaelechvac.github.io/sharma-pnl/" aria-current="page">P&amp;L</a>
  <a href="https://sharmaelechvac.github.io/sharma-ar/budget/">Budget</a>
</nav>
```

```css
.apps{display:flex;background:var(--white);border-bottom:1px solid var(--line)}
.apps a{flex:1;min-height:48px;display:flex;align-items:center;justify-content:center;padding:8px 6px;font:700 16px/1.1 var(--head);color:var(--navy);text-decoration:none;text-transform:uppercase;letter-spacing:.04em;border-bottom:3px solid transparent;text-align:center}
.apps a[aria-current="page"]{color:var(--dnavy);border-bottom-color:var(--gold)}
```

## Budget screens

1. **Jobs** — budget, actual cost to date, variance in dollars and percent, projected margin, and a below-floor flag.
2. **Job** — budget, actual, and variance for each phase and cost type, plus billed / paid / outstanding / retainage from the matched invoices.
3. **Divisions** — electrical and HVAC totaled apart.

Phase actuals are not in the finance file, so those cells stay "not entered". Material, labor, and other actuals are the P&L job totals. Permit has no actual of its own. `budget/finance-data.example.json` is for local screenshots (`?example=1` on localhost only) and for tests. The page on GitHub Pages never requests it.

## Design

Sharma standard (Mark Cuban, Design, 11/15): navy #264387, dark navy #1a2f61, gold #F0A846,
ink #1d2433, gray #5b6478, lines #dfe4ee, page #f4f6fb. kit display headings,
Inter body, IBM Plex Mono numbers. White header, real logo, 3px gold line. No gradients,
shadows, blur, emoji, pills or charts that don't track anything real.

## Publishing (how edits go live)

- Edit **`main`** only. GitHub Pages serves the `gh-pages` branch.
- `.github/workflows/publish.yml` runs on every push to `main`: it copies `main` onto `gh-pages`
  and publishes it. Live in about 1 minute. Never edit `gh-pages` by hand; it is overwritten.
- If Sanjay ever switches Settings > Pages to "Deploy from branch: main / (root)", the workflow
  and the `gh-pages` branch can be removed.
