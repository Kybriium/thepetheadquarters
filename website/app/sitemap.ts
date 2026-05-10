import type { MetadataRoute } from "next";

import { siteUrl, buildLanguageAlternates } from "@/i18n/config";
import { endpoints } from "@/config/endpoints";

// Tell Next to revalidate the sitemap every hour. Sitemaps don't need
// real-time accuracy and rebuilding on every crawler hit would be wasteful.
export const revalidate = 3600;

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


async function fetchSlugs(): Promise<SitemapPayload["data"]> {
  try {
    const res = await fetch(endpoints.seo.sitemapSlugs, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) {
      throw new Error(`Sitemap fetch failed: ${res.status}`);
    }
    const json = (await res.json()) as SitemapPayload;
    return json.data;
  } catch (err) {
    // If the API is unreachable we still ship a sitemap with the static
    // pages — that's better than 500ing the search engine crawler.
    console.error("[sitemap] failed to fetch slugs", err);
    return { products: [], categories: [], brands: [] };
  }
}

function entry(
  pathname: string,
  lastModified: Date,
  priority: number,
  changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"],
): MetadataRoute.Sitemap[number] {
  const languages = buildLanguageAlternates(pathname);
  return {
    url: `${siteUrl}${pathname}`,
    lastModified,
    changeFrequency,
    priority,
    ...(languages && { alternates: { languages } }),
  };
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const data = await fetchSlugs();
  const now = new Date();

  const staticEntries: MetadataRoute.Sitemap = [
    entry("/", now, 1.0, "daily"),
    entry("/products", now, 0.9, "daily"),
    entry("/categories", now, 0.8, "weekly"),
    entry("/brands", now, 0.7, "weekly"),
    entry("/search", now, 0.5, "weekly"),
    entry("/about", now, 0.6, "monthly"),
    entry("/contact", now, 0.6, "monthly"),
    entry("/legal/privacy", now, 0.3, "monthly"),
    entry("/legal/terms", now, 0.3, "monthly"),
    entry("/legal/cookies", now, 0.3, "monthly"),
  ];

  const productEntries: MetadataRoute.Sitemap = data.products.map((p) =>
    entry(`/products/${p.slug}`, new Date(p.updated_at), 0.8, "weekly"),
  );

  const categoryEntries: MetadataRoute.Sitemap = data.categories.map((c) =>
    entry(`/categories/${c.slug}`, new Date(c.updated_at), 0.7, "weekly"),
  );

  const brandEntries: MetadataRoute.Sitemap = data.brands.map((b) =>
    entry(`/brands/${b.slug}`, new Date(b.updated_at), 0.6, "monthly"),
  );

  return [
    ...staticEntries,
    ...productEntries,
    ...categoryEntries,
    ...brandEntries,
  ];
}
