import type { Metadata } from "next";
import { EmailVerificationBanner } from "./_components/email-verification-banner";

/**
 * All /account/* pages are per-customer and should never be indexed.
 * Setting `robots` here propagates to every child route, so we don't
 * have to remember to add it to every individual page.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Persistent verification reminder across every account page. The
          banner renders nothing for verified users, so it's safe to always
          mount here without conditional logic in child pages. */}
      <EmailVerificationBanner />
      {children}
    </>
  );
}
