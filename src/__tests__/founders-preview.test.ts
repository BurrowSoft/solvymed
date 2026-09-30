import { afterEach, describe, expect, it, vi } from "vitest";

// UX (1 Oct): Founders is visible only on Vercel Preview builds (the
// release-founders test site) until Vitor's go; never on Production.
describe("Founders visibility by build", () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

  for (const [env, on] of [["preview", true], ["production", false], ["development", false], [undefined, false]] as const) {
    it(`NEXT_PUBLIC_VERCEL_ENV=${env ?? "(unset)"} → ${on ? "on" : "off"}`, async () => {
      vi.resetModules();
      if (env) vi.stubEnv("NEXT_PUBLIC_VERCEL_ENV", env);
      else vi.stubEnv("NEXT_PUBLIC_VERCEL_ENV", "");
      const { liveFeatures } = await import("@/lib/liveFeatures");
      expect(liveFeatures.founders).toBe(on);
      expect(liveFeatures.foundersRules).toBe(on);
    });
  }
});
