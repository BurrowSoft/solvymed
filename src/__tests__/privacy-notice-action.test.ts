// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { PRIVACY_VERSION } from "@/lib/legalVersions";

// "OK" records this build's version (204's record_privacy_consent): a newer
// one already stored counts as done; anything else keeps the card.
const h = vi.hoisted(() => ({ error: null as null | { message: string }, calls: [] as unknown[] }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ rpc: async (fn: string, args: unknown) => { h.calls.push([fn, args]); return { data: null, error: h.error }; } }),
}));

import { acknowledgePrivacyNotice } from "@/lib/privacyNoticeActions";

describe("acknowledging the privacy notice", () => {
  it("records privacy at this build's version, on the web, in the page's language", async () => {
    h.error = null;
    h.calls = [];
    expect(await acknowledgePrivacyNotice("th")).toEqual({ ok: true });
    expect(h.calls).toEqual([["record_privacy_consent", { p_document: "privacy", p_version: PRIVACY_VERSION, p_platform: "web", p_locale: "th" }]]);
  });

  it("older_version is done; unknown_version or other errors keep the card", async () => {
    h.error = { message: "older_version" };
    expect(await acknowledgePrivacyNotice("en")).toEqual({ ok: true });
    h.error = { message: "unknown_version" };
    expect(await acknowledgePrivacyNotice("en")).toEqual({ ok: false });
    h.error = { message: "boom" };
    expect(await acknowledgePrivacyNotice("en")).toEqual({ ok: false });
  });

  it("an unknown locale falls back to the default", async () => {
    h.error = null;
    h.calls = [];
    await acknowledgePrivacyNotice("xx");
    expect((h.calls[0] as [string, { p_locale: string }])[1].p_locale).toBe("en");
  });
});
