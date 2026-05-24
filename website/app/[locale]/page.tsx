import type { Metadata } from "next";
import type { WithContext, Organization, WebSite } from "schema-dts";

import type { Locale } from "@/i18n/config";
import { siteUrl } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { JsonLd } from "@/lib/json-ld";
import { getRootCategories } from "@/hooks/categories.server";
import { getFeaturedProducts, getNewArrivals } from "@/hooks/products.server";
import { getBrands } from "@/hooks/brands.server";

import { HeroSection } from "./_components/hero-section";
import { CategoriesSection } from "./_components/categories-section";
import { FeaturedProductsSection } from "./_components/featured-products-section";
import { TrustSignalsSection } from "./_components/trust-signals-section";
import { BrandsSection } from "./_components/brands-section";
import { NewArrivalsSection } from "./_components/new-arrivals-section";
import { NewsletterSection } from "./_components/newsletter-section";

export const metadata: Metadata = {
  title: "Premium Pet Supplies & Food — Free UK Delivery",
  description:
    "Shop premium pet food, accessories, toys and supplies for dogs, cats and small animals. Trusted UK pet store with free delivery on orders over £30.",
  alternates: { canonical: siteUrl },
  openGraph: {
    title: "The Pet Headquarters — Premium Pet Supplies",
    description:
      "Premium pet food, accessories, toys and supplies. Free UK delivery on orders over £30.",
    url: siteUrl,
    type: "website",
    siteName: "The Pet Headquarters",
  },
};

// Organization schema — this is what Google uses to build the brand
// knowledge panel on the right of search results for branded queries.
// `sameAs` lets you link your social profiles into that panel.
const organizationJsonLd: WithContext<Organization> = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "The Pet Headquarters",
  url: siteUrl,
  logo: `${siteUrl}/img/logo.png`,
  description:
    "Premium pet food, accessories and supplies. Free UK delivery on orders over £30.",
  contactPoint: [
    {
      "@type": "ContactPoint",
      contactType: "customer support",
      email: "contact@thepetheadquarters.co.uk",
      areaServed: "GB",
      availableLanguage: ["en"],
    },
  ],
  // Add social URLs here when available — Google uses them for the
  // knowledge panel `sameAs` links.
  // sameAs: [
  //   "https://www.instagram.com/thepetheadquarters",
  //   "https://www.facebook.com/thepetheadquarters",
  // ],
};

// WebSite schema with SearchAction tells Google to render a sitelinks
// search box for branded queries — when someone Googles "pet headquarters"
// they get an inline search box that goes straight to /search?q=...
const websiteJsonLd: WithContext<WebSite> = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "The Pet Headquarters",
  url: siteUrl,
  potentialAction: {
    "@type": "SearchAction",
    target: {
      "@type": "EntryPoint",
      urlTemplate: `${siteUrl}/search?q={search_term_string}`,
    },
    // schema-dts requires this exact string format
    "query-input": "required name=search_term_string",
  } as WebSite["potentialAction"],
};

export default async function Home({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  const home = await getDictionary(locale, "home");

  const [categories, featuredProducts, newArrivals, brands] = await Promise.allSettled([
    getRootCategories(locale),
    getFeaturedProducts(locale),
    getNewArrivals(locale),
    getBrands(locale),
  ]);

  return (
    <main>
      <JsonLd data={organizationJsonLd} />
      <JsonLd data={websiteJsonLd} />
      <HeroSection dict={home.hero} />
      <CategoriesSection
        dict={home.categories}
        categories={categories.status === "fulfilled" ? categories.value : []}
      />
      <FeaturedProductsSection
        dict={home.featured}
        products={featuredProducts.status === "fulfilled" ? featuredProducts.value : []}
      />
      <TrustSignalsSection dict={home.trust} />
      <BrandsSection
        dict={home.brands}
        brands={brands.status === "fulfilled" ? brands.value : []}
      />
      <NewArrivalsSection
        dict={home.newArrivals}
        products={newArrivals.status === "fulfilled" ? newArrivals.value : []}
      />
      <NewsletterSection dict={home.newsletter} />
    </main>
  );
}
