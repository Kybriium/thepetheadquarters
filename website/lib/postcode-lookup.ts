/**
 * UK postcode lookup via postcodes.io — public, free, no API key, no rate
 * limits worth worrying about for storefront traffic.
 *
 * We only use it to auto-fill city / county / country on address forms.
 * The customer still types name + line 1 (+ optional line 2) themselves,
 * since postcodes.io doesn't return per-property data (a paid API like
 * getaddress.io would).
 */

import { useEffect, useRef, useState } from "react";

const API_BASE = "https://api.postcodes.io";

export interface PostcodeLookupResult {
  /** Canonical formatted postcode, e.g. "SW1A 1AA". */
  postcode: string;
  /** Best "city" candidate — admin_district usually matches what royal mail prints. */
  city: string;
  /** Best "county" candidate — admin_county when present, otherwise the region. */
  county: string;
  /** Always "GB" since postcodes.io only covers UK. */
  country: "GB";
}

interface RawPostcodeResponse {
  status: number;
  result?: {
    postcode: string;
    admin_district?: string | null;
    admin_county?: string | null;
    admin_ward?: string | null;
    parish?: string | null;
    region?: string | null;
    country?: string | null;
  } | null;
}

/** Strip whitespace + uppercase for the URL path. */
function normalizeForApi(raw: string): string {
  return raw.replace(/\s+/g, "").toUpperCase();
}

/**
 * UK postcode regex — accepts inbound + outbound with optional space.
 * Permissive but rejects obvious nonsense; postcodes.io is authoritative.
 */
const POSTCODE_RX = /^[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}$/i;

export function looksLikeUkPostcode(value: string): boolean {
  return POSTCODE_RX.test(value.trim());
}

/** Format e.g. "SW1A1AA" → "SW1A 1AA". Returns input untouched if invalid. */
export function formatUkPostcode(raw: string): string {
  const cleaned = normalizeForApi(raw);
  if (!POSTCODE_RX.test(cleaned)) return raw.toUpperCase().trim();
  // Inward part is always the last 3 chars; outward is everything before.
  return `${cleaned.slice(0, -3)} ${cleaned.slice(-3)}`;
}

/**
 * Returns the auto-fill data for a postcode, or `null` if the postcode
 * isn't recognized. Network errors also return null so the form falls
 * back to manual entry without surfacing a scary error.
 */
export async function lookupPostcode(
  raw: string,
  signal?: AbortSignal,
): Promise<PostcodeLookupResult | null> {
  const postcode = normalizeForApi(raw);
  if (!postcode || !POSTCODE_RX.test(postcode)) return null;

  let res: Response;
  try {
    res = await fetch(`${API_BASE}/postcodes/${encodeURIComponent(postcode)}`, {
      method: "GET",
      signal,
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;

  let body: RawPostcodeResponse;
  try {
    body = (await res.json()) as RawPostcodeResponse;
  } catch {
    return null;
  }
  if (!body.result) return null;

  const r = body.result;
  // Pick the best human-friendly "city" — admin_district is usually it
  // (e.g. "Westminster"), but fall back to parish or ward for rural postcodes.
  const city = r.admin_district || r.parish || r.admin_ward || "";
  // County — admin_county is null for unitary authorities (e.g. London,
  // Brighton). Fall back to the region.
  const county = r.admin_county || r.region || "";

  return {
    postcode: r.postcode,
    city,
    county,
    country: "GB",
  };
}


// ---------------------------------------------------------------------------
// React hook — debounced postcode → auto-fill
// ---------------------------------------------------------------------------

export type PostcodeLookupStatus = "idle" | "loading" | "ok" | "not_found";

const LOOKUP_DEBOUNCE_MS = 400;

/**
 * Wire postcode auto-fill into any react-hook-form. Watches the postcode
 * value; when it pattern-matches a UK postcode, debounces a network call
 * to postcodes.io, then auto-fills city / county / country if the user
 * hasn't already typed something there.
 *
 * Returns the current lookup status for inline UI feedback.
 */
export function usePostcodeAutoFill(args: {
  postcode: string;
  setValue: (field: "postcode" | "city" | "county" | "country", value: string, options?: { shouldValidate?: boolean }) => void;
  getValue: (field: "city" | "county") => string;
}): PostcodeLookupStatus {
  const { postcode, setValue, getValue } = args;
  const [status, setStatus] = useState<PostcodeLookupStatus>("idle");
  const abortRef = useRef<AbortController | null>(null);
  const lastQueriedRef = useRef<string>("");

  useEffect(() => {
    const trimmed = (postcode || "").trim();
    if (!trimmed) {
      setStatus("idle");
      return;
    }
    if (!looksLikeUkPostcode(trimmed)) {
      setStatus("idle");
      return;
    }
    // Skip re-fetching the same canonical postcode (e.g. after we re-format it).
    if (trimmed.toUpperCase().replace(/\s+/g, "") === lastQueriedRef.current) {
      return;
    }

    const handle = setTimeout(async () => {
      lastQueriedRef.current = trimmed.toUpperCase().replace(/\s+/g, "");
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setStatus("loading");
      const result = await lookupPostcode(trimmed, ctrl.signal);
      if (ctrl.signal.aborted) return;

      if (!result) {
        setStatus("not_found");
        return;
      }
      setValue("postcode", result.postcode, { shouldValidate: true });
      // Don't overwrite an existing entry — postcodes.io can be slightly off
      // for some rural postcodes, and the user may already have it right.
      if (!getValue("city")) setValue("city", result.city);
      if (!getValue("county")) setValue("county", result.county);
      setValue("country", result.country);
      setStatus("ok");
    }, LOOKUP_DEBOUNCE_MS);

    return () => clearTimeout(handle);
    // setValue / getValue are stable identities from react-hook-form
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postcode]);

  return status;
}
