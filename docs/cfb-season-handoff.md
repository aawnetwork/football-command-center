# CFB completed-week handoff (offline, explicit review)

The deployed base is a matched pair: `app/lib/stats-v2/cfb-player-history.json`
and `cfb-season-metadata.json`. The server verifies their fingerprint and refuses
live additions when an intervening week is absent. Process memory is not storage.

1. After the whole next week is final, reuse Utility Room's weekly runner and
   independently reconciled FBS manifest. Any missing-summary retrieval requires
   separate explicit approval. Keep FBS–FCS evidence and exact source identities.
2. Complete offline validation, retain original `request-provenance.json` hashes
   and `collection-results.json`. Every manifest game must be validated and final.
   New QB identities remain unresolved unless separately reviewed; never infer QB
   position from passing activity. This does not certify national rankings.
3. From the Hub, prepare a *new* private output directory (no database access):

   ```sh
   node scripts/cfb-season-handoff.mjs BASE_HISTORY BASE_METADATA \
     VERIFIED_MANIFEST PINNED_JSON_SHA256 COLLECTION_RESULTS REQUEST_PROVENANCE \
     '/Users/fletch/Desktop/AAW Utility Room/player-stats/cfb-player-games.mjs' \
     NEW_PRIVATE_CANDIDATE_DIRECTORY
   ```

   Paths identify existing files. The manifest pin is the existing runner's SHA256
   of JSON serialization, not a hash of pretty-printed file bytes. The script has
   no network, database, scheduler or automatic activation. Output permissions are
   user-only. A changed retained game fails and needs explicit correction review;
   an identical rerun is idempotent. Do not discard original correction evidence.
4. Review `handoff-review.json`, counts, source pins, unresolved positions and
   representative totals. Carry both candidate files into the Hub together,
   preserving the previous pair for rollback. Run focused live/season/history
   tests, typecheck and isolated production build. Rebuild/restart verifies the
   new base independently of previous in-memory observations. Public activation
   and deployment remain separately authorised actions.
5. With base through Week 8, Week 9 contributions replace exact player/game
   observations on every refresh. They do not increment counters. Reviewed Week 7
   and other fixed-week selections retain their original cutoffs. Roll back the
   pair together; if that creates a gap, the server fails closed instead of
   presenting incomplete Season totals as current.

## Scheduled retention and safe serving

The checked-in candidate base now includes verified Week 8. The original offline
handoff remains available for explicit correction review. The additive scheduled
collector reuses this validation contract and the pure source normaliser, recovers
missing completed weeks in order, and proposes a matched pair through a review
pull request. It never activates a deployment or writes to Utility's database.
See [CFB Season retention and rollover repair](cfb-season-retention.md) for source
reconciliation, evidence retention, failure behavior and operational limits.

If the deployed baseline lags or a provider fails, Season serves its latest
fingerprint-validated retained totals with the actual cutoff warning, rather than
adding across a missing week or failing the entire view. Public activation and
deployment still require owner approval.
