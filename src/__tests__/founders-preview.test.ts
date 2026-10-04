import { afterEach, describe, expect, it, vi } from "vitest";

// Founders went live (Vitor, 2 Oct): the page, the form and the rules page
// show on every build, Production included. Uploads stay behind their own
// condition (founders-upload-live).
describe("Founders visibility by build", () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

  for (const env of ["preview", "production", "development", ""] as const) {
    it(`NEXT_PUBLIC_VERCEL_ENV=${env || "(unset)"} → on`, async () => {
      vi.resetModules();
      vi.stubEnv("NEXT_PUBLIC_VERCEL_ENV", env);
      const { liveFeatures } = await import("@/lib/liveFeatures");
      expect(liveFeatures.founders).toBe(true);
      expect(liveFeatures.foundersRules).toBe(true);
    });
  }

  it("goes with the privacy version that adds §6d", async () => {
    const { PRIVACY_VERSION } = await import("@/lib/legalVersions");
    // §6d arrived in 2026-10-03; later versions keep it.
    expect(PRIVACY_VERSION >= "2026-10-03").toBe(true);
  });
});
