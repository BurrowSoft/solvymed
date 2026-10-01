import { afterEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { patientLanguageTarget, signupCountryCookie, SIGNUP_COUNTRY_COOKIE } from "@/lib/signupCountry";

// 3e's #286 ❌: a Thai pick at a Brazilian clinic was moved to Portuguese on
// the first /my-appointments (my_country = the clinic's BR) before the pick
// was saved. The pick is now a cookie the server reads first; SaveMyLocale
// saves it with the page's language and clears it.

const save = vi.hoisted(() => vi.fn(async () => true));
vi.mock("@/app/[locale]/(site)/dashboard/locale-actions", () => ({ saveMyLocale: save }));

import { SaveMyLocale } from "@/components/SaveMyLocale";

afterEach(() => {
  document.cookie = `${SIGNUP_COUNTRY_COOKIE}=; path=/; max-age=0`;
  try { localStorage.clear(); sessionStorage.clear(); } catch { /* none */ }
  save.mockClear();
});

describe("patientLanguageTarget", () => {
  it("TH pick (a BR clinic's patient): /th stays; BR: /th moves to pt-BR", () => {
    expect(patientLanguageTarget("th", "TH")).toBeNull();
    expect(patientLanguageTarget("th", "BR")).toBe("pt-BR");
    expect(patientLanguageTarget("pt-BR", "TH")).toBe("th");
  });

  it("English always stays; no country (or a failed lookup) changes nothing", () => {
    expect(patientLanguageTarget("en", "BR")).toBeNull();
    expect(patientLanguageTarget("en", "TH")).toBeNull();
    expect(patientLanguageTarget("th", null)).toBeNull();
    expect(patientLanguageTarget("th", "US")).toBeNull();
  });
});

describe("SaveMyLocale with the signup pick", () => {
  it("saves the page's language with the picked country, then clears the cookie", async () => {
    document.cookie = signupCountryCookie("TH");
    render(<SaveMyLocale locale="th" />);
    await waitFor(() => expect(save).toHaveBeenCalledWith("th", "TH"));
    await waitFor(() => expect(document.cookie.includes(`${SIGNUP_COUNTRY_COOKIE}=TH`)).toBe(false));
  });

  it("without a pick, the 1-arg save as before", async () => {
    render(<SaveMyLocale locale="pt-BR" />);
    await waitFor(() => expect(save).toHaveBeenCalledWith("pt-BR", null));
  });
});
