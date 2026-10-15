# CFB rankings comparison — implementation handoff

## Correction following confirmed AAW week convention (15 October)

The shared selector now uses UKI numbering: Week 6 requests AP native Week 7
and UKI native Week 6. A single Preseason option selects each source's stored
preseason W0 (falling back to another preseason release only if W0 is absent).
Legacy UKI regular W0 is an alias for Week 1, with native W1 preferred when
both exist. No archive records are changed. Missing exact mapped releases
remain empty; source weeks appear on card headers. CFP regular-season alignment
is deliberately not inferred pending confirmation. These rules supersede the
native-identity selection description and historical verification below.

Implemented locally, 15 October 2026. No commit, push, deployment, database write,
or Utility Room code change was performed by this task.

## Presentation

CFB Standings retains Conferences / Rankings. Rankings now contains AP Top 25,
UK & Ireland Top 25, CFP Top 25 in that order. Three equal-width cards on desktop,
two columns on tablet, one stack on mobile. Rows show only rank, official logo,
team name and movement. Release source/date remain in each compact card header.
Missing releases use short empty states, not stretched blank tables.

## Shared selection and accuracy

- One season selector and source-week button strip control all three cards.
- Default is the latest available native poll identity in the existing standings
  season context; older archived seasons remain selectable.
- Preseason, regular season and postseason identities remain separate.
- Historical selection is not reset by the existing five-minute refresh loop.
- Selecting a missing week never falls back to an older release from that poll.
- Each successful poll is checked against the selected season/phase/week/type
  before rendering. Errors are shown per card; failed refreshes do not masquerade
  as fresh rankings. Requests are cancelled on selection change/unmount and
  overlapping periodic loads are prevented.
- Up/down movement comes from the source's previous rank. Explicit unranked or a
  previous rank outside the Top 25 displays NEW; equality displays a neutral dash.
- Older AP imports sometimes lost the unranked marker. An adjacent archived
  source release can recover missing ranks by stable identity; NEW requires a
  complete, uniquely identified previous Top 25. No bridging archive gaps or
  season/phase changes. Unrecoverable history remains a dash with an accessible
  “movement unavailable” description, not an invented unchanged claim.

## Logos

Hub now carries the already-stored `team_id` through its existing poll response.
Existing CFB standings metadata supplies ID-based, dark-background-preferred
artwork. Historical rows can use exact names/abbreviations or their stored logo.
UNC / North Carolina and Pitt / Pittsburgh use existing directory aliases; an
explicit Miami (FL) spelling maps to Miami Hurricanes, never Miami (OH).
Unresolved/broken images retain a fixed-size neutral placeholder and readable name.
No uploads, external logo service or image dependency was introduced.

## Utility Room compatibility

The current local Utility Room importer supports:

    season,week,rank,team,record,previous_rank

Points and first-place votes are optional and remain null when absent. Embedded
season/week are validated and used; the legacy form-metadata workflow also remains
supported. Its ten existing importer tests passed, including the exact six-column
format, NR/blank previous ranks and mixed/invalid metadata rejection.

This task changed no Utility Room files. Any release of its independently edited
importer remains owned by that application; its production status was not asserted.
No second importer or new archive contract was created in Hub.

## Verification

- 138 Hub regression tests passed, including comparison rendering with all 75
  rows when CFP is supplied as a test fixture, historical/missing weeks, movement,
  aliases, legacy records and failures fetching previous-poll movement.
- TypeScript and production build passed. The build retains the existing unrelated
  season-stats dynamic-render diagnostic; it finishes successfully.
- Browser checks at 1280px: three equal columns. At 820px: two columns. At 390px:
  one 320px-wide column inside the page, no horizontal page overflow.
- Real archive Week 4 displayed all 25 AP and 25 UKI rows, with all 50 logos loaded.
- Missing Week 1 displayed zero rows rather than substituting another poll.
- Preseason displayed 25 AP rows. Week 7 correctly recovered NEW for Kentucky,
  Wake Forest and Northwestern from the previous archived AP release.
- CFP remains genuinely unavailable in the current archive; its released-poll
  rendering is covered by fixtures, not fabricated production records.
- NFL standings presentation, scoreboard refresh, audience and analytics code are
  unchanged. No new infrastructure, dependencies or recurring costs.

## Existing data limitations

At verification AP extended through native Week 7; UKI only had native Week 4;
CFP had no stored releases. UKI Week 4 has a 5 October publication date, whereas
AP Week 4 has 20 September. Hub preserves these stored source labels and shows
dates rather than silently renumbering or claiming calendar alignment. AAW should
use the intended native week when banking subsequent UKI polls in Utility Room.
That historical UKI snapshot also lacks previous ranks; movement remains unknown
unless supplied by a later import or safely supported by archived history.

## Files changed

- app/features/standings/CfbRankings.tsx (new comparison interface)
- app/features/standings/StandingsPanel.tsx (CFB integration/season context)
- app/features/standings/poll-model.ts (shared selection/movement helpers)
- app/features/standings/poll-team.ts (logo resolution)
- app/lib/cfb-polls.ts (stored team IDs/conservative movement recovery)
- app/command-center.css (scoped responsive ranking styles)
- tests/cfb-ranking-comparison.test.mjs
- tests/cfb-polls.test.mjs
- docs/cfb-ranking-comparison.md
