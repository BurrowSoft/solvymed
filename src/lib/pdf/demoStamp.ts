import { PDFDocument, degrees, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";

// Demo mode (specs/demo-mode.md, Vitor's must "it's a DEMO"): every PDF made
// in the demo gets a large diagonal "DEMO" across each page and a footer line
// ("Documento de demonstração, sem validade"), stamped on the finished
// document so every layout (Studio, classic, the controlled prescription)
// gets it the same way. The footer is drawn in the document's own font, so
// Thai and Latin both render. Real accounts never pass through here.
export const DEMO_STAMP_TEXT = "DEMO";

export async function stampDemo(bytes: Uint8Array, footer: string, fontBytes: Uint8Array): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(bytes);
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(fontBytes, { subset: true });
  const amber = rgb(245 / 255, 158 / 255, 11 / 255);
  const ink = rgb(138 / 255, 106 / 255, 27 / 255);
  for (const page of pdf.getPages()) {
    const { width, height } = page.getSize();
    const size = Math.min(width, height) / 3.2;
    const textWidth = font.widthOfTextAtSize(DEMO_STAMP_TEXT, size);
    // Centred, rotated -30°: the text's own centre on the page's centre.
    const angle = (-30 * Math.PI) / 180;
    const cx = width / 2 - (Math.cos(angle) * textWidth) / 2 + (Math.sin(angle) * size) / 3;
    const cy = height / 2 - (Math.sin(angle) * textWidth) / 2 - (Math.cos(angle) * size) / 3;
    page.drawText(DEMO_STAMP_TEXT, { x: cx, y: cy, size, font, color: amber, opacity: 0.18, rotate: degrees(-30) });
    const footSize = 8;
    const footWidth = font.widthOfTextAtSize(footer, footSize);
    page.drawText(footer, { x: Math.max(12, (width - footWidth) / 2), y: 10, size: footSize, font, color: ink });
  }
  return pdf.save();
}
