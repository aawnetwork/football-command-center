export type StatisticalRow = { rank: string; name: string; team: string; value: string; logo: string };
export type StatisticalSelection = { title: string; period: string; coverage: string; qualifications: string[]; rows: StatisticalRow[] };

/** Read the rendered Stats 2.0 selection. Sorting, eligibility, values and ranks
 * belong to Stats 2.0; publishing never recalculates them. */
export function readStatisticalSelection(root: HTMLElement): StatisticalSelection | null {
  const section = root.querySelector<HTMLElement>('section[data-league]');
  if (!section || section.querySelector('[role="alert"]')) return null;
  const table = section.querySelector('table');
  const heading = table?.querySelector<HTMLTableCellElement>('thead th[aria-sort="ascending"], thead th[aria-sort="descending"]');
  if (!table || !heading) return null;
  const index = Array.from(heading.parentElement!.children).indexOf(heading);
  const rows = Array.from(table.querySelectorAll<HTMLTableRowElement>('tbody > tr')).filter(row => row.querySelector('th[scope="row"]')).map(row => {
    const identity = row.querySelector('th[scope="row"]')!;
    const image = identity.querySelector<HTMLImageElement>('img[data-team-logo]');
    return { rank: row.cells[0].textContent?.trim() || '—', name: identity.querySelector('strong')?.textContent?.trim() || '', team: identity.querySelector('small')?.textContent?.trim() || '', value: row.cells[index]?.textContent?.trim() || '—', logo: image && !image.hidden ? image.currentSrc || image.src : '' };
  }).filter(row => row.name && row.value !== '—' && row.value !== 'N/A');
  const coverage = section.querySelector('aside[aria-label="Statistics coverage"]');
  // Only essential visible qualifications travel with the static publication.
  const qualifications = Array.from(coverage?.querySelectorAll('p') ?? []).filter(p => !p.closest('details')).map(p => p.textContent?.trim() || '').filter(Boolean);
  const filters = Array.from(section.querySelectorAll('select')).map(select => select.parentElement?.textContent?.startsWith('Conference') && select.value ? select.selectedOptions[0]?.textContent : '').filter(Boolean);
  const search = section.querySelector<HTMLInputElement>('input[placeholder="Player or team"]')?.value.trim();
  if (search) filters.push(`Matching “${search}”`);
  const summary = coverage?.querySelector('div > span')?.textContent || '';
  if (summary.includes('In-progress statistics are provisional.')) qualifications.unshift('In-progress statistics are provisional.');
  const observed = section.getAttribute('data-statistics-observed-at');
  if (observed && Number.isFinite(Date.parse(observed))) qualifications.push(`Observed ${new Date(observed).toLocaleString('en-GB', { timeZone: 'Europe/London' })} UK`);
  const attribution = section.getAttribute('data-statistics-source');
  if (attribution) qualifications.push(attribution);
  if (filters.length) qualifications.unshift(filters.join(' · '));
  return { title: heading.querySelector('button')?.getAttribute('data-statistic-label') || heading.textContent?.trim() || 'Leaders', period: section.querySelector('[data-statistics-period] > strong')?.textContent?.trim() || '', coverage: coverage?.querySelector('strong')?.textContent?.trim() || 'Reported data', qualifications, rows };
}

export function statisticalExportRows(selection: StatisticalSelection, limit: 5 | 10) {
  return selection.rows.slice(0, limit);
}
