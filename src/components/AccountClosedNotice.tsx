"use client";

import { useEffect, useState } from "react";

// Right after closing or deleting the account (Settings → "/?closed=1" or
// "/?deleted=1"), or after cancelling a pending Google sign-up ("/?signup_cancelled=1",
// 242, B4 F3): a short note saying which happened (UX). Read in the browser,
// after load, so the landing page stays static.
export function AccountClosedNotice({ closed, deleted, cancelled }: { closed: string; deleted: string; cancelled?: string }) {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    setText(q.get("deleted") === "1" ? deleted : q.get("closed") === "1" ? closed : q.get("signup_cancelled") === "1" && cancelled ? cancelled : null);
  }, [closed, deleted, cancelled]);
  if (!text) return null;
  return (
    <div role="status" className="bg-slate-100 px-4 py-3 text-center text-sm font-medium text-slate-800">
      {text}
    </div>
  );
}
