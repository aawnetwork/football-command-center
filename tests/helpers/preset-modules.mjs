import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
const root = fileURLToPath(new URL('../../', import.meta.url));
const dataModule = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const scoreboard = dataModule(`export async function GET(request) { const u=new URL(request.url); return Response.json({season:Number(u.searchParams.get('season')),week:Number(u.searchParams.get('week')),games:[{id:123,awayTeam:'Away Team',homeTeam:'Home Team',startDate:'2026-10-10T17:00:00Z'}]}); }`);
const cache = new Map();
export async function moduleUrl(file) {
  const full = path.resolve(root, file);
  if (full.endsWith('/app/api/scoreboard/route.ts')) return scoreboard;
  if (cache.has(full)) return cache.get(full);
  const input = (await readFile(full, 'utf8')).replace('import "server-only";', '');
  let source = ts.transpileModule(input, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  const matches = [...source.matchAll(/(["'])(\.\.?\/[^"']+)\1/g)];
  for (const match of matches) {
    const target = await moduleUrl(path.resolve(path.dirname(full), match[2] + (path.extname(match[2]) ? '' : '.ts')));
    source = source.replaceAll(match[0], JSON.stringify(target));
  }
  const url = dataModule(source); cache.set(full, url); return url;
}
export async function loadModule(file) { return import(await moduleUrl(file)); }
