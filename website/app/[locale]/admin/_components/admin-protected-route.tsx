"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { defaultLocale, isValidLocale } from "@/i18n/config";

export function AdminProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isStaff, isLoading, user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  // 2FA enforcement for staff accounts. The server-side IsStaffWithMfa
  // permission is the actual gate (admin API returns 403 mfa_required);
  // this redirect is purely UX so the user sees the setup wizard
  // instead of API errors. mfa_required is true only for staff who
  // haven't yet enrolled.
  const needsMfaSetup = user?.mfa_required === true;

  useEffect(() => {
    if (isLoading) return;
    // See ProtectedRoute for why we can't trust split("/")[1] as the
    // locale — proxy.ts rewrites bare paths internally and usePathname
    // can return either form. Validate before using.
    const segment = pathname.split("/")[1] ?? "";
    const locale = isValidLocale(segment) ? segment : defaultLocale;
    if (!isAuthenticated) {
      router.replace(`/${locale}/account/login?redirect=${encodeURIComponent(pathname)}`);
    } else if (!isStaff) {
      router.replace(`/${locale}/account`);
    } else if (needsMfaSetup) {
      router.replace(`/${locale}/account/security/setup?reason=admin_required`);
    }
  }, [isLoading, isAuthenticated, isStaff, needsMfaSetup, router, pathname]);

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div
          className="h-8 w-8 animate-spin rounded-full"
          style={{ border: "2px solid var(--bg-border)", borderTopColor: "var(--gold)" }}
        />
      </div>
    );
  }

  if (!isAuthenticated || !isStaff || needsMfaSetup) return null;

  return <>{children}</>;
}
