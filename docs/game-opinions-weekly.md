# Admin Game Opinions — weekly exploration

Implemented locally; not committed, pushed or deployed.

Admin UI only: the report route, its independent authentication, SQL/RPC,
collection, retention, consent, public Hub and analytics are unchanged.

Game Opinions has its own league, season and week controls, including a separate
postseason feed selection. Existing scoreboard endpoints supply canonical game
context, matchup, official logos, UK kickoff and status. Only verified, exact
league/season/week/event identities enter the weekly table. Verified scheduled
games with no contributions show zero. Unmatched season ratings remain available
in a collapsed section, explicitly excluded from weekly totals, without guessed
metadata or silently renumbered weeks. Each row expands in place to all four
existing samples: current, pregame, live and postgame; technical IDs are secondary.

Snapshot comparisons require 25 current ratings per game. S/A highlights use
raw vote counts within that eligible sample, with ties labelled. Divisiveness is
the standard deviation of the existing ordinal responses (S=4 through D=0,
range 0–2); it is not a quality/recommendation/prediction score. Phase counts are
not added together or treated as longitudinal individual journeys.

The existing aggregate API does NOT expose the distinct browser union across
games. Exact weekly participating-browser totals cannot be obtained in UI-only
scope. The snapshot therefore labels a conservative range: maximum per-game
sample through sum of samples. It never calls total ratings unique browsers.

Reads reuse the existing protected paginated report API. All current season
pages are read sequentially on league/season selection or manual refresh; week
changes reuse that in-memory report. Pagination is bounded at 100 pages / 1,000
rated games; failed, changing-total or duplicate/truncated pages raise an error
and never produce misleading partial weekly totals. This is not a transactional
snapshot across pages; values may change during the read and are refreshed on
demand. Existing live collection is not paused for reporting.

Schedule metadata has an eight-selection, five-minute browser-memory cache.
Refresh explicitly clears it. No polling, new endpoints, database writes, shared
audience cache, permanent snapshots, new packages or infrastructure were added.

Local development still requires valid existing Admin authentication for report
API requests (the API does not gain a loopback bypass). Browser verification used
an isolated compiled-server preview with process-only test credentials and
fixture report/schedule responses. It made no synthetic audience writes.

Verification: 152 automated tests passed, including seven focused weekly-model,
pagination, rendering and read-only contract tests. TypeScript and production
build passed (the pre-existing season-stats static-render diagnostic is nonfatal).
Real browser checks used the compiled fixture preview at 1280px and 390px:
NFL/CFB selection, sorting, official logo loading, zero-rating rows, snapshot
ordering and inline phase expansion passed. No horizontal page overflow;
the weekly table scrolls within its container on narrow screens. Final mobile
detail width was 308px within the 390px viewport. This is viewport simulation,
not physical iOS/Android certification or a production deployment.
