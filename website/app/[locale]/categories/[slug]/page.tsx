import { notFound, permanentRedirect } from "next/navigation";
import type { Metadata } from "next";
import type { WithContext, BreadcrumbList, CollectionPage } from "schema-dts";

import type { Locale } from "@/i18n/config";
import { siteUrl } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { getCategoryBySlug } from "@/hooks/categories.server";
import { getBrands } from "@/hooks/brands.server";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { JsonLd } from "@/lib/json-ld";
import { resolveCategoryRedirect } from "@/lib/slug-redirects";
import { generateCategorySlugParams } from "@/lib/static-params";

import { CategoryProductsView } from "./_components/category-products-view";

interface PageProps {
  params: Promise<{ locale: Locale; slug: string }>;
}

export async function generateStaticParams() {
  return generateCategorySlugParams();
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale, slug } = await params;
  try {
    const category = await getCategoryBySlug(slug, locale);
    const url = `${siteUrl}/categories/${slug}`;
    const title = category.meta_title || category.name;
    const description =
      category.meta_description ||
      category.description ||
      `Shop ${category.name} at The Pet Headquarters. Premium pet supplies with free UK delivery on orders over £30.`;

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
        images: category.image
          ? [{ url: category.image, width: 1200, height: 630, alt: category.name }]
          : [],
      },
      twitter: {
        card: "summary_large_image",
        title,
        description,
        images: category.image ? [category.image] : [],
      },
    };
  } catch {
    return { title: "Category Not Found", robots: { index: false, follow: false } };
  }
}

export default async function CategoryDetailPage({ params }: PageProps) {
  const { locale, slug } = await params;

  let category;
  try {
    category = await getCategoryBySlug(slug, locale);
  } catch {
    const newSlug = await resolveCategoryRedirect(slug);
    if (newSlug && newSlug !== slug) {
      permanentRedirect(`/categories/${newSlug}`);
    }
    notFound();
  }

  const dict = await getDictionary(locale, "products");
  const brands = await getBrands(locale).catch(() => []);

  const categoryUrl = `${siteUrl}/categories/${slug}`;

  const collectionJsonLd: WithContext<CollectionPage> = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: category.name,
    description: category.description || `Shop ${category.name} at The Pet Headquarters.`,
    url: categoryUrl,
  };

  const breadcrumbJsonLd: WithContext<BreadcrumbList> = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: siteUrl },
      { "@type": "ListItem", position: 2, name: "Categories", item: `${siteUrl}/categories` },
      { "@type": "ListItem", position: 3, name: category.name, item: categoryUrl },
    ],
  };

  return (
    <main className="py-16 md:py-24" style={{ background: "var(--bg-primary)" }}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <JsonLd data={collectionJsonLd} />
        <JsonLd data={breadcrumbJsonLd} />

        <Breadcrumbs
          items={[
            { label: "Home", href: "/" },
            { label: "Categories", href: "/categories" },
            { label: category.name },
          ]}
        />

        <div className="mb-8 md:mb-12" data-animate="fade-up">
          <h1
            style={{
              fontFamily: "var(--font-cormorant)",
              fontSize: "clamp(2rem, 5vw, 3rem)",
              fontWeight: "var(--weight-regular)",
              color: "var(--white)",
              letterSpacing: "var(--tracking-tight)",
            }}
          >
            {category.name}
          </h1>
          <div
            className="mt-4"
            data-animate="divider"
            style={{ width: 60, height: 1, background: "var(--gold)" }}
          />
          {category.description && (
            <p
              className="mt-4 max-w-2xl"
              style={{
                fontFamily: "var(--font-montserrat)",
                fontSize: "var(--text-sm)",
                color: "var(--white-dim)",
                lineHeight: "var(--leading-relaxed)",
              }}
            >
              {category.description}
            </p>
          )}
        </div>

        {/* Subcategories */}
        {category.children && category.children.length > 0 && (
          <div className="mb-10 flex flex-wrap gap-2" data-animate="stagger">
            {category.children.map((child) => (
              <a
                key={child.id}
                href={`/categories/${child.slug}`}
                className="rounded-full px-4 py-2 transition-all duration-200 hover:bg-[var(--gold)] hover:text-[var(--black)]"
                style={{
                  background: "var(--bg-secondary)",
                  border: "1px solid var(--bg-border)",
                  color: "var(--white-dim)",
                  fontFamily: "var(--font-montserrat)",
                  fontSize: "var(--text-sm)",
                }}
              >
                {child.name}
              </a>
            ))}
          </div>
        )}

        <CategoryProductsView
          categoryId={category.id}
          dict={dict}
          brands={brands}
          lang={locale}
        />
      </div>
    </main>
  );
}
