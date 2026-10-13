import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { consentVersion, consentText } from '../app/lib/participation-contract.ts';
const sql=await readFile(new URL('../supabase/hub-audience-participation-expiry.sql',import.meta.url),'utf8');
test('Stage 35 consent explains future-only private collection and fixed lifetime',()=>{
  assert.equal(consentVersion,'stage35-v1');
  assert.match(consentText,/future game-tier ratings and favourite-team selections/);
  assert.match(consentText,/Existing saved selections are never uploaded/);
  assert.match(consentText,/365 days from consent/);
  assert.doesNotMatch(consentText,/after those features launch|collects no ratings/);
});
test('All consent/write paths enforce deadline and current consent; owned withdrawal stays unchanged',()=>{
  for(const name of ['state','grant','contribution_gate','write_selection','write_phase_selection']){
    const body=sql.split(`function public.hub_audience_${name}(`)[1].split('$$;')[0];
    assert.match(body,/credential_expires_at>clock_timestamp\(\)/);
    assert.match(body,/stage35-v1/);
  }
  assert.doesNotMatch(sql,/create or replace function public.hub_audience_withdraw/);
  assert.match(sql,/interval '8760 hours'/);
});
test('Reports filter expired parents and current consent in every sample; cleanup uses existing locks and cascades',()=>{
  assert.equal((sql.match(/p\.credential_expires_at>now\(\)/g)||[]).length,4);
  assert.match(sql,/pg_try_advisory_xact_lock\(hashtextextended\(person.token_hash,0\)\)/);
  assert.match(sql,/delete from public.hub_audience_participants where id=person.id/);
  assert.match(sql,/'expiredParticipants',expired/);
  assert.doesNotMatch(sql,/security definer|grant .* to anon|create table/);
});
