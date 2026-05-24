import { apiClient } from "@/lib/api-client";
import { endpoints } from "@/config/endpoints";

export interface RecentReview {
  id: string;
  rating: number;
  title: string;
  body: string;
  display_name: string;
  is_verified_buyer: boolean;
  created_at: string;
  product_name: string;
  product_slug: string;
}

/**
 * Server-side fetcher for the landing-page "what customers are saying"
 * section. Defaults to last 6 reviews, 4+ stars only. Safe to render
 * an empty array on failure — the consuming section hides itself.
 */
export async function getRecentReviews(limit = 6): Promise<RecentReview[]> {
  try {
    return await apiClient.getSuccess<RecentReview[]>(
      `${endpoints.reviews.recent}?limit=${limit}`,
    );
  } catch {
    return [];
  }
}
