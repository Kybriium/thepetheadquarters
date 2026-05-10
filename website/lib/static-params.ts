import { endpoints } from "@/config/endpoints";

interface SitemapResource {
  slug: string;
  updated_at: string;
}

interface SitemapPayload {
  status: string;
  data: {
    products: SitemapResource[];
    categories: SitemapResource[];
    brands: SitemapResource[];
  };
}

type SlugBucket = "products" | "categories" | "brands";

// Cap the number of pages prebuilt per bucket so the build doesn't balloon
// if the catalog grows large. Anything past the cap still renders on-demand
// (Next's default `dynamicParams = true`) and is cached after the first hit.
const BUILD_TIME_CAP = 200;

async function fetchSlugBucket(bucket: SlugBucket): Promise<SitemapResource[]> {
  try {
    const res = await fetch(endpoints.seo.sitemapSlugs, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    const json = (await res.json()) as SitemapPayload;
    return json.data[bucket] ?? [];
  } catch {
    // If the API is unreachable at build time, fall back to on-demand
    // rendering rather than failing the build. Search engines will still
    // find every URL via sitemap.xml.
    return [];
  }
}

export async function generateProductSlugParams(): Promise<{ slug: string }[]> {
  const items = await fetchSlugBucket("products");
  return items.slice(0, BUILD_TIME_CAP).map((p) => ({ slug: p.slug }));
}

export async function generateCategorySlugParams(): Promise<{ slug: string }[]> {
  const items = await fetchSlugBucket("categories");
  return items.slice(0, BUILD_TIME_CAP).map((c) => ({ slug: c.slug }));
}

export async function generateBrandSlugParams(): Promise<{ slug: string }[]> {
  const items = await fetchSlugBucket("brands");
  return items.slice(0, BUILD_TIME_CAP).map((b) => ({ slug: b.slug }));
}
