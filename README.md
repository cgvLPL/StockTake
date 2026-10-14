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

## Counter / Verifier cloud setup

This release adds a role-selection welcome screen, a streamlined Counter entry view and the existing Verifier dashboard. **Cloud synchronization requires your own Supabase project**; it will not work until configured.

1. Create a Supabase project and run `supabase/schema.sql` in the SQL editor.
2. In Supabase Authentication, create each staff member as an email/password user. Copy their Auth user UUID.
3. In SQL editor assign each user a role: `insert into public.profiles(id,role) values ('USER_UUID','counter');` (or `'verifier'`). Never expose an administrative service-role key.
4. In Supabase Project Settings, obtain the project URL and **publishable/anon** key. Put them in `cloud-config.js`. These are public browser credentials; Row Level Security and role-checked RPCs enforce access.
5. Redeploy GitHub Pages and sign in. Counters save physical counts immediately to Supabase. Verifiers open a cloud snapshot in the original dashboard and use **Upload dashboard changes** to save system quantities and remarks. Use **Reload cloud** to see new Counter counts.

Important: Verifier uploads intentionally cannot change Counter actual quantities. Shared data requires network access; offline edits are not automatically queued. The original dashboard still uses local storage as a working view. Avoid simultaneous Verifier editing and reload before editing if another person has changed the date. There is currently no audit log or conflict resolution. This is an initial cloud integration, not a complete production inventory control system.

The public GitHub Pages source includes `cloud-config.js`; only put the public publishable/anon key in it. Never commit a service-role secret or staff passwords.
