import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// The app's staff inbox (2b-1) vendors a byte-identical copy of inbox.ts, as with score.ts:
// both repos pin its SHA-256 (line endings as LF), so a one-sided edit fails CI in both.
const PINNED = "36139fd403ab1b3e2e888a81cc614ac3b6ca196dfcdc6032b9221a72aaac647d";

const sha = (p: string) =>
  createHash("sha256").update(readFileSync(resolve(__dirname, p), "utf8").replace(/\r\n/g, "\n")).digest("hex");

describe("the Patient Channel inbox helpers are the same in both repos", () => {
  it("inbox.ts matches the pinned hash", () => {
    expect(
      sha("../lib/patientChannel/inbox.ts"),
      "inbox.ts differs from the pinned hash: change it in BOTH repos (web: src/lib/patientChannel/inbox.ts, " +
        "mobile: its vendored copy), then update the pinned hash in both",
    ).toBe(PINNED);
  });
});
