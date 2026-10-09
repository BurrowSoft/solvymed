// @vitest-environment node
import { describe, expect, it } from "vitest";
import { practiceLine } from "@/lib/assistant/server/handle";
import { appMapText } from "@/lib/solvyai/app-map";

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
    expect(text).toContain("Patients get NO automatic appointment reminders today");
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

describe("a model failure logs only its status and type", () => {
  it("an API error: the status and the API's error type, never the message", async () => {
    const { modelErrorSummary } = await import("@/lib/assistant/server/handle");
    const apiError = Object.assign(new Error("Your credit balance is too low (secret detail)"), {
      status: 400,
      error: { type: "error", error: { type: "invalid_request_error", message: "Your credit balance is too low" } },
    });
    const s = modelErrorSummary(apiError);
    expect(s).toEqual({ status: 400, type: "invalid_request_error" });
    expect(JSON.stringify(s)).not.toContain("credit");
  });

  it("anything else: its class name", async () => {
    const { modelErrorSummary } = await import("@/lib/assistant/server/handle");
    expect(modelErrorSummary(new TypeError("x"))).toEqual({ status: null, type: "TypeError" });
    expect(modelErrorSummary(null)).toEqual({ status: null, type: "unknown" });
  });
});
