import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// cf, 8 Oct: Vitor set SolvyAI's Production vars ahead of the go. Every
// SolvyAI surface also needs solvyai-live (the flip PR makes the privacy
// text, Help and the App Map true in the same build): the panel, the
// Settings card, the pricing line, the news entry and the tour all follow
// liveFeatures.solvyAi; /api/assistant and /api/assistant/usage (what the
// app follows) follow assistantApiEnabled(). With the env on and the
// condition false, all of it stays off: the routes answer today's 404.

const h = vi.hoisted(() => ({ live: false }));
vi.mock("@/lib/conditions", async (orig) => {
  const real = await orig<typeof import("@/lib/conditions")>();
  return { ...real, conditionMet: (id: string) => (id === "solvyai-live" ? h.live : real.conditionMet(id as never)) };
});

const env = { ...process.env };
beforeEach(() => {
  vi.resetModules();
  process.env.SOLVYAI_API_ENABLED = "1";
  process.env.NEXT_PUBLIC_SOLVYAI_ENABLED = "1";
});
afterEach(() => { process.env = { ...env }; });

describe("SolvyAI needs solvyai-live as well as the vars", () => {
  it("vars on, condition false: the panel flag and the API are off; usage answers 404", async () => {
    h.live = false;
    const { liveFeatures } = await import("@/lib/liveFeatures");
    const { assistantApiEnabled } = await import("@/lib/assistant/server/caller");
    expect(liveFeatures.solvyAi).toBe(false);
    expect(assistantApiEnabled()).toBe(false);
    // What follows the flag: the panel/intro card, the news item, the tour step.
    const { solvyAiPanelOn, solvyAiIntroOn } = await import("@/lib/solvyaiIntro");
    expect(solvyAiPanelOn({ isSecretary: false, sub: null })).toBe(false);
    expect(solvyAiIntroOn({ isSecretary: false, sub: null })).toBe(false);
    const { NEWS } = await import("@/lib/news");
    expect(NEWS.flatMap((r) => r.items).find((i) => i.id === "solvyai")?.live).toBe(false);
    const { tourSteps } = await import("@/lib/tour");
    expect(tourSteps("professional", "pix").some((s) => s.id === "solvyai")).toBe(false);
    const { GET } = await import("@/app/api/assistant/usage/route");
    const res = await GET(new Request("https://www.solvymed.com/api/assistant/usage") as never);
    expect(res.status).toBe(404);
    const chat = await import("@/app/api/assistant/route");
    const post = await chat.POST(new Request("https://www.solvymed.com/api/assistant", { method: "POST", body: "{}" }) as never);
    expect(post.status).toBe(404);
    // Fresh imports of both routes: slow under the full suite's load.
  }, 90_000);

  it("vars on and condition true: on", async () => {
    h.live = true;
    const { liveFeatures } = await import("@/lib/liveFeatures");
    const { assistantApiEnabled } = await import("@/lib/assistant/server/caller");
    expect(liveFeatures.solvyAi).toBe(true);
    expect(assistantApiEnabled()).toBe(true);
  });

  it("condition true but vars off: off (the kill switch still works)", async () => {
    h.live = true;
    process.env.SOLVYAI_API_ENABLED = "";
    process.env.NEXT_PUBLIC_SOLVYAI_ENABLED = "";
    const { liveFeatures } = await import("@/lib/liveFeatures");
    const { assistantApiEnabled } = await import("@/lib/assistant/server/caller");
    expect(liveFeatures.solvyAi).toBe(false);
    expect(assistantApiEnabled()).toBe(false);
  });
});
