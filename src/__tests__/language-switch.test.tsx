import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import pt from "@/messages/pt-BR.json";

// The dashboard's language switcher (d7): switching to English from
// /pt-BR/... must stick. English has no prefix, so the choice is written to
// NEXT_LOCALE before navigating; otherwise the middleware sent the
// unprefixed URL back to /pt-BR.

const nav = vi.hoisted(() => ({ push: vi.fn(), path: "/pt-BR/dashboard/settings" }));
vi.mock("next/navigation", () => ({
  usePathname: () => nav.path,
  useRouter: () => ({ push: nav.push, refresh: vi.fn(), replace: vi.fn() }),
  useParams: () => ({ locale: "pt-BR" }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ auth: { signOut: vi.fn() } }) }));

import { DashboardSidebar } from "@/components/DashboardSidebar";

afterEach(() => { document.cookie = "NEXT_LOCALE=; path=/; max-age=0"; nav.push.mockClear(); });

describe("dashboard language switcher", () => {
  it("English from /pt-BR: NEXT_LOCALE=en first, then the unprefixed page", () => {
    render(
      <NextIntlClientProvider locale="pt-BR" messages={pt}>
        <DashboardSidebar locale="pt-BR" firstName="Ana" email="ana@x.invalid" isSecretary={false} />
      </NextIntlClientProvider>,
    );
    fireEvent.click(screen.getAllByText("Português (BR)")[0]);
    fireEvent.click(screen.getByText("English"));
    expect(document.cookie).toContain("NEXT_LOCALE=en");
    expect(nav.push).toHaveBeenCalledWith("/dashboard/settings");
  });
});
