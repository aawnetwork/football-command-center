import { publicSource } from './public-source';
import type { EspnScoreboard } from './nfl-source-types';

/** Scoreboard only: no boxscores, roster/register downloads or statistical processing. */
export async function respondNflPollStatus(request: Request, source = publicSource) {
  const headers = {'Cache-Control':'no-store'};
  const params = new URL(request.url).searchParams;
  const mode = params.get('mode') ?? 'weekly', raw = params.get('week');
  if ([...params.keys()].some(key => !['view','mode','week','season'].includes(key) || params.getAll(key).length !== 1) || params.get('view') !== 'status' || !['weekly','season'].includes(mode) || (params.has('season') && params.get('season') !== '2026') || (mode === 'season' && raw !== null) || (raw !== null && (!/^[1-9]\d*$/.test(raw) || Number(raw) > 18))) return Response.json({error:'Invalid status selection'},{status:400,headers});
  try {
    const url = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard';
    const read = async (suffix = '') => {
      const board = (await source(url + suffix)).value as EspnScoreboard;
      if (board.season?.year !== 2026 || board.season.type !== 2 || !Number.isInteger(board.week?.number) || board.week!.number! < 1 || board.week!.number! > 18 || !Array.isArray(board.events)) throw Error('Unverified NFL period');
      return board;
    };
    let board = await read();
    const currentWeek = board.week!.number!, selected = raw === null ? currentWeek : Number(raw);
    if (mode === 'weekly' && selected !== currentWeek) {
      board = await read(`?dates=2026&seasontype=2&week=${selected}`);
      if (board.week?.number !== selected) throw Error('NFL week mismatch');
    }
    const seen = new Set<string>();
    const games = board.events!.map(event => {
      const status = event.competitions?.[0]?.status?.type;
      if (!event.id || seen.has(event.id) || !Number.isFinite(Date.parse(event.date ?? '')) || event.season?.year !== 2026 || event.season.type !== 2 || !status || !['pre','in','post'].includes(status.state ?? '') || (status.state === 'post' ? status.completed !== true : status.completed === true)) throw Error('Unverified NFL game status');
      seen.add(event.id);
      return {id:event.id,startDate:event.date!,live:status.state==='in',completed:status.completed===true};
    });
    // An empty active slate cannot prove that previously observed games have finished.
    if (!games.length) throw Error('NFL slate unavailable');
    const historical = mode === 'weekly' && selected < currentWeek && games.every(game => game.completed);
    return Response.json({historical,period:{season:2026,phase:'REG',week:mode==='season'?null:selected},games},{headers});
  } catch { return Response.json({error:'NFL game status unavailable'},{status:503,headers}); }
}
