import type { AnswerChunk } from "@/lib/assistant/types";

// The released apps show an answer's text as it is: no markdown rendering
// (d1: SolvyAIPanel's plain <Text>), so "**Configurações → Equipe**" showed
// its asterisks (Vitor, 6 Oct). The prompt asks the app's answers for plain
// text; this is the safety net, on whole lines so a marker split across
// streamed pieces is never half-removed.

export function plainLine(line: string): string {
  return line
    .replace(/^(\s*)#{1,6}\s+/, "$1")                       // # headings
    .replace(/^(\s*)[-*+]\s+/, "$1• ")                      // - list items
    .replace(/\*\*(.+?)\*\*/g, "$1")                        // **bold**
    .replace(/__(.+?)__/g, "$1")                            // __bold__
    .replace(/(^|[^\w*])\*(?!\s)([^*\n]+?)\*(?!\w)/g, "$1$2") // *italic*
    .replace(/`([^`\n]+)`/g, "$1")                          // `code`
    .replace(/\[([^\]\n]+)\]\((?:[^)\s]+)\)/g, "$1");        // [text](url)
}

// The answer's text pieces, line by line through plainLine; anything else
// passes through after the text held so far.
export async function* plainForApp(chunks: AsyncIterable<AnswerChunk>): AsyncIterable<AnswerChunk> {
  let held = "";
  for await (const c of chunks) {
    if (c.kind === "delta") {
      held += c.text;
      const nl = held.lastIndexOf("\n");
      if (nl >= 0) {
        yield { kind: "delta", text: held.slice(0, nl + 1).split("\n").map(plainLine).join("\n") };
        held = held.slice(nl + 1);
      }
      continue;
    }
    if (held) { yield { kind: "delta", text: plainLine(held) }; held = ""; }
    yield c;
  }
  if (held) yield { kind: "delta", text: plainLine(held) };
}
