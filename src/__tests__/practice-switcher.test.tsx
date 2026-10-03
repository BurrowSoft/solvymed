import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import pt from "@/messages/pt-BR.json";

// 1.5.0 secretaries serving several doctors (migration 163; behind the
// flag): the x-acting-practice header only for a well-formed id; the
// acting practice = the switcher's choice when she still serves that
// doctor, else her primary; the switcher offers only her doctors.

const h = vi.hoisted(() => ({ cookie: undefined as string | undefined, practices: null as unknown, rpc: vi.fn() }));
vi.mock("@/lib/liveFeatures", async (orig) => {
  const real = await orig<typeof import("@/lib/liveFeatures")>();
  return { ...real, liveFeatures: { ...real.liveFeatures, multiPractice: true } };
});
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => (h.cookie ? { value: h.cookie } : undefined), getAll: () => [] }) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: h.rpc }) }));

import { actingHeaders } from "@/lib/actingPractice";
import { actingPracticeFor } from "@/lib/effectiveProfId";
import { PracticeSwitcher } from "@/components/PracticeSwitcher";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";
const LIST = [
  { professional_id: A, display_name: "Dra. Ana", accent_color: "#7c3aed", is_primary: true },
  { professional_id: B, display_name: "Dr. Paulo", accent_color: null, is_primary: false },
];

beforeEach(() => {
  h.cookie = undefined;
  h.rpc.mockReset().mockResolvedValue({ data: LIST, error: null });
});

describe("the acting-practice header", () => {
  it("only for a well-formed id", () => {
    expect(actingHeaders(B)).toEqual({ "x-acting-practice": B });
    expect(actingHeaders("not-a-uuid")).toEqual({});
    expect(actingHeaders(null)).toEqual({});
  });
});

describe("actingPracticeFor", () => {
  it("no choice: her primary, without asking for the list", async () => {
    expect(await actingPracticeFor(A, "sec-1")).toBe(A);
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("a doctor she serves: that doctor", async () => {
    h.cookie = B;
    expect(await actingPracticeFor(A, "sec-2")).toBe(B);
    expect(h.rpc).toHaveBeenCalledWith("get_my_practices");
  });

  it("a doctor she no longer serves: her primary", async () => {
    h.cookie = C;
    expect(await actingPracticeFor(A, "sec-3")).toBe(A);
  });
});

describe("the switcher", () => {
  it("offers only her doctors and labels the choice", () => {
    render(<NextIntlClientProvider locale="pt-BR" messages={pt}><PracticeSwitcher practices={LIST} current={B} /></NextIntlClientProvider>);
    const sw = screen.getByTestId("practice-switcher");
    expect(sw).toHaveTextContent(pt.secretaryPractices.switcherLabel);
    const select = sw.querySelector("select") as HTMLSelectElement;
    expect(select.value).toBe(B);
    expect(Array.from(select.options).map((o) => o.value)).toEqual([A, B]);
  });

  it("a choice sets the cookie and reloads", () => {
    const reload = vi.fn();
    Object.defineProperty(window, "location", { value: { ...window.location, reload }, writable: true });
    render(<NextIntlClientProvider locale="pt-BR" messages={pt}><PracticeSwitcher practices={LIST} current={A} /></NextIntlClientProvider>);
    fireEvent.change(screen.getByTestId("practice-switcher").querySelector("select")!, { target: { value: B } });
    expect(document.cookie).toContain(`sm_practice=${B}`);
    expect(reload).toHaveBeenCalled();
  });
});
