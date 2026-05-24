"use client";

import Link from "next/link";
import Image from "next/image";
import { ArrowUpRight, Download } from "lucide-react";
import { useSiteLegal } from "@/hooks/use-site-legal";
import {
  openInstallPrompt,
  triggerNativePrompt,
  usePwaInstall,
} from "@/lib/pwa-install";
import { PaymentMethodsStrip } from "@/components/storefront/payment-methods-strip";

interface FooterProps {
  dict: {
    shop: string;
    company: string;
    legal: string;
    about: string;
    contact: string;
    privacy: string;
    terms: string;
    cookies: string;
    copyright: string;
    tagline: string;
  };
  navDict: {
    products: string;
    categories: string;
    brands: string;
  };
}

export function Footer({ dict, navDict }: FooterProps) {
  const currentYear = new Date().getFullYear();
  // Companies Act 2006 s.82 — Ltd companies must publish their registered
  // identity on the website. Surfaced once via the public /site/legal/
  // endpoint and rendered in the footer (visible on every page).
  const legal = useSiteLegal();
  // PWA install — show only when the browser can actually install. Hides
  // for users on Firefox desktop, already-installed apps, etc.
  const { canInstall, isIosSafari, isInstalled } = usePwaInstall();
  const canShowInstallLink = !isInstalled && (canInstall || isIosSafari);

  async function handleInstallClick() {
    if (canInstall) {
      // Chrome / Edge / Brave — go straight to the native install dialog
      await triggerNativePrompt();
    } else if (isIosSafari) {
      // iOS Safari has no install event — reopen the popup so the user
      // sees the "Share → Add to Home Screen" instructions again.
      openInstallPrompt();
    }
  }

  const columns = [
    {
      title: dict.shop,
      links: [
        { label: navDict.products, href: "/products" },
        { label: navDict.categories, href: "/categories" },
        { label: navDict.brands, href: "/brands" },
      ],
    },
    {
      title: dict.company,
      links: [
        { label: dict.about, href: "/about" },
        { label: dict.contact, href: "/contact" },
      ],
    },
    {
      title: dict.legal,
      links: [
        { label: dict.privacy, href: "/legal/privacy" },
        { label: dict.terms, href: "/legal/terms" },
        { label: dict.cookies, href: "/legal/cookies" },
      ],
    },
  ];

  return (
    <footer style={{ background: "var(--bg-tertiary)", borderTop: "1px solid var(--bg-border)" }}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div style={{ height: 1, background: "var(--bg-border)" }} />
      </div>

      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 md:py-20">
        {/* Brand + tagline */}
        <div className="mb-16 flex flex-col items-start gap-6 md:flex-row md:items-end md:justify-between" data-animate="fade-up">
          <div>
            <Link href="/" className="mb-4 flex items-center gap-3">
              <Image
                src="/img/logo.png"
                alt="The Pet Headquarters"
                width={48}
                height={48}
                className="rounded-full"
              />
              <span
                style={{
                  fontFamily: "var(--font-cormorant)",
                  fontSize: "var(--text-2xl)",
                  fontWeight: "var(--weight-medium)",
                  color: "var(--white)",
                  letterSpacing: "var(--tracking-wide)",
                }}
              >
                The Pet Headquarters
              </span>
            </Link>
            <p
              className="mt-4 max-w-sm"
              style={{
                fontFamily: "var(--font-montserrat)",
                fontSize: "var(--text-sm)",
                color: "var(--white-faint)",
                lineHeight: "var(--leading-relaxed)",
              }}
            >
              {dict.tagline}
            </p>
          </div>

          <div className="flex flex-col items-end gap-3">
            {canShowInstallLink && (
              <button
                onClick={handleInstallClick}
                className="group flex items-center gap-2 transition-all duration-300 hover:text-[var(--gold)]"
                style={{
                  fontFamily: "var(--font-montserrat)",
                  fontSize: "var(--text-xs)",
                  color: "var(--gold-dark)",
                  letterSpacing: "var(--tracking-wider)",
                  textTransform: "uppercase",
                }}
              >
                <Download size={14} />
                Install app
              </button>
            )}
            <button
              onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
              className="group flex items-center gap-2 transition-all duration-300 hover:text-[var(--gold)]"
              style={{
                fontFamily: "var(--font-montserrat)",
                fontSize: "var(--text-xs)",
                color: "var(--white-faint)",
                letterSpacing: "var(--tracking-wider)",
                textTransform: "uppercase",
              }}
            >
              Back to top
              <ArrowUpRight size={14} className="transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </button>
          </div>
        </div>

        {/* Columns */}
        <div className="grid gap-10 sm:grid-cols-3" data-animate="stagger">
          {columns.map((col) => (
            <div key={col.title}>
              <h4
                className="mb-5"
                style={{
                  fontFamily: "var(--font-montserrat)",
                  fontSize: "var(--text-xs)",
                  fontWeight: "var(--weight-semibold)",
                  color: "var(--gold-dark)",
                  letterSpacing: "var(--tracking-widest)",
                  textTransform: "uppercase",
                }}
              >
                {col.title}
              </h4>
              <ul className="flex flex-col gap-3">
                {col.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="group inline-flex items-center gap-1.5 transition-colors duration-200 hover:text-[var(--gold)]"
                      style={{
                        fontFamily: "var(--font-montserrat)",
                        fontSize: "var(--text-sm)",
                        color: "var(--white-faint)",
                      }}
                    >
                      {link.label}
                      <ArrowUpRight
                        size={12}
                        className="opacity-0 transition-all duration-200 group-hover:opacity-100"
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom */}
        <div
          className="mt-16 flex flex-col gap-5 pt-8"
          style={{ borderTop: "1px solid var(--bg-border)" }}
        >
          {/* Payment-method badges — even on pages where checkout is
              still a few clicks away, the sight of Visa/MC/Amex/Apple
              Pay/Google Pay near the legal entity disclosure reinforces
              "real shop, normal payments, nothing weird here". */}
          <PaymentMethodsStrip compact centered={false} />

          {/* Companies Act 2006 s.82 disclosure */}
          {legal?.legal_name && (
            <p
              style={{
                fontFamily: "var(--font-montserrat)",
                fontSize: "var(--text-xs)",
                color: "var(--white-faint)",
                lineHeight: "var(--leading-relaxed)",
              }}
            >
              {legal.trading_name && legal.trading_name !== legal.legal_name && (
                <>{legal.trading_name} is a trading name of </>
              )}
              <strong style={{ color: "var(--white-dim)" }}>{legal.legal_name}</strong>
              {legal.company_number && (
                <>
                  , a company registered in {legal.incorporation || "England and Wales"}{" "}
                  (no. {legal.company_number})
                </>
              )}
              {legal.registered_office && (
                <>. Registered office: {legal.registered_office}</>
              )}
              {legal.vat_registered && legal.vat_number && (
                <> · VAT no. {legal.vat_number}</>
              )}
              .
            </p>
          )}

          <div className="flex items-center justify-between gap-4">
            <span
              style={{
                fontFamily: "var(--font-montserrat)",
                fontSize: "var(--text-xs)",
                color: "var(--white-faint)",
              }}
            >
              &copy; {currentYear} {legal?.trading_name || "The Pet Headquarters"}. {dict.copyright}
            </span>
            <div style={{ width: 40, height: 1, background: "var(--gold)" }} />
          </div>
        </div>
      </div>
    </footer>
  );
}
