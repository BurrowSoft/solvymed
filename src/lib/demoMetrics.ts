import { createClient } from "@/lib/supabase/client";

// The demo's cookie-free counters (specs/activation-and-demo-metrics.md §A; migration
// 238): daily totals per country and language, nothing that identifies anyone. The
// server counts only for an anonymous caller with a live demo, once per metric per demo,
// and only while server_flags.demo_metrics is on: until then every call is a no-op.
// A count never blocks or breaks the page: errors are ignored, and a call that is
// awaited (before the demo ends) gives up after CAP_MS.

export type DemoClientMetric =
  | "signin"
  | "tour_step_1" | "tour_step_2" | "tour_step_3" | "tour_step_4"
  | "value_rx" | "value_booking" | "value_ai"
  | "signup_click_bar" | "signup_click_blocked" | "signup_click_ai_quota" | "signup_click_value"
  | "signup_click_tour" | "signup_click_gate"
  | "app_store_click" | "leave";

const CAP_MS = 1500;

// Only Production counts (cf, #615: previews share the production database). The
// server decides (VERCEL_ENV) and hands it down: the demo page and the demo bar call
// this while rendering, before any child counts. Off until then.
let countingOn = false;
export function setDemoCounting(on: boolean): void {
  countingOn = on;
}

export function demoCount(metric: DemoClientMetric, where?: { country: string; locale: string }): Promise<void> {
  if (!countingOn) return Promise.resolve();
  const call = (async () => {
    try {
      await createClient().rpc("demo_count", where ? { p_metric: metric, p_country: where.country, p_locale: where.locale } : { p_metric: metric });
    } catch {
      // Counting is best-effort.
    }
  })();
  return Promise.race([call, new Promise<void>((resolve) => setTimeout(resolve, CAP_MS))]);
}

// Where a sign-up click came from (the track() "where") → its counter.
export function signupClickMetric(where: string): DemoClientMetric | null {
  if (where === "bar") return "signup_click_bar";
  if (where === "blocked") return "signup_click_blocked";
  if (where === "ai_quota") return "signup_click_ai_quota";
  if (where === "tour") return "signup_click_tour";
  if (where === "gate") return "signup_click_gate";
  if (where.startsWith("sheet_")) return "signup_click_value";
  return null;
}

// The value moments (DemoGate's DemoValueKind) → their counters.
export const VALUE_METRIC = { prescription: "value_rx", appointment: "value_booking", solvyai: "value_ai" } as const;
