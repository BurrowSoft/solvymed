import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// specs/patient-contact-tech.md §4.1: the mobile repo vendors a byte-identical copy of
// score.ts, and both repos pin its SHA-256 (line endings as LF), so a one-sided edit fails.
const PINNED = "cb1e334e6c4415478dbfe8e465d8ec900f1c0648b814fa320d874cda89a3cb40";

const sha = (p: string) =>
  createHash("sha256").update(readFileSync(resolve(__dirname, p), "utf8").replace(/\r\n/g, "\n")).digest("hex");

describe("the Patient Channel engine is the same in both repos", () => {
  it("score.ts matches the pinned hash", () => {
    expect(
      sha("../lib/patientChannel/score.ts"),
      "score.ts differs from the pinned hash: change it in BOTH repos (web: src/lib/patientChannel/score.ts, " +
        "mobile: lib/patientChannel/score.ts), re-run the shared vectors, then update the pinned hash in both",
    ).toBe(PINNED);
  });
});
