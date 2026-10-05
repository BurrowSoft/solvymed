import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "@/messages/en.json";
import pt from "@/messages/pt-BR.json";
import { readPlaces } from "@/lib/foundersPlaces";

// The Founders page's form and counter (founders-page-spec.md, stage 1).

vi.mock("@/i18n/navigation", () => ({ Link: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => <a href={href} {...p}>{children}</a> }));
vi.mock("@/lib/track", () => ({ track: vi.fn() }));

import { FoundersForm } from "@/app/[locale]/(site)/founders/FoundersForm";

const show = (locale: "en" | "pt-BR", defaultCountry: "BR" | "TH" | "" = "BR") =>
  render(
    <NextIntlClientProvider locale={locale} messages={locale === "en" ? en : pt}>
      <FoundersForm locale={locale} defaultCountry={defaultCountry} showRulesLink={false} />
    </NextIntlClientProvider>,
  );

describe("FoundersForm", () => {
  const fetchMock = vi.fn();
  beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock); });

  const fillAndSend = (system: string) => {
    fireEvent.change(screen.getByLabelText(/Full name/), { target: { value: "Ana" } });
    fireEvent.change(screen.getByLabelText(/^Email/), { target: { value: "ana@example.com" } });
    fireEvent.change(screen.getByLabelText(/WhatsApp or LINE/), { target: { value: "+55 11 99999-0000" } });
    fireEvent.change(screen.getByLabelText(/Which clinic system/), { target: { value: system } });
    fireEvent.click(screen.getByRole("checkbox", { name: /I agree/ }));
    fireEvent.click(screen.getByRole("button", { name: en.founders.submit }));
  };

  it("the system list follows the country (BR list, TH list); no \"Other\" country (e7)", () => {
    show("en", "BR");
    const options = () => Array.from((screen.getByLabelText(/Which clinic system/) as HTMLSelectElement).options).map((o) => o.value);
    expect(options()).toContain("feegow");
    expect(options()).not.toContain("proclinic");
    fireEvent.change(screen.getByLabelText(/^Country/), { target: { value: "TH" } });
    expect(options()).toContain("proclinic");
    const countries = Array.from((screen.getByLabelText(/^Country/) as HTMLSelectElement).options).map((o) => o.value);
    expect(countries).toEqual(["BR", "TH"]);
    expect(screen.getByText("For now, the Founders program is only for clinics in Brazil and Thailand.")).toBeInTheDocument();
  });

  it("English: no country preselected; sending without one asks for it", () => {
    // The geo lookup (static page) finds no Founders country.
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ country: null }) });
    show("en", "");
    const select = screen.getByLabelText(/^Country/) as HTMLSelectElement;
    expect(select.value).toBe("");
    fillAndSend("other");
    expect(fetchMock.mock.calls.filter(([url]) => url !== "/api/geo")).toEqual([]);
    expect(screen.getByRole("alert")).toHaveTextContent(en.founders.errorInvalid);
  });

  it("sends the answers (with the honeypot empty) and says it's on the waitlist when the system is full", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ status: "waitlist" }) });
    show("en");
    fillAndSend("feegow");
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("The places for Feegow are full"));
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toMatchObject({ country: "BR", system: "feegow", consent: true, website: "", locale: "en" });
  });

  it('"Other" asks which system', () => {
    show("en");
    fireEvent.change(screen.getByLabelText(/Which clinic system/), { target: { value: "other" } });
    expect(screen.getByLabelText(/Which one/)).toBeInTheDocument();
  });

  it("already applied / too many attempts / a bad field show their messages", async () => {
    show("en");
    fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({ code: "already_applied" }) });
    fillAndSend("feegow");
    expect(await screen.findByText(en.founders.errorAlreadyApplied)).toBeInTheDocument();
    fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({ code: "invalid", field: "phone" }) });
    fireEvent.click(screen.getByRole("button", { name: en.founders.submit }));
    expect(await screen.findByText(en.founders.errorInvalid)).toBeInTheDocument();
  });

  it("pt-BR shows the Brazilian texts", () => {
    show("pt-BR");
    expect(screen.getByRole("button", { name: pt.founders.submit })).toBeInTheDocument();
    expect(screen.getByText("Excel / Planilhas Google")).toBeInTheDocument();
  });
});

describe("readPlaces", () => {
  it("maps 129's counts per system: null = no counter, 0 = full; an error = unavailable", async () => {
    const db = { rpc: async () => ({ data: [{ system: "feegow", capacity: 5, places_left: 0 }, { system: "iclinic", capacity: 5, places_left: 3 }], error: null }) };
    const br = (await readPlaces(db, "BR"))!;
    expect(br.find((p) => p.system === "feegow")).toMatchObject({ name: "Feegow", placesLeft: 0, capacity: 5 });
    expect(br.find((p) => p.system === "iclinic")).toMatchObject({ placesLeft: 3 });
    expect(br.find((p) => p.system === "ninsaude")).toMatchObject({ placesLeft: null });
    expect(await readPlaces({ rpc: async () => ({ data: null, error: { message: "x" } }) }, "TH")).toBeNull();
  });
});

describe("founders texts", () => {
  it("every locale has its own translation (no en fallback), with en's placeholders and tags", async () => {
    const fs = await import("node:fs");
    const dir = "src/messages";
    const marks = (v: string) => [...(v.match(/\{\w+\}/g) ?? []), ...(v.match(/<\/?\w+>/g) ?? [])].sort().join(" ");
    const enF = en.founders as Record<string, string>;
    for (const f of fs.readdirSync(dir)) {
      if (f === "en.json") continue;
      const loc = JSON.parse(fs.readFileSync(`${dir}/${f}`, "utf8").replace(/^﻿/, "")).founders as Record<string, string>;
      expect(Object.keys(loc), f).toEqual(Object.keys(enF));
      for (const k of ["heroTitle", "rule5", "privacyNotice", "rulesTranslationNote"]) expect(loc[k], `${f} ${k}`).not.toBe(enF[k]);
      for (const k of Object.keys(enF)) expect(marks(loc[k]), `${f} ${k}`).toBe(marks(enF[k]));
    }
  });
});

describe("privacy policy", () => {
  it("the Founders section only while the page is live", async () => {
    const { PrivacyEn } = await import("@/app/[locale]/(site)/privacy/PrivacyEn");
    const wrap = (founders: boolean) => <NextIntlClientProvider locale="en" messages={en}><PrivacyEn turnstile={false} founders={founders} /></NextIntlClientProvider>;
    const { container, rerender } = render(wrap(false));
    expect(container.textContent).not.toContain("Founders Program");
    rerender(wrap(true));
    expect(container.textContent).toContain("6d. Founders Program applications");
    expect(container.textContent).toContain("deleted 12 months after their last status change");
    expect(container.textContent).toContain("kept while their account exists");
  });
});
