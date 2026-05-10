export const defaultLocale = "en" as const;

export const locales = ["en"] as const;

export type Locale = (typeof locales)[number];

export const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL || "https://thepetheadquarters.co.uk";

export function isValidLocale(locale: string): locale is Locale {
  return locales.includes(locale as Locale);
}

export function getLocalizedUrl(pathname: string, locale: Locale): string {
  if (locale === defaultLocale) return `${siteUrl}${pathname}`;
  return `${siteUrl}/${locale}${pathname}`;
}

// Build hreflang language alternates for a given path. Returns `undefined`
// when the site is monolingual — Google treats `x-default` and a single
// language pointing at the same URL as redundant noise. When more locales
// are added later, this automatically begins emitting full alternates.
export function buildLanguageAlternates(
  pathname: string,
): Record<string, string> | undefined {
  if (locales.length <= 1) return undefined;
  const languages: Record<string, string> = {};
  for (const loc of locales) {
    languages[loc] =
      loc === defaultLocale
        ? `${siteUrl}${pathname}`
        : `${siteUrl}/${loc}${pathname}`;
  }
  languages["x-default"] = `${siteUrl}${pathname}`;
  return languages;
}
