'use client';
import './stats-preview-switch.css';
import { useSearchParams } from 'next/navigation';
export function useStatsPreview() {
  const params = useSearchParams();
  const release=process.env.NEXT_PUBLIC_AAW_STATS_V2_RELEASE==='1';
  const preview=process.env.NEXT_PUBLIC_AAW_STATS_V2_PREVIEW==='1';
  const available=release||preview;
  const teams=available&&(release?params.get('statsView')==='teams':params.get('stats2')==='teams');
  const enabled=available&&!teams&&(release?params.get('statsView')!=='legacy':params.get('stats2')==='1');
  const select=(view:'players'|'teams'|'legacy')=>{
    const url=new URL(window.location.href);
    if(release){url.searchParams.delete('stats2');if(view==='players')url.searchParams.delete('statsView');else url.searchParams.set('statsView',view);}
    else {if(view==='legacy')url.searchParams.delete('stats2');else url.searchParams.set('stats2',view==='players'?'1':'teams');}
    window.history.replaceState(null,'',url);
  };
  return {available,teams,enabled,selectTeams(){select('teams');},select(enabled:boolean){select(enabled?'players':'legacy');}};
}
export function StatsPreviewSwitch({ enabled, onPreview, onExisting, onTeams, league = 'NFL', teams = false }: { enabled: boolean; teams?: boolean; league?: 'NFL' | 'CFB'; onPreview: () => void; onExisting: () => void; onTeams: () => void }) {
  return <div className="stats-preview-switch" data-league={league} aria-label="Stats views">
    <button aria-pressed={enabled} onClick={onPreview}>Players</button>
    <button aria-pressed={teams} onClick={onTeams}>Teams</button>
    {process.env.NODE_ENV==='development'&&process.env.NEXT_PUBLIC_AAW_STATS_V2_PREVIEW==='1'&&process.env.NEXT_PUBLIC_AAW_STATS_V2_RELEASE!=='1'&&<button aria-pressed={!enabled && !teams} onClick={onExisting}>Compare existing Stats</button>}
  </div>;
}
