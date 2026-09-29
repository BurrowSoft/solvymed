"use client";

import { useEffect } from "react";
import { track } from "@/lib/track";

// founders_page_view (consent-gated like every event: lib/track).
export function FoundersPageView({ locale }: { locale: string }) {
  useEffect(() => {
    track("founders_page_view", { locale });
  }, [locale]);
  return null;
}
