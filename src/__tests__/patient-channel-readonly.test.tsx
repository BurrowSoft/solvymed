// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import pt from "@/messages/pt-BR.json";

// 01, 10-26: when the doctor's channel isn't taking new messages (their own switch off, or
// the patient no longer connected) and the patient has requests there, the card offers
// "Ver minhas mensagens" and the channel is read-only. The platform-wide switch is the
// emergency stop (callers check it first). A closed practice / archived patient: nothing
// here (the page keeps "não disponível").

vi.mock("server-only", () => ({}));
const { channelEntry, myRequestsWith } = await import("@/lib/patientChannel/practice");
const { ReadOnlyChannel } = await import("@/app/[locale]/(site)/my-appointments/channel/[professionalId]/ReadOnlyChannel");

const ROW = { id: "q1", status: "answered", reasonTitle: "Receita", option: null, text: "Preciso da receita", replyText: "Enviada por e-mail.", repliedAt: "2026-10-26T13:00:00Z", createdAt: "2026-10-26T10:00:00Z" };
const db = (pageError: string | null, rows: unknown[]) => ({
  rpc: async (fn: string) => fn === "pc_patient_page"
    ? (pageError ? { data: null, error: { message: pageError } } : { data: {}, error: null })
    : { data: rows, error: null },
}) as never;

describe("channelEntry", () => {
  it("open; view when off or no longer connected WITH requests; nothing otherwise", async () => {
    expect(await channelEntry(db(null, []), "d1")).toBe("open");
    expect(await channelEntry(db("channel_off", [ROW]), "d1")).toBe("view");
    expect(await channelEntry(db("not_connected", [ROW]), "d1")).toBe("view");
    expect(await channelEntry(db("channel_off", []), "d1")).toBeNull();
    // A closed practice / archived patient: not this case (the page says "não disponível").
    expect(await channelEntry(db("pc_practice_closed", [ROW]), "d1")).toBeNull();
    expect(await channelEntry(db("pc_patient_archived", [ROW]), "d1")).toBeNull();
  });

  it("myRequestsWith: the rows, or [] on a failed read", async () => {
    expect((await myRequestsWith(db(null, [ROW]), "d1")).map((r) => r.id)).toEqual(["q1"]);
    const failing = { rpc: async () => ({ data: null, error: { message: "x" } }) } as never;
    expect(await myRequestsWith(failing, "d1")).toEqual([]);
  });
});

describe("the read-only channel", () => {
  it("the not-taking line, the emergency line, the requests with the reply; no form", () => {
    render(
      <NextIntlClientProvider locale="pt-BR" messages={pt}>
        <ReadOnlyChannel doctorName="Dra. Ana" practiceLine="Clínica" emergencyNumber="192" country="BR" timeZone="America/Sao_Paulo"
          requests={[{ ...ROW, status: "answered" as const }]} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByTestId("pc-read-only-note")).toHaveTextContent(pt.patientChannel.patient.notTaking);
    expect(screen.getByTestId("pc-read-only")).toHaveTextContent(pt.patientChannel.patient.urgentCall.replace("{number}", "192"));
    expect(screen.getByTestId("pc-my-request-reply")).toHaveTextContent("Enviada por e-mail.");
    expect(screen.queryByTestId("pc-start")).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
  });
});
