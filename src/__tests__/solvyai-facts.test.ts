// @vitest-environment node
import { describe, expect, it } from "vitest";
import { practiceLine } from "@/lib/assistant/server/handle";
import { GENERAL, appMapText, ruleText } from "@/lib/solvyai/app-map";

// 53's go-live audit (#429), cf's facts (6 Oct): Pix named to a Thai doctor,
// "patients get reminders", "the website can't send the Pix message",
// "existing templates", "no Founders Program".

describe("the practice country's facts reach every answer", () => {
  it("Brazil: Pix", () => {
    const l = practiceLine("BR");
    expect(l).toContain("Pix");
    expect(l).not.toContain("PromptPay");
    expect(l).not.toContain("no messaging-app items");
  });

  it("Thailand: PromptPay, and no WhatsApp/LINE items while LINE isn't live", () => {
    const l = practiceLine("TH");
    expect(l).toContain("PromptPay");
    expect(l).not.toMatch(/Pix \(/);
    expect(l).toContain("never suggest sending anything by WhatsApp or LINE");
  });

  it("unknown country: nothing claimed", () => {
    expect(practiceLine(undefined)).toBe("");
  });
});

describe("the App Map states the corrected facts", () => {
  const text = appMapText();
  it("no automatic patient reminders; the reminders are the clinic's own phone", () => {
    expect(text).toContain("Patients get NO automatic appointment reminders");
    // The privacy text is live (whatsapp-auto-live) but the flag isn't (whatsapp-auto-on, 01 + cf,
    // 10-28): the map still says automatic WhatsApp is off, and offers no way to turn it on.
    expect(text).toContain("automatic WhatsApp messages are off");
    expect(text).not.toContain("automatic WhatsApp messages never include reminders");
    expect(text).not.toContain("about a minute after the practice books (confirms) or cancels their appointment");
  });

  it("the auto-WhatsApp rules follow whatsapp-auto-on (the flag), not the privacy text's whatsapp-auto-live", () => {
    const gate = (needle: string) => {
      const r = GENERAL.find((g) => ruleText(g.rule).includes(needle))?.rule;
      return typeof r === "string" || !r ? null : { pending: r.pending, until: r.until ?? [] };
    };
    expect(gate("automatic WhatsApp messages are off")).toEqual({ pending: [], until: ["whatsapp-auto-on"] });
    expect(gate("automatic WhatsApp messages never include reminders")).toEqual({ pending: ["whatsapp-auto-on"], until: [] });
    expect(gate("Brazilian practices can turn on automatic WhatsApp messages")).toEqual({ pending: ["whatsapp-auto-on"], until: [] });
    expect(gate("Automatic WhatsApp messages to patients (Brazilian practices) end with")).toEqual({ pending: ["whatsapp-auto-on", "whatsapp-optout-live"], until: [] });
    for (const g of GENERAL) {
      if (typeof g.rule !== "string") expect([...g.rule.pending, ...(g.rule.until ?? [])], ruleText(g.rule).slice(0, 60)).not.toContain("whatsapp-auto-live");
    }
  });
  it("the website can send the Pix message by WhatsApp", () => {
    expect(text).toContain("Never say the website can't send it.");
  });
  it("record templates are live with the 1.8.0 flip: the templates rule replaces \"no templates yet\"", () => {
    expect(text).not.toContain("There are no record or document templates yet");
    expect(text).toContain("Record templates (website, doctors only)");
  });
  it("the Founders Program page exists", () => {
    expect(text).toContain("/founders");
  });
});

describe("a model failure logs its status, type and the API's own reason (01, 10-22)", () => {
  it("an API error: the status, the type and the API's message (capped, quoted values cut), never the SDK error text", async () => {
    const { modelErrorSummary } = await import("@/lib/assistant/server/handle");
    const apiError = Object.assign(new Error("Your credit balance is too low (secret detail)"), {
      status: 400,
      error: { type: "error", error: { type: "invalid_request_error", message: "Your credit balance is too low to access the Anthropic API." } },
    });
    const s = modelErrorSummary(apiError);
    expect(s).toEqual({ status: 400, type: "invalid_request_error", message: "Your credit balance is too low to access the Anthropic API." });
    expect(JSON.stringify(s)).not.toContain("secret detail");
  });

  it("quoted values and anything key-like are cut; the message is capped at 300", async () => {
    const { modelErrorSummary } = await import("@/lib/assistant/server/handle");
    const err = (message: string) => ({ status: 400, error: { error: { type: "invalid_request_error", message } } });
    expect(modelErrorSummary(err(`messages.1.content: unexpected "Maria da Silva" in 'x' and \`y\``)).message).toBe("messages.1.content: unexpected … in … and …");
    expect(modelErrorSummary(err("bad key sk-ant-api03-abcDEF_123")).message).toBe("bad key …");
    expect(modelErrorSummary(err("x".repeat(500))).message).toHaveLength(300);
    expect(modelErrorSummary({ status: 500, error: { error: { type: "api_error" } } })).toEqual({ status: 500, type: "api_error" });
  });

  it("anything else: its class name", async () => {
    const { modelErrorSummary } = await import("@/lib/assistant/server/handle");
    expect(modelErrorSummary(new TypeError("x"))).toEqual({ status: null, type: "TypeError" });
    expect(modelErrorSummary(null)).toEqual({ status: null, type: "unknown" });
  });
});
