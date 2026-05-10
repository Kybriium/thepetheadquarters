import { notFound, permanentRedirect } from "next/navigation";
import type { Metadata } from "next";
import type {
  WithContext,
  Product as ProductSchema,
  BreadcrumbList,
  Offer,
  AggregateOffer,
} from "schema-dts";

import type { Locale } from "@/i18n/config";
import { siteUrl } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { getProductBySlug } from "@/hooks/products.server";
import { getProducts } from "@/hooks/products.server";
import { getProductAttributes } from "@/hooks/attributes.server";
import { JsonLd } from "@/lib/json-ld";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { resolveProductRedirect } from "@/lib/slug-redirects";
import { generateProductSlugParams } from "@/lib/static-params";

import { ImageGallery } from "./_components/image-gallery";
import { ProductInfo } from "./_components/product-info";
import { ProductTabs } from "./_components/product-tabs";
import { ShareButtons } from "./_components/share-buttons";
import { RelatedProducts } from "./_components/related-products";

interface PageProps {
  params: Promise<{ locale: Locale; slug: string }>;
}

export async function generateStaticParams() {
  return generateProductSlugParams();
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale, slug } = await params;

  try {
    const product = await getProductBySlug(slug, locale);
    const url = `${siteUrl}/products/${slug}`;
    const title = product.meta_title || product.name;
    const description = product.meta_description || product.short_description;
    const image = product.primary_image
      ? [{ url: product.primary_image, width: 1200, height: 1200, alt: product.name }]
      : [];

    return {
      title,
      description,
      alternates: { canonical: url },
      openGraph: {
        title,
        description,
        url,
        type: "website",
        siteName: "The Pet Headquarters",
        images: image,
      },
      twitter: {
        card: "summary_large_image",
        title,
        description,
        images: product.primary_image ? [product.primary_image] : [],
      },
    };
  } catch {
    return { title: "Product Not Found", robots: { index: false, follow: false } };
  }
}

function formatPrice(pence: number): string {
  return (pence / 100).toFixed(2);
}

export default async function ProductDetailPage({ params }: PageProps) {
  const { locale, slug } = await params;

  let product;
  try {
    product = await getProductBySlug(slug, locale);
  } catch {
    // Before giving up, check whether this slug used to belong to a
    // renamed product. If yes, issue a permanent (308) redirect so
    // external links and Google's index keep working after a rename.
    const newSlug = await resolveProductRedirect(slug);
    if (newSlug && newSlug !== slug) {
      permanentRedirect(`/products/${newSlug}`);
    }
    notFound();
  }

  const dict = await getDictionary(locale, "product");

  // Fetch attributes and related products in parallel
  const [attributesResult, relatedResult] = await Promise.allSettled([
    getProductAttributes(product.id, locale),
    product.category_ids.length > 0
      ? getProducts({ category: product.category_ids[0], page_size: "5" }, locale)
      : Promise.resolve({ count: 0, next: null, previous: null, results: [] }),
  ]);

  const attributes = attributesResult.status === "fulfilled" ? attributesResult.value : [];
  const relatedRaw = relatedResult.status === "fulfilled" ? relatedResult.value.results : [];
  const relatedProducts = relatedRaw.filter((p) => p.id !== product.id).slice(0, 4);

  const minPrice = product.min_price;
  const maxPrice = product.max_price;
  const productUrl = `${siteUrl}/products/${slug}`;

  // schema-dts requires availability to be the literal URL string, not
  // a widened `string`. Helper keeps the type narrow.
  const availability = (
    inStock: boolean,
  ): "https://schema.org/InStock" | "https://schema.org/OutOfStock" =>
    inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock";

  // Build individual Offer objects per active variant when there are
  // multiple SKUs — Google rewards variant-level price/availability
  // with richer search snippets.
  const variantOffers: Offer[] = (product.variants || [])
    .filter((v) => v.is_active && v.price > 0)
    .map((v) => ({
      "@type": "Offer",
      sku: v.sku,
      priceCurrency: "GBP",
      price: formatPrice(v.price),
      availability: availability(v.in_stock),
      url: productUrl,
    }));

  let offersBlock: Offer | AggregateOffer | undefined;
  if (variantOffers.length > 1) {
    offersBlock = {
      "@type": "AggregateOffer",
      priceCurrency: "GBP",
      lowPrice: minPrice !== null ? formatPrice(minPrice) : "0",
      highPrice:
        maxPrice !== null
          ? formatPrice(maxPrice)
          : minPrice !== null
          ? formatPrice(minPrice)
          : "0",
      offerCount: variantOffers.length,
      availability: availability(product.in_stock),
      offers: variantOffers,
    };
  } else if (minPrice !== null) {
    offersBlock = {
      "@type": "Offer",
      priceCurrency: "GBP",
      price: formatPrice(minPrice),
      availability: availability(product.in_stock),
      url: productUrl,
      ...(product.variants?.[0]?.sku && { sku: product.variants[0].sku }),
    };
  }

  const jsonLd: WithContext<ProductSchema> = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.short_description || product.meta_description || product.name,
    image: product.primary_image || undefined,
    url: productUrl,
    ...(product.variants?.[0]?.sku && { sku: product.variants[0].sku }),
    ...(product.brand && {
      brand: {
        "@type": "Brand" as const,
        name: product.brand.name,
        ...(product.brand.slug && { url: `${siteUrl}/brands/${product.brand.slug}` }),
      },
    }),
    ...(offersBlock && { offers: offersBlock }),
    ...(Number(product.average_rating) > 0 && {
      aggregateRating: {
        "@type": "AggregateRating" as const,
        ratingValue: String(product.average_rating),
        reviewCount: product.review_count,
        bestRating: "5",
        worstRating: "1",
      },
    }),
  };

  // BreadcrumbList lets Google replace the URL line in search results
  // with the breadcrumb trail, which dramatically improves CTR.
  const breadcrumbJsonLd: WithContext<BreadcrumbList> = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: dict.breadcrumb.home,
        item: siteUrl,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: dict.breadcrumb.products,
        item: `${siteUrl}/products`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: product.name,
        item: productUrl,
      },
    ],
  };

  const breadcrumbs = [
    { label: dict.breadcrumb.home, href: "/" },
    { label: dict.breadcrumb.products, href: "/products" },
    { label: product.name },
  ];

  return (
    <main className="py-8 md:py-16" style={{ background: "var(--bg-primary)" }}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <JsonLd data={jsonLd} />
        <JsonLd data={breadcrumbJsonLd} />
        <Breadcrumbs items={breadcrumbs} />

        {/* Product layout */}
        <div className="grid gap-8 md:grid-cols-2 md:gap-12">
          {/* Left — Images */}
          <div data-animate="fade-up">
            <ImageGallery images={product.images} productName={product.name} />
          </div>

          {/* Right — Info + Share */}
          <div data-animate="fade-up">
            <ProductInfo product={product} dict={dict.details} />
            <div className="mt-6 pt-6" style={{ borderTop: "1px solid var(--bg-border)" }}>
              <ShareButtons url={productUrl} title={product.name} />
            </div>
          </div>
        </div>

        {/* Tabs */}
        <ProductTabs
          description={product.description}
          attributes={attributes}
          dict={dict.details}
          reviewCount={product.review_count}
          slug={product.slug}
        />

        {/* Related Products */}
        <RelatedProducts
          products={relatedProducts}
          title="You Might Also Like"
        />
      </div>
    </main>
  );
}
