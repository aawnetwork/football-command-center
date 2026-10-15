# Stage 35 — Audience launch correction

## Reverification — 15 October 2026

Latest follow-up: Vercel CLI renewed its existing login successfully. Project
`aaw-football-desk` production deployment `dpl_Div5FTTbPsBKPrjYH2BHNvNJ1ZJ9`
runs `306b6bc6f217c197d6ec5fe6bd513679f359dc29`, which includes `0a995f4`.
Team remains Hobby/Active. Existing SSO protection is
`all_except_custom_domains`; anonymous NFL/CFB pages on desk.aawnetwork.co.uk
return 200, so invited-testers-only protection is NOT established. No protection
settings were changed. The exact supplied privacy URL
`https://aawnetwork.co.uk/?page_id=572` was added locally beside participation,
but returns HTTP 404 / Page not found to a logged-out request. Collection stays
disabled. The exact-link regression test and existing 28 tests pass (29 total).
Full enabled production desktop/mobile/cross-tab testing remains gated by a
publicly accessible policy and verified tester-only access. No commit/push.

- Existing correction is committed in `0a995f4`; no duplicate implementation was
  required. The fixed-expiry migration is present in the live database.
- Live hourly job remains active (`17 * * * *`). Its last three inspected runs
  succeeded, with no failed participants or skipped locks in the latest run.
- Reran all four database suites in explicit BEGIN/ROLLBACK transactions:
  participation expiry, selections, seasonal/phase retention, and Admin reports.
  All passed without retaining synthetic records.
- 28 focused Node tests, TypeScript and production build passed. Existing
  season-stats dynamic-render build diagnostic remains unrelated and nonfatal.
- Production HTTPS participation endpoint returned `available:false` and
  `active:false`. Collection was not enabled.
- Saved Vercel CLI credential is rejected (`invalidToken`); browser dashboard
  access also timed out. Current deployment revision and current shared Hobby
  usage could not be verified. No deployment was performed in this follow-up.
- Desktop/mobile and cross-tab browser workflows were not rerun in this
  follow-up; prior browser evidence below remains historical, not a fresh test.
- Activation still requires privacy/controller-notice sign-off, explicit AAW
  activation approval, authenticated hosting/resource verification and final
  production-browser checks. No GA4 or infrastructure changes were made.

Implemented 13 October 2026. Production collection remains disabled. No GA4 changes.

## Changes

- `supabase/hub-audience-participation-expiry.sql`: applied as migration
  `hub_audience_fixed_participation_expiry` in the existing Supabase project.
- Fixed participation lifetime is exactly 8760 hours (365 UTC days) from consent.
  Repeated confirmation does not extend the deadline.
- State, contribution gate and both writers require unexpired Stage 35 consent.
  Historic wording is not automatically upgraded. Owned withdrawal still works
  with an expired credential, even while collection is disabled.
- Reports exclude expired or obsolete consent before physical cleanup.
- Existing hourly retention job now purges expired participant parents under the
  same credential locks as writes/withdrawal. Consent, tiers, favourites, phases
  and ordering cascade, including where a season end is unknown. Seasonal
  expiry and bounded/busy retry behaviour remain intact.
- Current consent version: `stage35-v1`. Preferences explain future-only,
  voluntary private collection, phase samples, finite retention and lost-cookie
  limitations. No saved selections/preset overlays are uploaded retrospectively.

## Verification

- 115 Node regression tests passed; TypeScript and production build passed.
- Four SQL suites ran against the actual database inside BEGIN/ROLLBACK:
  selections, phases/season retention, reporting and participation expiry.
- New expiry suite passed before migration and again after application.
- Actual production-build browser test on a temporary loopback server:
  pre-consent tier/favourite saved locally, opt-in collected zero saved choices;
  new NFL/CFB favourites and ratings collected; changing a favourite replaced
  its current selection; scheduled CFB, live NFL and final NFL phases collected;
  refresh preserved consent/local choices without resubmission; explicit rating
  and favourite removals changed reports; withdrawal cascaded all records while
  preserving local choices.
- Existing protected Admin pages and reporting API returned correct per-league
  statistics; anonymous requests returned 401. Local production-mode admin
  verification used an ephemeral process-only test password because no saved
  local Export Studio password was configured. No credentials/config were saved.
- Final database check: zero participants, consent, tiers, phases, favourites and
  ordering records. Disposable browser test records were withdrawn; SQL fixtures
  were rolled back. Production participation endpoint still returned unavailable.
- Database security advisor returned only existing INFO deny-all RLS notices.
  No public grants/security-definer functions/new services were introduced.

## Release gates

1. AAW approve final wording and accessible controller/privacy notice coverage.
   Pseudonymous browser participation must not be represented as identified
   people or guaranteed irreversible anonymity.
2. Release the uncommitted application changes; database correction is applied.
   No commit, push or Vercel deployment was performed by this task.
3. Resolve/confirm the shared Hobby resource position before collection launch:
   team dashboard reports Exceeded free resources; rolling 30-day CPU is about
   4h13m against 4h, while Billing reports Hobby Active and live APIs still work.
   This is not a current proven outage but there is no verified CPU headroom.
   Vercel documents possible pauses on exceeding free limits, not a fixed monthly
   reset. No paid upgrade, hosting migration or cross-app optimisation was made.
4. Do the final production HTTPS smoke check after approved release and before
   broad invitation. Loopback Secure-cookie browser testing is not a Safari/iOS
   or production-host HTTPS certification. Unsupported browser storage/locks
   continue to fail closed with personal preferences remaining local.

Only after these gates, explicitly enable `AAW_AUDIENCE_PARTICIPATION_ENABLED`
for the intended production environment and redeploy with approval. Leave all
Google Analytics configuration unchanged.
