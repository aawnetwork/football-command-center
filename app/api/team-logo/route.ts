// Fixed upstream and numeric NCAA IDs prevent this endpoint becoming an open proxy.
export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id || !/^\d{1,10}$/.test(id)) return new Response("Invalid NCAA team ID", { status: 400 });
  try {
    const upstream = await fetch(`https://a.espncdn.com/i/teamlogos/ncaa/500/${id}.png`, {
      signal: AbortSignal.timeout(8_000), redirect: "error", next: { revalidate: 86400 },
    });
    if (!upstream.ok || !upstream.headers.get("content-type")?.startsWith("image/png")) {
      return new Response("Logo unavailable", { status: 502 });
    }
    const bytes = await upstream.arrayBuffer();
    const signature = new Uint8Array(bytes, 0, Math.min(bytes.byteLength, 8));
    if (bytes.byteLength > 2_000_000 || signature.length !== 8 ||
        ![137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => signature[index] === byte)) {
      return new Response("Invalid logo", { status: 502 });
    }
    return new Response(bytes, { headers: {
      "Content-Type": "image/png", "Cache-Control": "public, max-age=86400",
      "X-Content-Type-Options": "nosniff",
    } });
  } catch {
    return new Response("Logo unavailable", { status: 502 });
  }
}
