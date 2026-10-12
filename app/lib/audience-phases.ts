import { assessGameContext, type GameContext } from "./game-context";
export type AudiencePhase = "pregame" | "live" | "postgame";
export function audiencePhase(context: GameContext, now: string): AudiencePhase | null {
  if (!assessGameContext(context, now).usable) return null;
  return context.status === "scheduled" ? "pregame" : context.status === "live" ? "live" : context.status === "completed" ? "postgame" : null;
}
