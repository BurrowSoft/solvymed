import { describe, it, expect } from "vitest";
import { authErrorKey } from "@/lib/authErrors";

describe("authErrorKey", () => {
  it("maps Supabase error codes, never the raw message", () => {
    expect(authErrorKey({ code: "invalid_credentials", message: "Invalid login credentials" })).toBe("wrongCredentials");
    expect(authErrorKey({ code: "email_not_confirmed" })).toBe("emailNotConfirmed");
    expect(authErrorKey({ code: "over_request_rate_limit" })).toBe("rateLimited");
    expect(authErrorKey({ code: "over_email_send_rate_limit" })).toBe("rateLimited");
    expect(authErrorKey({ status: 429 })).toBe("rateLimited");
    expect(authErrorKey({ code: "weak_password" })).toBe("weakPassword");
    expect(authErrorKey({ code: "same_password" })).toBe("samePassword");
    expect(authErrorKey({ code: "user_banned" })).toBe("accountClosed");
    expect(authErrorKey({ code: "otp_expired" })).toBe("linkExpired");
    expect(authErrorKey({ code: "flow_state_expired" })).toBe("linkExpired");
    expect(authErrorKey({ code: "refresh_token_not_found" })).toBe("linkExpired");
    expect(authErrorKey({ code: "captcha_failed" })).toBe("captchaFailed");
    expect(authErrorKey({ name: "AuthRetryableFetchError", status: 0 })).toBe("network");
    expect(authErrorKey({ code: "unexpected_failure", message: "db down" })).toBe("generic");
    expect(authErrorKey(null)).toBeNull();
  });
});
