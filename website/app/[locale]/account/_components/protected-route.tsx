"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { defaultLocale, isValidLocale } from "@/i18n/config";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      // proxy.ts rewrites bare paths (/account/x) to /<defaultLocale>/account/x
      // internally, so usePathname can return either form. Treat the first
      // segment as the locale only when it's actually a valid one;
      // otherwise fall back to the default. Without this guard, navigating
      // from /account/security produces /account/account/login (because
      // split("/")[1] returns "account", not "en").
      const segment = pathname.split("/")[1] ?? "";
      const locale = isValidLocale(segment) ? segment : defaultLocale;
      router.replace(`/${locale}/account/login?redirect=${encodeURIComponent(pathname)}`);
    }
  }, [isLoading, isAuthenticated, router, pathname]);

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

  if (!isAuthenticated) return null;

  return <>{children}</>;
}
