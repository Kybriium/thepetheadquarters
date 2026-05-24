"use client";

import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { endpoints } from "@/config/endpoints";

export interface RecentActivityItem {
  id: string;
  buyer_initial: string;
  city: string;
  product_name: string;
  product_slug: string;
  product_image: string | null;
  paid_at: string;
}

/**
 * Polls the anonymised recent-order feed on a 3-minute interval. Used by
 * the live-activity toaster.
 *
 * No retries / exponential backoff — the endpoint is cheap and cached
 * server-side; one missed poll just means the toaster pauses for a
 * cycle. The hook deliberately does NOT block first render: it returns
 * an empty array on mount and populates after the first fetch settles.
 */
export function useRecentActivity(): RecentActivityItem[] {
  const [items, setItems] = useState<RecentActivityItem[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const data = await apiClient.getSuccess<RecentActivityItem[]>(
          endpoints.orders.recentActivity,
        );
        if (!cancelled) setItems(Array.isArray(data) ? data : []);
      } catch {
        // Silent — toaster just won't show. Don't pollute console.
      }
    }

    load();
    // 3 minutes — the endpoint is cached for 60s anyway and the toaster
    // cycles items every ~10s, so refreshing more often than this is
    // just wasted network.
    const interval = setInterval(load, 3 * 60 * 1000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return items;
}
