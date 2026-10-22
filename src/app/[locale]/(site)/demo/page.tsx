import { DemoClient } from "./DemoClient";
import { demoTurnstileKeys } from "@/lib/demoTurnstile";

export const dynamic = "force-dynamic";

// /demo (specs/demo-mode.md). ?demo_test=1 (the testers' window before the
// switch) only off Production, read here on the server per request (the
// layout is force-dynamic; 01, 10-22): on www only demo_mode opens it.
export default function DemoPage() {
  return <DemoClient testAllowed={process.env.VERCEL_ENV !== "production"} siteKey={demoTurnstileKeys().siteKey} />;
}
