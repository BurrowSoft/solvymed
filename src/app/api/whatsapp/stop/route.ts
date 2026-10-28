import { NextRequest, NextResponse } from "next/server";
import { clientIp } from "@/lib/founders";
import { allowStop, isWellFormedStopToken, optoutEndpoint } from "@/lib/whatsapp/stop";

// POST { t }: stops a practice's automatic WhatsApp messages to the number in
// the token. The whatsapp-optout edge function (no JWT, server to server: no
// CORS, no apikey) verifies and records it and always answers 200 { ok }: a
// bad token, its own rate limit and its own failure are all { ok: false }, so
// it is never an oracle (the mobile developer, 10-28). This route passes only
// that { ok } on: never the number, the practice or a locale (contract v2, S2).
// A malformed token gets the same { ok: false } without calling the function.
// Codes: 429 rate_limited (this route's per-IP limit), 503 generic (the
// function didn't answer: a network failure or a gateway error).
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { t?: unknown } | null;
  if (!isWellFormedStopToken(body?.t)) return NextResponse.json({ ok: false });
  const ip = clientIp(request.headers);
  if (!ip || !allowStop(ip)) return NextResponse.json({ code: "rate_limited" }, { status: 429 });

  try {
    const res = await fetch(optoutEndpoint(), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ t: body.t }),
      signal: AbortSignal.timeout(10_000),
    });
    const out = (await res.json().catch(() => null)) as { ok?: unknown } | null;
    if (!res.ok || typeof out?.ok !== "boolean") {
      console.error("WhatsApp stop: the opt-out function failed", res.status);
      return NextResponse.json({ code: "generic" }, { status: 503 });
    }
    return NextResponse.json({ ok: out.ok });
  } catch {
    console.error("WhatsApp stop: the opt-out function didn't answer");
    return NextResponse.json({ code: "generic" }, { status: 503 });
  }
}
