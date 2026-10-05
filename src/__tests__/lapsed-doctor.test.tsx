import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import pt from "@/messages/pt-BR.json";
import en from "@/messages/en.json";
import th from "@/messages/th.json";

// A secretary serving 2+ doctors when one's subscription lapsed (d1/cf; the
// app's slice 2; migration 182's get_my_practices.subscription_active):
// the inactive screen names that doctor and lists her others; on load an
// active doctor opens instead (unless she picked the lapsed one herself);
// the switcher marks lapsed doctors; "Todos" leaves them out with a note.

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";
const h = vi.hoisted(() => ({
  cookie: undefined as string | undefined,
  practices: [] as unknown[],
  clinic: { professional_name: "Ana Lima", subscription_active: false } as Record<string, unknown>,
  primary: "11111111-1111-4111-8111-111111111111",
}));
vi.mock("@/lib/liveFeatures", async (orig) => {
  const real = await orig<typeof import("@/lib/liveFeatures")>();
  return { ...real, liveFeatures: { ...real.liveFeatures, multiPractice: true } };
});
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => (h.cookie ? { value: h.cookie } : undefined), getAll: () => [] }) }));
vi.mock("next/navigation", async (orig) => ({
  ...(await orig<typeof import("next/navigation")>()),
  redirect: (to: string) => { throw new Error(`redirect:${to}`); },
  usePathname: () => "/pt-BR/dashboard",
  useParams: () => ({ locale: "pt-BR" }),
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}));
vi.mock("next-intl/server", async () => {
  const { createTranslator } = await import("next-intl");
  const msgs = (await import("@/messages/pt-BR.json")).default;
  return { getTranslations: async (o: string | { namespace: string }) => createTranslator({ locale: "pt-BR", messages: msgs, namespace: (typeof o === "string" ? o : o.namespace) as never }) };
});
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "sec-1" } } }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { role: "secretary", invited_by_professional_id: h.primary } }) }) }) }),
    rpc: async (name: string) => name === "get_my_clinic" ? { data: [h.clinic], error: null } : { data: h.practices, error: null },
  }),
}));

import ClinicInactivePage from "@/app/[locale]/(site)/auth/clinic-inactive/page";
import { OpenActivePractice, PracticeSwitcher, SwitchDoctorList, practiceLabel } from "@/components/PracticeSwitcher";
import { PICKED_KEY, allFallbackCookieScript, allFallbackId, browserActingCookie, todosPractices, type MyPractice } from "@/lib/actingPractice";
import { actingPracticeFor } from "@/lib/effectiveProfId";
import { AllSchedule } from "@/app/[locale]/(site)/dashboard/(gated)/schedule/AllSchedule";

const doc = (id: string, name: string, active: boolean | null | undefined, primary = false): MyPractice =>
  ({ professional_id: id, display_name: name, title: "Dra.", accent_color: null, is_primary: primary, subscription_active: active });
const intl = (ui: React.ReactNode) => <NextIntlClientProvider locale="pt-BR" messages={pt}>{ui}</NextIntlClientProvider>;
const page = async () => renderToStaticMarkup(intl(await ClinicInactivePage({ params: Promise.resolve({ locale: "pt-BR" }) })));

let assign: ReturnType<typeof vi.fn>;
let replace: ReturnType<typeof vi.fn>;
beforeEach(() => {
  h.cookie = undefined;
  h.primary = A;
  h.clinic = { professional_name: "Ana Lima", subscription_active: false };
  sessionStorage.clear();
  document.cookie = "sm_practice=; path=/; max-age=0";
  assign = vi.fn();
  replace = vi.fn();
  Object.defineProperty(window, "location", { configurable: true, value: { ...window.location, assign, replace, reload: vi.fn() } });
});

describe("the inactive screen, 2+ doctors", () => {
  it("names the lapsed doctor, lists her others with their state, and Sair", async () => {
    h.practices = [doc(A, "Ana Lima", false, true), doc(B, "Bia Reis", true), doc(C, "Caio Melo", false)];
    const html = await page();
    expect(html).toContain("A assinatura de Dra. Ana Lima está inativa. Para voltar a atender, Dra. Ana Lima precisa renovar.");
    expect(html).toContain("Trocar de médico");
    expect(html).toContain("Dra. Bia Reis");
    expect(html).toContain("Dra. Caio Melo · assinatura inativa");
    expect(html).not.toContain(">Dra. Ana Lima<");
    expect(html).toContain(pt.secretary.signOut);
  });

  it("one doctor: unchanged (today's text, no list)", async () => {
    h.practices = [doc(A, "Ana Lima", false, true)];
    const html = await page();
    expect(html).toContain(pt.secretary.clinicInactiveBody.replace("{name}", "Ana Lima"));
    expect(html).not.toContain("Trocar de médico");
  });

  it("renewed since: back to the dashboard", async () => {
    h.clinic = { professional_name: "Ana Lima", subscription_active: true };
    await expect(page()).rejects.toThrow("redirect:/pt-BR/dashboard");
  });
});

describe("on load: an active doctor opens instead", () => {
  it("sets the cookie to the active doctor and opens the dashboard, once per tab", () => {
    const { unmount } = render(<OpenActivePractice lapsed={A} target={B} href="/pt-BR/dashboard" />);
    expect(document.cookie).toContain(`sm_practice=${B}`);
    expect(replace).toHaveBeenCalledWith("/pt-BR/dashboard");
    unmount();
    replace.mockReset();
    render(<OpenActivePractice lapsed={A} target={B} href="/pt-BR/dashboard" />);
    expect(replace).not.toHaveBeenCalled();
  });

  it("not when she picked the lapsed doctor herself", () => {
    sessionStorage.setItem(PICKED_KEY, A);
    render(<OpenActivePractice lapsed={A} target={B} href="/pt-BR/dashboard" />);
    expect(replace).not.toHaveBeenCalled();
  });

  it("the screen opens her first active doctor; with every doctor lapsed it stays", async () => {
    const mount = async () => render(intl(await ClinicInactivePage({ params: Promise.resolve({ locale: "pt-BR" }) })));
    h.practices = [doc(A, "Ana Lima", false, true), doc(B, "Bia Reis", false)];
    (await mount()).unmount();
    expect(replace).not.toHaveBeenCalled();
    h.practices = [doc(A, "Ana Lima", false, true), doc(B, "Bia Reis", false), doc(C, "Caio Melo", true)];
    await mount();
    expect(document.cookie).toContain(`sm_practice=${C}`);
    expect(replace).toHaveBeenCalledWith("/pt-BR/dashboard");
  });
});

describe("Trocar de médico", () => {
  it("a pick sets the cookie, counts as hers, and opens the dashboard", () => {
    render(intl(<SwitchDoctorList practices={[doc(A, "Ana Lima", false, true), doc(B, "Bia Reis", true)]} current={A} href="/pt-BR/dashboard" />));
    fireEvent.click(screen.getByRole("button", { name: "Dra. Bia Reis" }));
    expect(document.cookie).toContain(`sm_practice=${B}`);
    expect(sessionStorage.getItem(PICKED_KEY)).toBe(B);
    expect(assign).toHaveBeenCalledWith("/pt-BR/dashboard");
  });
});

describe("the switcher and Todos", () => {
  it("a lapsed doctor carries the suffix; a choice counts as hers", () => {
    render(intl(<PracticeSwitcher practices={[doc(A, "Ana Lima", true, true), doc(B, "Bia Reis", false)]} current={A} />));
    expect(screen.getByRole("option", { name: "Dra. Bia Reis · assinatura inativa" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Dra. Ana Lima" })).toBeTruthy();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: B } });
    expect(sessionStorage.getItem(PICKED_KEY)).toBe(B);
  });

  it("Todos leaves lapsed doctors out and counts them; before 182 (no column) nothing is hidden", () => {
    const r = todosPractices([doc(A, "Ana", true), doc(B, "Bia", false), doc(C, "Caio", null)]);
    expect([r.shown.map((p) => p.professional_id), r.lapsedCount]).toEqual([[A, C], 1]);
    expect(todosPractices([doc(A, "Ana", undefined), doc(B, "Bia", undefined)]).lapsedCount).toBe(0);
  });

  it("every doctor lapsed: Todos shows the note and an empty list, no zones hint, no grid, no New appointment (c6)", async () => {
    const el = await AllSchedule({
      practices: [doc(A, "Ana", false, true), doc(B, "Bia", false)], userId: "sec-1", today: "2026-10-05",
      date: null, doctor: null, view: "week", locale: "pt-BR",
    });
    render(intl(el));
    expect(screen.getByTestId("lapsed-hint").textContent).toBe("2 médico(s) com assinatura inativa não aparecem.");
    expect(screen.queryByTestId("zones-hint")).toBeNull();
    expect(screen.getByText(pt.secretaryPractices.allEmpty)).toBeTruthy();
    expect(screen.queryByTestId("all-add")).toBeNull();
  });

  it("Todos with a lapsed primary (53's ❌): outside the Agenda she acts for her first active doctor, server and browser alike", async () => {
    const list = [doc(A, "Ana", false, true), doc(B, "Bia", false), doc(C, "Caio", true)];
    expect(allFallbackId(list)).toBe(C);
    expect(allFallbackId([doc(A, "Ana", true, true), doc(B, "Bia", true)])).toBeNull(); // primary active: primary
    expect(allFallbackId([doc(A, "Ana", false, true), doc(B, "Bia", false)])).toBeNull(); // nobody active
    expect(allFallbackId([doc(A, "Ana", undefined, true), doc(B, "Bia", true)])).toBeNull(); // before 182
    // The server's acting doctor (the same choice as its header).
    h.cookie = "all";
    h.practices = list;
    expect(await actingPracticeFor(A, "sec-all")).toBe(C);
    // The browser client's: the cookie the dashboard writes before any script.
    new Function(allFallbackCookieScript(C))();
    document.cookie = "sm_practice=all; path=/";
    expect(browserActingCookie()).toBe(C);
    new Function(allFallbackCookieScript(null))();
    expect(browserActingCookie()).toBeNull();
    expect(allFallbackCookieScript('x";alert(1)//')).not.toContain("alert");
    document.cookie = "sm_practice=; path=/; max-age=0";
  });

  it("cf's words in en / pt-BR / th", () => {
    expect([en, pt, th].map((m) => [m.secretaryPractices.inactiveSuffix, m.secretaryPractices.allLapsedNote, m.secretaryPractices.switchDoctor])).toEqual([
      [" · subscription inactive", "{n} doctor(s) with an inactive subscription aren't shown.", "Switch doctor"],
      [" · assinatura inativa", "{n} médico(s) com assinatura inativa não aparecem.", "Trocar de médico"],
      [" · หมดอายุ", "ไม่แสดงแพทย์ {n} ท่านที่การสมัครใช้งานหมดอายุ", "เปลี่ยนแพทย์"],
    ]);
    expect(practiceLabel(doc(A, "Ana", false), en.secretaryPractices.inactiveSuffix)).toBe("Dra. Ana · subscription inactive");
  });
});
