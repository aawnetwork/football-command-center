import { captureCard } from '../exports/capture-card';
import type { projectNflRanking } from '../../lib/stats-v2/nfl-export';

/** Dedicated, verified selected-stat projection. Never capture the wide live table. */
export async function captureRanking(ranking: ReturnType<typeof projectNflRanking>, teamName: (code: string) => string) {
  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'position:fixed;left:-100000px;top:0;pointer-events:none;';
  const host = document.createElement('section');
  host.style.cssText = 'width:640px;background:#fffdf7;color:#0b1f33;padding:24px;font-family:Arial,sans-serif;border-radius:12px;';
  const node = (tag: string, text: string, css = '') => { const element = document.createElement(tag); element.textContent = text; element.style.cssText = css; return element; };
  host.append(node('p', 'AAW HUB / NFL', `margin:0 0 8px;font-size:13px;font-weight:800;border-top:6px solid ${ranking.accent};padding-top:14px;`),
    node('h2', ranking.statistic.label, 'margin:0;font-size:30px;'),
    node('p', `${ranking.period.season} · ${ranking.period.phase === 'REG' ? 'Regular season' : 'Postseason'} · ${ranking.period.week === null ? 'Season' : `Week ${ranking.period.week}`}`, 'margin:8px 0 18px;color:#52606a;'));
  for (const row of ranking.rows) {
    const item = node('div', '', 'display:flex;align-items:center;gap:14px;padding:14px 0;border-top:1px solid #d8d6cd;');
    item.append(node('span', String(row.rank), 'width:28px;font-size:20px;'));
    for (const team of row.teams) if (team.logo) { const image = document.createElement('img'); image.src = team.logo; image.alt = ''; image.style.cssText = 'width:38px;height:38px;object-fit:contain;'; item.append(image); }
    const identity = node('div', '', 'flex:1;'); identity.append(node('strong', row.player.name, 'font-size:21px;display:block;'), node('span', row.teams.map(t => teamName(t.code)).join(' / '), 'color:#52606a;font-size:13px;'));
    item.append(identity, node('strong', Number.isInteger(row.value) ? row.value.toLocaleString('en-GB') : row.value.toFixed(1), 'font-size:26px;')); host.append(item);
  }
  host.append(node('p', `Last Updated ${new Date(ranking.checkedAt).toLocaleString('en-GB')}`, 'font-size:11px;color:#52606a;margin:16px 0 0;'));
  wrapper.append(host); document.body.append(wrapper);
  try { return await captureCard(host); } finally { wrapper.remove(); }
}
