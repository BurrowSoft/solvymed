import { describe, it, expect } from "vitest";
import { deletionRequestError, deletionRequestRow } from "@/lib/deletionRequest";

describe("deletionRequestError", () => {
  it("maps migration 100's intake errors to stable codes", () => {
    expect(deletionRequestError('new row violates check: too_many_attempts')).toBe("too_many_attempts");
    expect(deletionRequestError("invalid_email")).toBe("invalid_email");
    expect(deletionRequestError("something else")).toBe("generic");
    expect(deletionRequestError(null)).toBe("generic");
  });
});

describe("deletionRequestRow", () => {
  it("normalizes the email and drops an empty reason", () => {
    const row = deletionRequestRow("  Ana@Example.COM ", "   ");
    expect(row.email).toBe("ana@example.com");
    expect(row.reason).toBeNull();
    expect(row.status).toBe("pending");
  });
});
