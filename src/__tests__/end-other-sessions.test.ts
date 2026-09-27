import { describe, it, expect, vi } from "vitest";
import { endOtherSessions } from "@/lib/endOtherSessions";

describe("endOtherSessions", () => {
  it("signs out every other session, keeping this one", async () => {
    const signOut = vi.fn(async () => ({ error: null }));
    await endOtherSessions({ auth: { signOut } } as never);
    expect(signOut).toHaveBeenCalledWith({ scope: "others" });
  });

  it("never throws: the new password is already saved", async () => {
    const signOut = vi.fn(async () => { throw new Error("network"); });
    await expect(endOtherSessions({ auth: { signOut } } as never)).resolves.toBeUndefined();
  });
});
