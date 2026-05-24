import { notFound } from "next/navigation";
import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Montserrat } from "next/font/google";

import { isValidLocale, locales, siteUrl, buildLanguageAlternates } from "@/i18n/config";
import type { Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { Providers, ToastContainer } from "@/components/providers";
import { ScrollAnimations } from "@/components/scroll-animations";
import { PageLoader } from "@/components/page-loader";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { UspRibbon } from "@/components/storefront/usp-ribbon";
import { LiveActivityToaster } from "@/components/storefront/live-activity-toaster";
import { FirstOrderBanner } from "@/components/storefront/first-order-banner";

import "../globals.css";

// Cormorant is used only for headings — keep regular + medium weights.
// Italic is synthesized when needed (admin only); shipping the italic file
// would cost an extra ~30KB across pages that never use it.
const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-cormorant",
  display: "swap",
});

// Montserrat carries body + UI text. 400/500/600/700 cover every actual
// usage in the codebase; 300 was loaded but unreferenced.
const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-montserrat",
  display: "swap",
});

// Centralised OG image — used as the fallback for any page that doesn't
// override it with a more specific image (product photo, brand logo, etc.).
const DEFAULT_OG_IMAGE = `${siteUrl}/img/og-default.png`;

export const viewport: Viewport = {
  themeColor: "#0F0F12",
  width: "device-width",
  initialScale: 1,
  // Allow user zoom — important for accessibility on iOS Safari
  maximumScale: 5,
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;

  const languages = buildLanguageAlternates("/");

  return {
    metadataBase: new URL(siteUrl),
    icons: {
      icon: "/img/logo.png",
      apple: "/img/logo.png",
    },
    manifest: "/manifest.webmanifest",
    title: {
      template: "%s | The Pet Headquarters",
      default: "The Pet Headquarters — Premium Pet Supplies in the UK",
    },
    description:
      "Shop premium pet food, accessories, toys and supplies for dogs, cats and small animals. Free UK delivery on orders over £30.",
    keywords: [
      "pet supplies UK",
      "pet food",
      "dog accessories",
      "cat accessories",
      "premium pet products",
    ],
    applicationName: "The Pet Headquarters",
    authors: [{ name: "The Pet Headquarters" }],
    creator: "The Pet Headquarters",
    publisher: "The Pet Headquarters",
    formatDetection: {
      email: false,
      telephone: false,
      address: false,
    },
    openGraph: {
      type: "website",
      locale: locale,
      siteName: "The Pet Headquarters",
      url: siteUrl,
      images: [
        {
          url: DEFAULT_OG_IMAGE,
          width: 1200,
          height: 630,
          alt: "The Pet Headquarters",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: "The Pet Headquarters — Premium Pet Supplies",
      description:
        "Shop premium pet food, accessories, toys and supplies. Free UK delivery on orders over £30.",
      images: [DEFAULT_OG_IMAGE],
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-image-preview": "large",
        "max-snippet": -1,
        "max-video-preview": -1,
      },
    },
    alternates: {
      canonical: siteUrl,
      ...(languages && { languages }),
    },
  };
}

export async function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!isValidLocale(locale)) {
    notFound();
  }

  const common = await getDictionary(locale as Locale, "common");

  return (
    <html lang={locale} className={`page-loading ${cormorant.variable} ${montserrat.variable}`}>
      <body>
        <PageLoader />
        <Providers>
          {/* Promo strip pinned to the very top of every page — distinct
              red so it doesn't compete with the gold USP ribbon below
              the header. Dismissible per session. */}
          <FirstOrderBanner />
          <Header dict={common.nav} />
          {/* Site-wide value-prop strip — visible on every page right
              under the header. Reassures first-time visitors instantly
              about delivery, security, ratings and support. */}
          <UspRibbon />
          {children}
          {/* Live recent-purchase toaster — bottom-left corner, real
              anonymized orders only. Hides itself on checkout/account
              paths and when there's no recent activity. */}
          <LiveActivityToaster />
          <Footer dict={common.footer} navDict={common.nav} />
        </Providers>
        <ToastContainer />
        <ScrollAnimations />
      </body>
    </html>
  );
}
