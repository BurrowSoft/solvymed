import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

// Payments' Particular / Convênio filter (Help G6, like the app's report
// filter): anything not private counts as insurance.

const nav = vi.hoisted(() => ({ push: vi.fn(), search: "period=month" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push }),
  usePathname: () => "/pt-BR/dashboard/payments",
  useSearchParams: () => new URLSearchParams(nav.search),
  redirect: () => { throw new Error("REDIRECT"); },
}));
vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }));

const h = vi.hoisted(() => ({ ors: [] as string[] }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "doc-1" } } }) },
    from: () => {
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "in", "gte", "lte", "order", "neq"]) q[m] = () => q;
      q.or = (f: string) => { h.ors.push(f); return q; };
      q.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null, count: 1 }).then(res);
      return q;
    },
  }),
}));
vi.mock("@/lib/effectiveProfId", () => ({ getEffectiveProfId: async () => "doc-1" }));
vi.mock("@/lib/practiceCountry", () => ({ getPracticeCountry: async () => "BR" }));
vi.mock("@/lib/clinicTime", async (orig) => ({ ...(await orig<typeof import("@/lib/clinicTime")>()), getClinicTimeZone: async () => "America/Sao_Paulo" }));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (k: string) => k }));

import { TypeFilter } from "@/app/[locale]/(site)/dashboard/(gated)/payments/PaymentsClient";
import PaymentsPage from "@/app/[locale]/(site)/dashboard/(gated)/payments/page";

beforeEach(() => { nav.push.mockClear(); nav.search = "period=month"; h.ors = []; });

describe("TypeFilter", () => {
  it("sets ?type= and keeps the period; Todos removes it", () => {
    render(<TypeFilter current="all" />);
    fireEvent.click(screen.getByText("typeInsurance"));
    expect(nav.push).toHaveBeenCalledWith("/pt-BR/dashboard/payments?period=month&type=insurance");
    nav.search = "period=month&type=private";
    fireEvent.click(screen.getByText("typeAll"));
    expect(nav.push).toHaveBeenLastCalledWith("/pt-BR/dashboard/payments?period=month");
  });
});

describe("the payments query", () => {
  const run = (type?: string) => PaymentsPage({ params: Promise.resolve({ locale: "pt-BR" }), searchParams: Promise.resolve({ period: "month", ...(type ? { type } : {}) }) });

  it("private → only private; insurance → everything not private (null too); none/unknown → no filter", async () => {
    await run("private");
    expect(h.ors).toEqual(["payment_type.eq.private", "payment_type.eq.private"]);
    h.ors = [];
    await run("insurance");
    expect(h.ors).toEqual(["payment_type.is.null,payment_type.neq.private", "payment_type.is.null,payment_type.neq.private"]);
    h.ors = [];
    await run();
    await run("drop table");
    expect(h.ors).toEqual([]);
  });
});
