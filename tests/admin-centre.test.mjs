import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
test('Proxy covers all consolidated admin paths and leaves Broadcasts separate', async () => {
  const source = await readFile(new URL('../proxy.ts', import.meta.url), 'utf8');
  for (const path of ['/admin', '/admin/user-stats/:path*', '/admin/exports/:path*', '/admin/decks/:path*', '/api/admin/decks/:path*']) assert.ok(source.includes(`"${path}"`));
  assert.equal(source.includes('"/admin/:path*"'), false);
  assert.equal(source.includes('"/admin/broadcasts'), false);
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
