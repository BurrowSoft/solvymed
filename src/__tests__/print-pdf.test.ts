import { afterEach, describe, expect, it, vi } from "vitest";
import { printPdf } from "@/lib/printPdf";

// The special control prescription's "Imprimir" (ad): the PDF loads in a
// hidden frame and the browser's print dialog opens on it; a browser that
// refuses gets the PDF in a new tab instead.

afterEach(() => { document.body.innerHTML = ""; vi.restoreAllMocks(); });

describe("printPdf", () => {
  it("a hidden frame with the PDF; print once it has loaded", () => {
    URL.createObjectURL = vi.fn(() => "blob:rx");
    URL.revokeObjectURL = vi.fn();
    expect(printPdf(new Uint8Array([37, 80, 68, 70]))).toBe("blob:rx");
    const frame = document.querySelector("iframe")!;
    expect(frame.getAttribute("src")).toBe("blob:rx");
    expect(frame.getAttribute("aria-hidden")).toBe("true");
    const print = vi.fn();
    const win = new EventTarget() as EventTarget & { focus: () => void; print: () => void };
    win.focus = vi.fn(); win.print = print;
    Object.defineProperty(frame, "contentWindow", { value: win });
    frame.onload!(new Event("load"));
    expect(print).toHaveBeenCalledTimes(1);
    // Gone once printing is done (0f).
    win.dispatchEvent(new Event("afterprint"));
    expect(document.querySelector("iframe")).toBeNull();
  });

  it("where the frame can't print, the PDF opens in a new tab", () => {
    URL.createObjectURL = vi.fn(() => "blob:rx");
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    printPdf(new Uint8Array([1]));
    const frame = document.querySelector("iframe")!;
    Object.defineProperty(frame, "contentWindow", { value: { addEventListener: vi.fn(), focus: vi.fn(), print: () => { throw new Error("blocked"); } } });
    frame.onload!(new Event("load"));
    expect(open).toHaveBeenCalledWith("blob:rx", "_blank", "noopener");
  });
});
