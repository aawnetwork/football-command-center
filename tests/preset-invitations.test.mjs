import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const compile = source => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText).toString('base64')}`;
const validation = compile(await readFile(new URL('../app/lib/deck-validation.ts', import.meta.url), 'utf8'));
const source = (await readFile(new URL('../app/lib/preset-invitations.ts', import.meta.url), 'utf8')).replace('"./deck-validation"', JSON.stringify(validation));
const { newPresetToken, hashPresetToken, presetToken, validateInvitation, checkInvitationSlate, presetId, presetRevision } = await import(compile(source));

test('Invitation secrets are strong, hashed, and accepted only as exact bearer headers', () => {
  const first = newPresetToken(); const second = newPresetToken();
  assert.match(first, /^[a-f0-9]{64}$/); assert.notEqual(first, second);
  assert.notEqual(first, hashPresetToken(first)); assert.equal(hashPresetToken(first), hashPresetToken(first));
  assert.equal(presetToken(new Request('https://hub.test/api/contributor/presets', { headers: { authorization: `Bearer ${first}` } })), first);
  for (const header of ['', `Basic ${first}`, `Bearer ${first}x`, 'Bearer short']) assert.throws(() => presetToken(new Request('https://hub.test', { headers: { authorization: header } })));
});
test('Invitation validation rejects unsafe or ambiguous options and supports optional slate and expiry', () => {
  const input = { action: 'create', label: ' Pat ', mode: 'continuous' };
  assert.deepEqual(validateInvitation(input), { label: 'Pat', mode: 'continuous', season: null, week: null, expires_at: null });
  const valid = validateInvitation({ ...input, season: 2026, week: 0, expires_at: '2027-01-01T12:00:00Z' }, Date.parse('2026-01-01'));
  assert.equal(valid.week, 0); assert.equal(valid.expires_at, '2027-01-01T12:00:00.000Z');
  for (const extra of [{ label: '' }, { label: 'x'.repeat(101) }, { label: 'bad\nname' }, { mode: 'public' }, { season: 2026 }, { season: 2025, week: 0 }, { expires_at: '2020-01-01T00:00:00Z' }, { expires_at: '2027-01-01' }, { token_hash: 'mine' }, { publish: true }]) assert.throws(() => validateInvitation({ ...input, ...extra }));
  assert.doesNotThrow(() => checkInvitationSlate({ season: null, week: null }, 2026, 7));
  assert.doesNotThrow(() => checkInvitationSlate({ season: 2026, week: 0 }, 2026, 0));
  assert.throws(() => checkInvitationSlate({ season: 2026, week: 0 }, 2026, 1));
  for (const id of [null, '1', 'anything&select=token_hash']) assert.throws(() => presetId(id));
  for (const rev of [undefined, 0, 1.5, '1']) assert.throws(() => presetRevision(rev));
});
