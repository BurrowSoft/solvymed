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
  it("no templates while record templates are hidden", () => {
    expect(text).toContain("There are no record or document templates yet");
  });
  it("the Founders Program page exists", () => {
    expect(text).toContain("/founders");
  });
});
