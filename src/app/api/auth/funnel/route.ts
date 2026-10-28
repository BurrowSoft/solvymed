import { NextRequest, NextResponse } from "next/server";
import { routing } from "@/i18n/routing";
import { isVerifyMetric } from "@/lib/authFunnel";
import { authFunnelCount } from "@/lib/authFunnelServer";

// The verify page's funnel totals (lib/authFunnel: verify_view, verify_expired,
// verify_resend; verify_continue_ok is counted by after-verify). A daily total only:
// nothing about the visitor is read or stored. Same-origin POSTs only, and only the
// listed metrics; anything else is a quiet 204, like a count with the switch off.
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return new NextResponse(null, { status: 204 });
  const body = (await request.json().catch(() => ({}))) as { metric?: unknown; locale?: unknown };
  if (!isVerifyMetric(body.metric) || body.metric === "verify_continue_ok") return new NextResponse(null, { status: 204 });
  const locale = typeof body.locale === "string" && (routing.locales as readonly string[]).includes(body.locale) ? body.locale : routing.defaultLocale;
  await authFunnelCount(body.metric, null, locale);
  return new NextResponse(null, { status: 204 });
}
