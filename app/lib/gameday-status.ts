type Competition = {
  status?: { type?: { state?: string; completed?: boolean; name?: string; description?: string } };
  competitors?: { team?: { id?: string }; homeAway?: string }[];
  situation?: { possession?: string };
};

export function isLiveCompetition(competition: Competition | undefined): boolean {
  return competition?.status?.type?.state === "in" && competition.status.type.completed !== true;
}

export function isTeamPlaying(competition: Competition | undefined, teamId: unknown): boolean {
  return typeof teamId === "string" && teamId.length > 0 && isLiveCompetition(competition) &&
    competition?.competitors?.filter((entry) => entry.team?.id === teamId).length === 1;
}

export function possessionSide(competition: Competition | undefined): "home" | "away" | null {
  if (!isLiveCompetition(competition)) return null;
  const type = competition?.status?.type;
  // ESPN marks halftime/end-of-period separately; never use lastPlay as a substitute.
  if (type?.name !== "STATUS_IN_PROGRESS" || /half|end of|delay|suspend/i.test(type.description ?? "")) return null;
  const id = competition?.situation?.possession;
  if (typeof id !== "string" || !id) return null;
  const matches = competition?.competitors?.filter((entry) => entry.team?.id === id) ?? [];
  const side = matches.length === 1 ? matches[0].homeAway : null;
  return side === "home" || side === "away" ? side : null;
}
