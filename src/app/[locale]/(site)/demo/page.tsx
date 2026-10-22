import { preload } from "react-dom";
import { DemoClient } from "./DemoClient";
import { demoTurnstileKeys } from "@/lib/demoTurnstile";
import { TURNSTILE_SCRIPT_SRC } from "@/lib/turnstileScript";

export const dynamic = "force-dynamic";

// /demo (specs/demo-mode.md). ?demo_test=1 (the testers' window before the
// switch) only off Production, read here on the server per request (the
// layout is force-dynamic; 01, 10-22): on www only demo_mode opens it.
// #604: the connections the start needs are opened while the page loads
// (Supabase for the switch, the session and start; Cloudflare for the bot
// check), and Turnstile's script is fetched early.
export default function DemoPage() {
  const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL;
  preload(TURNSTILE_SCRIPT_SRC, { as: "script" });
  return (
    <>
      {/* React hoists these into <head>. */}
      {supabase && <link rel="preconnect" href={supabase} crossOrigin="anonymous" />}
      <link rel="preconnect" href="https://challenges.cloudflare.com" />
      <DemoClient testAllowed={process.env.VERCEL_ENV !== "production"} siteKey={demoTurnstileKeys().siteKey} />
    </>
  );
}
