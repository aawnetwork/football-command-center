# Stats 2.0 NFL foundation — local Phase 2

20 October 2026. Additive modules only; no public route, component, refresh timer,
existing exporter, source URL, cache lifetime or authentication change.

## Entry points and contract

- `app/lib/stats-v2/nfl-identity.ts`: season-scoped explicit roster crosswalk.
  `resolve('gsis'|'espn', id)` returns namespaced identity, or null for malformed
  or conflicting identities. Unlinked ESPN IDs stay ESPN IDs; names never join
  people. A later explicit crosswalk is necessary to reconcile them. Conflicts
  propagate across the connected crosswalk, not just one offending pair.
- `app/lib/stats-v2/nfl-statlines.ts`: `buildNflStatlines(rows, period, checkedAt,
  rosters)` accepts already parsed public nflverse records and optional roster
  records. It makes no network request. Use the existing source snapshot, not
  records projected by the old nine-stat adapter and never live ESPN totals.
- `app/lib/stats-v2/nfl-export.ts`: `projectNflRanking(snapshot, selection, logos)`
  returns a selected-statistic ranking projection, not a table/DOM capture.

Period is explicit 2026 REG/POST and week-or-null; other seasons are rejected.
POST is isolated in the contract/tests, not a claim that the existing REG-only
loader supplies postseason. The supplied timestamp is an observation time, not
an invented upstream publication time. Coverage is `supplied-records-only`.
`complete` means no rejected/conflicting input records; it does not certify
complete season/player coverage. Production source-cutoff validation is still
needed before integration. Do not label an incomplete sample an official season
leaderboard.

Game identity validates season/week/participating team/opponent against the
nflverse game ID. Missing IDs or invalid teams are rejected, and conflicting
player/game facts are removed rather than arbitrarily choosing one. Identical
facts are deduplicated. Consumers must check issues/complete; exports reject
incomplete input. Corrections require rebuilding from a fresh source snapshot,
not appending an update to the previous snapshot. No index/cache survives calls.

Primary position from the statistical record verifies QB eligibility; a roster
fallback requires the same season, phase, team and week. Conflicting evidence
fails closed. QB does not require an attempt threshold. Rush/Rec/Def use evidence
of activity, not position or minimum volume. Opponent fumble recovery alone does
not establish defensive activity. Position changes suppress whole-period QB
eligibility conservatively; team-stint eligibility is evaluated independently.

Metrics retain `{state:'value', value:0}` versus missing/null. Derived rates with
known zero denominator are not-applicable/null. Missing or invalid components
make a rate missing, not zero. Additive metrics with an unknown game value stay
missing over the aggregate; no partial total masquerades as complete. Negative
yardage and half sacks/TFL survive. Ordinary event counts must be nonnegative
integers. Invalid percentages (completions > attempts, catches > targets) remain
missing while original counts remain inspectable. There are no minimum-volume
qualification exclusions, including for rate rankings. Participation counts
remain available for a future separately approved qualification policy.

Season rates use summed underlying totals. Derived tackles preserve the existing
NFL formula of solo tackles plus tackle assists. Raw CPOE, EPA and provider
shares are intentionally not introduced without an agreed aggregation contract.
Team stints retain their own game rows, categories and totals; a team-scoped
ranking uses only that team's contributions. LA/LAR is an explicit shared team
identity. No conference membership is inferred by these modules.

Export output contains league/accent, period/scope/coverage/observation time,
one selected statistic definition and rows of rank/player identity/name/team
identity/branding/value. It has no other statistical columns, expanded logs or
editorial text. Sort direction is explicit; ties use competition rank and a
stable identity tie-break. Limit is an output-size bound, not a participation
threshold. Source modules do not fetch branding; callers supply existing logos.
NFL accent is #FFC720. No unobserved PLAYING NOW status is invented for published
records. The existing live UI/exporter remains unchanged and retains its badge.

## Remaining integration gates

These modules are deliberately not imported by existing routes/screens. Next
integration must reuse existing downloads, verify source cutoffs and stable
crosswalks, join live observations without doubling published games, preserve
30-second polling and PLAYING NOW, and retain expanded-row/UI state. It must not
claim cross-instance caching. Snapshot/roster loading and error behaviour need
route-level tests before the new projection becomes a public contract.

## Read-only CFB findings from this phase

Bounded public source samples were inspected; no CFB code or ingestion changed.
The NCAA sample cutoff was through games 17 October 2026. These observations
supersede the earlier assessment's inability to retrieve those endpoints:

- Individual passing endpoint 453: Position, G, Pass Att, Pass Com, Int,
  Pass TD, Pass Yds, Name/Team/Class/Rank; three source pages reported.
- Rushing 469: Position, G, Rush (attempts), Rush TD, Rush Yds; four pages.
- Receiving 455: Position, G, Rec, Rec Yds, Rec TD; four pages.
- Tackles 34: Position, G, Solo Tack, Asst Tack, TT, TPG; five pages.
- Sacks 36: Position, G, Solo Sack, Asst Sack, Sack Yds, Tot Sack,
  Sacks PG; four pages. The sample retained a 10.5 total.

These are real source fields currently discarded by the adapter. They support
source-position QB classification and fuller season lines for returned players.
Only one page per category was sampled; all-player completeness, qualification
rules, duplicate same-name players and historic roster affiliation are not
certified. Position does not supply an ESPN athlete ID. No name-based crosswalk
was created or implied. Blank-to-zero conversion in the current adapter remains
an implementation gate. CFB targets/full defensive season coverage remain gaps.

A completed 2026 week-7 ESPN summary (event 401871067) exposed passing C/ATT,
YDS/AVG/TD/INT/QBR; rushing CAR/YDS/AVG/TD/LONG; receiving REC/YDS/AVG/TD/LONG;
defense TOT/SOLO/SACKS/TFL/PD/QB HUR/TD; interceptions INT/YDS/TD; fumbles
FUM/LOST/REC. Athlete IDs were present but positions were absent in sampled
boxscore athlete objects. A generic fumble recovery is not automatically a
defensive takeaway. Passing C/ATT needs structured split parsing rather than the
current numeric label filter. None of the samples establishes a minimum volume
or justifies excluding early-season starters with limited attempts.

The public ESPN 2026 Miami roster sample returned season, athlete IDs and explicit
position objects including QB. A sampled ESPN athlete gamelog for athlete 5289314
returned event IDs and two game statlines in one response, with matching summary
event ID, season-type metadata, labels and totals. It did not require a full-slate
scan per prior week. Two appearances do not mean zero activity/DNP in all other
games. This establishes a plausible economical per-athlete log source, not full
coverage, a reliable NCAA-to-ESPN bridge or a finished production integration.
Any future detail fetching needs bounded on-demand requests, schema/identity
validation and an explicit freshness policy independent of 30-second live data.

Public sources: ncaa-api.henrygd.me/stats/football/fbs/current/individual/{453,
469,455,34,36}; site.api.espn.com/apis/site/v2/sports/football/college-football/
(scoreboard, summary, teams/2390/roster); site.web.api.espn.com/apis/common/v3/
sports/football/college-football/athletes/5289314/gamelog?season=2026.
Some Python HTTP requests received 403; bounded curl reads succeeded. No paid
provider key, Hub production endpoint, database writer or refresh job was used.
