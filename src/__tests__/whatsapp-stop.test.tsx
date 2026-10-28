import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextRequest } from "next/server";
import { NextIntlClientProvider } from "next-intl";
import pt from "@/messages/pt-BR.json";
import en from "@/messages/en.json";

// The stop link of the automatic WhatsApp messages to patients (contract v2,
// PC-W1′; 01's strings, 10-28): opening the link only shows the button (a link
// preview changes nothing); the click POSTs the token through /api/whatsapp/stop
// to the whatsapp-optout edge function, which answers only { ok }. The edge
// function is mocked here (it isn't live yet).

const h = vi.hoisted(() => ({ params: new URLSearchParams() }));
vi.mock("next/navigation", async (orig) => ({ ...(await orig<typeof import("next/navigation")>()), useSearchParams: () => h.params }));

import { allowStop, isWellFormedStopToken, optoutEndpoint, resetStopLimit } from "@/lib/whatsapp/stop";
import { POST } from "@/app/api/whatsapp/stop/route";
import Page from "@/app/[locale]/(site)/whatsapp/stop/page";

// Today's format: 74–81 bytes → 99–108 base64url characters (the mobile developer, 10-28).
const TOKEN = "AQ" + "x".repeat(80) + "-_" + "9".repeat(20); // 104
const post = (body: unknown, ip = "203.0.113.7") =>
  new NextRequest(new URL("/api/whatsapp/stop", "https://www.solvymed.com"), {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
  });
const reply = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

describe("the token's shape (base64url, no padding)", () => {
  it("accepts base64url within the length bounds, nothing else", () => {
    expect(isWellFormedStopToken(TOKEN)).toBe(true);
    expect(TOKEN).toHaveLength(104);
    expect(isWellFormedStopToken("A".repeat(99))).toBe(true);
    expect(isWellFormedStopToken("A".repeat(108))).toBe(true);
    for (const bad of [undefined, null, "", "short", "A".repeat(79), "A".repeat(201), TOKEN + "=", TOKEN.replace("x", "+"), TOKEN.replace("x", "/"), 42]) {
      expect(isWellFormedStopToken(bad), String(bad)).toBe(false);
    }
  });
});

describe("the per-IP limit", () => {
  beforeEach(() => resetStopLimit());

  it("20 tries per address per 10 minutes, each address on its own", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 20; i++) expect(allowStop("198.51.100.1", t0 + i)).toBe(true);
    expect(allowStop("198.51.100.1", t0 + 20)).toBe(false);
    expect(allowStop("198.51.100.2", t0 + 20)).toBe(true);
    expect(allowStop("198.51.100.1", t0 + 10 * 60 * 1000 + 1)).toBe(true);
  });
});

describe("POST /api/whatsapp/stop", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    resetStopLimit();
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(reply(200, { ok: true }));
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("posts only { t } to the whatsapp-optout function, with no apikey or Authorization, and answers its { ok }", async () => {
    const res = await POST(post({ t: TOKEN }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(optoutEndpoint()).toMatch(/\/functions\/v1\/whatsapp-optout$/);
    expect(fetchMock).toHaveBeenCalledWith(optoutEndpoint(), expect.objectContaining({ method: "POST", body: JSON.stringify({ t: TOKEN }) }));
    expect(fetchMock.mock.calls[0][1].headers).toEqual({ "content-type": "application/json" });
  });

  it("the function refuses the token: { ok: false }, nothing else passed on", async () => {
    fetchMock.mockResolvedValue(reply(200, { ok: false, extra: "never" }));
    const res = await POST(post({ t: TOKEN }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: false });
  });

  it("a malformed or missing token: the same { ok: false }, the function never called", async () => {
    for (const body of [{ t: "short" }, {}, null]) {
      const res = await POST(post(body));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: false });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("no usable IP, or over the limit: 429, the function not called", async () => {
    expect((await POST(post({ t: TOKEN }, "not an ip"))).status).toBe(429);
    for (let i = 0; i < 20; i++) await POST(post({ t: TOKEN }));
    fetchMock.mockClear();
    const res = await POST(post({ t: TOKEN }));
    expect(res.status).toBe(429);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("a gateway error, a body without { ok }, or no answer at all: 503 generic", async () => {
    for (const m of [
      () => fetchMock.mockResolvedValue(reply(500, { code: "x" })),
      () => fetchMock.mockResolvedValue(reply(200, { nope: 1 })),
      () => fetchMock.mockRejectedValue(new Error("timeout")),
    ]) {
      m();
      const res = await POST(post({ t: TOKEN }));
      expect(res.status).toBe(503);
      expect(await res.json()).toEqual({ code: "generic" });
    }
  });
});

describe("the page", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  const show = (t: string | null, messages: typeof pt = pt, locale = "pt-BR") => {
    h.params = new URLSearchParams(t === null ? "" : `t=${t}`);
    return render(
      <NextIntlClientProvider locale={locale} messages={messages}>
        <Page />
      </NextIntlClientProvider>,
    );
  };
  const BUTTON = "Parar estas mensagens";

  it("a malformed or missing link: the neutral line, no button, nothing sent", () => {
    for (const t of [null, "abc"]) {
      const { unmount } = show(t);
      expect(screen.getByTestId("whatsapp-stop-invalid").textContent).toBe("Este link não funcionou. Confira se você abriu o link completo da mensagem do WhatsApp.");
      expect(screen.queryByRole("button", { name: BUTTON })).toBeNull();
      unmount();
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("opening the link (GET) only shows the title, the lead and the button: nothing is sent", () => {
    show(TOKEN);
    expect(screen.getByRole("heading", { name: "Parar as mensagens automáticas pelo WhatsApp" })).toBeTruthy();
    expect(screen.getByText("Se você confirmar, vai deixar de receber as mensagens automáticas deste consultório pelo WhatsApp.")).toBeTruthy();
    expect(screen.getByRole("button", { name: BUTTON })).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("the click POSTs the token and shows the approved confirmation (in the link's language)", async () => {
    fetchMock.mockResolvedValue(reply(200, { ok: true }));
    show(TOKEN);
    fireEvent.click(screen.getByRole("button", { name: BUTTON }));
    await waitFor(() => expect(screen.getByTestId("whatsapp-stop-done").textContent).toBe("Pronto. Você não vai mais receber mensagens automáticas deste consultório pelo WhatsApp."));
    expect(fetchMock).toHaveBeenCalledWith("/api/whatsapp/stop", expect.objectContaining({ method: "POST", body: JSON.stringify({ t: TOKEN }) }));

    fetchMock.mockClear();
    const { unmount } = show(TOKEN, en as unknown as typeof pt, "en");
    fireEvent.click(screen.getByRole("button", { name: "Stop these messages" }));
    await waitFor(() => expect(screen.getAllByTestId("whatsapp-stop-done").some((e) => e.textContent === "Done. You won't get automatic WhatsApp messages from this practice anymore.")).toBe(true));
    unmount();
  });

  it("{ ok: false } from the function: the neutral line, the button gone", async () => {
    fetchMock.mockResolvedValue(reply(200, { ok: false }));
    show(TOKEN);
    fireEvent.click(screen.getByRole("button", { name: BUTTON }));
    await waitFor(() => expect(screen.getByTestId("whatsapp-stop-invalid")).toBeTruthy());
    expect(screen.queryByRole("button", { name: BUTTON })).toBeNull();
  });

  it("a failure (429 / 503 / network) keeps the button and shows the generic error below it", async () => {
    for (const m of [() => fetchMock.mockResolvedValue(reply(503, { code: "generic" })), () => fetchMock.mockResolvedValue(reply(429, { code: "rate_limited" })), () => fetchMock.mockRejectedValue(new Error("offline"))]) {
      m();
      const { unmount } = show(TOKEN);
      fireEvent.click(screen.getByRole("button", { name: BUTTON }));
      await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Algo deu errado. Tente novamente."));
      expect(screen.getByRole("button", { name: BUTTON })).toBeTruthy();
      unmount();
    }
  });

  it("every locale has the six strings; error is that locale's noticesUnsubscribe.error", async () => {
    const fs = await import("node:fs");
    for (const f of fs.readdirSync("src/messages")) {
      const m = JSON.parse(fs.readFileSync(`src/messages/${f}`, "utf8").replace(/^﻿/, ""));
      expect(Object.keys(m.whatsappStop ?? {}).sort(), f).toEqual(["button", "done", "error", "invalid", "lead", "title"]);
      expect(m.whatsappStop.error, f).toBe(m.noticesUnsubscribe.error);
    }
  });

  it("the layout keeps the page out of search and the token out of the Referer", async () => {
    const { metadata } = await import("@/app/[locale]/(site)/whatsapp/stop/layout");
    expect(metadata).toMatchObject({ robots: { index: false, follow: false }, referrer: "no-referrer" });
  });
});
