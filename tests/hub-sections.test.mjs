import test from 'node:test';
import assert from 'node:assert/strict';
import { hubSections, hubSection, hubSectionUrl } from '../app/lib/hub-sections.ts';
test('Both league URLs retain every supported section on refresh/direct access', () => {
  for (const league of ['nfl','cfb']) for (const section of hubSections) {
    const url = new URL(`https://example.com/${league}?section=${section}`);
    assert.equal(hubSection(url.searchParams), section);
    assert.equal(hubSection(new URL(url.href).searchParams), section);
  }
});
test('Missing, empty, duplicate, unknown and unsafe section values fall back to Games', () => {
  for (const query of ['', 'section=', 'section=bad', 'section=content', 'section=STATS', 'section=stats&section=content', 'section=%3Cscript%3E']) {
    assert.equal(hubSection(new URLSearchParams(query)), 'games');
  }
});
test('Tab transitions preserve unrelated parameters, duplicates and fragments without touching origin', () => {
  const path = hubSectionUrl('https://example.com/cfb?source=team&tag=a&tag=b#leaders', 'stats');
  assert.equal(path, '/cfb?source=team&tag=a&tag=b&section=stats#leaders');
  assert.equal(hubSectionUrl('https://example.com/nfl?section=stats&source=team', 'stats'), null);
  assert.equal(hubSectionUrl('https://example.com/nfl', 'invalid'), null);
});
test('History URLs resolve correctly in both directions without a separate state copy', () => {
  const history = ['https://example.com/cfb'];
  for (const section of ['stats','standings','all-time']) history.push(new URL(hubSectionUrl(history.at(-1), section), 'https://example.com').href);
  assert.deepEqual(history.map((url) => hubSection(new URL(url).searchParams)), ['games','stats','standings','all-time']);
  assert.deepEqual(history.slice().reverse().map((url) => hubSection(new URL(url).searchParams)), ['all-time','standings','stats','games']);
});
