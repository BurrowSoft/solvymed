import { describe, expect, it } from "vitest";
import { studioEnabled } from "@/lib/studio/live";

// Document Studio's one switch (02, 10-13): the server flag document_studio,
// shared with the app (migration 223, per-practice testers). Anything but
// an enabled row is off.
const rpc = (data: unknown, error: unknown = null) => ({ rpc: async () => ({ data, error }) });

describe("studioEnabled", () => {
  it("on only with the document_studio flag enabled for the caller", async () => {
    expect(await studioEnabled(rpc([{ key: "document_studio", enabled: true }]))).toBe(true);
    expect(await studioEnabled(rpc([{ key: "document_studio", enabled: false }]))).toBe(false);
    expect(await studioEnabled(rpc([{ key: "practice_locations", enabled: true }]))).toBe(false);
  });

  it("no rows, a read error or a throw: off", async () => {
    expect(await studioEnabled(rpc(null))).toBe(false);
    expect(await studioEnabled(rpc(null, { message: "boom" }))).toBe(false);
    expect(await studioEnabled({ rpc: async () => { throw new Error("network"); } })).toBe(false);
  });
});
