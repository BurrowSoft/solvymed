import { describe, expect, it } from "vitest";
import { countryProfile, messagingChannel } from "@/lib/country";
import { liveFeatures } from "@/lib/liveFeatures";

// Item 12 (Vitor; the app's #230): messaging follows the practice country.
// WhatsApp in Brazil and by default; LINE in Thailand once live, none until
// then, so a Thai practice sees no WhatsApp item (Settings → Team's share).

describe("messagingChannel", () => {
  it("WhatsApp in Brazil and for the explicit default", () => {
    expect(messagingChannel(countryProfile("BR"))).toBe("whatsapp");
    expect(messagingChannel(countryProfile("US"))).toBe("whatsapp");
    expect(messagingChannel(countryProfile("ZZ"))).toBe("whatsapp");
  });

  it("Thailand: LINE only once it's live, else none", () => {
    expect(countryProfile("TH").messagingApp).toBe("line");
    expect(messagingChannel(countryProfile("TH"))).toBe(liveFeatures.lineReminders ? "line" : null);
    expect(messagingChannel(countryProfile("TH"))).not.toBe("whatsapp");
  });
});
