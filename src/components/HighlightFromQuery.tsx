"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { dropQueryParam } from "@/lib/dropQueryParam";

// ?highlight=<id> (after a SolvyAI save, specs/assistant.md §2.3): the row
// with data-highlight-id=<id> is scrolled into view and ringed for 3 s,
// then the parameter is dropped so a reload doesn't repeat it.
export function HighlightFromQuery() {
  const params = useSearchParams();
  const id = params.get("highlight");
  useEffect(() => {
    if (!id || !/^[A-Za-z0-9_-]{1,64}$/.test(id)) return;
    let el: HTMLElement | null = null;
    // The page may still be rendering its rows: look for a moment.
    let tries = 0;
    const find = setInterval(() => {
      el = document.querySelector<HTMLElement>(`[data-highlight-id="${id}"]`);
      if (el || ++tries > 20) {
        clearInterval(find);
        if (!el) { dropQueryParam("highlight"); return; }
        el.scrollIntoView?.({ block: "center" });
        el.classList.add("ring-2", "ring-teal-400", "ring-offset-2");
        setTimeout(() => { el?.classList.remove("ring-2", "ring-teal-400", "ring-offset-2"); dropQueryParam("highlight"); }, 3000);
      }
    }, 100);
    return () => clearInterval(find);
  }, [id]);
  return null;
}
