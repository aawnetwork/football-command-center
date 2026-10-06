# Utility Room → Football Desk polls

Utility's confirmed `public.ur_cfb_polls` snapshots are the single authority. Desk reads them through its existing `/api/standings?league=CFB&view=polls&type=ap` backend. No copy, delivery, local Utility HTTP dependency or Desk historical store exists.

Server configuration: existing `SUPABASE_URL` (or `NEXT_PUBLIC_SUPABASE_URL`) and new `SUPABASE_POLL_READ_KEY` (publishable key; no `NEXT_PUBLIC_` prefix). No privileged key fallback. The additive SQL in `supabase/utility-cfb-poll-read.sql` grants anon SELECT on named snapshot columns with a CFB/AP/CFP/UKI policy; it grants no writes, save execution or revision/capture access. Future columns are not automatically exposed. Rollback: drop policy `ur_cfb_polls_public_read` and revoke those SELECT column grants from anon, then revert the Desk commit/configuration.

Query `type=ap|cfp|uki`; omit week for latest stored (optionally constrain season), or use `season=2026&phase=preseason|regular|postseason&week=0..30`. A legacy week-only request resolves within that type's latest season; week 0 defaults to preseason. Missing snapshots return `poll:null`, never a substituted current poll. Response includes actual available snapshot identities, metadata and mapped entries. Latest sorts season, then preseason/regular/postseason, then week; publication time, recapture and revision cannot promote an old week. UI Latest stored refreshes every five minutes; explicit historical selections remain pinned. Reload for immediate visibility after banking.

Unknown/null previous rank displays —, known rank displays its number, explicitly unranked (`previous_rank_status=unranked` or numeric previous_rank=0) displays NR. Utility UKI imports accept NR in previous_rank; blank is unknown. Older ambiguous nulls are not rewritten or inferred.

The old source-code snapshot responsibility and Rankings live ESPN poll fetch are retired. ESPN conference/NFL standings and scoreboard/gamecard curatedRank are unchanged. AP/CFP capture remains manual: bank it in Utility before Desk can display it. The separate Utility CFBD source collection is not this authoritative archive.

Safety backup before access changes: /private/tmp/aaw-step5-poll-backup.json and /private/tmp/aaw-step5-backups. No existing poll records were changed.
