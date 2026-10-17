# Live season statistics and branded stat exports

Implemented in the local `AAW Football Hub` repository on 17 October 2026.

## Causes

The CFB season-stat effect fetched NCAA data only when the mode changed. Weekly stats used a separate 30-second ESPN box-score loop. The existing season playing-now decoration refreshed the badge, not the season totals. NCAA's response explicitly publishes a `Through games …` date and is not a live box-score feed.

The compact export override rebuilt individual tables with a hardcoded navy surface and removed the playing-now badge. It also skipped three-column team tables entirely.

## Implementation

- Season live box scores refresh every 30 seconds, independently of the five-minute NCAA baseline refresh and selected weekly tab. Requests do not overlap; cleanup prevents late state updates. A temporary live-fetch failure retains the last successful values and displays the failed refresh status.
- Each refresh starts from the published NCAA baseline. Only verified started/finished scoreboard games after that category's through-date contribute. Completed contributions remain until a newer baseline covers them. Repeated refreshes never increment a previously merged total.
- Player identity requires a unique school and normalized exact athlete name; ambiguous or absent identities/cutoffs retain published values. Published season leaderboard pages are fetched completely, for both players and teams.
- Team cumulative offense, scoring averages, yardage-defense averages, sacks and turnover margin use their corresponding box-score inputs. Scoring averages use exact published points and games rather than reconstructing totals from rounded averages. Rushing/passing defense now read the provider's YPG field instead of labeling cumulative yards as YPG.
- The full current NCAA FBS school list was checked against ESPN. Explicit aliases cover Army West Point, Miami (FL), and the other verified abbreviated school names.
- Compact individual/team exports use the current cream/navy palette, yellow accent, `The HUB`, `hub.aawnetwork.co.uk`, light-surface logo variants, and the source table's orange `PLAYING NOW` indicator. The live table remains untouched; compact output remains top ten. Both CFB and NFL use this shared presentation.

## Verification

Regression tests cover live refresh scheduling, cancellation, no duplicate additions, NCAA cutoff rollover, unknown/ambiguous identities, all school aliases, complete pagination, units, scoring-average arithmetic, team turnover/sack totals, and existing live-player and team/player separation behavior.

An actual-source check compared Julian Sayin's fetched NCAA passing total of 1,772 (through 16 October) with his fetched ESPN game box score of 80: the merged value was 1,852. This records the fetched snapshots, not a claim about his final game total.

Actual Chrome PNG encoding passed all eight combinations of CFB/NFL, weekly/season and individual/team. Tests inspected decoded image pixels for the live badge, cream surface, top-ten limit, branding and preservation of the source table. The weekly/season PNG files in this folder are synthetic layout fixtures; they do not represent actual player rankings.

Changed source files: `app/api/player-stats/route.ts`, `app/api/season-stats/route.ts`, `app/cfb/page.tsx`, `app/features/exports/compact-stats.ts`, `app/features/stats/StatsLeaderboardTable.tsx`, `app/lib/cfb-helpers.ts`, `app/lib/team-logos.ts`, and new `app/lib/cfb-live-season.ts`. Tests and supporting fixtures accompany the changes.

No Git push or production deployment was performed.
