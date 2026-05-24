"use client";

import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { endpoints } from "@/config/endpoints";

export interface ProductSocialProof {
  bought_last_30d: number;
}

/**
 * Fetches the public social-proof aggregates for a product. Returns
 * undefined while the request is in flight and null on failure — the
 * consuming component should hide the corresponding UI in both cases
 * so we never paint a misleading "Bought 0 times" line.
 */
export function useProductSocialProof(slug: string): ProductSocialProof | null | undefined {
  const [data, setData] = useState<ProductSocialProof | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .getSuccess<ProductSocialProof>(endpoints.products.socialProof(slug))
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  return data;
}
