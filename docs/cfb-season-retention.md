# CFB Season retention and rollover repair

The Season baseline is an immutable, matched history/metadata pair. Week 8 is
recovered from 56 final ESPN summaries, reconciled against all 138 season-qualified
FBS team schedules. 3,447 FBS appearances are added; Weeks 1–7 remain byte-equivalent
as JSON records. Retained base: 566 games, 32,930 appearances, 7,744 identities.
Missing cells stay null; no new QB position is inferred. This validates the
collected game set, not every metric's national leaderboard completeness.

## Automatic retention, without deployment

`.github/workflows/cfb-season-retention.yml` runs daily in September–December or
on demand. It uses existing GitHub Actions, Node and repository JSON storage:
no database, paid service, new production endpoint or provider credentials.
The season is explicitly 2026; a new season cannot silently reuse these records.
The repo's GitHub Actions setting must permit creating pull requests.

The collector discovers the current period and processes **every** missing prior
regular-season week in order. Each week's explicit scoreboard must agree with
every FBS team's regular-season schedule (including games against non-FBS teams).
Both participant identities, home/away, kickoff, period, final status, player
identities, nullable statistics and original response hashes are validated by
the existing handoff contract and its pure Utility validator. Utility is not
modified or connected. Unknown membership or positions never get guessed.

The job stores original responses, manifests, request/observation provenance and
validation review as a repository Actions artifact (90 days), including
on failure. The deployable pair is retained in repository history through an
ordinary review PR. It never merges, publishes or deploys. Existing retained
weeks are not re-fetched or silently corrected. Identical replays are idempotent;
changed retained facts require explicit correction review.

A provider error, unfinished game, missing source category, inconsistent schedule
or byte/request budget failure prevents candidate activation. Up to 400 requests
and 100 MB per execution, sequential requests, no retries, 15-second timeouts,
12 MB per response and no redirects. This supports ordinary missed-week catchup;
a larger backlog may need bounded separate runs. Successful candidate files are
written only after the entire requested range validates. Evidence can be reused
from the same private output directory without changing original timestamps.
Use a fresh directory for a new provider check; saved responses are evidence,
not an expiring live cache. Failed jobs stay visible in Actions; a subsequent run
starts from main's retained cutoff, so a missed run does not skip the missed week.

## Serving safely

Week N live observations can extend a verified baseline through Week N−1.
Refreshes replace exact athlete/game observations; totals never accumulate twice.
If intervening history is missing, current identity validation fails, or ESPN
fails, the API returns the fingerprint-validated retained baseline with HTTP 200,
its original observation time and a prominent coverage warning naming its cutoff.
It does not add Week 10 to a Week 8 baseline, manufacture Week 9 zeroes, or call
old totals current. Retained details remain usable. A bad retained fingerprint
still fails closed. Missing current-game observations remain qualified/withheld
under the existing live-data rules; they are not certified season totals.

No NFL, weekly CFB, team statistics, UI layout, Export Studio, Basement or
production database changes are part of this repair. Historical Week 7 selections
retain their Week 7 cutoff even though the shared recent-game archive now has 8.
