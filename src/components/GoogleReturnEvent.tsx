"use client";

import { useEffect } from "react";
import { GOOGLE_RETURN_PARAM } from "@/lib/googleSignIn";
import { track } from "@/lib/track";

// signup_google_return {kind}: once per page load that the Google callback
// marked (?gr=new → "Complete your account"; ?gr=existing → an account that
// already existed). track() sends only with analytics consent. Renders nothing.
let reported = false;

export function GoogleReturnEvent() {
  useEffect(() => {
    if (reported) return;
    const kind = new URLSearchParams(location.search).get(GOOGLE_RETURN_PARAM);
    if (kind !== "new" && kind !== "existing") return;
    reported = true;
    track("signup_google_return", { kind });
  }, []);
  return null;
}
