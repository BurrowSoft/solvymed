import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// The app's Patient Channel (2b-2) vendors a byte-identical copy of channel.ts, as with
// inbox.ts: both repos pin its SHA-256 (line endings as LF), so a one-sided edit fails CI in both.
const PINNED = "1ceb2097567fd32ded742b4255cc6760e3bd642c0a48a749c789c3e2ae919985";

const sha = (p: string) =>
  createHash("sha256").update(readFileSync(resolve(__dirname, p), "utf8").replace(/\r\n/g, "\n")).digest("hex");

describe("the Patient Channel helpers are the same in both repos", () => {
  it("channel.ts matches the pinned hash", () => {
    expect(
      sha("../lib/patientChannel/channel.ts"),
      "channel.ts differs from the pinned hash: change it in BOTH repos (web: src/lib/patientChannel/channel.ts, " +
        "mobile: its vendored copy), then update the pinned hash in both",
    ).toBe(PINNED);
  });
});
