export type SourceRow = Readonly<Record<string, string | undefined>>;
export type NflIdentity = {
  key: string;
  gsisId: string | null;
  espnId: string | null;
};
const gsis = (value?: string) => /^00-\d{7}$/.test(value ?? '') ? value! : null;
const espn = (value?: string) => /^[1-9]\d*$/.test(value ?? '') ? value! : null;

/** Snapshot-scoped, explicit crosswalk only. Never resolve an athlete by name.
 * A conflict in either direction blocks the entire connected identity. */
export function createNflIdentityIndex(rosters: readonly SourceRow[], season: number) {
  const links = rosters.filter(row => row.season === String(season))
    .map(row => ({ g: gsis(row.gsis_id), e: espn(row.espn_id) }));
  const byGsis = new Map<string, Set<string>>(), byEspn = new Map<string, Set<string>>();
  for (const { g, e } of links) {
    if (!g || !e) continue;
    if (!byGsis.has(g)) byGsis.set(g, new Set());
    if (!byEspn.has(e)) byEspn.set(e, new Set());
    byGsis.get(g)!.add(e); byEspn.get(e)!.add(g);
  }
  const blockedGsis = new Set<string>(), blockedEspn = new Set<string>();
  for (const [g, ids] of byGsis) if (ids.size > 1) blockedGsis.add(g);
  for (const [e, ids] of byEspn) if (ids.size > 1) blockedEspn.add(e);
  // Visit each connected node once, including long conflict chains.
  const queue: ['gsis' | 'espn', string][] = [
    ...[...blockedGsis].map(id => ['gsis', id] as ['gsis', string]),
    ...[...blockedEspn].map(id => ['espn', id] as ['espn', string]),
  ];
  for (let index = 0; index < queue.length; index++) {
    const [source, id] = queue[index];
    const neighbours = source === 'gsis' ? byGsis.get(id) : byEspn.get(id);
    const blocked = source === 'gsis' ? blockedEspn : blockedGsis;
    for (const neighbour of neighbours ?? []) if (!blocked.has(neighbour)) {
      blocked.add(neighbour); queue.push([source === 'gsis' ? 'espn' : 'gsis', neighbour]);
    }
  }
  return {
    resolve(source: 'gsis' | 'espn', id: string): NflIdentity | null {
      if (source === 'gsis') {
        if (!gsis(id) || blockedGsis.has(id)) return null;
        return { key: `gsis:${id}`, gsisId: id, espnId: [...(byGsis.get(id) ?? [])][0] ?? null };
      }
      if (!espn(id) || blockedEspn.has(id)) return null;
      const g = [...(byEspn.get(id) ?? [])][0] ?? null;
      return { key: g ? `gsis:${g}` : `espn:${id}`, gsisId: g, espnId: id };
    },
  };
}
