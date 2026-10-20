import { describe, it, expect } from "vitest";
import { isFirstConfirmation, OAUTH_SIGN_IN } from "@/lib/firstConfirmation";

const now = new Date("2026-09-26T15:00:00Z").getTime();
const ago = (ms: number) => new Date(now - ms).toISOString();

describe("isFirstConfirmation", () => {
  it("is true for the link that just confirmed the account, whatever its type", () => {
    for (const type of ["signup", "email", "magiclink", null]) {
      expect(isFirstConfirmation({ email_confirmed_at: ago(5_000) }, type, now)).toBe(true);
    }
    expect(isFirstConfirmation({ confirmed_at: ago(9 * 60_000) }, "signup", now)).toBe(true);
  });

  it("is false for a later login or a password reset", () => {
    expect(isFirstConfirmation({ email_confirmed_at: ago(2 * 24 * 3600_000) }, "magiclink", now)).toBe(false);
    expect(isFirstConfirmation({ email_confirmed_at: ago(11 * 60_000) }, "signup", now)).toBe(false);
    expect(isFirstConfirmation({ email_confirmed_at: ago(5_000) }, "recovery", now)).toBe(false);
    // An existing account signing in with Google (01): never the welcome,
    // even when Google has just confirmed it (a fresh stamp).
    expect(isFirstConfirmation({ email_confirmed_at: ago(5_000) }, OAUTH_SIGN_IN, now)).toBe(false);
    expect(isFirstConfirmation({}, "signup", now)).toBe(false);
  });
});
