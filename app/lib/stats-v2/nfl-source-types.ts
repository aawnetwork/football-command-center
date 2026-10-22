export type EspnTeam = { id?: string; abbreviation?: string; displayName?: string; logo?: string };
export type EspnCompetition = {
  id?: string;
  status?: { type?: { state?: string; completed?: boolean; name?: string } };
  competitors?: { team?: EspnTeam; score?: string; homeAway?: string }[];
};
export type EspnEvent = { id?: string; date?: string; season?: { year?: number; type?: number }; competitions?: EspnCompetition[] };
export type EspnScoreboard = { season?: { year?: number; type?: number }; week?: { number?: number }; events?: EspnEvent[] };
export type EspnSummary = {
  header?: { id?: string; season?: { year?:number; type?:number }; week?:number|{number?:number}; competitions?: EspnCompetition[] };
  boxscore?: { players?: { team?: EspnTeam; statistics?: {
    name?: string; labels?: string[];
    athletes?: { athlete?: { id?: string; displayName?: string; position?: { abbreviation?: string } }; stats?: unknown[] }[];
  }[] }[] };
};
export type NflLiveSource = { observedAt: number; scoreboard: EspnScoreboard; summaries: (EspnSummary | null)[] };
