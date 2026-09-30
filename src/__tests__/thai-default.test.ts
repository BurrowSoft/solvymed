import { afterEach, describe, expect, it, vi } from "vitest";

// Vitor (2026-10-01): the Thai language stays public; "0" is its off switch.
// The Thai MARKET (signup country picker, TH/Other pricing, landing) still
// needs "1", so making the language public never launches the market.

async function load(value: string | undefined) {
  if (value === undefined) vi.stubEnv("NEXT_PUBLIC_THAI_ENABLED", undefined as unknown as string);
  else vi.stubEnv("NEXT_PUBLIC_THAI_ENABLED", value);
  vi.resetModules();
  return import("@/lib/publicLocales");
}
afterEach(() => { vi.unstubAllEnvs(); });

describe("NEXT_PUBLIC_THAI_ENABLED", () => {
  it("unset (Production): Thai language public, Thai market off", async () => {
    const m = await load(undefined);
    expect(m.thaiLanguagePublic).toBe(true);
    expect(m.publicLocales()).toContain("th");
    expect(m.thaiEnabled).toBe(false);
  });

  it('"1" (Preview): both on', async () => {
    const m = await load("1");
    expect(m.publicLocales()).toContain("th");
    expect(m.thaiEnabled).toBe(true);
  });

  it('"0": the off switch hides the language (market off too)', async () => {
    const m = await load("0");
    expect(m.publicLocales()).not.toContain("th");
    expect(m.isPublicLocale("th")).toBe(false);
    expect(m.thaiEnabled).toBe(false);
  });
});
