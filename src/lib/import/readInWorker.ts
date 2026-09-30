// Reads the chosen file in a Web Worker (the page stays responsive on a big
// sheet); where workers aren't available (tests, old browsers) it reads on
// the main thread. Either way the file stays in the browser.
import { readSpreadsheet, type ReadResult } from "./readFile";

export async function readInWorker(file: File, delimiters?: string[]): Promise<ReadResult> {
  const bytes = await file.arrayBuffer();
  if (typeof Worker === "undefined") return readSpreadsheet(new Uint8Array(bytes), file.name, delimiters);
  return new Promise<ReadResult>((resolve) => {
    const worker = new Worker(new URL("./worker.ts", import.meta.url));
    const done = (r: ReadResult) => { worker.terminate(); resolve(r); };
    worker.onmessage = (e: MessageEvent<ReadResult>) => done(e.data);
    worker.onerror = () => done({ ok: false, error: "unreadable" });
    worker.postMessage({ bytes, name: file.name, delimiters }, [bytes]);
  });
}
