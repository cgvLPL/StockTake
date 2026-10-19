# CGV StockTake

A mobile-friendly daily stock-counting app with 103 inventory items, actual/system comparisons, daily history, month summaries, search, and Excel export. No server or runtime dependencies are needed.

## Open the app

Once GitHub Pages is enabled, the app is served at **https://cgvlpl.github.io/StockTake/**.

One-time setup: open **Settings → Pages → Build and deployment → Source → GitHub Actions**. Then open **Actions → Test and deploy StockTake → Run workflow**. Subsequent pushes to `main` test and deploy automatically.

On iPhone, open the site in Safari and use **Share → Add to Home Screen**. The app works offline after the first successful online load and service-worker installation. Browser support for installation varies.

## Counting

- Choose a date, then enter Actual and System quantities. Both are required for an item to count as completed.
- Use up to four decimal places, e.g. `1000,50` or `1000.50`. A single separator is always decimal. Indonesian grouped values such as `1.000,50` are accepted; use `1000` for one thousand without a fractional part.
- Invalid numbers are marked in red and excluded from matches. Differences display all supported decimal places.
- Search and filters update as entries change. Completing a row removes it from the active filter after you leave the row, so typing is not interrupted.
- **Copy for Excel** exports all items for the selected date, including the date. Numbers use Indonesian decimal commas; paste with an Indonesian spreadsheet locale. Text that could be interpreted as a formula is escaped.
- Tap the bin twice within three seconds to clear the selected day. Switching dates cancels the confirmation.

## Data and backups

Counts are saved only in this browser's local storage. They are not committed to GitHub, sent to a server, or synchronized between devices. Clearing browser data removes counts. Keep regular Excel copies; there is no spreadsheet import.

If saving fails, a persistent warning appears. Unsaved edits remain available when switching dates in the same tab; use **Retry saving** or copy each affected date before closing. Corrupted stored records are preserved and not silently overwritten. Use Clear day only if you intend to discard that saved day's data.

Legacy index-keyed records on the **same browser origin** migrate to fixed item IDs when next saved. Opening this hosted app does not import entries from the original HTML file or another origin; copy those entries for safekeeping first. Use one editing tab per device to avoid concurrent edits.

## Development

Serve this directory with any static HTTP server, for example `python3 -m http.server 8080`, then open `http://localhost:8080`. Run regression tests with `npm test` (Node 20+; no package installation needed).

- `index.html`: interface
- `styles.css`: responsive styling
- `app.js`: catalog, calculations, persistence, filtering and export
- `manifest.webmanifest`, `icon.svg`, `sw.js`: home-screen and offline support
- `tests/`: numeric, storage, migration, filtering and clear-day regression tests
- `.github/workflows/pages.yml`: tests and GitHub Pages deployment

Keep catalog IDs permanent. Do not renumber IDs when sorting or inserting items. GitHub Actions stamps the service-worker cache with the commit SHA on every deployment, so every release is detectable.

## Branding

The approved CGV StockTake design uses the original CGV vector mark from [KnowledgeAcademy](https://github.com/cgvLPL/KnowledgeAcademy/blob/main/public/brand/cgv-knowledge-academy.svg), a warm gradient divider, and a light/bold StockTake wordmark. Lettering is outlined for consistent rendering. `brand/` includes the header logo, favicon, PNG app icons, and iPhone home-screen icon. The Actions workflow deploys these assets and the offline cache includes them.

## Update notifications

While the app is open, it checks for a new version every minute and when you return to the tab or reconnect. Once the new app shell is downloaded, a **New version available** banner offers **Refresh** or **Later**. It never automatically refreshes an editing tab. Refresh retries pending saves and is blocked if any entries remain unsaved. Updating in another tab prompts this tab rather than reloading it. Dismissing a version hides that prompt for the current page session.

Existing installations need one normal page refresh to load this notification feature. Future deployments are then detected automatically. Offline users receive the prompt after reconnecting and downloading the update.

## Google Apps Script + Google Sheets synchronization

This version uses **Google Sheets** as the shared stock database, with **Google Apps Script** as the backend. Supabase is not required.

1. Create a Google Sheet with a `Users` tab. Row 1: `Username | PIN_SHA256 | Role`.
2. In Apps Script (Extensions → Apps Script), paste `google-apps-script/Code.gs` into `Code.gs`.
3. Set a Script Property `SHEET_ID` to your Google Sheet's ID (Project Settings → Script properties).
4. Add users to the `Users` sheet, with usernames, SHA-256 hexadecimal hashes of their PINs, and roles `counter` or `verifier`. Use long, unique random passphrases rather than short numeric PINs. Do not put plaintext credentials in the repository.
5. Deploy → New deployment → Web app → Execute as **Me**, Who has access **Anyone**. Copy the `/exec` URL to `cloud-config.js` and commit that URL.
6. Refresh the GitHub Pages app and sign in. Counters enter physical counts; Verifiers view shared counts and upload system quantities and remarks.

**Security limitations:** This basic Apps Script deployment authenticates with staff credentials managed in a Google Sheet. It does not provide Google account sign-in, rate limiting, session tokens, or an enterprise-grade audit trail. Anyone with the web app URL can attempt authentication. Use strong random passphrases, protect the Sheet, and do not use this for sensitive production inventory without stronger authentication. Google Apps Script HTML iframe POST responses may be subject to browser restrictions, so validate the integration on your devices before relying on it. Network access is required.

**Synchronization:** Counter changes save to the shared Sheet after each field change. Verifiers load a snapshot of that data and explicitly upload their system quantities and remarks. Refresh cloud data to see another user's edits. Automatic live updates and conflict resolution are not included. The Verifier dashboard continues to use a local working copy.

## Daily, weekly, and monthly report downloads

Verifier users can open **Download stocktake report** on the dashboard, select **Daily**, **Weekly**, or **Monthly**, pick a reference date, and choose **Executive PDF** or **Detailed CSV**.

- **Executive PDF** produces a professional, downloadable, A4 multi-page management report with period KPIs, counted item-day coverage, match rate, a 14-day activity snapshot, a full daily summary table, and the 15 most recent variance records (where available). PDF is generated locally in the browser from the authenticated Google Sheets report response, without third-party PDF services. For complete item-by-item details, use the CSV. The executive report clearly flags periods without saved counts.
- **Detailed CSV** keeps the full item-level audit export for Excel.
- **Daily** exports the selected day, including all current inventory items and their Actual, System, Difference, Remarks and Status fields, even if no count has been entered.
- **Weekly** covers Monday through Sunday containing the selected date. **Monthly** covers the entire selected calendar month. Both include daily summaries for every date, and item details for dates that have saved records.
- The Excel-compatible UTF-8 CSV includes a daily summary (counted, verified, matched, differences, pending and not counted) followed by an item-level detail section. Zero values and decimal quantities are preserved. Exported notes and item names are sanitized to reduce spreadsheet-formula injection risks.
- Reports are read from the **Google Sheets Counts tab**, not from the current device's local storage. Only **Verifier** accounts are authorized to request reports. The exports do not modify inventory or stock counts.
- If an item recorded historically is no longer part of the active Inventory list, its item ID appears under an 'Archived item' label.

**One-time Apps Script update required:** copy the latest `google-apps-script/Code.gs` into the associated Google Apps Script project, then select **Deploy → Manage deployments → Edit → New version → Deploy**. The GitHub Pages update alone does not enable the new authenticated `report` backend action. Keep the existing deployment URL and Script Properties unchanged.

## Editable Inventory and Excel-style daily reports

After setting `SHEET_ID`, run `seedInventory()` **once** in the Apps Script editor. It creates the `Inventory` tab and imports the original 103 catalog items. Do not run it on a populated Inventory tab.

Inventory columns: `Item ID | Item Name | UOM | Active | Sort Order`. Edit names, UOM, sort order, or the Active checkbox directly in Google Sheets. To add an item, assign a **new permanent ID** such as `stock-104` and mark it active. Never reuse an existing ID, even if the item is inactive. The app reloads this list when Counter or Verifier loads a date or refreshes cloud data.

The backend also generates a formatted daily tab such as `14-Oct-2026` on each save, with the original workbook's eight columns and calculated Difference and Status. A `Summary` tab provides daily totals. `Counts` is the authoritative record store; daily tabs are **generated views** and direct edits to them will be overwritten. To change stock values, use the web app. The date tabs and summary are created for days with saved counts, rather than pre-creating every date of the month.

For production, test Apps Script permissions and browser communication before rollout. Google Sheets should be shared only with trusted inventory administrators; staff use the web app rather than editing protected records.

## Staff account setup

The backend provides `setupStaffAccounts()` to create or update two accounts:
- `admin` — `verifier`
- `stars` — `counter`

In the Apps Script editor, open **Project Settings → Script Properties**, set `ADMIN_PIN` and `STARS_PIN` to the desired PINs, and run `setupStaffAccounts()` once. It writes SHA-256 PIN hashes to the private `Users` tab, not plaintext PINs. Then **Deploy → Manage deployments → Edit → New version → Deploy** so the web app runs the updated code.

A four-digit PIN (including 0000) is weak and not recommended for an internet-exposed application. Prefer long, unique passphrases and add throttling and proper authentication before production use.

## Verifier staff account management

After deploying the latest Apps Script version, sign in as a Verifier and expand **Staff management** on the Verifier dashboard. Verifiers can create additional Counter and Verifier users. Usernames must be unique, and new passwords must be at least eight characters. Counter users cannot call the create-user backend operation. The `Users` sheet stores SHA-256 password hashes. The initial admin/stars accounts still require running `setupStaffAccounts()` in the Apps Script editor; GitHub deployment cannot modify Apps Script project properties or spreadsheet data automatically.

Security: this starter authentication has no brute-force rate limiting, salts, or account recovery. Do not use weak 4-digit PINs on an internet-accessible app in production.
