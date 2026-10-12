"use client";

import { useEffect } from "react";
import { flushPendingSignOut } from "@/lib/signOut";

// On every page: a sign-out made offline is completed on the server as soon
// as possible (lib/signOut). Renders nothing.
export function PendingSignOut() {
  useEffect(() => {
    void flushPendingSignOut();
    const onOnline = () => { void flushPendingSignOut(); };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, []);
  return null;
}
