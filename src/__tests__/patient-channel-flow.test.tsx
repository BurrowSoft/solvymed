import { describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { NextIntlClientProvider } from "next-intl";
import pt from "@/messages/pt-BR.json";
import en from "@/messages/en.json";
import { SAMPLE_PAGE, samplePreview, sampleSubmit, toMyRequests, type PcMyRequest } from "@/lib/patientChannel/patientPage";
import type { Chip, Vocabulary } from "@/lib/patientChannel/score";
import { PatientChannelFlow } from "@/components/patientChannel/PatientChannelFlow";
import { SmartTextBox } from "@/components/patientChannel/SmartTextBox";

// Patient Channel M4a: the patient's flow (the prototype v17's tab 1) on the sample
// practice, /preview and the submit stubbed; and the smart text box (§5).

const P = pt.patientChannel.patient;
const wrap = (node: React.ReactNode) => <NextIntlClientProvider locale="pt-BR" messages={pt}>{node}</NextIntlClientProvider>;
const REQ = (o: Partial<PcMyRequest> = {}): PcMyRequest => ({
  id: "q1", status: "open", reasonTitle: "Possível efeito colateral", option: null, text: "Estou com coceira",
  replyText: null, repliedAt: null, createdAt: "2026-10-26T10:00:00Z", ...o,
});
const flow = () => render(wrap(<PatientChannelFlow page={SAMPLE_PAGE} preview={samplePreview()} submit={sampleSubmit()} banner={P.sampleBanner} />));
const toForm = (reason: string) => {
  fireEvent.click(screen.getByTestId("pc-start"));
  fireEvent.click(screen.getByTestId("pc-faq-continue"));
  fireEvent.click(screen.getByTestId(`pc-reason-${reason}`));
};
const choose = (label: string, option: string) => {
  const select = screen.getByRole("combobox", { name: label });
  fireEvent.change(select, { target: { value: within(select).getByRole("option", { name: option }).getAttribute("value") } });
};
const A = pt.patientChannel.answers;

describe("the patient's flow", () => {
  it("entry: the practice country's emergency number, the rules; the FAQ can resolve it with nothing sent", () => {
    flow();
    expect(screen.getByText(P.entryEmergency.replace("{number}", "192"))).toBeInTheDocument();
    expect(screen.getByText("2 dias úteis")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("pc-start"));
    fireEvent.click(screen.getByTestId("pc-faq-solved"));
    expect(screen.getByTestId("pc-resolved")).toHaveTextContent(P.resolved);
  });

  it("an options reason goes to the front desk; a second send asks to replace the open one", async () => {
    flow();
    toForm("adm");
    expect(screen.getByText("Para: Secretaria")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("pc-send"));
    await waitFor(() => expect(screen.getByTestId("pc-sent")).toHaveTextContent("Secretaria responde em até 2 dias úteis"));
    fireEvent.click(screen.getByRole("button", { name: P.again }));
    toForm("adm");
    fireEvent.click(screen.getByTestId("pc-send"));
    expect(await screen.findByTestId("pc-replace")).toHaveTextContent(P.openTitle);
    fireEvent.click(screen.getByTestId("pc-replace-yes"));
    await waitFor(() => expect(screen.getByTestId("pc-sent")).toBeInTheDocument());
  });

  it("each reason says who it goes to: the doctor by name, or the front desk; no score talk after sending (01)", async () => {
    flow();
    fireEvent.click(screen.getByTestId("pc-start"));
    fireEvent.click(screen.getByTestId("pc-faq-continue"));
    expect(screen.getByTestId("pc-reason-efe")).toHaveTextContent("Para: Dra. Ana Lima");
    expect(screen.getByTestId("pc-reason-adm")).toHaveTextContent("Para: Secretaria");
    fireEvent.click(screen.getByTestId("pc-reason-med"));
    fireEvent.click(screen.getByTestId("pc-send"));
    await waitFor(() => expect(screen.getByTestId("pc-sent")).toBeInTheDocument());
    expect(document.body.textContent).not.toMatch(/pontua/i);
  });

  it("an immediate-warning symptom shows the emergency at once, from the vocabulary (no score shown)", () => {
    flow();
    toForm("efe");
    expect(screen.queryByTestId("pc-emergency")).toBeNull();
    fireEvent.click(screen.getByRole("checkbox", { name: "Falta de ar ou inchaço no rosto" }));
    expect(screen.getByTestId("pc-emergency")).toHaveTextContent("192");
    expect(document.body.textContent).not.toMatch(/Urgente|Atenção|pontos/);
  });

  it("an automatic message with the skip button; never the skip with the warning", async () => {
    flow();
    toForm("efe");
    fireEvent.click(screen.getByRole("checkbox", { name: "Coceira na pele" }));
    choose(A.whenQ, A.when0);
    choose(A.intensityQ, A.intensity0);
    expect(await screen.findByTestId("pc-skip")).toHaveTextContent(P.skip);
    fireEvent.click(screen.getByRole("checkbox", { name: "Dor no peito ou desmaio" }));
    await waitFor(() => expect(screen.queryByTestId("pc-skip")).toBeNull());
    expect(screen.getByTestId("pc-auto")).toBeInTheDocument();
    expect(screen.getByTestId("pc-emergency")).toBeInTheDocument();
  });

  it("M4b: the FAQ and the skip are counted for the doctor (no content)", async () => {
    const onSelfServe = vi.fn();
    render(wrap(<PatientChannelFlow page={SAMPLE_PAGE} preview={samplePreview()} submit={sampleSubmit()} onSelfServe={onSelfServe} />));
    fireEvent.click(screen.getByTestId("pc-start"));
    fireEvent.click(screen.getByTestId("pc-faq-solved"));
    expect(onSelfServe).toHaveBeenCalledWith("faq_resolved");
  });

  it("M4b: the practice closed or the patient archived at send → not available, the emergency notice stays", async () => {
    render(wrap(<PatientChannelFlow page={SAMPLE_PAGE} preview={samplePreview()} submit={async () => ({ status: "unavailable" })} />));
    toForm("adm");
    fireEvent.click(screen.getByTestId("pc-send"));
    const box = await screen.findByTestId("pc-unavailable");
    expect(box).toHaveTextContent(P.unavailable);
    expect(box).toHaveTextContent("192");
  });

  it("M4b: the submit gets the automatic messages the patient saw", async () => {
    const submit = vi.fn(async () => ({ status: "sent" as const }));
    render(wrap(<PatientChannelFlow page={SAMPLE_PAGE} preview={samplePreview()} submit={submit} />));
    toForm("efe");
    fireEvent.click(screen.getByRole("checkbox", { name: "Coceira na pele" }));
    choose(A.whenQ, A.when0);
    choose(A.intensityQ, A.intensity0);
    await screen.findByTestId("pc-skip");
    fireEvent.click(screen.getByTestId("pc-send"));
    await waitFor(() => expect(submit).toHaveBeenCalled());
    expect((submit.mock.calls[0] as unknown[])[3]).toEqual(["a1"]);
  });

  it("M4b: too many sends → 01's message, the emergency line and the open request; nothing else sent", async () => {
    const loadRequests = vi.fn(async () => [REQ({ reasonTitle: "Possível efeito colateral" })]);
    render(wrap(<PatientChannelFlow page={SAMPLE_PAGE} preview={samplePreview()} submit={async () => ({ status: "rate_limited" })} loadRequests={loadRequests} />));
    toForm("adm");
    fireEvent.click(screen.getByTestId("pc-send"));
    const box = await screen.findByTestId("pc-rate-limited");
    expect(box).toHaveTextContent(P.rateLimited);
    expect(box).toHaveTextContent(P.urgentCall.replace("{number}", "192"));
    expect(await screen.findByTestId("pc-open-request")).toHaveTextContent("Possível efeito colateral");
  });

  it("the skip ends with nothing sent", async () => {
    flow();
    toForm("efe");
    fireEvent.click(screen.getByRole("checkbox", { name: "Coceira na pele" }));
    choose(A.whenQ, A.when0);
    choose(A.intensityQ, A.intensity0);
    fireEvent.click(await screen.findByTestId("pc-skip"));
    expect(screen.getByTestId("pc-resolved")).toBeInTheDocument();
  });
});

// P-14 (01, 10-26): the patient sees their requests and the practice's reply.
describe("Suas mensagens", () => {
  const show = (list: PcMyRequest[] | null, page = SAMPLE_PAGE) =>
    render(wrap(<PatientChannelFlow page={page} preview={samplePreview()} submit={sampleSubmit()} loadRequests={async () => list} />));

  it("the latest, answered: what they wrote, the status with the date in the practice's zone, the reply", async () => {
    show([REQ({ status: "answered", replyText: "Pode tomar com comida.", repliedAt: "2026-10-26T13:05:00Z" })], { ...SAMPLE_PAGE, timeZone: "America/Sao_Paulo", country: "BR" });
    const card = await screen.findByTestId("pc-my-request");
    expect(screen.getByTestId("pc-my-requests")).toHaveTextContent(P.myRequests);
    expect(card).toHaveTextContent(P.youWrote);
    expect(card).toHaveTextContent("Estou com coceira");
    // 13:05 UTC = 10:05 in São Paulo.
    expect(screen.getByTestId("pc-my-request-status").textContent).toMatch(/^Respondida em .*10:05/);
    expect(screen.getByTestId("pc-my-request-reply")).toHaveTextContent(P.replyTitle);
    expect(screen.getByTestId("pc-my-request-reply")).toHaveTextContent("Pode tomar com comida.");
    // Never a score, a band or a breakdown.
    expect(screen.getByTestId("pc-my-requests").textContent).not.toMatch(/pts|Urgente|Atenção|Não urgente|pontos/);
  });

  it("every status has a line: open, call back (no text → no reply card), closed without a text, replaced", async () => {
    const { unmount } = show([REQ({ status: "call_back", repliedAt: "2026-10-26T13:00:00Z" })]);
    expect(await screen.findByTestId("pc-my-request-status")).toHaveTextContent(P.statusCallBack);
    expect(screen.queryByTestId("pc-my-request-reply")).toBeNull();
    unmount();
    const r2 = show([REQ({ status: "answered", repliedAt: "2026-10-26T13:00:00Z" })]);
    expect(await screen.findByTestId("pc-my-request-status")).toHaveTextContent(P.statusClosed);
    r2.unmount();
    show([REQ({ id: "new" }), REQ({ id: "old", status: "substituted", option: "Recibo", text: "" })]);
    expect(await screen.findByTestId("pc-my-request-status")).toHaveTextContent(P.statusOpen);
    fireEvent.click(screen.getByTestId("pc-my-requests-earlier"));
    const earlier = screen.getByTestId("pc-my-request-earlier");
    expect(earlier).toHaveTextContent(P.statusSubstituted);
    expect(earlier).toHaveTextContent(P.youChose.replace("{option}", "Recibo"));
  });

  it("none, or a failed read: no section", async () => {
    show(null);
    await screen.findByTestId("pc-start");
    expect(screen.queryByTestId("pc-my-requests")).toBeNull();
  });

  it("an unknown status: never dropped, never shown raw: 'Recebida', and reported (01)", async () => {
    const onUnknown = vi.fn();
    const list = toMyRequests([{ id: "x", status: "weird_new", reasonTitle: "Receita", text: "Preciso da receita", createdAt: "2026-10-26T10:00:00Z" }], onUnknown);
    expect(list.map((r) => [r.id, r.status])).toEqual([["x", "other"]]);
    expect(onUnknown).toHaveBeenCalledWith("weird_new");
    show(list);
    expect(await screen.findByTestId("pc-my-request-status")).toHaveTextContent(P.statusReceived);
    expect(screen.getByTestId("pc-my-requests").textContent).not.toContain("weird_new");
  });
});

function Box({ vocab = SAMPLE_PAGE.vocabulary, initial = "" }: { vocab?: Vocabulary; initial?: string }) {
  const [text, setText] = useState(initial);
  const [chips, setChips] = useState<Chip[]>([]);
  return (
    <>
      <SmartTextBox vocab={vocab} text={text} chips={chips} maxLength={500} label="Texto" placeholder="" onChange={(t, c) => { setText(t); setChips(c); }} />
      <output data-testid="state">{JSON.stringify({ text, chips })}</output>
    </>
  );
}
const state = () => JSON.parse(screen.getByTestId("state").textContent!) as { text: string; chips: Chip[] };
const type = (value: string) => {
  const box = screen.getByRole("textbox", { name: "Texto" }) as HTMLTextAreaElement;
  fireEvent.change(box, { target: { value, selectionStart: value.length, selectionEnd: value.length } });
  fireEvent.select(box, { target: { selectionStart: value.length } });
};

describe("the smart text box", () => {
  it("suggests from 2 letters; Enter locks the first as a chip in the doctor's spelling", () => {
    render(wrap(<Box />));
    type("estou com f");
    expect(screen.queryByTestId("pc-suggestions")).toBeNull();
    type("estou com fe");
    expect(screen.getByTestId("pc-suggestions")).toHaveTextContent("Febre");
    type("estou com feb");
    expect(within(screen.getByTestId("pc-suggestions")).getAllByRole("option")[0]).toHaveTextContent("Febre");
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Texto" }), { key: "Enter" });
    expect(state()).toEqual({ text: "estou com Febre ", chips: [{ kind: "symptom", ref: "s9", text: "Febre" }] });
  });

  it("a whole known word followed by a space locks itself; a medicine too", () => {
    render(wrap(<Box />));
    type("tomei metformina ");
    expect(state().chips).toEqual([{ kind: "medicine", text: "Metformina" }]);
    expect(state().text).toBe("tomei Metformina ");
  });

  it("removing a chip removes its words from the text (all of a symptom's)", () => {
    render(wrap(<Box />));
    type("muita coceira ");
    expect(state().chips).toEqual([{ kind: "symptom", ref: "s2", text: "Coceira na pele" }]);
    fireEvent.click(screen.getByRole("button", { name: P.textBox.remove.replace("{term}", "Coceira na pele") }));
    expect(state()).toEqual({ text: "muita ", chips: [] });
  });

  it("highlights the recognised terms behind the text", () => {
    render(wrap(<Box initial="estou com febre e tontura" />));
    const marks = screen.getByTestId("pc-text-backdrop").querySelectorAll("mark");
    expect([...marks].map((m) => m.textContent)).toEqual(["febre", "tontura"]);
  });

  it("Thai: suggestions from the run before the caret (no spaces)", () => {
    const th: Vocabulary = { symptoms: [{ id: "t1", name: "เวียนหัว", words: ["มึนหัว"], immediateWarning: false }], medicines: [] };
    render(wrap(<Box vocab={th} />));
    type("วันนี้เวีย");
    expect(within(screen.getByTestId("pc-suggestions")).getAllByRole("option")[0]).toHaveTextContent("เวียนหัว");
  });
});

describe("the patient flow's strings", () => {
  it("every locale has the same keys as English", () => {
    const keys = (o: unknown, p = ""): string[] =>
      Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => (typeof v === "object" && v ? keys(v, `${p}${k}.`) : [`${p}${k}`]));
    const want = keys(en.patientChannel.patient).sort();
    const dir = resolve(__dirname, "../messages");
    for (const file of readdirSync(dir).filter((n) => n.endsWith(".json"))) {
      const m = JSON.parse(readFileSync(resolve(dir, file), "utf8").trimStart());
      expect(keys(m.patientChannel.patient).sort(), file).toEqual(want);
    }
  });
});
