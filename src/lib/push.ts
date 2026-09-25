const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

/**
 * Sends an Expo push notification to each token. Best-effort — a failure
 * here shouldn't fail the booking/appointment action it's attached to — but
 * logged rather than silently swallowed, so a broken push pipeline is
 * actually visible instead of invisible.
 */
export async function sendExpoPush(tokens: string[], title: string, body: string): Promise<void> {
  if (!tokens.length) return;
  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(tokens.map((to) => ({ to, title, body, sound: "default" }))),
    });
    if (!res.ok) {
      console.error(`Expo push send failed: ${res.status} ${await res.text().catch(() => "")}`);
      return;
    }
    // Expo returns 200 for the request itself even when individual tickets
    // failed (e.g. DeviceNotRegistered) — those are only visible in the
    // response body, not the HTTP status.
    const json = await res.json().catch(() => null) as { data?: Array<{ status: string; message?: string; details?: unknown }> } | null;
    const failedTickets = (json?.data ?? []).filter((t) => t.status === "error");
    if (failedTickets.length) {
      console.error("Expo push ticket errors", failedTickets);
    }
  } catch (err) {
    console.error("Expo push send threw", err);
  }
}
