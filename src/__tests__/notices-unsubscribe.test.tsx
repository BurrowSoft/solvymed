import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextRequest } from "next/server";
import { NextIntlClientProvider } from "next-intl";
import pt from "@/messages/pt-BR.json";

// The Patient Channel e-mails' "Não quero receber estes e-mails" (247, 01's
// approved strings, 10-27): opening the link only shows the button (a mail
// scanner's prefetch changes nothing); the click POSTs the token to
// pc_email_optout_confirm; a malformed link says so; any well-formed token
// gets the same confirmation.

const h = vi.hoisted(() => ({
  rpc: vi.fn(),
  params: new URLSearchParams(),
}));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ rpc: h.rpc }) }));
vi.mock("next/navigation", async (orig) => ({ ...(await orig<typeof import("next/navigation")>()), useSearchParams: () => h.params }));

import { allowUnsubscribe, isWellFormedToken, resetUnsubscribeLimit } from "@/lib/notices/unsubscribe";
import { POST } from "@/app/api/notices/unsubscribe/route";
import Page from "@/app/[locale]/(site)/notices/unsubscribe/page";

const TOKEN = "A".repeat(20) + "b-_" + "9".repeat(20); // 43 base64url characters
const post = (body: unknown, ip = "203.0.113.7") =>
  new NextRequest(new URL("/api/notices/unsubscribe", "https://www.solvymed.com"), {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
  });

describe("the token's shape (32 random bytes, base64url)", () => {
  it("accepts exactly 43 base64url characters, nothing else", () => {
    expect(TOKEN).toHaveLength(43);
    expect(isWellFormedToken(TOKEN)).toBe(true);
    for (const bad of [undefined, null, "", TOKEN.slice(1), TOKEN + "A", TOKEN.slice(1) + "=", TOKEN.slice(1) + "+", TOKEN.slice(1) + "/", 42]) {
      expect(isWellFormedToken(bad), String(bad)).toBe(false);
    }
  });
});

describe("the per-IP limit", () => {
  beforeEach(() => resetUnsubscribeLimit());

  it("20 tries per address per 10 minutes, each address on its own", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 20; i++) expect(allowUnsubscribe("198.51.100.1", t0 + i)).toBe(true);
    expect(allowUnsubscribe("198.51.100.1", t0 + 20)).toBe(false);
    expect(allowUnsubscribe("198.51.100.2", t0 + 20)).toBe(true);
    expect(allowUnsubscribe("198.51.100.1", t0 + 10 * 60 * 1000 + 1)).toBe(true);
  });
});

describe("POST /api/notices/unsubscribe", () => {
  beforeEach(() => {
    resetUnsubscribeLimit();
    h.rpc.mockReset();
    h.rpc.mockResolvedValue({ data: true, error: null });
  });

  it("a well-formed token calls pc_email_optout_confirm and answers ok", async () => {
    const res = await POST(post({ t: TOKEN }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(h.rpc).toHaveBeenCalledWith("pc_email_optout_confirm", { p_token: TOKEN });
  });

  it("a malformed or missing token: 400, the database never called", async () => {
    for (const body of [{ t: "short" }, {}, null]) {
      const res = await POST(post(body));
      expect(res.status).toBe(400);
    }
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("no usable IP, or over the limit: 429, the database not called", async () => {
    expect((await POST(post({ t: TOKEN }, "not an ip"))).status).toBe(429);
    for (let i = 0; i < 20; i++) await POST(post({ t: TOKEN }));
    h.rpc.mockClear();
    const res = await POST(post({ t: TOKEN }));
    expect(res.status).toBe(429);
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("the database didn't answer: 503 generic", async () => {
    h.rpc.mockResolvedValue({ data: null, error: { code: "PGRST202", message: "x" } });
    const res = await POST(post({ t: TOKEN }));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ code: "generic" });
  });
});

describe("the page", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  const show = (t: string | null) => {
    h.params = new URLSearchParams(t === null ? "" : `t=${t}`);
    return render(
      <NextIntlClientProvider locale="pt-BR" messages={pt}>
        <Page />
      </NextIntlClientProvider>,
    );
  };

  it("a malformed or missing link: the approved 'incomplete' line, no button", () => {
    for (const t of [null, "abc"]) {
      const { unmount } = show(t);
      expect(screen.getByTestId("unsubscribe-incomplete").textContent).toBe("Este link está incompleto. Abra o link do e-mail novamente.");
      expect(screen.queryByRole("button", { name: "Parar estes e-mails" })).toBeNull();
      unmount();
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("opening the link only shows the title, the lead and the button (nothing is sent)", () => {
    show(TOKEN);
    expect(screen.getByRole("heading", { name: "Parar e-mails do Canal do Paciente" })).toBeTruthy();
    expect(screen.getByText("Ao confirmar, você deixa de receber e-mails sobre respostas no Canal do Paciente. Os avisos no app continuam.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Parar estes e-mails" })).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("the click POSTs the token and shows the approved confirmation", async () => {
    fetchMock.mockResolvedValue({ ok: true });
    show(TOKEN);
    fireEvent.click(screen.getByRole("button", { name: "Parar estes e-mails" }));
    await waitFor(() => expect(screen.getByTestId("unsubscribe-done").textContent).toBe("Pronto. Você não receberá mais estes e-mails. As respostas continuam no app e no site."));
    expect(fetchMock).toHaveBeenCalledWith("/api/notices/unsubscribe", expect.objectContaining({ method: "POST", body: JSON.stringify({ t: TOKEN }) }));
  });

  it("a failure keeps the button and shows the generic error below it", async () => {
    fetchMock.mockResolvedValue({ ok: false });
    show(TOKEN);
    fireEvent.click(screen.getByRole("button", { name: "Parar estes e-mails" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe(pt.schedule.genericError));
    expect(screen.getByRole("button", { name: "Parar estes e-mails" })).toBeTruthy();
  });

  it("every locale has the five approved strings plus the error", async () => {
    const fs = await import("node:fs");
    for (const f of fs.readdirSync("src/messages")) {
      const m = JSON.parse(fs.readFileSync(`src/messages/${f}`, "utf8").replace(/^﻿/, ""));
      expect(Object.keys(m.noticesUnsubscribe ?? {}).sort(), f).toEqual(["button", "done", "error", "incomplete", "lead", "title"]);
    }
  });
});
