// Run after npm run build. PLAYWRIGHT_MODULE may point to an installed Playwright
// module when it is not available locally. Never uses a live database or ESPN.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { testDatabase, restResponse } from './helpers/preset-database.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../', import.meta.url));
const output = process.env.PRESET_SCREENSHOT_DIR;
const db = await testDatabase();
let browser, app, adminPage, guestPage;
let appOutput = '';
const backend = createServer(async (req, res) => {
  try {
    assert.equal(req.headers.apikey, 'isolated-preset-test-secret');
    assert.equal(req.headers.authorization, 'Bearer isolated-preset-test-secret');
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const response = await restResponse(db, `http://127.0.0.1${req.url}`, { method: req.method, body: Buffer.concat(chunks).toString() || undefined });
    res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(await response.text());
  } catch (error) { console.error(error); res.writeHead(500); res.end('{}'); }
});
await new Promise(resolve => backend.listen(0, '127.0.0.1', resolve));
const portFinder = createServer(); await new Promise(resolve => portFinder.listen(0, '127.0.0.1', resolve));
const port = portFinder.address().port; await new Promise(resolve => portFinder.close(resolve));
const origin = `http://127.0.0.1:${port}`;
const adminAuthorization = 'Basic ' + Buffer.from('aaw:isolated-admin-test-password').toString('base64');
const preloader = fileURLToPath(new URL('./helpers/preset-browser-network.mjs', import.meta.url));
try {
  app = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(port)], {
    cwd: root,
    env: { ...process.env, NODE_ENV: 'production', NODE_OPTIONS: `--import=${JSON.stringify(preloader)}`, SUPABASE_URL: `http://127.0.0.1:${backend.address().port}`, SUPABASE_SECRET_KEY: 'isolated-preset-test-secret', EXPORT_STUDIO_PASSWORD: 'isolated-admin-test-password', AAW_INVITED_TESTING_ENABLED: 'true', AAW_TESTER_PASSWORD: 'isolated-tester-test-password', AAW_AUDIENCE_PARTICIPATION_ENABLED: 'false', AAW_GA4_ENABLED: 'false' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  app.stdout.on('data', chunk => { appOutput += chunk; }); app.stderr.on('data', chunk => { appOutput += chunk; });
  for (let i = 0; i < 120; i++) {
    if (app.exitCode !== null) throw new Error(`App exited: ${appOutput}`);
    try { const response = await fetch(origin + '/contribute/presets'); if (response.ok) break; } catch { /* Waiting for startup. */ }
    await new Promise(resolve => setTimeout(resolve, 250));
    if (i === 119) throw new Error(`App did not start: ${appOutput}`);
  }
  browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
  const adminContext = await browser.newContext({ extraHTTPHeaders: { Authorization: adminAuthorization }, viewport: { width: 1365, height: 1000 } });
  const admin = await adminContext.newPage(); adminPage = admin;
  admin.on('response', async response => { if (response.url().includes('/api/admin/preset-links') && !response.ok()) console.error('Invitation API:', response.status(), await response.text()); });
  const clientErrors = []; admin.on('pageerror', error => clientErrors.push(error.message));
  await admin.goto(origin + '/admin/decks');
  await admin.getByLabel('Contributor name').fill('Pat Browser Test');
  await admin.getByLabel('Link type').selectOption('continuous');
  await admin.getByLabel('Restrict to a season and week').check();
  await admin.getByLabel('Invitation season').fill('2026');
  await admin.getByLabel('Invitation week').selectOption('6');
  await admin.getByRole('button', { name: 'Generate contributor link' }).click();
  const linkField = admin.getByLabel('New contributor link');
  await linkField.waitFor();
  const link = await linkField.inputValue(); assert.ok(link.includes('#token='));
  const token = link.split('#token=')[1];
  const guestContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const guest = await guestContext.newPage(); guestPage = guest;
  guest.on('pageerror', error => clientErrors.push(error.message));
  const guestRequests = []; guest.on('request', req => guestRequests.push(req.url()));
  await guest.goto(link);
  await guest.getByLabel('Preset name').fill('Pat’s browser preset');
  assert.equal(new URL(guest.url()).hash, '');
  assert.equal(await guest.getByLabel('Season').isDisabled(), true);
  await guest.getByRole('button', { name: 'Away Team at Home Team: S', exact: true }).click();
  await guest.getByRole('button', { name: 'Save Draft', exact: true }).click();
  await guest.getByText('Draft saved privately.', { exact: false }).waitFor();
  await guest.reload();
  await guest.getByLabel('Preset name').waitFor();
  assert.equal(await guest.getByLabel('Preset name').inputValue(), 'Pat’s browser preset');
  assert.equal(await guest.getByRole('button', { name: 'Away Team at Home Team: S', exact: true }).getAttribute('aria-pressed'), 'true');
  assert.equal(await guest.getByRole('button', { name: 'Publish', exact: true }).count(), 0);
  await guest.getByRole('button', { name: 'Submit for Review', exact: true }).click();
  await guest.getByText('Submitted to AAW for review.', { exact: false }).waitFor();
  assert.equal(await guest.getByLabel('Preset name').isDisabled(), true);
  let publicResponse = await adminContext.request.get(origin + '/api/decks?season=2026&week=6', { headers: { Authorization: 'Basic ' + Buffer.from('aaw:isolated-tester-test-password').toString('base64') } });
  assert.deepEqual((await publicResponse.json()).decks, []);
  await admin.reload();
  await admin.getByLabel('Show presets').selectOption('submitted');
  const selector = admin.getByLabel('Saved decks');
  const deckId = await selector.locator('option').filter({ hasText: 'Pat’s browser preset' }).getAttribute('value');
  await selector.selectOption(deckId);
  await admin.getByRole('button', { name: 'Publish', exact: true }).click();
  await admin.getByText('Published. Refresh public CFB Games', { exact: false }).waitFor();
  publicResponse = await adminContext.request.get(origin + '/api/decks?season=2026&week=6', { headers: { Authorization: 'Basic ' + Buffer.from('aaw:isolated-tester-test-password').toString('base64') } });
  assert.equal((await publicResponse.json()).decks[0].name, 'Pat’s browser preset');
  await admin.getByLabel('Feedback for the contributor').fill('Please change the top tier to A.');
  await admin.getByRole('button', { name: 'Return for changes', exact: true }).click();
  await admin.getByText('Returned for changes.', { exact: false }).waitFor();
  await guest.getByRole('button', { name: 'Reload saved presets', exact: true }).click();
  await guest.getByText('AAW feedback: Please change the top tier to A.').waitFor();
  await guest.getByRole('button', { name: 'Away Team at Home Team: A', exact: true }).click();
  await guest.getByRole('button', { name: 'Save Draft', exact: true }).click();
  await guest.getByText('Draft saved privately.', { exact: false }).waitFor();
  await guest.getByRole('button', { name: 'Submit for Review', exact: true }).click();
  await guest.getByText('Submitted to AAW for review.', { exact: false }).waitFor();
  await admin.getByRole('button', { name: 'Reload saved decks', exact: true }).click();
  await admin.getByText('submitted', { exact: true }).waitFor();
  await admin.getByRole('button', { name: 'Publish', exact: true }).click();
  await admin.getByText('Published. Refresh public CFB Games', { exact: false }).waitFor();
  publicResponse = await adminContext.request.get(origin + '/api/decks?season=2026&week=6', { headers: { Authorization: 'Basic ' + Buffer.from('aaw:isolated-tester-test-password').toString('base64') } });
  assert.equal((await publicResponse.json()).decks[0].assignments['123'], 'A');
  if (output) {
    await mkdir(output, { recursive: true });
    await guest.screenshot({ path: path.join(output, 'guest-preset-mobile.png'), fullPage: true });
    await admin.screenshot({ path: path.join(output, 'admin-preset-links.png'), fullPage: true });
  }
  assert.equal(await guest.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'Mobile layout should not overflow');
  assert.equal(guestRequests.some(url => url.includes('/api/audience/')), false, 'Invitees must not request gated Hub preferences');
  assert.equal(guestRequests.some(url => url.includes(token)), false, 'Invitation secret must not appear in network URLs');
  await admin.getByText('Manage existing links', { exact: false }).click();
  admin.once('dialog', dialog => dialog.accept());
  await admin.getByRole('button', { name: 'Revoke link for Pat Browser Test', exact: true }).click();
  await admin.getByText('Link revoked.', { exact: false }).waitFor();
  await guest.getByRole('button', { name: 'Reload saved presets', exact: true }).click();
  await guest.getByRole('alert').filter({ hasText: 'invalid, expired or revoked' }).waitFor();
  const forged = await guestContext.request.post(origin + '/api/contributor/presets', { headers: { Authorization: `Bearer ${token}`, Origin: origin }, data: { action: 'publish', id: deckId, revision: 1 } });
  assert.equal(forged.status(), 403);
  for (const url of ['/admin/decks', '/api/admin/preset-links', '/cfb', '/api/scoreboard?season=2026&week=6']) assert.equal((await guestContext.request.get(origin + url)).status(), 401);
  // A separate one-preset invitation closes after submission, and merely opening
  // or refreshing it does not consume its allowance.
  const createResponse = await adminContext.request.post(origin + '/api/admin/preset-links', { headers: { Origin: origin }, data: { action: 'create', label: 'One-time guest', mode: 'one_time', season: 2026, week: 6 } });
  assert.equal(createResponse.status(), 201);
  const oneTime = await createResponse.json();
  const one = await guestContext.newPage(); await one.goto(origin + oneTime.path);
  await one.getByLabel('Preset name').fill('One-time preset');
  await one.getByRole('button', { name: 'Away Team at Home Team: B', exact: true }).click();
  await one.getByRole('button', { name: 'Save Draft', exact: true }).click();
  await one.getByText('Draft saved privately.', { exact: false }).waitFor();
  await one.getByRole('button', { name: 'Submit for Review', exact: true }).click();
  await one.getByText('Your one-preset invitation is now closed.', { exact: false }).waitFor();
  const oneDeck = (await db.query('select id,revision from public.desk_curated_decks where contributor_link_id=$1', [oneTime.invitation.id])).rows[0];
  const returned = await adminContext.request.post(origin + '/api/admin/preset-links', { headers: { Origin: origin }, data: { action: 'return', id: oneDeck.id, revision: oneDeck.revision, note: 'Please check your one-time preset.' } });
  assert.equal(returned.status(), 200);
  await one.goto(origin + oneTime.path);
  await one.getByText('AAW feedback: Please check your one-time preset.').waitFor();
  assert.equal(await one.getByLabel('Preset name').isDisabled(), false);
  await one.getByRole('button', { name: 'Submit for Review', exact: true }).click();
  await one.getByText('Your one-preset invitation is now closed.', { exact: false }).waitFor();
  await one.goto(origin + oneTime.path);
  await one.getByRole('alert').filter({ hasText: 'already been submitted' }).waitFor();
  assert.deepEqual(clientErrors, []);
  console.log('PASS: admin link generation → mobile guest save/reload/submit → admin publish → return/revise → revocation; one-time closure; private routes and URL secrecy.');
} catch (error) {
  console.error(appOutput);
  for (const page of [adminPage, guestPage]) if (page && !page.isClosed()) console.error((await page.locator('body').innerText()).replace(/[a-f0-9]{64}/g, '[secret]').slice(0, 6000));
  throw error;
} finally {
  await browser?.close();
  if (app && app.exitCode === null) { app.kill('SIGTERM'); await once(app, 'exit'); }
  await new Promise(resolve => backend.close(resolve)); await db.close();
}
