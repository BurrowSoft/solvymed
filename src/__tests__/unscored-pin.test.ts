import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// The mobile repo vendors a byte-identical copy of the Patient Channel's unscored.ts (app #586),
// and both repos pin its SHA-256 (line endings as LF), so a one-sided edit fails.
const PINNED = "04aa3df293663da942e2e7c1ca088c8fc8a4fb2830a7a3dbd83647f78815253a";

const sha = (p: string) =>
  createHash("sha256").update(readFileSync(resolve(__dirname, p), "utf8").replace(/\r\n/g, "\n")).digest("hex");

describe("the unscored rule is the same in both repos", () => {
  it("unscored.ts matches the pinned hash", () => {
    expect(
      sha("../lib/patientChannel/unscored.ts"),
      "unscored.ts differs from the pinned hash: change it in BOTH repos (web: src/lib/patientChannel/unscored.ts, " +
        "mobile: its vendored copy), then update the pinned hash in both",
    ).toBe(PINNED);
  });
});
