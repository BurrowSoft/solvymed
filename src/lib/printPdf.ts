// Prints a PDF made in the browser (ad, 1.8.0: the special control
// prescription is print-only, as in the app). The PDF loads in a hidden
// frame and the browser's print dialog opens on it; where a browser won't
// print a PDF frame, the PDF opens in a new tab to print from there.
// Returns the PDF's address for the card's "Abrir PDF" link; the caller
// revokes it when the link goes (URL.revokeObjectURL).
export function printPdf(bytes: Uint8Array): string {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
  // The frame goes once printing is done (0f), or after a minute.
  const removeFrame = () => frame.remove();
  frame.onload = () => {
    const win = frame.contentWindow;
    try {
      win?.addEventListener("afterprint", removeFrame, { once: true });
      win?.focus();
      win?.print();
    } catch {
      removeFrame();
      window.open(url, "_blank", "noopener");
    }
  };
  frame.src = url;
  document.body.appendChild(frame);
  setTimeout(removeFrame, 60_000);
  return url;
}
