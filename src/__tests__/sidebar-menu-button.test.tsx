import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import pt from "@/messages/pt-BR.json";

// The phone ☰ button (3e): a label for screen readers that follows its state.

vi.mock("next/navigation", () => ({
  usePathname: () => "/pt-BR/dashboard",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  useParams: () => ({ locale: "pt-BR" }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ auth: { signOut: vi.fn() } }) }));

import { DashboardSidebar } from "@/components/DashboardSidebar";

describe("the phone menu button", () => {
  it("is labelled Abrir menu / Fechar menu and says whether the drawer is open", () => {
    render(
      <NextIntlClientProvider locale="pt-BR" messages={pt}>
        <DashboardSidebar locale="pt-BR" firstName="Ana" email="ana@x.invalid" isSecretary={false} />
      </NextIntlClientProvider>,
    );
    const button = screen.getByRole("button", { name: "Abrir menu" });
    expect(button).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(button);
    expect(screen.getByRole("button", { name: "Fechar menu" })).toHaveAttribute("aria-expanded", "true");
  });
});
