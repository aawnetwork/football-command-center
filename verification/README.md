# Share My Deck logo fix — 17 October 2026

Repository inspected: aawnetwork/football-command-center, local baseline 6b5c6d3 (`share my deck`).

## Findings

The week 7 ESPN scoreboard and standings both identify Army Black Knights as NCAA 349, Miami Hurricanes as 2390, and Miami (OH) RedHawks as 193. Their current default assets are valid PNGs, HTTP 200, with `Access-Control-Allow-Origin: *`. No school-name lookup is used by the original deck exporter: the scoreboard URLs pass through grouping directly to canvas. The shared fuzzy/alias resolver is not the cause of this export issue. Both Miami identities were checked separately; neither was substituted for the other.

An unmodified Chrome export with the current live assets successfully drew all supplied marks. The exact historical request/network failure behind the user's missing-logo screenshot cannot be established from the available conversation, which contains no screenshot or browser network log. It would be inaccurate to claim the current assets are broken, a specific Miami identity was selected incorrectly, or a particular CORS response caused the historical failure.

A controlled Chrome reproduction delaying the original CDN responses by 5.5 seconds exported a PNG with zero logo draw calls. The repaired exporter passed a 5.5-second response test with all six logos visible.

The confirmed pipeline defect is that its sole remote image attempt becomes null on error or after five seconds, then the renderer leaves an empty logo slot and reports a successful download. It also has no recovery for an absent source URL. There are no bundled NCAA logo assets in the original public directory.

## Changes

- `app/api/scoreboard/route.ts`: retain ESPN home/away team IDs.
- `app/lib/cfb-helpers.ts`, `app/lib/curated-decks.ts`: carry those optional IDs into deck groups.
- `app/api/team-logo/route.ts`: same-origin, cached PNG delivery from a fixed ESPN NCAA endpoint; numeric ID validation, timeout, redirect rejection, MIME/signature/size validation, and uncached failure responses.
- `app/features/games/deck-png.ts`: try same-origin delivery first, direct source as fallback, recover missing URLs using authoritative IDs, allow twelve seconds for image loading, validate decoded dimensions, and report exhausted attempts with visible initials. Concurrent team loads and repeated-team deduplication remain intact. No guessed school-name mappings.
- `app/features/games/DeckControls.tsx`: tell the user which logos could not be loaded.
- `tests/deck-png.test.mjs`, `tests/team-logo-route.test.mjs`, `tests/deck-png.browser.cjs`: regression coverage and actual browser PNG verification.

The redesign, tier ordering, all selected games, 2160px normal export width, size bound, `The HUB` heading, and `hub.aawnetwork.co.uk` footer are preserved.

## Verification

21 targeted Node tests passed. Next route type generation and TypeScript checking passed. Targeted ESLint and whitespace checks passed.

The browser runner uses actual Chrome canvas PNG encoding and real upstream PNG bytes through the production route handler. It verifies logo pixels in the decoded exported PNG, not just mocked draw calls. Teams: Army, Miami Hurricanes, Miami (OH), USC, Hawai'i, San José State. Scenarios: browser CDN requests blocked, missing source URLs, 5.5-second responses, proxy failure with direct fallback, and total failure with named warnings and initials. Raw scenario results are in `browser-results.jsonl`; the visually inspected export is `miami-army-deck.png`. The game pairings in this test image are synthetic verification fixtures, not claims about actual scheduled matchups.

No production deployment or Git push was performed.
