import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

// Settings → Programa Fundadores (founders stage 2): the upload card.

vi.mock("next-intl", () => ({
  useTranslations: (ns: string) => {
    const t = (key: string, params?: Record<string, unknown>) => `${ns}.${key}${params ? JSON.stringify(params) : ""}`;
    return Object.assign(t, { rich: (key: string) => `${ns}.${key}` });
  },
}));
const upload = vi.hoisted(() => ({ calls: [] as unknown[][], error: null as unknown }));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    storage: { from: (bucket: string) => ({ uploadToSignedUrl: async (...a: unknown[]) => { upload.calls.push([bucket, ...a]); return { data: {}, error: upload.error }; } }) },
  }),
}));
vi.mock("@/lib/track", () => ({ track: vi.fn() }));

import { FoundersCard } from "@/app/[locale]/(site)/dashboard/settings/FoundersCard";

const fetchMock = vi.fn();
const json = (status: number, body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status }));

beforeEach(() => {
  upload.calls = []; upload.error = null;
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

const pick = (name = "export.csv", size = 100) => {
  const file = new File(["x".repeat(size)], name, { type: "text/csv" });
  fireEvent.change(screen.getByLabelText("foundersCard.upload"), { target: { files: [file] } });
  return file;
};
const button = () => screen.getByRole("button", { name: "foundersCard.upload" });
const confirm = () => fireEvent.click(screen.getByRole("checkbox"));

describe("FoundersCard", () => {
  it("instructions open until the first upload; the call link or the email line", () => {
    const { container, unmount } = render(<FoundersCard uploadsLeft={20} bookingUrl="https://cal.example/founders" />);
    expect(container.querySelector("details")).toHaveAttribute("open");
    expect(screen.getByRole("link", { name: "foundersCard.bookCall" })).toHaveAttribute("href", "https://cal.example/founders");
    unmount();
    const again = render(<FoundersCard uploadsLeft={19} />);
    expect(again.container.querySelector("details")).not.toHaveAttribute("open");
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("foundersCard.callByEmail")).toBeInTheDocument();
  });

  it("the upload needs a file and the confirmation each time", async () => {
    fetchMock
      .mockReturnValueOnce(json(200, { path: "u1/1-export.csv", token: "tok", contentType: "text/csv" }))
      .mockReturnValueOnce(json(200, { ok: true }));
    render(<FoundersCard uploadsLeft={20} />);
    expect(button()).toBeDisabled();
    const file = pick();
    expect(button()).toBeDisabled();
    confirm();
    fireEvent.click(button());
    await screen.findByText("foundersCard.success");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ fileName: "export.csv", size: 100, confirmed: true });
    expect(upload.calls).toEqual([["founder-samples", "u1/1-export.csv", "tok", file, { contentType: "text/csv" }]]);
    expect(fetchMock.mock.calls[1][0]).toBe("/api/founders/register");
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ path: "u1/1-export.csv", confirmed: true });
    expect(screen.getByText(/foundersCard.left{"n":19}/)).toBeInTheDocument();
    expect(screen.getByRole("checkbox")).not.toBeChecked();
    expect(button()).toBeDisabled();
  });

  it("checks type and size in the browser first", () => {
    render(<FoundersCard uploadsLeft={20} />);
    pick("scan.pdf");
    confirm();
    fireEvent.click(button());
    expect(screen.getByRole("alert")).toHaveTextContent("foundersCard.errType");
    pick("big.csv", 20 * 1024 * 1024 + 1);
    fireEvent.click(button());
    expect(screen.getByRole("alert")).toHaveTextContent("foundersCard.errSize");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows the server's refusals and doesn't count them", async () => {
    fetchMock.mockReturnValueOnce(json(429, { code: "daily_limit" }));
    render(<FoundersCard uploadsLeft={5} />);
    pick(); confirm(); fireEvent.click(button());
    expect(await screen.findByRole("alert")).toHaveTextContent("foundersCard.errDaily");
    expect(upload.calls).toEqual([]);

    fetchMock.mockReturnValueOnce(json(200, { path: "u1/1-export.csv", token: "tok", contentType: "text/csv" }));
    upload.error = { message: "network" };
    fireEvent.click(button());
    await waitFor(() => expect(upload.calls.length).toBe(1));
    expect(await screen.findByRole("alert")).toHaveTextContent("foundersCard.errGeneric");

    upload.error = null;
    fetchMock
      .mockReturnValueOnce(json(200, { path: "u1/2-export.csv", token: "tok", contentType: "text/csv" }))
      .mockReturnValueOnce(json(409, { code: "too_many_files" }));
    fireEvent.click(button());
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("foundersCard.errLimit"));
    expect(screen.getByText(/foundersCard.left{"n":5}/)).toBeInTheDocument();
  });

  it("no uploads left: the button is off and the limit line shows", () => {
    render(<FoundersCard uploadsLeft={0} />);
    pick(); confirm();
    expect(button()).toBeDisabled();
    expect(screen.getByText("foundersCard.errLimit")).toBeInTheDocument();
  });
});
