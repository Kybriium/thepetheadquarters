import { apiClient } from "@/lib/api-client";
import { endpoints } from "@/config/endpoints";
import type { CustomizationField } from "@/types/customization";

/**
 * Fetched server-side on the PDP. Returns [] for non-customizable products,
 * so the panel can safely no-render without checking is_customizable twice.
 */
export async function getProductCustomizations(
  slug: string,
): Promise<CustomizationField[]> {
  try {
    return await apiClient.getSuccess<CustomizationField[]>(
      endpoints.customizations.byProduct(slug),
    );
  } catch {
    return [];
  }
}
