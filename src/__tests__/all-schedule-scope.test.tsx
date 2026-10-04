import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import pt from "@/messages/pt-BR.json";

// 166 "All" schedule (behind the flag): a row's action acts for THAT row's
// doctor, for that call only (c6 B3), re-checked against her practices; the
// switcher offers "Todos" on the Agenda only.

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";
const h = vi.hoisted(() => ({ cookie: undefined as string | undefined, pathname: "/pt-BR/dashboard/schedule", headers: [] as unknown[], actFor: vi.fn() }));
vi.mock("@/lib/liveFeatures", async (orig) => {
  const real = await orig<typeof import("@/lib/liveFeatures")>();
  return { ...real, liveFeatures: { ...real.liveFeatures, multiPractice: true } };
});
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => (h.cookie ? { value: h.cookie } : undefined), getAll: () => [], set: () => {} }) }));
vi.mock("next/navigation", async (orig) => ({ ...(await orig<typeof import("next/navigation")>()), usePathname: () => h.pathname }));
vi.mock("@supabase/ssr", () => ({
  createServerClient: (_u: string, _k: string, opts: { global?: { headers?: Record<string, string> } }) => {
    h.headers.push(opts.global?.headers ?? {});
    return { rpc: async () => ({ data: [{ professional_id: A }, { professional_id: B }], error: null }) };
  },
}));
vi.mock("@/app/[locale]/(site)/dashboard/(gated)/schedule/row-actions", () => ({ actForRow: h.actFor }));

import { inRowPractice } from "@/lib/rowPractice";
import { actingPracticeFor } from "@/lib/effectiveProfId";
import { createClient } from "@/lib/supabase/server";
import { RowPractice, useRowAction } from "@/components/RowPractice";
import { PracticeSwitcher } from "@/components/PracticeSwitcher";

beforeEach(() => {
  h.cookie = undefined;
  h.headers = [];
  h.actFor.mockReset().mockResolvedValue("via-row");
  h.pathname = "/pt-BR/dashboard/schedule";
});

describe("a row's practice, for one call", () => {
  it("inside inRowPractice: the header and the acting practice are the row's", async () => {
    h.cookie = A;
    await inRowPractice(B, async () => {
      await createClient();
      expect(h.headers.at(-1)).toEqual({ "x-acting-practice": B });
      expect(await actingPracticeFor(A, "sec-1")).toBe(B);
    });
    // Outside, the switcher's choice again.
    await createClient();
    expect(h.headers.at(-1)).toEqual({ "x-acting-practice": A });
  });

  it("a doctor she doesn't serve acts for no practice (fail closed); a malformed id is ignored", async () => {
    await inRowPractice(C, async () => { expect(await actingPracticeFor(A, "sec-1")).toBeNull(); });
    await inRowPractice("nope", async () => { expect(await actingPracticeFor(A, "sec-1")).toBe(A); });
  });

  it('"all" is never a header; elsewhere she acts for her primary', async () => {
    h.cookie = "all";
    await createClient();
    expect(h.headers.at(-1)).toEqual({});
    expect(await actingPracticeFor(A, "sec-1")).toBe(A);
  });
});

function Probe({ onCall }: { onCall: (r: unknown) => void }) {
  const run = useRowAction("deleteAppointment", (async (id: string) => `direct:${id}`) as never);
  return <button onClick={async () => onCall(await (run as unknown as (id: string) => Promise<unknown>)("x1"))}>go</button>;
}

describe("row components", () => {
  it("inside a row: the dispatcher with the row's doctor; outside: the action itself", async () => {
    const got: unknown[] = [];
    render(<><RowPractice id={B}><Probe onCall={(r) => got.push(r)} /></RowPractice><Probe onCall={(r) => got.push(r)} /></>);
    const [inRow, plain] = screen.getAllByText("go");
    fireEvent.click(inRow);
    fireEvent.click(plain);
    await vi.waitFor(() => expect(got).toHaveLength(2));
    expect(h.actFor).toHaveBeenCalledWith(B, "deleteAppointment", ["x1"]);
    expect(got).toContain("via-row");
    expect(got).toContain("direct:x1");
  });

  it('the switcher offers "Todos" on the Agenda only, selected when chosen', () => {
    const list = [{ professional_id: A, display_name: "Ana", title: "Dra.", accent_color: null, is_primary: true }, { professional_id: B, display_name: "Paulo", title: "Dr.", accent_color: null, is_primary: false }];
    const { unmount } = render(<NextIntlClientProvider locale="pt-BR" messages={pt}><PracticeSwitcher practices={list} current={A} allChosen /></NextIntlClientProvider>);
    expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe("all");
    expect(screen.getByRole("option", { name: pt.secretaryPractices.all })).toBeInTheDocument();
    unmount();
    h.pathname = "/pt-BR/dashboard/patients";
    render(<NextIntlClientProvider locale="pt-BR" messages={pt}><PracticeSwitcher practices={list} current={A} allChosen /></NextIntlClientProvider>);
    expect(screen.queryByRole("option", { name: pt.secretaryPractices.all })).toBeNull();
    expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe(A);
  });
});
