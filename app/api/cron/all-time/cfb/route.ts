import { runAllTimeCron } from "../../../../lib/all-time-cron";

export const runtime = "nodejs";

export function GET(request: Request) {
  return runAllTimeCron(request, "CFB");
}
