import { runAllTimeCron } from "../../../../lib/all-time-cron";

export const runtime = "nodejs";
export const maxDuration = 180;

export function GET(request: Request) {
  return runAllTimeCron(request, "NFL");
}
