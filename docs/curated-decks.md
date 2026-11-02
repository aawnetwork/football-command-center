# Maintaining CFB decks

Open `/admin/decks` and sign in with the same credentials as Export Studio. Create Deck, enter a name, select season/week, assign S–D tiers, Save Draft, then Publish. Published decks appear in public CFB Games → Load a Deck after refresh. Unpublish removes the public option but retains the saved draft. Editing and saving a published deck does not update its public snapshot until Publish is selected again.

Saved drafts and published snapshots live in the server-only Supabase `desk_curated_decks` table. Client roles have no table grants and RLS denies client access. Private APIs independently enforce existing Export Studio authorization; writes require same-origin JSON requests and revision checks. A conflicting edit returns an error: reload before trying again. SQL is recorded in `supabase/desk-curated-decks.sql`.

The editor uses the existing scoreboard to verify game IDs against the selected season/week. Week 0 currently uses the existing 2026-specific slate split; other seasons support weeks 1–16. No extra polling is added.

File-based presets in `app/cfb/data/curated-decks.ts` remain a fallback if database loading fails. Add contributor-approved picks only; the shipped list is intentionally empty until picks are provided.

Example structure (IDs below are illustrative, not publishable picks):

```ts
export const curatedDecks: CuratedDeck[] = [{
  id: "fletch-2026-week-6",
  league: "CFB",
  season: 2026,
  week: 6,
  name: "Fletch's Deck",
  assignments: { "ESPN_EVENT_ID": "S", "ANOTHER_EVENT_ID": "A" },
}];
```

Use unique deck IDs and the numeric event IDs returned by `/api/scoreboard?week=6`. Week 0 is supported. Invalid tiers and IDs outside the selected slate are ignored. A deck with no valid selections cannot be loaded. Only the selected season/week's decks appear.

File-based changes require the normal commit/push deployment process; private manager publication does not. There is no automatic deck generator.

Loaded decks and edits are session-only overlays. Personal tiers remain in `cfb-game-tiers`; Return to my selections (or a reload) restores them. Switching weeks does not apply a deck to a different slate.

Share My Deck uses explicit assigned tiers, not automatic suggestions. Exports include all assigned games in the selected week, independent of current on-screen conference/tier filters. S is checked by default; empty tiers are omitted. PNG creation is client-side and does not upload selections.

## External contributors

Admin → Presets includes **Contributor links** and an **Awaiting review** filter.
Create a separate invitation for each contributor. Choose **One preset** or
**Continuous**, optionally set an expiry, and optionally restrict its season/week.
Copy the generated link immediately: its secret is displayed only once and only
its SHA-256 hash is stored. Anyone holding that link has its contributor access;
the label is not a verified identity. Do not share the Admin password with guests.

Guests open `/contribute/presets` using their invitation, name their preset, assign
tiers, and select **Save Draft**, then **Submit for Review**. A saved draft may be
empty, but submission requires at least one valid game assignment. Guests can
only access presets attached to their own invitation. Submitted/approved versions
are locked against guest edits. Guests cannot publish or unpublish, including by
sending a handcrafted API request.

- **One preset:** reading/opening the link does not consume it. It permits one
  preset with repeated draft saves. Successful submission consumes the link in
  the same database transaction as the submission. Returning that preset for
  changes reopens the same link for that existing preset, without permitting a
  second preset.
- **Continuous:** allows further presets until revoked/expired, up to 250 presets
  per invitation. Issue a new link if the limit is reached. Use separate links
  for separate people; a shared link shares its drafts.
- **Revoke:** stops further guest reads/writes, including requests from previously
  open sessions. Existing drafts and public snapshots remain. Reopening for
  changes never overrides expiry or revocation.

Select a submitted preset under **Awaiting review**. Review/edit it, save any
admin changes, then **Publish** or enter feedback and **Return for changes**.
Returning a previously published preset does not remove its public snapshot.
Guest revisions remain private until resubmitted and explicitly published again.
Approved presets may also be unpublished and republished by an admin.

Publishing continues to use the existing shared Admin credential. It is exclusive
to you only if you alone hold that credential; individual publisher accounts are
not part of this addition. No email notifications or guest accounts are added.

### Installation and deployment

1. Back up the database according to the existing project process. Apply
   `supabase/desk-preset-invitations.sql` to the **same project** as
   `desk-curated-decks.sql`. The script is a one-time, transactional, additive
   schema upgrade; it does not remove or publish existing decks. Do not rerun it.
2. Deploy the application changes after the SQL succeeds. There are no new
   environment variables; the existing server-only Supabase and Admin settings
   are used. The older application remains compatible with the additive columns.
3. In Admin → Presets, generate a short-lived invitation and confirm the guest
   save/submit/review flow in the deployed environment before sharing real links.

The new application expects the added schema columns. If SQL is missing, private
preset management/invitation requests fail closed with an unavailable message;
public reads still select published snapshots only. Roll back the app first if
needed; do not remove stored contributor data as part of a routine rollback.

### Access and request handling

The exact contributor page and API paths bypass the optional invited-tester gate;
Admin, public Hub pages, and scoreboard APIs retain their existing gates. The
contributor shell does not mount Hub audience/analytics preferences. The API
independently requires its contributor bearer secret, uses private/no-store
responses, and keeps write origin checks, strict action/field validation, 20 KB
body limits, game validation and revision checks. Origin validation uses the HTTP
Host with the request protocol, so internal Next routing URLs do not reject
legitimate writes; forwarded-host headers are not trusted.

The link secret is in a URL fragment, removed on opening, retained in memory and
per-tab session storage for reloads, and sent only in the Authorization header.
It is not placed in server URLs, cookies, analytics, or database plaintext fields.
If browser storage is disabled, reopening the original link restores access.
A no-referrer policy and noindex metadata apply to contributor pages/responses.

Server-only SQL functions use SECURITY INVOKER with an empty search path. Execute
privileges are revoked from PUBLIC/anon/authenticated and explicitly granted only
to service_role; invitation tables have RLS and no client grants/policies. Every
guest operation checks persisted expiry/revocation/consumption, and row locks
serialize one-time use and revocation. A database-backed allowance of 120 operations
per invitation per minute applies across app instances (save/submit use a preflight
and a write operation). No new anonymous direct database access is introduced.

### Verification

- `npm run test:presets`: unit tests, isolated PostgreSQL-compatible SQL tests,
  actual API handlers against that database, and existing preset/Admin/tester
  regressions. The pinned PGlite development dependency runs locally with no
  external database credentials. It serializes connections, so these tests verify
  competing-request outcomes but do not simulate multi-connection lock waiting.
- `npm run build`: production compilation and TypeScript verification.
- After building, `npm run test:presets:browser`: launches a local production app,
  isolated database adapter and deterministic scoreboard fixtures; exercises the
  Admin and mobile guest workflow with the invited-tester gate enabled. Requires
  Playwright plus Chromium. If installed elsewhere, pass `PLAYWRIGHT_MODULE` as
  a module path/URL (and optionally `CHROME_PATH`). Set `PRESET_SCREENSHOT_DIR`
  to save screenshots. The test blocks external server fetches and never uses a
  production Supabase connection or publishes a real preset.
