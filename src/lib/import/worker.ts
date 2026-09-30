// The import's file reader, off the main thread (a 20 MB sheet would freeze
// the page otherwise). Nothing here talks to the network.
import { readSpreadsheet } from "./readFile";

self.onmessage = (e: MessageEvent<{ bytes: ArrayBuffer; name: string; delimiters?: string[] }>) => {
  const { bytes, name, delimiters } = e.data;
  self.postMessage(readSpreadsheet(new Uint8Array(bytes), name, delimiters));
};
