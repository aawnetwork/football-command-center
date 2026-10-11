import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyDataCheck, recordDataCheck, dataCheckLabel } from '../app/lib/data-check.ts';

test('Changed and unchanged successful responses record checks, never claim source freshness', () => {
  let check = emptyDataCheck;
  for (const at of [1000, 2000, 3000]) {
    check = recordDataCheck(check, '6', true, at);
    assert.equal(check.at, at);
    assert.equal(check.failed, false);
    assert.match(dataCheckLabel(check), /^Last checked at /);
    assert.doesNotMatch(dataCheckLabel(check), /updated/i);
  }
});
test('Failure retains the last successful check and never gives another week its timestamp', () => {
  const success = recordDataCheck(emptyDataCheck, '6', true, 1000);
  const failed = recordDataCheck(success, '6', false, 2000);
  assert.equal(failed.at, 1000);
  assert.match(dataCheckLabel(failed), /^Check failed · Last checked at /);
  assert.equal(recordDataCheck(success, '7', false, 2000).at, null);
});
test('Missing/invalid timestamps fall back honestly; absolute UK time does not freeze a relative age', () => {
  assert.equal(dataCheckLabel(emptyDataCheck), 'Last checked: unavailable');
  assert.equal(dataCheckLabel({ ...emptyDataCheck, at: NaN }), 'Last checked: unavailable');
  const at = Date.parse('2026-10-11T12:30:24Z');
  assert.equal(dataCheckLabel({ at, failed: false, scope: '6' }), 'Last checked at 13:30:24 UK');
  assert.equal(dataCheckLabel({ at: Date.parse('2026-12-11T12:30:24Z'), failed: false, scope: '6' }), 'Last checked at 12:30:24 UK');
});
