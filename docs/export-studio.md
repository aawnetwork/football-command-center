# Private Export Studio

Run the usual Desk development server and open `/admin/exports` on its localhost port (currently `http://localhost:3001/admin/exports`). No public navigation links are added.

Choose CFB or NFL. In the embedded Desk view, use the normal tabs/weeks/categories. Select one eligible card/table in the Studio, Generate PNG, inspect the preview, then Download PNG. The source view keeps normal live data behaviour; the export is a frozen snapshot.

Supported: game cards, individual performances, weekly/season stats tables, conference/division standings tables, individual All-Time leaderboard cards. Polls, playoff-picture tables and unavailable/loading placeholders are not added to the export list.

Individual weekly/season statistics use an export-only compact top-10 card: rank, team logo, player with normal-weight team beneath, and right-aligned value with its unit underneath. Desk retains all 25 table rows. Logos reuse the existing standings endpoint. Team statistics, All-Time and other captures retain their existing presentation.

When viewing All-Time, the Studio's Record period selector switches the source between Career, Season and Single Game (where available). Picker labels and filenames include the period, and switching period invalidates the old preview so a Career image cannot be mistaken for a Season or Single Game capture. The card's visible heading remains unchanged.

Capture uses the rendered card and computed styles, not a separately maintained graphic template. Only marked interface clutter is removed: game date/tier footer; performance opponent line/content angle; interactive controls. Fades, gradients, borders and ACTIVE treatments remain. Logos must embed successfully or capture reports a failure rather than silently omitting them.

One card per PNG at 2× resolution with a 12px transparent gutter (24 output pixels). Entire tables are captured even beyond the iframe viewport. Oversized captures fail explicitly; no rows are silently dropped. Do not treat the preview as confirmation of fresh/current data: select the intended source week and check its actual values first.

Development loopback access remains available without a password. All other access requires HTTP Basic authentication, checked by the route proxy and again by the server page. Username: `aaw`. Set server-only `EXPORT_STUDIO_PASSWORD` in Vercel Production to a unique password of at least 16 characters, then redeploy. Missing or shorter configuration fails closed. Preview deployments require their own environment setting if access is wanted. Never prefix this variable with NEXT_PUBLIC_. Use HTTPS remotely and do not expose the development server publicly.

Contained logos are decoded and drawn directly onto the output canvas at their existing positions, bypassing browser-dependent SVG foreignObject image rendering. The card design is unchanged.

## Video Reels — new browser-side MP4 workflow

Choose **Video Reels (MP4)** in Export Studio. Select College or NFL, Pregame or Final, the week and the verified source game. Optionally choose a JPEG/PNG/WebP background photograph from the local computer (up to 20 MB); it stays in the browser and is never uploaded. Select the Navy or Cream treatment and Full HD (1080×1920) or the lighter 720×1280 setting. Use **Play preview** to review the nine-second motion composition; select **Generate MP4**, wait for H.264 encoding/finalization, watch the resulting video preview, then **Download MP4**. The exported file is 9:16, 30 fps, H.264 MP4 and silent, with official team logos and the supplied AAW wordmark. It is not a WebM renamed as MP4.

The Reel deliberately does not reproduce the PNG scorebug as a tall static card. It starts with animated photo/graphic motion, brings the selected game's teams and scores (or upcoming kickoff) onto an AAW-branded composition, and closes on the supplied AAW identity. It never fabricates a score for a pregame fixture. Source values are captured at selection time; refresh and check them before publishing.

All frames are drawn and encoded locally using browser WebCodecs and Mediabunny's MP4 muxer. No server render, remote encoding, subscription, photo upload, or public data mutation is involved. The browser must support AVC/H.264 encoding; unsupported browsers report a failure. The encoder respects backpressure to avoid collecting hundreds of full-size raw frames in memory. 720p is provided for older computers, but browser/device compatibility and actual playable downloads must still be verified on AAW's machines before production deployment. Existing PNG exporters are not modified.

### Video release verification

- [x] Next production build, TypeScript, focused export access/PNG regression tests and Reel timeline unit tests pass locally.
- [ ] Produce a complete playable MP4, check its duration/frames and decode it independently.
- [ ] Verify 1080p on the Windows 10 tower and the 2019 Intel MacBook Air; try 720p on the 2015 MacBook Pro.
- [ ] Review a real NFL final and CFB pregame with official logos and a locally uploaded photograph.
- [ ] Receive normal production deployment approval after those checks.

## Historical local verification — 9 October 2026 (previous local-only gate)

Generated and visually inspected real CFB game, performance, weekly stats, conference standings and All-Time PNGs, plus NFL All-Time with ACTIVE rows and season stats. Verified full-table capture, transparent outer pixels and an actual PNG download. Type checking and the six deck/access tests passed. Export-specific lint has no errors (one intentional plain-image preview warning).

A separate production build was started locally and `/admin/exports` returned HTTP 404, including with a forged localhost Host. The development route also rejected a non-loopback Host. This verifies the production-build gate, not a new deployment: these changes have not been pushed or deployed to Vercel. Normal source tabs and filters were exercised during capture; this is not an exhaustive regression test of all Desk features.
