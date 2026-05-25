"use client";

import { useEffect, useState } from "react";
import Script from "next/script";

import {
  CONSENT_CHANGED_EVENT,
  getClarityConsent,
  getClarityProjectId,
} from "@/lib/clarity";

/**
 * Loads the Microsoft Clarity tag — but only after the user has
 * explicitly consented via the cookie notice. The tag is the official
 * snippet from learn.microsoft.com/en-us/clarity/setup-and-installation,
 * loaded with `next/script` strategy="afterInteractive" so it never
 * blocks first paint.
 *
 * When the cookie notice flips consent we re-read the localStorage key
 * via a custom event and mount/unmount the <Script>. A user who
 * accepts mid-session sees Clarity start recording from that point
 * onward; a user who later revokes will stop sending NEW events on
 * the next page load (Clarity has no clean runtime stop API).
 */
export function ClarityScript() {
  const [accepted, setAccepted] = useState(false);
  const projectId = getClarityProjectId();

  useEffect(() => {
    setAccepted(getClarityConsent() === "all");

    function onChange() {
      setAccepted(getClarityConsent() === "all");
    }
    window.addEventListener(CONSENT_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(CONSENT_CHANGED_EVENT, onChange);
  }, []);

  if (!projectId || !accepted) return null;

  return (
    <Script id="ms-clarity" strategy="afterInteractive">
      {`(function(c,l,a,r,i,t,y){
c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
})(window, document, "clarity", "script", "${projectId}");`}
    </Script>
  );
}
