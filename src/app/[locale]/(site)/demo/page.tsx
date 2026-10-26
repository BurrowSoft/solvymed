import { preload } from "react-dom";
import { after } from "next/server";
import { DemoClient } from "./DemoClient";
import { demoTurnstileKeys } from "@/lib/demoTurnstile";
import { TURNSTILE_SCRIPT_SRC } from "@/lib/turnstileScript";
import { DEMO_TEST_PARAM, demoCountry } from "@/lib/demo";
import { demoCountServer } from "@/lib/demoMetricsServer";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// /demo (specs/demo-mode.md). ?demo_test=1 (the testers' window before the
// switch) only off Production, read here on the server per request (the
// layout is force-dynamic; 01, 10-22): on www only demo_mode opens it.
// #604: the switch is read here (the page no longer waits for it in the
// browser), and the connections the start needs are opened while the page
// loads: Supabase always; Cloudflare (preconnect + Turnstile's script) only
// when the demo is on, so a closed demo never contacts Cloudflare (cf; §6h:
// the check runs before a demo starts).
export default async function DemoPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { locale } = await params;
  // The counters' denominator (238): every render, bots included, counted after the
  // response so it never slows the page; a no-op while demo_metrics is off.
  after(() => demoCountServer("page_load", demoCountry(locale), locale));
  const testAllowed = process.env.VERCEL_ENV !== "production";
  const test = testAllowed && (await searchParams)[DEMO_TEST_PARAM] === "1";
  // null: unknown (the read failed): the browser asks again.
  let on: boolean | null = test || null;
  if (!test) {
    // The RPC itself (not publicFlag, which says false on a failed read):
    // a failed read stays null, and the browser asks again (cf).
    try {
      const { data, error } = await (await createClient()).rpc("get_public_flags");
      on = error || !Array.isArray(data) ? null : data.some((r: { key?: unknown; enabled?: unknown }) => r?.key === "demo_mode" && r.enabled === true);
    } catch {
      on = null;
    }
  }
  const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (on) preload(TURNSTILE_SCRIPT_SRC, { as: "script" });
  return (
    <>
      {/* React hoists these into <head>. */}
      {supabase && <link rel="preconnect" href={supabase} crossOrigin="anonymous" />}
      {on && <link rel="preconnect" href="https://challenges.cloudflare.com" />}
      <DemoClient testAllowed={testAllowed} siteKey={demoTurnstileKeys().siteKey} serverOn={on} />
    </>
  );
}
