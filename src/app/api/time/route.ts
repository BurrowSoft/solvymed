// The server's time (lib/clockSkew: is the device's clock right?). Nothing
// else: no session, no data. Never cached.
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ now: Date.now() }, { headers: { "Cache-Control": "no-store" } });
}
