import { NextRequest, NextResponse } from "next/server";
import { routing } from "@/i18n/routing";
import { allowFunnelCount, funnelPlatform, isVerifyMetric } from "@/lib/authFunnel";
import { authFunnelCount } from "@/lib/authFunnelServer";
import { clientIp } from "@/lib/founders";

// The confirm screens' funnel totals (lib/authFunnel): the website's verify page
// (verify_view, verify_expired, verify_resend; its verify_continue_ok is counted by
// after-verify) and the app's confirm panel (all four, with platform "android" / "ios";
// the contract's item 6). A daily total only: the metric, the language and the platform;
// nothing about the visitor is stored. A browser's POST must come from this site (the
// app's has no Origin); one address gets a few per 10 minutes. Anything else is a quiet
// 204, like a count with the switch off.
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return new NextResponse(null, { status: 204 });
  const ip = clientIp(request.headers);
  if (!ip || !allowFunnelCount(ip)) return new NextResponse(null, { status: 204 });
  const body = (await request.json().catch(() => ({}))) as { metric?: unknown; locale?: unknown; platform?: unknown };
  const platform = funnelPlatform(body.platform);
  if (!isVerifyMetric(body.metric) || (body.metric === "verify_continue_ok" && platform === "web")) return new NextResponse(null, { status: 204 });
  const locale = typeof body.locale === "string" && (routing.locales as readonly string[]).includes(body.locale) ? body.locale : routing.defaultLocale;
  await authFunnelCount(body.metric, null, locale, platform);
  return new NextResponse(null, { status: 204 });
}
