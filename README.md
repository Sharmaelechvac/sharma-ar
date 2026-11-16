# Sharma AR — Accounts Receivable

Phone-first AR board for Sharma Electric & HVAC: what every builder owes us, what is overdue,
and how old it is. Front end only. **All numbers come from the shared finance data file**, published encrypted as
`finance-data.enc.json` and unlocked with the office code. Nothing is typed into the code.

Live (once Pages is on): `https://sharmaelechvac.github.io/sharma-ar/`

## Files

| File | What it is |
|---|---|
| `index.html` | Page shell |
| `styles.css` | Sharma standard: navy/gold, flat, 4px corners, 16px min text, 48px taps |
| `app.js` | Loads the data file, does the math, draws the page |
| `lock.js` | Code screen + WebCrypto decrypt (same file in sharma-pnl) |
| `finance-data.enc.json` | **The data file, encrypted.** No invoices and no revenue yet; P&L job costs carried from the P&L sheet. Jarvis fills the rest. |
| `tools/encrypt.py` | Schema check + encrypt (and `--decrypt` for editing) |
| `.gitignore` | Keeps the plain `finance-data.json` out of git |
| `SCHEMA.md` | Field-by-field rules for the data file |
| `finance-data.schema.json` | JSON Schema to validate the data file |
| `assets/logo.png` | Real Sharma Electric & HVAC horizontal logo (same art as the ACH sheet) |

## Where the data lives

- Repo: `Sharmaelechvac/sharma-ar`, file `finance-data.enc.json` at the repo root.
- URL: `https://sharmaelechvac.github.io/sharma-ar/finance-data.enc.json`
- The page fetches it on every load with `cache: 'no-store'`. Re-encrypt, commit the `.enc.json`,
  wait for Pages to publish (about a minute), reload. No code change, ever.
- The old plain URL `.../sharma-ar/finance-data.json` is gone (404).

## How AR and P&L share it (one source of truth)

**Recommendation: this file is the only copy.** The Sharma P&L app (`sharma-pnl`) fetches
`https://sharmaelechvac.github.io/sharma-ar/finance-data.enc.json` instead of keeping its own.
GitHub Pages allows cross-origin reads, so this works with no server.

- AR reads `meta` + `invoices`.
- P&L reads `meta` + `pnl` (`months`, `jobs`, `revenueBasis`, `marginFloor`, `sources`, `notes`) (and can read `invoices` to show "billed this month" as a check).
- Same file, same numbers. Nothing typed twice. Do not copy the JSON into `sharma-pnl`.
- If Sanjay wants the data in its own repo later (e.g. `sharma-finance-data`), move the file
  there and change the one `DATA_URL` line at the top of `app.js` in both apps.

## Schema (v1)

Full rules: `finance-data.schema.json` and `SCHEMA.md` (both in this repo). P&L revenue is **billed** basis (Sanjay, 2026-11-15).

```json
{
  "meta": { "schemaVersion": 1, "company": "Sharma Electric & HVAC", "asOf": "", "currency": "USD", "updatedBy": "" },
  "invoices": [],
  "pnl": { "divisions": ["electrical", "hvac"], "months": [] }
}
```

Invoice fields, exactly: `id`, `number`, `client`, `jobAddress`, `trade` (`electrical`|`hvac`),
`amount` (number), `dateSent` (`YYYY-MM-DD`), `dueTerms` (integer days), `status`
(`sent`|`paid`|`overdue`|`undelivered`), `datePaid` (`YYYY-MM-DD` or `null`), `retainage` (number, `0` if none).

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

## Design

Sharma standard (Mark Cuban, Design, 11/15): navy #264387, dark navy #1a2f61, gold #F0A846,
ink #1d2433, gray #5b6478, lines #dfe4ee, page #f4f6fb. Barlow Semi Condensed 700 headings,
Inter body, IBM Plex Mono numbers. White header, real logo, 3px gold line. No gradients,
shadows, blur, emoji, pills or charts that don't track anything real.

## Publishing (how edits go live)

- Edit **`main`** only. GitHub Pages serves the `gh-pages` branch.
- `.github/workflows/publish.yml` runs on every push to `main`: it copies `main` onto `gh-pages`
  and publishes it. Live in about 1 minute. Never edit `gh-pages` by hand; it is overwritten.
- If Sanjay ever switches Settings > Pages to "Deploy from branch: main / (root)", the workflow
  and the `gh-pages` branch can be removed.
