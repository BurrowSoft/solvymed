import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import pt from "@/messages/pt-BR.json";

// The doctor's brand on the pages patients see (1.5.0, behind the flag):
// the public invite link (signup ?join=, by the PUBLIC code from the
// browser) and the booking page. Anything but a saved brand, including the
// per-IP budget's too_many_attempts, is "no brand": the page as before,
// never an error. Never a legacy image.

const h = vi.hoisted(() => ({ rpc: vi.fn(), params: new URLSearchParams() }));
vi.mock("@/lib/liveFeatures", async (orig) => {
  const real = await orig<typeof import("@/lib/liveFeatures")>();
  return { ...real, liveFeatures: { ...real.liveFeatures, myBrand: true } };
});
vi.mock("next/navigation", async (orig) => ({
  ...(await orig<typeof import("next/navigation")>()),
  useParams: () => ({ locale: "pt-BR" }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => h.params,
}));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    rpc: h.rpc,
    storage: { from: () => ({ getPublicUrl: (p: string) => ({ data: { publicUrl: `https://cdn/brand-assets/${p}` } }) }) },
  }),
}));

import SignupPage from "@/app/[locale]/(site)/auth/signup/page";
import { publicFromPractice, type Brand } from "@/lib/brand";

const ROW = { display_name: "Ana Souza", title: "Dra.", specialty: "Dermatologia", accent_color: "#7c3aed", logo_square_path: "d1/logo.png", photo_path: null };

const join = (code = "PUB123") => {
  h.params = new URLSearchParams(`join=${code}`);
  return render(<NextIntlClientProvider locale="pt-BR" messages={pt}><SignupPage /></NextIntlClientProvider>);
};

beforeEach(() => h.rpc.mockReset());

describe("the public invite link's brand (signup ?join=)", () => {
  it("a saved brand: the header with the name, specialty and logo; looked up by the public code", async () => {
    h.rpc.mockResolvedValue({ data: [ROW], error: null });
    join();
    const header = await screen.findByTestId("brand-header");
    expect(header).toHaveTextContent("Dra. Ana Souza");
    expect(header).toHaveTextContent("Dermatologia");
    expect(header.querySelector("img")).toHaveAttribute("src", "https://cdn/brand-assets/d1/logo.png");
    expect(h.rpc).toHaveBeenCalledWith("get_public_brand_by_code", { p_code: "PUB123" });
    expect(screen.getByText(pt.auth.signup.joiningAs.replace("{role}", pt.auth.signup.rolePatient))).toBeInTheDocument();
  });

  it.each([
    ["no saved brand (0 rows)", { data: [], error: null }],
    ["the per-IP budget (too_many_attempts)", { data: null, error: { message: "too_many_attempts" } }],
    ["any error", { data: null, error: { message: "boom" } }],
  ])("%s: no header, the page as before, no error", async (_label, result) => {
    h.rpc.mockResolvedValue(result);
    join();
    await waitFor(() => expect(h.rpc).toHaveBeenCalled());
    expect(screen.queryByTestId("brand-header")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("no join code (a normal signup): no lookup at all", () => {
    h.params = new URLSearchParams("c=BR");
    render(<NextIntlClientProvider locale="pt-BR" messages={pt}><SignupPage /></NextIntlClientProvider>);
    expect(h.rpc).not.toHaveBeenCalled();
  });
});

describe("a practice brand for patients", () => {
  const brand = (own: Brand["own"]): Brand => ({
    displayName: "", title: "Dr.", specialty: "", registrationLine: "", accentColor: null,
    logoSquareUrl: "https://x/logo.png", logoWideUrl: null, photoUrl: "https://x/legacy-photo.png", own, saved: false,
  });

  it("own images only: a legacy photo or logo is never shown", () => {
    expect(publicFromPractice(brand({ logo_square: false, logo_wide: false, photo: false }), { name: "Carlos Lima", specialty: "Cardio" }))
      .toEqual({ name: "Dr. Carlos Lima", specialty: "Cardio", accentColor: null, logoUrl: null, photoUrl: null });
    expect(publicFromPractice(brand({ logo_square: true, logo_wide: false, photo: true }), { name: "Carlos Lima", specialty: "" }))
      .toMatchObject({ logoUrl: "https://x/logo.png", photoUrl: "https://x/legacy-photo.png" });
  });

  it("no brand → null (the page as before)", () => {
    expect(publicFromPractice(null, { name: "A", specialty: "" })).toBeNull();
  });
});
