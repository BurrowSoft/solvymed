import { preload } from "react-dom";
import { DemoClient } from "./DemoClient";
import { demoTurnstileKeys } from "@/lib/demoTurnstile";
import { TURNSTILE_SCRIPT_SRC } from "@/lib/turnstileScript";
import { DEMO_TEST_PARAM } from "@/lib/demo";
import { publicFlag } from "@/lib/publicFlags";
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
export default async function DemoPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const testAllowed = process.env.VERCEL_ENV !== "production";
  const test = testAllowed && (await searchParams)[DEMO_TEST_PARAM] === "1";
  // null: unknown (the read failed): the browser asks again.
  let on: boolean | null = test || null;
  if (!test) {
    try {
      on = await publicFlag(await createClient(), "demo_mode");
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
