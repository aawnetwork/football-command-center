# Stage 33 — Analytics & Consent implementation handoff

13 October 2026. Repository: `/Users/fletch/Desktop/AAW Football Hub`.

## Status

The consent and GA4 integration framework is implemented locally. It is uncommitted and undeployed. Actual GA4 measurement is **not activated**: no measurement ID was verified, and both release gates are disabled. No production environment settings, Google account settings, database structures or audience flags were changed. No new packages, paid services or tag-management platform were added.

Stage 32 remains cancelled. No public audience ratings, percentages, favourite popularity or analytics dashboard was introduced. No other stage was started.

## Existing configuration investigation

Hub had no GA4 integration, measurement ID, or functional analytics permission: Preferences showed a Coming Soon placeholder. Local environment inspection confirmed no `GA4_MEASUREMENT_ID`, no analytics approval flags enabled, and audience participation disabled. The public `https://aawnetwork.co.uk` homepage returned HTTP 200 but contained no identifiable `G-…` or `GTM-…` ID in its HTML.

This does **not** establish that AAW has no GA4 property: account-side Google Analytics settings and dynamically injected WordPress tags were not verified. No existing property/stream was repurposed and no new property was created. Prefer a Hub-specific web stream in a suitable existing AAW property, after central account inspection; do not change a shared WordPress stream's measurement settings without checking its other consumers.

## Consent experience

- Existing Preferences now has independent Website analytics controls: Allow, Decline/Withdraw, current choice and explicit processing/withdrawal wording.
- No preselected permission. Initial state is unknown/not allowed.
- A non-blocking, non-floating inline invitation offers Allow, Decline, Details in Preferences and Dismiss. It appears only on eligible public, non-embedded Hub pages, and only when measurement is release-enabled or the app is in development for UI verification. Production gate-off builds do not nag visitors for unavailable measurement; Preferences remains usable.
- Decline/dismissal suppress repeat invitations. Opening Preferences hides the invitation; analytics and audience invitations do not compete.
- Minimum local record: key `aaw-hub-analytics-consent`, JSON `{version:"stage33-v1",choice:"granted"|"denied"|"dismissed"}`. No timestamp or participant identifier is added.
- Unknown versions, malformed/extra fields, unavailable storage and failed persistence fail closed. Future material wording changes must increment the version and invalidate old grants.
- Cross-tab storage updates and return-to-visible checks synchronise permission without polling.
- Audience participation, tiers and favourites retain their separate storage and existing opt-in/withdrawal behaviour. No participation cookie or consent receipt is reused.

## GA4 activation safeguards

All three must be present:

1. `GA4_MEASUREMENT_ID` — verified public `G-…` ID.
2. `AAW_ANALYTICS_ENABLED=true` — explicit measurement/privacy release approval.
3. `AAW_GA4_STREAM_APPROVED=true` — independently verified stream configuration suitable for manual-only instrumentation.

None was set in `.env.local` or production. `.env.example` only documents empty/false defaults. Configuration is passed from the server; prerendered pages capture it at build time, so an approved future environment change must be followed by a rebuild/deployment and verification.

Stream approval requires all Enhanced Measurement disabled (especially history-based automatic page views, outbound clicks, forms, scrolls and downloads), no Connected Site Tags, no advertising links, no Google Signals or remarketing. This is an operational prerequisite, not a claim that the code has inspected those Google settings. Do not approve an unknown stream.

No tag or Consent Mode command is loaded/sent before explicit consent. After permission and both gates, the minimal integration loads only `gtag.js`, disables automatic initial page views, explicitly disables advertising/signals parameters and grants only analytics storage. Denied advertising states are configured only after analytics acceptance—not by loading a denied tag before consent.

## Events and navigation

Intentional event names:

- `page_view` — public landing, NFL/CFB route and meaningful section navigation.
- `tier_interaction` — explicit tier-control actions, not renders, hydration or imports. No selected tier/game ID is passed.
- `favourite_interaction` — explicit favourite changes/removal; no team ID/name is passed.
- `preferences_open` — explicit Preferences button opening.
- `feature_navigation` — clicks on same-origin links to eligible public Hub routes. Admin/external links are not tracked by this handler.

Payload whitelist: `league` (`Football`, `NFL`, `CFB`), `section` (`home` or one of the existing six sections), public measurement target, fixed page title, sanitised page location and empty referrer. No raw URL, arbitrary queries, hash, deck ID, game ID, tier value, favourite identity, audience token, receipt, participant ID, name or email is supplied.

The existing Next.js pathname/search-parameter observation supports direct links, native history-backed tab changes, client navigation and back/forward. A single normalised path/section key deduplicates rerenders and irrelevant query changes; returning from one section to another is a new meaningful view. Initial automatic page views are disabled; manual views are emitted only after the script is ready. No pre-consent or loading-time interaction queue is replayed. Accepting on a page produces only the current post-consent view, not earlier navigation history.

Admin, API, unknown, preview/export-query and iframe contexts are excluded. Google's documented `ga-disable-ID` flag dynamically rechecks permission and current context, including protected navigation or storage failure before React synchronises.

## Withdrawal and cleanup

Withdrawal blocks sending before storage is written, sets the SDK opt-out state, removes the loading script, discards unsent Hub commands and disables future Hub event dispatch. Late script callbacks cannot revive collection or stop a newer authorised session.

Hub config uses host-only, `/`-path cookies with the `aaw_hub` prefix. Cleanup deletes accessible Hub-prefixed GA cookies and owned GA storage keys; it does not clear participation, personal tiers, favourites or other websites' `_ga` cookies. The already-executed SDK cannot literally be unloaded from the JavaScript runtime; its opt-out flag remains enforced.

Already transmitted or in-flight data cannot be recalled. Browser restrictions, HttpOnly/third-party cookies and records stored at Google are outside local cleanup. No historical deletion claim is made. [Google's documented opt-out/privacy controls](https://developers.google.com/tag-platform/security/guides/privacy) inform the implementation.

## Files changed

Added:

- `app/lib/analytics-consent.ts` — versioned storage contract, release gates and sanitised route/payload dimensions.
- `app/lib/analytics-runtime.ts` — guarded SDK lifecycle, manual views, action whitelist, opt-out and owned-cookie cleanup.
- `app/features/preferences/useAnalytics.tsx` — consent state, cross-tab checks, URL observation and bounded feature-link instrumentation.
- `tests/analytics.test.mjs` — nine focused regression tests with a mock-only measurement ID; no test ID was sent to Google.
- This handoff.

Modified:

- `app/layout.tsx` — pass disabled-by-default server configuration.
- `app/features/preferences/HubPreferences.tsx` — independent controls and coordinated inline invitation.
- `app/features/preferences/preferences.css` — scoped invitation styling.
- `app/cfb/page.tsx`, `app/nfl/page.tsx` — one analytics action call in explicit tier handlers; no football calculations or refresh changes.
- `.env.example` — document empty ID/false gates.
- `tests/local-preferences.test.mjs` — replace the obsolete Coming Soon expectation while preserving separation/accessibility tests.

No admin authentication, football feed, game-card layout, contribution endpoint, phase history, retention job or Admin Centre reporting implementation was changed.

## Verification

- Full suite: **112 tests passed, 0 failed**, including audience participation/withdrawal, preferences, tier/deck/sharing, navigation, exports/security, football and retention regressions.
- Nine analytics tests cover default/release gates, malformed/versioned consent, blocked storage, decline/dismissal persistence, no pre-consent script/cookies/events, acceptance, no buffered interaction replay, normalised/deduplicated views and back/forward equivalents, safe payloads, feature actions, withdrawal/owned-cookie cleanup, cross-tab revocation, late callbacks, protected/embedded routes and immediate SDK opt-out on storage/context changes.
- TypeScript and production build passed. Existing caught dynamic-render diagnostics from NFL performances and season-stats routes remain; no new build failure.
- Browser checks on local CFB: first-visit invitation appeared; Allow removed it; Preferences showed Allowed with measurement disabled; no GA4 script appeared before or after acceptance while gates were off; Withdraw showed Declined, preserved the unavailable audience state, persisted across refresh and suppressed repeat prompting. Escape closed the existing dialog and restored focus. Existing team selectors and game controls remained present.
- DOM script absence was checked, but the available browser inspection scope did not expose a full network log. Real GA4 requests/cookies/payloads were not generated against an invented ID.
- Mobile viewport verification could not be completed reliably: the browser viewport/inventory control failed during testing. The responsive invitation CSS and existing Preferences dialog are retained, but actual mobile/device sign-off remains outstanding.

## Outstanding approval and browser checks

1. Establish the actual AAW GA4 property/Hub stream and verified measurement ID through authorised Google account access.
2. Approve privacy wording, Google processing disclosures, property retention and stream settings; this implementation is not a legal compliance certification. [ICO guidance](https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guidance-on-the-use-of-storage-and-access-technologies/what-are-storage-and-access-technologies/) is relevant to the consent review.
3. If approved wording changes, bump consent version before activation.
4. With a verified stream and explicit approval, perform browser network/cookie checks before consent, after acceptance, after withdrawal, across section/back/forward changes and in Admin/Export iframes. Confirm no automatic duplicate page views or unapproved Enhanced Measurement events. [Google's page-view guidance](https://developers.google.com/analytics/devguides/collection/ga4/views) requires manual measurement not to overlap automatic measurement.
5. Complete actual mobile browser/keyboard checks and production smoke tests after an approved release.

Until these checks and approvals, leave both analytics gates false. Audience participation remains disabled and must not be enabled as part of analytics release.
