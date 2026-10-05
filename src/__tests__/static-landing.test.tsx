import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import pt from "@/messages/pt-BR.json";

// The landing and /founders are static per locale (cf; f0's cold 4.9 s):
// the signed-in redirect moved to the middleware (lib/landingRoute, the
// page's old rules), the closed/deleted note reads the query in the browser,
// and the Founders form's English country comes from /api/geo after load.

import { isLandingPath, landingDestination } from "@/lib/landingRoute";
import { AccountClosedNotice } from "@/components/AccountClosedNotice";
import { FoundersForm } from "@/app/[locale]/(site)/founders/FoundersForm";
import { routing } from "@/i18n/routing";

afterEach(() => { vi.unstubAllGlobals(); window.history.replaceState(null, "", "/"); });

describe("the signed-in landing redirect (the page's old rules)", () => {
  it("patients, a pending patient, an unresolved invite, everyone else", () => {
    expect(landingDestination({ role: "patient", linked_patient_id: "p1" }, undefined, "/pt-BR")).toBe("/pt-BR/my-appointments");
    expect(landingDestination({ role: "patient", invited_by_professional_id: "d1" }, undefined, "/pt-BR")).toBe("/pt-BR/auth/pending-confirmation");
    expect(landingDestination({ role: "patient" }, undefined, "")).toBe("/my-appointments");
    expect(landingDestination(null, "patient", "/th")).toBe("/th/auth/invite-required");
    expect(landingDestination({ role: "professional" }, "patient", "")).toBe("/dashboard");
    expect(landingDestination({ role: "secretary", invited_by_professional_id: "d1" }, undefined, "/pt-BR")).toBe("/pt-BR/dashboard");
    expect(landingDestination(null, undefined, "")).toBe("/dashboard");
  });

  it("only the landing paths", () => {
    for (const p of ["/", "/pt-BR", "/th/", "/en"]) expect(isLandingPath(p, routing.locales)).toBe(true);
    for (const p of ["/pricing", "/pt-BR/founders", "/dashboard", "/xx", "/pt-BR/auth/login"]) expect(isLandingPath(p, routing.locales)).toBe(false);
  });
});

describe("the closed/deleted note, read in the browser", () => {
  const show = () => render(<AccountClosedNotice closed="Conta encerrada." deleted="Conta excluída." />);
  it("closed, deleted, or nothing", async () => {
    window.history.replaceState(null, "", "/?closed=1");
    let r = show();
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Conta encerrada."));
    r.unmount();
    window.history.replaceState(null, "", "/?deleted=1");
    r = show();
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Conta excluída."));
    r.unmount();
    window.history.replaceState(null, "", "/");
    show();
    expect(screen.queryByRole("status")).toBeNull();
  });
});

describe("the Founders form's country in English (from /api/geo)", () => {
  const form = (defaultCountry: "" | "BR" | "TH") =>
    render(<NextIntlClientProvider locale="pt-BR" messages={pt}><FoundersForm locale="en" defaultCountry={defaultCountry} showRulesLink={false} /></NextIntlClientProvider>);
  const select = () => screen.getAllByRole("combobox")[0] as HTMLSelectElement;

  it("a Founders country is preselected; any other stays Choose…", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ country: "TH" }) })));
    let r = form("");
    await waitFor(() => expect(select().value).toBe("TH"));
    r.unmount();
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ country: "US" }) })));
    r = form("");
    await new Promise((res) => setTimeout(res, 20));
    expect(select().value).toBe("");
  });

  it("the language's country (pt-BR/th pages) needs no lookup", () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    form("BR");
    expect(select().value).toBe("BR");
    expect(f).not.toHaveBeenCalled();
  });
});
