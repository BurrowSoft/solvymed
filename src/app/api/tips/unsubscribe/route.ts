import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { clientIp } from "@/lib/founders";
import { allowUnsubscribe } from "@/lib/notices/unsubscribe";
import { isWellFormedTipsToken, tipsTogglesLive } from "@/lib/tips";

// POST: stops the tips e-mails for the account that owns the token (276's
// tips_email_optout_confirm, granted to anon; the contract's §4). Two callers:
// - the page's button: JSON { t };
// - a mail provider's one-click (RFC 8058, the List-Unsubscribe-Post header):
//   form "List-Unsubscribe=One-Click", the token in the URL's ?t=.
// The RPC always answers true, for unknown and repeated tokens alike, so this route
// never tells whether a token exists. Codes: 400 bad_token, 429 rate_limited, 503 generic;
// 404 while tips-toggles-live is off (276 not live).
export async function POST(request: NextRequest) {
  if (!tipsTogglesLive()) return new NextResponse(null, { status: 404 });
  const fromQuery = request.nextUrl.searchParams.get("t");
  const body = request.headers.get("content-type")?.includes("application/json")
    ? ((await request.json().catch(() => null)) as { t?: unknown } | null)
    : null;
  const token = body?.t ?? fromQuery;
  if (!isWellFormedTipsToken(token)) return NextResponse.json({ code: "bad_token" }, { status: 400 });
  const ip = clientIp(request.headers);
  if (!ip || !allowUnsubscribe(ip)) return NextResponse.json({ code: "rate_limited" }, { status: 429 });

  // An anonymous client: the token is the only credential.
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await supabase.rpc("tips_email_optout_confirm", { p_token: token });
  if (error) {
    console.error("Tips unsubscribe: RPC failed", error.code ?? "unknown");
    return NextResponse.json({ code: "generic" }, { status: 503 });
  }
  return NextResponse.json({ ok: true });
}
