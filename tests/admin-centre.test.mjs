import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
test('Proxy covers all consolidated admin paths and leaves Broadcasts separate', async () => {
  const source = await readFile(new URL('../proxy.ts', import.meta.url), 'utf8');
  assert.match(source,/path === "\/admin"/);
  assert.match(source,/path\.startsWith\("\/admin\/"\) && !broadcast/);
  assert.match(source,/path\.startsWith\("\/api\/admin\/"\)/);
  assert.match(source,/const broadcast = path === "\/admin\/broadcasts"/);
  assert.match(source,/matcher:.*_next\/static/);
});
test('New pages require a server-side gate; original tools and page gates remain', async () => {
  for (const page of ['admin/page.tsx', 'admin/user-stats/page.tsx']) {
    const source = await readFile(new URL(`../app/${page}`, import.meta.url), 'utf8');
    assert.match(source, /await requireAdmin\(\)/);
    assert.match(source, /index: false/);
  }
  for (const [page, component] of [['decks','DeckManager'],['exports','ExportStudio']]) {
    const source = await readFile(new URL(`../app/admin/${page}/page.tsx`, import.meta.url), 'utf8');
    assert.match(source, /validExportPassword/);
    assert.ok(source.includes(`<${component} />`));
  }
});
