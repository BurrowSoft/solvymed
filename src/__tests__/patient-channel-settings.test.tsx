import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { NextIntlClientProvider } from "next-intl";
import pt from "@/messages/pt-BR.json";
import en from "@/messages/en.json";
import cases from "./fixtures/patient-channel-score-cases.json";
import type { ChannelConfig } from "@/lib/patientChannel/score";
import { EMPTY_RULES } from "@/lib/patientChannel/rules";
import { DEFAULT_SETTINGS } from "@/lib/patientChannel/channel";
import { PatientChannelSettings } from "@/app/[locale]/(site)/dashboard/settings/patient-channel/PatientChannelSettings";

// Patient Channel M3a: the doctor's rules editor and "Testar como paciente" (the
// prototype v17's tab 3). Nothing is saved yet.

const sample = cases.config as ChannelConfig;
const wrap = (node: React.ReactNode) => <NextIntlClientProvider locale="pt-BR" messages={pt}>{node}</NextIntlClientProvider>;
const P = pt.patientChannel;
// M3b-2's props (the channel cards), empty: these tests are about the rules.
const EXTRA = { professionalId: "doc1", channel: { settings: DEFAULT_SETTINGS, reasons: [], faq: [] }, brandHref: "/pt-BR/dashboard/settings#brand" };

describe("the Patient Channel rules editor", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("starts empty with nothing to save, and adds a symptom", () => {
    render(wrap(<PatientChannelSettings {...EXTRA} initialRules={EMPTY_RULES} initialVersion={0} emergencyNumber="192" />));
    expect(screen.getByTestId("pc-save")).toBeDisabled();
    expect(screen.getByText(P.symptoms.none)).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: P.symptoms.new }), { target: { value: "Tontura" } });
    fireEvent.click(within(screen.getByRole("region", { name: P.symptoms.title })).getByRole("button", { name: P.symptoms.add }));
    expect(within(screen.getByRole("region", { name: P.symptoms.title })).getByText("Tontura")).toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: "Pontos para Tontura" })).toHaveValue(2);
  });

  it.each(["ไ", "X"])("refuses a 1-letter symptom in any script (237): %s", (name) => {
    render(wrap(<PatientChannelSettings {...EXTRA} initialRules={EMPTY_RULES} initialVersion={0} emergencyNumber="1669" />));
    fireEvent.change(screen.getByRole("textbox", { name: P.symptoms.new }), { target: { value: name } });
    fireEvent.click(within(screen.getByRole("region", { name: P.symptoms.title })).getByRole("button", { name: P.symptoms.add }));
    expect(screen.getByRole("alert")).toHaveTextContent(P.symptoms.termShort);
    expect(screen.getByText(P.symptoms.none)).toBeInTheDocument();
  });

  it("a refused 1-letter word is cleared from the patient-words field (01, #614 row)", () => {
    render(wrap(<PatientChannelSettings {...EXTRA} initialRules={sample} initialVersion={3} emergencyNumber="1669" />));
    const field = screen.getAllByRole("textbox", { name: P.symptoms.words })[0] as HTMLInputElement;
    fireEvent.change(field, { target: { value: "ก, x, มึนหัว" } });
    fireEvent.blur(field);
    expect(field.value).toBe("มึนหัว");
    expect(screen.getByRole("alert")).toHaveTextContent(P.symptoms.termShort);
  });

  it("Save: PUT /config with the version read; then saved, and nothing left to save", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ version: 4, rescored: 1 }) }));
    vi.stubGlobal("fetch", fetchMock);
    render(wrap(<PatientChannelSettings {...EXTRA} initialRules={sample} initialVersion={3} emergencyNumber="192" />));
    expect(screen.getByTestId("pc-save")).toBeDisabled();
    fireEvent.click(screen.getAllByRole("checkbox", { name: P.symptoms.immediate, checked: false })[0]);
    expect(screen.getByRole("status")).toHaveTextContent(P.settings.unsaved);
    fireEvent.click(screen.getByTestId("pc-save"));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(P.settings.saved));
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect([url, init.method]).toEqual(["/api/patient-channel/config", "PUT"]);
    const sent = JSON.parse(init.body as string);
    expect(sent.expectedVersion).toBe(3);
    expect(Object.keys(sent.rules).sort()).toEqual(["autoMessages", "combinations", "medicines", "minBandForTextOnly", "symptoms", "thresholds"]);
    expect(screen.getByTestId("pc-save")).toBeDisabled();
  });

  it("a newer save elsewhere (409) asks to reload instead of writing over it", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 409, json: async () => ({ code: "version_conflict" }) })));
    render(wrap(<PatientChannelSettings {...EXTRA} initialRules={sample} initialVersion={3} emergencyNumber="192" />));
    fireEvent.click(screen.getAllByRole("checkbox", { name: P.symptoms.immediate, checked: false })[0]);
    fireEvent.click(screen.getByTestId("pc-save"));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(P.settings.conflict));
    expect(screen.getByRole("button", { name: P.settings.reload })).toBeInTheDocument();
    expect(screen.getByTestId("pc-save")).toBeDisabled();
  });

  it("renaming a symptom keeps its messages (cf, #614); a duplicate name is refused", () => {
    render(wrap(<PatientChannelSettings {...EXTRA} initialRules={sample} initialVersion={3} emergencyNumber="192" />));
    fireEvent.click(screen.getByRole("button", { name: `${P.symptoms.rename} Tontura` }));
    const input = screen.getByRole("textbox", { name: P.symptoms.renameLabel.replace("{name}", "Tontura") });
    fireEvent.change(input, { target: { value: "Febre" } });
    fireEvent.click(screen.getByRole("button", { name: P.symptoms.renameSave }));
    expect(screen.getByRole("alert")).toHaveTextContent(P.symptoms.exists);
    fireEvent.change(input, { target: { value: "Vertigem" } });
    fireEvent.click(screen.getByRole("button", { name: P.symptoms.renameSave }));
    const auto = within(screen.getByRole("region", { name: P.auto.title }));
    expect(auto.getAllByText(/Vertigem/).length).toBeGreaterThan(0);
    // The terms line follows the rename (the message's own text is the doctor's and stays).
    expect(auto.queryByText(/^Tontura ·/)).toBeNull();
    expect(auto.getByText(/^Vertigem ·/)).toBeInTheDocument();
  });

  it("the warn-on-urgent line names the practice country's number", () => {
    render(wrap(<PatientChannelSettings {...EXTRA} initialRules={sample} initialVersion={0} emergencyNumber="1669" />));
    expect(screen.getByText(P.bands.warnOnUrgent.replace("{number}", "1669"))).toBeInTheDocument();
  });

  it("bands: urgent must stay above attention", () => {
    render(wrap(<PatientChannelSettings {...EXTRA} initialRules={sample} initialVersion={0} emergencyNumber="192" />));
    fireEvent.change(screen.getByRole("spinbutton", { name: `${P.bands.red} ${P.bands.from}` }), { target: { value: "5" } });
    expect(screen.getByText(P.bands.invalid)).toBeInTheDocument();
  });

  it("an automatic message needs a term", () => {
    render(wrap(<PatientChannelSettings {...EXTRA} initialRules={sample} initialVersion={0} emergencyNumber="192" />));
    fireEvent.change(screen.getByRole("textbox", { name: P.auto.message }), { target: { value: "Beba água." } });
    fireEvent.click(screen.getByRole("button", { name: P.auto.add }));
    expect(screen.getByText(P.auto.pickTerm)).toBeInTheDocument();
  });
});

describe("the page never scrolls the whole window (83, #620)", () => {
  it("its root is a containing block, so sr-only bits stay inside the dashboard's <main>", () => {
    const { container } = render(wrap(<PatientChannelSettings {...EXTRA} initialRules={sample} initialVersion={1} emergencyNumber="192" />));
    expect(container.firstElementChild).toHaveClass("relative");
    expect(container.querySelectorAll(".sr-only").length).toBeGreaterThan(0);
  });
});

describe("Testar como paciente", () => {
  const openTest = (rules: ChannelConfig, number = "192") => {
    render(wrap(<PatientChannelSettings {...EXTRA} initialRules={rules} initialVersion={0} emergencyNumber={number} />));
    fireEvent.click(screen.getByRole("button", { name: P.settings.testButton }));
    expect(screen.getByText(P.test.bar)).toBeInTheDocument();
  };
  const tick = (name: string) => fireEvent.click(screen.getByRole("checkbox", { name }));
  const choose = (label: string, option: string) => {
    const select = screen.getByRole("combobox", { name: label });
    fireEvent.change(select, { target: { value: within(select).getByRole("option", { name: option }).getAttribute("value") } });
  };

  it("the live score adds up the lines as the patient answers (green + itchy = 8 amber)", () => {
    openTest(sample);
    tick("Pele esverdeada");
    tick("Coceira na pele");
    choose(P.answers.whenQ, P.answers.when2);
    choose(P.answers.intensityQ, P.answers.intensity0);
    expect(screen.getAllByTestId("pc-test-total")[0]).toHaveTextContent("8");
    expect(screen.getByText("Pele esverdeada · Há mais de 3 dias")).toBeInTheDocument();
    expect(screen.queryByTestId("pc-test-emergency")).toBeNull();
  });

  it("an immediate-warning symptom shows the country's emergency number; never the skip button", () => {
    openTest(sample, "1669");
    tick("Falta de ar ou inchaço no rosto");
    tick("Tontura");
    choose(P.answers.intensityQ, P.answers.intensity2);
    expect(screen.getByTestId("pc-test-emergency")).toHaveTextContent("1669");
    // As the patient's form: the message ("Tontura forte…") becomes "Procure a emergência." (launch polish 40).
    expect(screen.queryByTestId("pc-test-auto")).toBeNull();
    expect(screen.getByTestId("pc-test-auto-emergency")).toHaveTextContent(P.patient.autoEmergency);
    expect(screen.getByTestId("pc-test-auto-emergency")).not.toHaveTextContent("Tontura forte");
    expect(screen.queryByTestId("pc-test-skip")).toBeNull();
  });

  it("text counts like the box, marked (texto); the skip button ends the test without a request", () => {
    openTest(sample);
    choose(P.answers.whenQ, P.answers.when0);
    choose(P.answers.intensityQ, P.answers.intensity0);
    fireEvent.change(screen.getByRole("textbox", { name: P.test.textLabel }), { target: { value: "muita coceira hoje" } });
    expect(screen.getByText("Coceira na pele (texto)")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("pc-test-skip"));
    expect(screen.getByTestId("pc-test-result")).toHaveTextContent(P.test.skipped);
  });

  it("Enviar shows what would arrive, then back to the rules", () => {
    openTest(sample);
    tick("Dor de cabeça");
    fireEvent.click(screen.getByRole("button", { name: P.test.send }));
    const result = screen.getByTestId("pc-test-result");
    expect(result).toHaveTextContent(P.test.resultTitle);
    expect(result).toHaveTextContent(P.test.resultWarning.replace("{answer}", P.test.no));
    fireEvent.click(screen.getByRole("button", { name: P.test.back }));
    expect(screen.getByRole("button", { name: P.settings.testButton })).toBeInTheDocument();
  });
});

describe("the Patient Channel's strings", () => {
  it("every locale has the same keys as English", () => {
    const keys = (o: unknown, p = ""): string[] =>
      Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => (typeof v === "object" && v ? keys(v, `${p}${k}.`) : [`${p}${k}`]));
    const want = keys(en.patientChannel).sort();
    const dir = resolve(__dirname, "../messages");
    for (const file of readdirSync(dir).filter((n) => n.endsWith(".json"))) {
      const m = JSON.parse(readFileSync(resolve(dir, file), "utf8").trimStart());
      expect(keys(m.patientChannel).sort(), file).toEqual(want);
    }
  });
});
