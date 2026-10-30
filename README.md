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

## Neon PostgreSQL backend

The deployed Vercel project uses **Neon PostgreSQL** for shared inventory, stock counts, staff accounts and reporting. The frontend calls the same-origin Vercel Function at `/api/index`; database credentials remain server-side.

### First-time setup

1. Confirm the Neon integration is connected to the Vercel project and that `POSTGRES_URL` is available in the Vercel environment used by the deployment.
2. Deploy this branch to a Vercel preview and open the preview URL.
3. On the first visit, create the initial administrator with a unique username and a password of at least 12 characters. The first admin session seeds the original **103 inventory items** into Neon automatically.
4. Sign in as the administrator and open **Verifier → Staff management**. Create Counter and Verifier accounts using unique usernames and strong passwords (12+ characters).
5. Counters enter physical quantities. Verifiers enter system quantities and remarks, view reports, and manage the catalogue.

The initial administrator can be created only while the users table is empty. The server enforces role checks for account and catalogue management. Sessions use signed, HttpOnly, Secure, SameSite cookies and expire after 12 hours. Passwords are stored as salted scrypt hashes.

### Item catalogue management

Expand **Staff management → Item catalogue** while signed in as the administrator.

- Add a single item using its permanent Item ID, Item Name and UOM.
- Import a CSV exported from Excel. The required columns are **Item ID**, **Item Name** and **UOM** (also accepts common variants such as `ID`, `Description`, `Unit`).
- Review the preview before importing. Duplicate IDs within the file and missing fields are rejected.
- Importing an existing ID updates its name/UOM and reactivates it. Historical count rows remain in the database.
- Do not reuse an ID for a different product. Archive/deactivation should be preferred to deleting inventory records.

The initial 103-item catalogue is bundled in `data/catalog.json` and is seeded once when the first administrator signs in. It does not import historical count records or old Google Sheets user accounts.

### Data migration note

The Neon migration preserves the existing item catalogue and the Counter/Verifier workflows, but it does **not** automatically copy historical counts or staff accounts from the former Google Sheets database. Keep the original Sheet as a read-only archive until its records and user list have been exported and reconciled. Create new staff accounts in the Neon administrator dashboard; do not reuse weak legacy PINs.

### Reports

Daily, weekly and monthly Executive PDF and Detailed CSV reports are generated from Neon-saved stock records. Only Verifier accounts can request reports. The export includes saved count details, item IDs and archived historical item references where applicable.


