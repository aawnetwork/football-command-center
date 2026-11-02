import { NextResponse } from "next/server";
import { getBasementRecordPublication } from "../../../lib/basement-record-publication";
import { recordEnvelope, validBasementToken } from "../../../lib/basement-export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

export async function GET(request: Request) {
  if (!validBasementToken(request.headers.get("authorization"), process.env.BASEMENT_RECORDS_EXPORT_TOKEN))
    return NextResponse.json({ error: "Private factual export requires its dedicated read credential." }, { status: 401, headers });
  const params = new URL(request.url).searchParams;
  if ([...params.keys()].some(key => !["kind", "season"].includes(key)))
    return NextResponse.json({ error: "Invalid export selection." }, { status: 400, headers });
  const kind = params.get("kind") ?? "records";
  try {
    if (kind === "records" && !params.has("season"))
      return NextResponse.json(await getBasementRecordPublication(), { headers });
    if (kind !== "rankings" || !/^20\d{2}$/.test(params.get("season") ?? ""))
      return NextResponse.json({ error: "Invalid export selection." }, { status: 400, headers });
    const season = Number(params.get("season"));
    if (season > new Date().getUTCFullYear() + 1 || !process.env.CFBD_API_KEY)
      return NextResponse.json({ error: "Rankings source is unavailable for this selection." }, { status: 503, headers });
    // One cached season publication; no per-game fan-out, writes or credentials in the response.
    const response = await fetch(`https://api.collegefootballdata.com/rankings?year=${season}&seasonType=both`, {
      headers: { Authorization: `Bearer ${process.env.CFBD_API_KEY}` }, next: { revalidate: 900 },
      signal: AbortSignal.timeout(10_000), redirect: "error",
    });
    if (!response.ok) throw new Error("Rankings read failed");
    const text = await response.text();
    if (Buffer.byteLength(text) > 2_000_000) throw new Error("Rankings publication too large");
    const weeks: unknown = JSON.parse(text);
    if (!Array.isArray(weeks) || weeks.length > 60) throw new Error("Invalid rankings publication");
    return NextResponse.json(recordEnvelope({ kind: "cfbd-rankings", season, source: "https://api.collegefootballdata.com/rankings", weeks }), { headers });
  } catch {
    return NextResponse.json({ error: "Factual publication is unavailable. Retain the last successful delivery." }, { status: 503, headers });
  }
}
