"use client";

import { useEffect, useState } from "react";

// Right after closing or deleting the account (Settings → "/?closed=1" or
// "/?deleted=1"): a short note saying which happened (UX). Read in the
// browser, after load, so the landing page stays static.
export function AccountClosedNotice({ closed, deleted }: { closed: string; deleted: string }) {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    setText(q.get("deleted") === "1" ? deleted : q.get("closed") === "1" ? closed : null);
  }, [closed, deleted]);
  if (!text) return null;
  return (
    <div role="status" className="bg-slate-100 px-4 py-3 text-center text-sm font-medium text-slate-800">
      {text}
    </div>
  );
}
