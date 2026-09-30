import type { AnswerBlock } from "./types";

// An assistant turn as history text: what the user saw. A list or a time
// choice comes with no text (UX), and an empty turn isn't sent, so without
// this the next message (the tapped option) would go alone and the model
// would lose the request it answers (3e/d7: "O que você gostaria de fazer
// com esse cadastro?").
export function answerText(blocks: AnswerBlock[]): string {
  const parts = blocks.map((b) => {
    switch (b.type) {
      case "text": return b.text;
      case "steps": return b.items.join(" ");
      case "pick": return `${b.question} ${b.options.map((o) => o.title).join("; ")}`;
      case "slot_choice": return b.text;
      case "card": return b.card.title;
      default: return "";
    }
  });
  return parts.map((p) => p.trim()).filter(Boolean).join(" ").slice(0, 1000);
}
