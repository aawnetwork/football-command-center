export type PollKind = "ap" | "cfp" | "uki";

export type PollEntry = {
  rank: number;
  previousRank: number | null;
  team: string;
  abbreviation: string;
  logo: string | null;
  record: string;
  points?: number | null;
  firstPlaceVotes?: number | null;
};

export type PollSnapshot = {
  week: number;
  publishedAt: string | null;
  entries: PollEntry[];
};

// Weekly snapshots belong here once a poll has been captured. UK & Ireland
// rankings are intentionally maintained here by the AAW team.
export const cfbPollSnapshots: Partial<Record<PollKind, Record<number, PollSnapshot>>> = {
  uki: {},
};
