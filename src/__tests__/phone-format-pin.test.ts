import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Launch polish 27: the mobile repo vendors a byte-identical copy of phoneFormat.ts, and both
// repos pin its SHA-256 (line endings as LF), so a one-sided edit fails.
const PINNED = "2c6ce6806adb6bc973463cd7ddc1f68c598f04e7333116012d64aac74fedd607";

const sha = (p: string) =>
  createHash("sha256").update(readFileSync(resolve(__dirname, p), "utf8").replace(/\r\n/g, "\n")).digest("hex");

describe("the phone format is the same in both repos", () => {
  it("phoneFormat.ts matches the pinned hash", () => {
    expect(
      sha("../lib/phoneFormat.ts"),
      "phoneFormat.ts differs from the pinned hash: change it in BOTH repos (web: src/lib/phoneFormat.ts, " +
        "mobile: its vendored copy), then update the pinned hash in both",
    ).toBe(PINNED);
  });
});
