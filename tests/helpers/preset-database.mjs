import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
export const sampleDraft = { league: 'CFB', name: 'Guest picks', season: 2026, week: 6, assignments: { '123': 'S' } };
export async function testDatabase() {
  const db = new PGlite();
  await db.exec('create role anon; create role authenticated; create role service_role bypassrls; grant usage on schema public to service_role, anon, authenticated;');
  for (const file of ['desk-curated-decks.sql', 'desk-preset-invitations.sql']) await db.exec(await readFile(new URL(`../../supabase/${file}`, import.meta.url), 'utf8'));
  return db;
}
const columns = {
  desk_preset_invitations: new Set('id,token_hash,label,mode,season,week,expires_at,revoked_at,consumed_at,created_at,rate_window,rate_count'.split(',')),
  desk_curated_decks: new Set('id,draft,published,published_season,published_week,revision,created_at,updated_at,published_at,contributor_link_id,review_state,submitted_at,review_note'.split(',')),
};
// Minimal local PostgREST adapter for exercising real app routes against the SQL
// functions. It is test-only, with no connection to a Supabase project.
export async function restResponse(db, input, init = {}) {
  const url = new URL(String(input));
  const path = url.pathname.replace('/rest/v1/', '');
  const method = init.method || 'GET';
  const body = init.body ? JSON.parse(init.body) : null;
  if (path.startsWith('rpc/')) {
    const name = path.slice(4);
    const allowed = { desk_guest_preset: ['p_token_hash', 'p_action', 'p_id', 'p_revision', 'p_draft'], desk_return_preset: ['p_id', 'p_revision', 'p_note'] }[name];
    if (!allowed) return Response.json({}, { status: 404 });
    const args = allowed.map(key => body[key] ?? null);
    if (name === 'desk_guest_preset' && args[4] !== null) args[4] = JSON.stringify(args[4]);
    const placeholders = args.map((_, i) => `$${i + 1}`).join(',');
    const { rows } = await db.query(`select public.${name}(${placeholders}) as result`, args);
    return Response.json(rows[0].result);
  }
  const validColumns = columns[path];
  if (!validColumns) return Response.json({}, { status: 404 });
  const fields = (url.searchParams.get('select') || '*').split(',');
  if (fields.some(field => field !== '*' && !validColumns.has(field))) throw new Error('Invalid test selection');
  const values = [], conditions = [];
  const bind = value => { values.push(value && typeof value === 'object' ? JSON.stringify(value) : value); return `$${values.length}`; };
  for (const [key, value] of url.searchParams) {
    if (!validColumns.has(key)) continue;
    if (value === 'not.is.null') conditions.push(`${key} is not null`);
    else if (value.startsWith('eq.')) conditions.push(`${key}=${bind(value.slice(3))}`);
    else throw new Error('Invalid test filter');
  }
  const where = conditions.length ? ` where ${conditions.join(' and ')}` : '';
  const selected = fields.join(',');
  let query;
  if (method === 'POST') {
    const keys = Object.keys(body);
    if (keys.some(key => !validColumns.has(key))) throw new Error('Invalid test insert');
    query = `insert into public.${path} (${keys.join(',')}) values (${keys.map(key => bind(body[key])).join(',')}) returning ${selected}`;
  } else if (method === 'PATCH') {
    const keys = Object.keys(body);
    if (keys.some(key => !validColumns.has(key))) throw new Error('Invalid test update');
    query = `update public.${path} set ${keys.map(key => `${key}=${bind(body[key])}`).join(',')}${where} returning ${selected}`;
  } else {
    query = `select ${selected} from public.${path}${where}`;
    const order = url.searchParams.get('order');
    if (order) {
      const [key, direction] = order.split('.');
      if (!validColumns.has(key) || !['asc', 'desc'].includes(direction)) throw new Error('Invalid test order');
      query += ` order by ${key} ${direction}`;
    }
    const limit = url.searchParams.get('limit');
    if (limit && /^\d+$/.test(limit)) query += ` limit ${Number(limit)}`;
  }
  const { rows } = await db.query(query, values);
  return Response.json(rows);
}
