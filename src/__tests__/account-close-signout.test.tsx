import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { NextRequest, NextResponse } from "next/server";
import pt from "@/messages/pt-BR.json";
import { clearAuthCookies } from "@/lib/authCookies";

// After closing or deleting the account the browser is signed out (Vitor,
// 1 Oct: it went back to the dashboard): the close response expires the
// Supabase auth cookies, the panel drops the local session without calling
// Auth, and the home page says the account was closed.

const h = vi.hoisted(() => ({ signOut: vi.fn<(o?: { scope: string }) => Promise<{ error: null }>>(async () => ({ error: null })) }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ auth: { signOut: h.signOut } }) }));

import { CloseAccountPanel } from "@/app/[locale]/(site)/dashboard/settings/CloseAccountPanel";

afterEach(() => { vi.unstubAllGlobals(); h.signOut.mockClear(); });

describe("closing the account signs out", () => {
  it("the response expires every sb- cookie and nothing else", () => {
    const req = new NextRequest("https://www.solvymed.com/api/account/close", {
      method: "POST",
      headers: { cookie: "sb-abc-auth-token.0=x; sb-abc-auth-token.1=y; sb-abc-auth-token-code-verifier=z; NEXT_LOCALE=pt-BR" },
    });
    const res = NextResponse.json({ outcome: "closed" });
    clearAuthCookies(req, res);
    const set = res.headers.getSetCookie();
    expect(set).toHaveLength(3);
    for (const name of ["sb-abc-auth-token.0", "sb-abc-auth-token.1", "sb-abc-auth-token-code-verifier"]) {
      expect(set.find((c) => c.startsWith(`${name}=;`))).toMatch(/Max-Age=0/);
    }
    expect(set.some((c) => c.startsWith("NEXT_LOCALE"))).toBe(false);
  });

  it("the panel signs out locally and lands on the home page with the note for what happened", async () => {
    for (const [outcome, href] of [["deleted", "/pt-BR?deleted=1"], ["closed", "/pt-BR?closed=1"]] as const) {
      vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ outcome }), { status: 200 })));
      const loc = { href: "" };
      vi.stubGlobal("location", loc);
      const { unmount } = render(
        <NextIntlClientProvider locale="pt-BR" messages={pt}>
          <CloseAccountPanel locale="pt-BR" preview={{ role: "secretary", has_clinical_history: false, subscription_active: false, patients: 0, upcoming_appointments: 0, secretaries: 0 }} />
        </NextIntlClientProvider>,
      );
      fireEvent.click(screen.getByRole("checkbox"));
      fireEvent.click(screen.getByRole("button"));
      await waitFor(() => expect(loc.href).toBe(href));
      expect(h.signOut).toHaveBeenCalledWith({ scope: "local" });
      unmount();
    }
  });

  it("a failed close keeps the session and shows the error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ code: "generic" }), { status: 500 })));
    render(
      <NextIntlClientProvider locale="pt-BR" messages={pt}>
        <CloseAccountPanel locale="pt-BR" preview={{ role: "secretary", has_clinical_history: false, subscription_active: false, patients: 0, upcoming_appointments: 0, secretaries: 0 }} />
      </NextIntlClientProvider>,
    );
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button"));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(h.signOut).not.toHaveBeenCalled();
  });
});
