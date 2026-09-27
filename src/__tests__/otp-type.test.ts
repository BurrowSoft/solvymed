import { describe, it, expect } from "vitest";
import { otpTypeFor } from "@/lib/otpType";

describe("otpTypeFor", () => {
  it("accepts the template and hook types verifyOtp supports", () => {
    for (const t of ["signup", "recovery", "invite", "magiclink", "email_change", "email"]) expect(otpTypeFor(t)).toBe(t);
    expect(otpTypeFor("email_change_new")).toBe("email_change");
  });

  it("refuses missing or unknown types instead of guessing", () => {
    expect(otpTypeFor("")).toBeNull();
    expect(otpTypeFor(null)).toBeNull();
    expect(otpTypeFor("reauthentication")).toBeNull();
    expect(otpTypeFor("SIGNUP")).toBeNull();
  });
});
