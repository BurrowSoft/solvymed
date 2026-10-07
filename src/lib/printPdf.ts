// Prints a PDF made in the browser (ad, 1.8.0: the special control
// prescription is print-only, as in the app). The PDF loads in a hidden
// frame and the browser's print dialog opens on it; where a browser won't
// print a PDF frame, the PDF opens in a new tab to print from there.
export function printPdf(bytes: Uint8Array): void {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
  const fallback = () => { window.open(url, "_blank", "noopener"); };
  frame.onload = () => {
    try {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
    } catch {
      fallback();
    }
  };
  frame.src = url;
  document.body.appendChild(frame);
  // The print dialog holds the frame while it's open; clean up well after.
  setTimeout(() => { frame.remove(); URL.revokeObjectURL(url); }, 60_000);
}
