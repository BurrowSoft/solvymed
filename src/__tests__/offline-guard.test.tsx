import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "@/messages/en.json";
import { blockedTarget, blocksWhenOffline, installOfflineFetchGuard, OfflineBlockedError } from "@/lib/offline";
import { OfflineGuard } from "@/components/OfflineGuard";

// The offline guard (specs/offline-guard.md, 1.9.0): offline → no request,
// the banner, blocked controls, and typed work kept.

const ORIGIN = "https://www.solvymed.com";
const SB = "https://abc.supabase.co";

function setOnline(v: boolean) {
  Object.defineProperty(window.navigator, "onLine", { configurable: true, get: () => v });
  window.dispatchEvent(new Event(v ? "online" : "offline"));
}

describe("which requests the fetch layer blocks offline", () => {
  it.each([
    ["a server action (POST, own origin)", [`${ORIGIN}/dashboard/patients/1`, { method: "POST", headers: { "Next-Action": "x" } }], true],
    ["a relative POST (/api)", ["/api/checkout/stripe", { method: "POST" }], true],
    ["a PATCH to Supabase REST", [`${SB}/rest/v1/patients?id=eq.1`, { method: "PATCH" }], true],
    ["an RPC to Supabase (POST)", [`${SB}/rest/v1/rpc/log_record_access`, { method: "POST" }], true],
    ["a storage upload (PUT)", [`${SB}/storage/v1/object/patient-files/a`, { method: "PUT" }], true],
    ["a Request object with POST", [new Request(`${ORIGIN}/x`, { method: "POST" })], true],
    ["a GET to our own origin (navigation data)", [`${ORIGIN}/dashboard`], false],
    ["a GET to Supabase (a read)", [`${SB}/rest/v1/patients`], false],
    ["signing out (this browser's session)", [`${SB}/auth/v1/logout`, { method: "POST" }], false],
    ["another site", ["https://example.invalid/x", { method: "POST" }], false],
  ])("%s", (_, args, blocked) => {
    expect(blocksWhenOffline(args as [RequestInfo, RequestInit?], ORIGIN, SB)).toBe(blocked);
  });
});

describe("the fetch layer", () => {
  let base: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    base = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", base);
  });
  afterEach(() => {
    setOnline(true);
    vi.unstubAllGlobals();
  });

  it("offline: a POST is refused before it is sent, like a network error; a GET goes", async () => {
    const off = installOfflineFetchGuard(SB);
    setOnline(false);
    await expect(window.fetch("/api/x", { method: "POST" })).rejects.toBeInstanceOf(OfflineBlockedError);
    await expect(window.fetch("/api/x", { method: "POST" })).rejects.toBeInstanceOf(TypeError);
    expect(base).not.toHaveBeenCalled();
    await window.fetch("/dashboard");
    expect(base).toHaveBeenCalledTimes(1);
    off();
    expect(window.fetch).toBe(base);
  });

  it("online: everything goes through", async () => {
    const off = installOfflineFetchGuard(SB);
    setOnline(true);
    await window.fetch("/api/x", { method: "POST" });
    expect(base).toHaveBeenCalledTimes(1);
    off();
  });
});

describe("the visual layer's targets", () => {
  it("submit buttons and [data-server] controls, unless opted out", () => {
    document.body.innerHTML = `
      <button id="s" type="submit"><span id="in-s">Save</span></button>
      <button id="d" data-server>Share</button>
      <button id="plain" type="button">Open dialog</button>
      <div data-offline-ok><button id="ok" type="submit">Search</button></div>`;
    const q = (id: string) => document.getElementById(id);
    expect(blockedTarget(q("in-s"))).toBe(q("s"));
    expect(blockedTarget(q("d"))).toBe(q("d"));
    expect(blockedTarget(q("plain"))).toBeNull();
    expect(blockedTarget(q("ok"))).toBeNull();
    document.body.innerHTML = "";
  });
});

describe("OfflineGuard", () => {
  afterEach(() => setOnline(true));

  function mount() {
    const onShare = vi.fn();
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
    const onPlain = vi.fn();
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <OfflineGuard />
        <form onSubmit={onSubmit}>
          <input aria-label="name" defaultValue="" />
          <button type="submit">Save</button>
        </form>
        <button data-server onClick={onShare}>Share</button>
        <button type="button" onClick={onPlain}>Close</button>
      </NextIntlClientProvider>,
    );
    return { onShare, onSubmit, onPlain };
  }

  it("offline: the banner, blocked actions, kept text; back online: no banner, actions run", () => {
    const { onShare, onSubmit, onPlain } = mount();
    expect(screen.queryByTestId("offline-banner")).toBeNull();

    act(() => setOnline(false));
    expect(screen.getByTestId("offline-banner").textContent).toContain("No internet connection. You can view what's open, but changes won't be saved.");
    expect(document.documentElement.dataset.offline).toBe("1");
    // A notice, not a control: clicks pass through to the header under it.
    expect(screen.getByTestId("offline-banner").className).toContain("pointer-events-none");
    expect(screen.getByTestId("offline-banner").querySelector("p")?.className).toContain("pointer-events-none");

    const input = screen.getByLabelText("name") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Maria" } });
    fireEvent.click(screen.getByText("Save"));
    fireEvent.submit(input.form!);
    fireEvent.click(screen.getByText("Share"));
    fireEvent.click(screen.getByText("Close"));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(onShare).not.toHaveBeenCalled();
    // A control that doesn't need the server still works.
    expect(onPlain).toHaveBeenCalledTimes(1);
    // The typed text is still there, and a tap repeats the message.
    expect(input.value).toBe("Maria");
    expect(screen.getByRole("alert").textContent).toContain("No internet connection");

    act(() => setOnline(true));
    expect(screen.queryByTestId("offline-banner")).toBeNull();
    expect(document.documentElement.dataset.offline).toBeUndefined();
    fireEvent.click(screen.getByText("Share"));
    fireEvent.submit(input.form!);
    expect(onShare).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  // Screen readers (01, 10-15): aria-disabled on the blocked controls while
  // offline, and one announcement from a live region that is always there.
  it("offline: the blocked controls say aria-disabled, a control's own is kept; back online: restored", async () => {
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <OfflineGuard />
        <button type="submit">Save</button>
        <button data-server>Share</button>
        <button type="button">Close</button>
        <button data-server aria-disabled="false">Own</button>
        <div data-offline-ok><button type="submit">Search</button></div>
      </NextIntlClientProvider>,
    );
    const btn = (name: string) => screen.getByText(name);
    const announcer = screen.getByTestId("offline-announcer");
    // Always on the page, a polite live region, empty while online.
    expect(announcer.getAttribute("aria-live")).toBe("polite");
    expect(announcer.textContent).toBe("");
    expect(btn("Save").hasAttribute("aria-disabled")).toBe(false);

    act(() => setOnline(false));
    expect(announcer.textContent).toContain("No internet connection");
    expect(btn("Save").getAttribute("aria-disabled")).toBe("true");
    expect(btn("Share").getAttribute("aria-disabled")).toBe("true");
    expect(btn("Close").hasAttribute("aria-disabled")).toBe(false);
    expect(btn("Search").hasAttribute("aria-disabled")).toBe(false);
    expect(btn("Own").getAttribute("aria-disabled")).toBe("false");
    // The visible banner isn't a second live region.
    expect(screen.getByTestId("offline-banner").hasAttribute("aria-live")).toBe(false);

    // A control that appears while offline is marked too.
    const late = document.createElement("button");
    late.setAttribute("data-server", "");
    late.textContent = "Late";
    act(() => { document.body.appendChild(late); });
    await act(async () => { await Promise.resolve(); });
    expect(late.getAttribute("aria-disabled")).toBe("true");

    act(() => setOnline(true));
    expect(announcer.textContent).toBe("");
    for (const n of ["Save", "Share"]) expect(btn(n).hasAttribute("aria-disabled")).toBe(false);
    expect(late.hasAttribute("aria-disabled")).toBe(false);
    expect(btn("Own").getAttribute("aria-disabled")).toBe("false");
    late.remove();
  });

  it("has the banner text in every language", async () => {
    const { readdirSync, readFileSync } = await import("node:fs");
    for (const f of readdirSync("src/messages")) {
      const m = JSON.parse(readFileSync(`src/messages/${f}`, "utf8").replace(/^﻿/, ""));
      expect(typeof m.offline?.banner, f).toBe("string");
    }
  });
});
