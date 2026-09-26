import { describe, it, expect, vi } from "vitest";

// /auth/confirm must never verify a one-time token on load (mail scanners
// open links first): with ?token_hash it renders the click-to-verify page
// and doesn't even create a Supabase client.
const createClient = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ createClient: (...a: unknown[]) => createClient(...a) }));
// The client components themselves aren't under test (and pull in
// next-intl navigation); stand-ins let the test check what's rendered.
vi.mock("@/app/[locale]/auth/verify/VerifyClient", () => ({ VerifyClient: function VerifyClient() { return null; } }));
vi.mock("@/app/[locale]/auth/confirm/ConfirmClient", () => ({ default: function ConfirmClient() { return null; } }));

const { default: AuthConfirmPage } = await import("@/app/[locale]/auth/confirm/page");
const { VerifyClient } = await import("@/app/[locale]/auth/verify/VerifyClient");

describe("/auth/confirm with a one-time token", () => {
  it("renders the click-to-verify page with the app handoff, without verifying", async () => {
    const el = (await AuthConfirmPage({
      params: Promise.resolve({ locale: "pt-BR" }),
      searchParams: Promise.resolve({ token_hash: "abc", type: "recovery" }),
    })) as { type: unknown; props: Record<string, unknown> };
    expect(el.type).toBe(VerifyClient);
    expect(el.props).toMatchObject({ locale: "pt-BR", tokenHash: "abc", type: "recovery", appHandoff: true });
    expect(createClient).not.toHaveBeenCalled();
  });
});
