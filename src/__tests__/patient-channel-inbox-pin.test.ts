import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// The app's staff inbox (2b-1) vendors a byte-identical copy of inbox.ts, as with score.ts:
// both repos pin its SHA-256 (line endings as LF), so a one-sided edit fails CI in both.
const PINNED = "8c48bd1d8c2c53878ce05a3305d3a9f6da591319b989d318e0d1da9bc1a431fb";

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
