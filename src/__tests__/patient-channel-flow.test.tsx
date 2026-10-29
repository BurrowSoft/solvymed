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
// Opens an FAQ answer (<details>), as a tap does: "Isso resolveu" shows only after one (01, 10-29).
const openFaq = (i = 0) => {
  const d = document.querySelectorAll("details")[i] as HTMLDetailsElement;
  d.open = true;
  fireEvent(d, new Event("toggle"));
};

describe("the patient's flow", () => {
  it("entry: the practice country's emergency number, the rules; the FAQ can resolve it with nothing sent", () => {
    flow();
    expect(screen.getByText(P.entryEmergency.replace("{number}", "192"))).toBeInTheDocument();
    expect(screen.getByText("2 dias úteis")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("pc-start"));
    openFaq();
    fireEvent.click(screen.getByTestId("pc-faq-solved"));
    expect(screen.getByTestId("pc-resolved")).toHaveTextContent(P.resolved);
  });

  it("an options reason goes to the front desk; a second send asks to replace the open one", async () => {
    flow();
    toForm("adm");
    // The front desk with its article (launch polish 18).
    expect(screen.getByText("Para a secretaria")).toBeInTheDocument();
    expect(screen.getByTestId("pc-send")).toHaveTextContent("Enviar para a secretaria");
    fireEvent.click(screen.getByTestId("pc-send"));
    await waitFor(() => expect(screen.getByTestId("pc-sent")).toHaveTextContent("Recebido. A secretaria responde em até 2 dias úteis."));
    // Not urgent: no emergency line after sending.
    expect(screen.queryByTestId("pc-sent-urgent")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: P.again }));
    toForm("adm");
    fireEvent.click(screen.getByTestId("pc-send"));
    expect(await screen.findByTestId("pc-replace")).toHaveTextContent(P.openTitle);
    fireEvent.click(screen.getByTestId("pc-replace-yes"));
    await waitFor(() => expect(screen.getByTestId("pc-sent")).toBeInTheDocument());
  });

  it("the replace prompt names the open request from the 409 (its reason and date) and who has it (launch polish 2; 255)", async () => {
    const submit = vi.fn(async () => ({ status: "open_exists" as const, open: { reasonTitle: "Possível efeito colateral", createdAt: "2026-10-26T13:05:00Z" } }));
    render(wrap(<PatientChannelFlow page={SAMPLE_PAGE} preview={samplePreview()} submit={submit} />));
    toForm("efe");
    fireEvent.click(screen.getByTestId("pc-send"));
    const prompt = await screen.findByTestId("pc-replace");
    expect(screen.getByTestId("pc-replace-open")).toHaveTextContent("Você já tem uma solicitação aberta: Possível efeito colateral (");
    // One open request per destination (255): the one to replace goes where the new one goes.
    expect(prompt).toHaveTextContent(P.openText.replace("{who}", SAMPLE_PAGE.doctorName));
    expect(toMyRequests([{ id: "q", status: "open", destination: "elsewhere" }])[0].destination).toBeNull();
  });

  it("an older server's 409 without the request: named from the patient's own list, the open one with the SAME destination", async () => {
    const loadRequests = vi.fn(async () => [REQ({ id: "d", destination: "doctor", reasonTitle: "Dúvida clínica" }), REQ({ id: "s", destination: "secretary", reasonTitle: "Recibo" })]);
    const submit = vi.fn(async () => ({ status: "open_exists" as const }));
    render(wrap(<PatientChannelFlow page={SAMPLE_PAGE} preview={samplePreview()} submit={submit} loadRequests={loadRequests} />));
    await waitFor(() => expect(loadRequests).toHaveBeenCalled());
    toForm("adm");
    fireEvent.click(screen.getByTestId("pc-send"));
    await waitFor(() => expect(screen.getByTestId("pc-replace-open")).toHaveTextContent("Recibo"));
    expect(screen.getByTestId("pc-replace-open").textContent).not.toContain("Dúvida clínica");
  });

  it("each reason says who it goes to: the doctor by name, or the front desk; no score talk after sending (01)", async () => {
    flow();
    fireEvent.click(screen.getByTestId("pc-start"));
    fireEvent.click(screen.getByTestId("pc-faq-continue"));
    expect(screen.getByTestId("pc-reason-efe")).toHaveTextContent("Para: Dra. Ana Lima");
    expect(screen.getByTestId("pc-reason-adm")).toHaveTextContent("Para a secretaria");
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

  it("an automatic message with the skip button; with the warning, no skip and no info-tone message (launch polish 4)", async () => {
    flow();
    toForm("efe");
    fireEvent.click(screen.getByRole("checkbox", { name: "Coceira na pele" }));
    choose(A.whenQ, A.when0);
    choose(A.intensityQ, A.intensity0);
    expect(await screen.findByTestId("pc-skip")).toHaveTextContent(P.skip);
    expect(screen.getByTestId("pc-auto")).toHaveTextContent("Coceira leve");
    fireEvent.click(screen.getByRole("checkbox", { name: "Dor no peito ou desmaio" }));
    await waitFor(() => expect(screen.queryByTestId("pc-skip")).toBeNull());
    expect(screen.getByTestId("pc-emergency")).toBeInTheDocument();
    // "Coceira leve…" is info-tone: it goes while the emergency line shows.
    expect(screen.queryByTestId("pc-auto")).toBeNull();
  });

  it("with the warning, an attention-tone message becomes \"Procure a emergência.\", with no time words (launch polish 40)", async () => {
    flow();
    toForm("efe");
    fireEvent.click(screen.getByRole("checkbox", { name: "Tontura" }));
    choose(A.intensityQ, A.intensity2);
    expect(await screen.findByTestId("pc-auto")).toHaveTextContent("Tontura forte");
    fireEvent.click(screen.getByRole("checkbox", { name: "Dor no peito ou desmaio" }));
    expect(screen.getByTestId("pc-emergency")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("pc-auto-emergency")).toHaveTextContent(P.autoEmergency));
    const auto = screen.getByTestId("pc-auto");
    expect(auto).not.toHaveTextContent("Tontura forte");
    expect(auto.textContent).not.toMatch(/hoje|agora|em até/i);
    expect(within(auto).getAllByText(P.autoEmergency)).toHaveLength(1);
    // The emergency line itself is unchanged.
    expect(screen.getByTestId("pc-emergency")).toHaveTextContent(P.emergencyNow.replace("{number}", "192"));
  });

  it("with the warning, the request keeps no automatic message as seen; without it, the ones shown (cf on #679)", async () => {
    const submit = vi.fn(sampleSubmit());
    render(wrap(<PatientChannelFlow page={SAMPLE_PAGE} preview={samplePreview()} submit={submit} />));
    toForm("efe");
    fireEvent.click(screen.getByRole("checkbox", { name: "Tontura" }));
    choose(A.intensityQ, A.intensity2);
    await screen.findByTestId("pc-auto");
    fireEvent.click(screen.getByTestId("pc-send"));
    await screen.findByTestId("pc-sent");
    expect((submit.mock.calls[0][3] as string[]).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: P.again }));
    toForm("efe");
    fireEvent.click(screen.getByRole("checkbox", { name: "Tontura" }));
    choose(A.intensityQ, A.intensity2);
    fireEvent.click(screen.getByRole("checkbox", { name: "Dor no peito ou desmaio" }));
    await screen.findByTestId("pc-auto-emergency");
    fireEvent.click(screen.getByTestId("pc-send"));
    fireEvent.click(await screen.findByTestId("pc-replace-yes"));
    await screen.findByTestId("pc-sent");
    expect(submit.mock.calls.at(-1)?.[3]).toEqual([]);
  });

  it("after an URGENT send, the confirmation says not to wait, with the number, above \"Recebido\" (launch polish 1)", async () => {
    flow();
    toForm("efe");
    fireEvent.click(screen.getByRole("checkbox", { name: "Falta de ar ou inchaço no rosto" }));
    fireEvent.click(screen.getByTestId("pc-send"));
    const urgent = await screen.findByTestId("pc-sent-urgent");
    expect(urgent).toHaveTextContent(P.sentUrgent.replace("{number}", "192"));
    expect(urgent.compareDocumentPosition(screen.getByTestId("pc-sent")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // A new, non-urgent request to the front desk starts clean, and (255) doesn't replace the
    // open clinical one: one open request per destination.
    fireEvent.click(screen.getByRole("button", { name: P.again }));
    toForm("adm");
    fireEvent.click(screen.getByTestId("pc-send"));
    await waitFor(() => expect(screen.getByTestId("pc-sent")).toBeInTheDocument());
    expect(screen.queryByTestId("pc-replace")).toBeNull();
    expect(screen.queryByTestId("pc-sent-urgent")).toBeNull();
  });

  it("the replace prompt for the front desk's open request takes the article", async () => {
    const loadRequests = vi.fn(async () => [REQ({ destination: "secretary" })]);
    const submit = vi.fn(async () => ({ status: "open_exists" as const }));
    render(wrap(<PatientChannelFlow page={SAMPLE_PAGE} preview={samplePreview()} submit={submit} loadRequests={loadRequests} />));
    await waitFor(() => expect(loadRequests).toHaveBeenCalled());
    toForm("adm");
    fireEvent.click(screen.getByTestId("pc-send"));
    await waitFor(async () => expect(await screen.findByTestId("pc-replace")).toHaveTextContent(P.openTextSecretary));
  });

  it("FAQ: \"Isso resolveu\" only after an answer was opened; before, hidden in place and nothing counts (01, 10-29)", () => {
    const onSelfServe = vi.fn();
    render(wrap(<PatientChannelFlow page={SAMPLE_PAGE} preview={samplePreview()} submit={sampleSubmit()} onSelfServe={onSelfServe} />));
    fireEvent.click(screen.getByTestId("pc-start"));
    const solved = screen.getByTestId("pc-faq-solved");
    expect(solved).toBeDisabled();
    expect(solved).toHaveClass("invisible");
    expect(solved).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByTestId("pc-faq-continue")).not.toBeDisabled();
    fireEvent.click(solved);
    expect(onSelfServe).not.toHaveBeenCalled();
    expect(screen.queryByTestId("pc-resolved")).toBeNull();
    openFaq();
    expect(solved).not.toBeDisabled();
    expect(solved).toHaveClass("visible");
    expect(solved).not.toHaveAttribute("aria-hidden");
  });

  it("M4b: the FAQ and the skip are counted for the doctor (no content)", async () => {
    const onSelfServe = vi.fn();
    render(wrap(<PatientChannelFlow page={SAMPLE_PAGE} preview={samplePreview()} submit={sampleSubmit()} onSelfServe={onSelfServe} />));
    fireEvent.click(screen.getByTestId("pc-start"));
    openFaq();
    fireEvent.click(screen.getByTestId("pc-faq-solved"));
    // Item 43: with the question opened last (the route uses it only once pc-resolved-items-live).
    expect(onSelfServe).toHaveBeenCalledWith("faq_resolved", { kind: "faq", id: SAMPLE_PAGE.faq[0].id });
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

// 01 (10-27, as the app): when the emergency line first appears off-screen (at phone width it
// sits below the symptom list), it's scrolled into view; role="alert" announces it.
describe("the emergency line comes into view", () => {
  const scroll = vi.fn();
  const original = { scroll: Element.prototype.scrollIntoView, rect: Element.prototype.getBoundingClientRect, matchMedia: window.matchMedia };
  const setup = ({ offScreen, reduce }: { offScreen: boolean; reduce: boolean }) => {
    scroll.mockReset();
    Element.prototype.scrollIntoView = scroll;
    Element.prototype.getBoundingClientRect = function () {
      const top = offScreen && this.getAttribute?.("data-testid") === "pc-emergency" ? 2000 : 10;
      return { top, bottom: top + 40, left: 0, right: 100, width: 100, height: 40, x: 0, y: top, toJSON: () => ({}) } as DOMRect;
    };
    window.matchMedia = ((q: string) => ({ matches: reduce && q.includes("reduce"), media: q, addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia;
  };
  const restore = () => {
    Element.prototype.scrollIntoView = original.scroll;
    Element.prototype.getBoundingClientRect = original.rect;
    window.matchMedia = original.matchMedia;
  };
  const tick = () => fireEvent.click(screen.getByRole("checkbox", { name: "Falta de ar ou inchaço no rosto" }));

  it("off-screen: scrolled into view once, smoothly, and announced (role=alert)", () => {
    setup({ offScreen: true, reduce: false });
    try {
      flow();
      toForm("efe");
      tick();
      expect(screen.getByTestId("pc-emergency").getAttribute("role")).toBe("alert");
      expect(scroll).toHaveBeenCalledTimes(1);
      expect(scroll).toHaveBeenCalledWith({ behavior: "smooth", block: "center" });
    } finally {
      restore();
    }
  });

  it("reduced motion: no smooth scroll", () => {
    setup({ offScreen: true, reduce: true });
    try {
      flow();
      toForm("efe");
      tick();
      expect(scroll).toHaveBeenCalledWith({ behavior: "auto", block: "center" });
    } finally {
      restore();
    }
  });

  it("already on screen: left where it is", () => {
    setup({ offScreen: false, reduce: false });
    try {
      flow();
      toForm("efe");
      tick();
      expect(screen.getByTestId("pc-emergency")).toBeInTheDocument();
      expect(scroll).not.toHaveBeenCalled();
    } finally {
      restore();
    }
  });

  it("unticked and ticked again: it appears again and comes into view again", () => {
    setup({ offScreen: true, reduce: false });
    try {
      flow();
      toForm("efe");
      tick();
      tick();
      expect(screen.queryByTestId("pc-emergency")).toBeNull();
      tick();
      expect(scroll).toHaveBeenCalledTimes(2);
    } finally {
      restore();
    }
  });
});

// 01 (10-27; web tester 1's 320 check on #657): while the patient TYPES, scrolling to the line
// would push the text box behind the keyboard. Nothing scrolls; a compact bar pinned to the top
// of the visible area repeats the line while it's off-screen; the box wins on a short screen.
describe("the emergency bar while typing", () => {
  const scroll = vi.fn();
  const original = { scroll: Element.prototype.scrollIntoView, rect: Element.prototype.getBoundingClientRect };
  const at = { line: 2000, box: 300, bar: 56 };
  const rect = (top: number, height: number) => ({ top, bottom: top + height, left: 0, right: 100, width: 100, height, x: 0, y: top, toJSON: () => ({}) }) as DOMRect;
  const setup = () => {
    scroll.mockReset();
    Object.assign(at, { line: 2000, box: 300, bar: 56 });
    Element.prototype.scrollIntoView = scroll;
    Element.prototype.getBoundingClientRect = function () {
      const id = this.getAttribute?.("data-testid");
      if (id === "pc-emergency") return rect(at.line, 40);
      if (id === "pc-emergency-bar") return rect(0, at.bar);
      if (this.tagName === "TEXTAREA") return rect(at.box, 96);
      return rect(10, 40);
    };
  };
  const restore = () => {
    Element.prototype.scrollIntoView = original.scroll;
    Element.prototype.getBoundingClientRect = original.rect;
  };
  const type = (text: string) => {
    const box = screen.getByRole("textbox", { name: P.textLabel });
    box.focus();
    fireEvent.change(box, { target: { value: text } });
  };

  it("typed into the warning, the line off-screen: no scroll; the bar, aria-hidden, the same line (192 shown), 2 lines", () => {
    setup();
    try {
      flow();
      toForm("efe");
      type("estou com falta de ar");
      expect(screen.getByTestId("pc-emergency").getAttribute("role")).toBe("alert");
      expect(scroll).not.toHaveBeenCalled();
      const bar = screen.getByTestId("pc-emergency-bar");
      expect(bar.getAttribute("aria-hidden")).toBe("true");
      expect(bar.tabIndex).toBe(-1);
      expect(bar).toHaveTextContent(P.emergencyNow.replace("{number}", "192"));
      expect(bar.querySelector(".line-clamp-2")).not.toBeNull();
      // The number is never inside the clamped text (cf, #662): it shows however short the bar.
      const num = screen.getByTestId("pc-emergency-bar-number");
      expect(num).toHaveTextContent(/^192$/);
      expect(num.closest(".line-clamp-1, .line-clamp-2")).toBeNull();
      // Outside the form's subtree (a portal), so no transformed parent can move a fixed bar.
      expect(bar.parentElement).toBe(document.body);
      fireEvent.click(bar);
      expect(scroll).toHaveBeenCalledWith({ behavior: "smooth", block: "center" });
    } finally {
      restore();
    }
  });

  it("a short screen: when the 2-line bar would cover the text box, it shrinks to 1 line; back to 2 with room", () => {
    setup();
    try {
      flow();
      toForm("efe");
      at.box = 40;
      type("falta de ar");
      fireEvent.scroll(window);
      const bar = screen.getByTestId("pc-emergency-bar");
      expect(bar.querySelector(".line-clamp-1")).not.toBeNull();
      expect(screen.getByTestId("pc-emergency-bar-number").closest(".line-clamp-1")).toBeNull();
      expect(screen.getByTestId("pc-emergency-bar-number")).toHaveTextContent("192");
      at.bar = 36;
      at.box = 200;
      fireEvent.scroll(window);
      expect(screen.getByTestId("pc-emergency-bar").querySelector(".line-clamp-2")).not.toBeNull();
    } finally {
      restore();
    }
  });

  it("gone once the line is on screen, or when the warning clears", () => {
    setup();
    try {
      flow();
      toForm("efe");
      type("falta de ar");
      expect(screen.getByTestId("pc-emergency-bar")).toBeInTheDocument();
      at.line = 100;
      fireEvent.scroll(window);
      expect(screen.queryByTestId("pc-emergency-bar")).toBeNull();
      at.line = 2000;
      type("estou bem");
      type("falta de ar");
      expect(screen.getByTestId("pc-emergency-bar")).toBeInTheDocument();
      type("estou bem");
      expect(screen.queryByTestId("pc-emergency")).toBeNull();
      expect(screen.queryByTestId("pc-emergency-bar")).toBeNull();
    } finally {
      restore();
    }
  });

  it("no known number (another country): no number element, the local-number phrase stays in the sentence", () => {
    setup();
    try {
      render(wrap(<PatientChannelFlow page={{ ...SAMPLE_PAGE, emergencyNumber: null }} preview={samplePreview()} submit={sampleSubmit()} banner={P.sampleBanner} />));
      toForm("efe");
      type("falta de ar");
      const bar = screen.getByTestId("pc-emergency-bar");
      expect(screen.queryByTestId("pc-emergency-bar-number")).toBeNull();
      expect(bar).toHaveTextContent(P.emergencyNow.replace("{number}", P.localNumber));
    } finally {
      restore();
    }
  });

  it("not typing (a ticked box): no bar, the line is scrolled to as before", () => {
    setup();
    try {
      flow();
      toForm("efe");
      fireEvent.click(screen.getByRole("checkbox", { name: "Falta de ar ou inchaço no rosto" }));
      expect(screen.queryByTestId("pc-emergency-bar")).toBeNull();
      expect(scroll).toHaveBeenCalledTimes(1);
    } finally {
      restore();
    }
  });
});

describe("launch polish 15: nothing preselected", () => {
  it("each question starts on \"Escolha…\" and an untouched form sends -1 (adds 0 points)", async () => {
    const submit = vi.fn(async () => ({ status: "sent" as const }));
    render(wrap(<PatientChannelFlow page={SAMPLE_PAGE} preview={samplePreview()} submit={submit} />));
    toForm("efe");
    for (const q of [A.whenQ, A.intensityQ, A.stillTakingQ]) {
      const select = screen.getByRole("combobox", { name: q }) as HTMLSelectElement;
      expect(select.value).toBe("-1");
      expect(select.selectedOptions[0].textContent).toBe(A.choose);
    }
    fireEvent.click(screen.getByRole("checkbox", { name: "Coceira na pele" }));
    fireEvent.click(screen.getByTestId("pc-send"));
    await waitFor(() => expect(submit).toHaveBeenCalled());
    expect((submit.mock.calls[0] as unknown[])[1]).toMatchObject({ when: -1, intensity: -1, stillTaking: -1 });
  });
});
