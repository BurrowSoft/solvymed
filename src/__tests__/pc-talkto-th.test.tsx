import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import th from "@/messages/th.json";
import { SAMPLE_PAGE, samplePreview, sampleSubmit } from "@/lib/patientChannel/patientPage";
import { PatientChannelFlow } from "@/components/patientChannel/PatientChannelFlow";

// 01 (10-29, WT1): the channel page's heading "ติดต่อ{doctor}" follows the entry button's rule
// (afterThai, the app's #628): a Thai name attached, a Latin name after a space.
describe("the channel heading in th", () => {
  const heading = (doctorName: string) => {
    const { unmount } = render(
      <NextIntlClientProvider locale="th" messages={th}>
        <PatientChannelFlow page={{ ...SAMPLE_PAGE, doctorName }} preview={samplePreview()} submit={sampleSubmit()} />
      </NextIntlClientProvider>,
    );
    const text = screen.getByRole("heading", { level: 2 }).textContent;
    unmount();
    return text;
  };
  it("a Thai name stays attached; a Latin one gets a space", () => {
    expect(heading("ศ.นพ.สมชาย ใจดี")).toBe("ติดต่อศ.นพ.สมชาย ใจดี");
    expect(heading("Dra. Ana Lima")).toBe("ติดต่อ Dra. Ana Lima");
  });
});
