/** Shared record-book validation and competition ranks, including genuine ties. */
export type HistoricalRecord = {
  rank: number;
  player: string;
  team: string;
  years: string;
  value: number;
  isActive?: boolean;
};

export function rankHistoricalRecords(records: readonly HistoricalRecord[]): HistoricalRecord[] {
  const sorted = records.filter(record => typeof record.value === 'number' && Number.isFinite(record.value) && record.player.trim())
    .map(record => ({ ...record }))
    .sort((left, right) => right.value - left.value || left.player.localeCompare(right.player) || left.years.localeCompare(right.years));
  let rank = 0;
  return sorted.map((record, index) => {
    if (index === 0 || record.value !== sorted[index - 1].value) rank = index + 1;
    return { ...record, rank };
  });
}

/** Count only explicitly retained W–L–T components; never infer missing games. */
export function gamesPlayedRecords(records: readonly HistoricalRecord[]): HistoricalRecord[] {
  const seen = new Set<string>();
  return rankHistoricalRecords(records.map(record => {
    const match = /^(\d{1,3}(?:,\d{3})*|\d+)[–-](\d{1,3}(?:,\d{3})*|\d+)[–-](\d{1,3}(?:,\d{3})*|\d+)$/.exec(record.team);
    if (!match || seen.has(record.player)) throw new Error('Ambiguous or missing franchise W–L–T record.');
    seen.add(record.player);
    const [wins, losses, ties] = match.slice(1).map(value => Number(value.replace(/,/g, '')));
    if (wins !== record.value) throw new Error('Franchise wins disagree with retained W–L–T record.');
    return { ...record, value: wins + losses + ties };
  }));
}
