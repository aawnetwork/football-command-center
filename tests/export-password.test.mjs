import test from 'node:test';
import assert from 'node:assert/strict';
import { validExportPassword } from '../app/lib/export-password.ts';
const password = 'test-only-long-password';
const basic = (value) => `Basic ${Buffer.from(value).toString('base64')}`;
test('Export password fails closed and validates credentials', () => {
  assert.equal(validExportPassword(basic(`aaw:${password}`), password), true);
  for (const header of [null, 'Bearer anything', basic('aaw:wrong'), basic(`other:${password}`)])
    assert.equal(validExportPassword(header, password), false);
  assert.equal(validExportPassword(basic(`aaw:${password}`), undefined), false);
  assert.equal(validExportPassword(basic('aaw:short'), 'short'), false);
});
