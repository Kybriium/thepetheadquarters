"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { endpoints } from "@/config/endpoints";

// ---------------------------------------------------------------------------
// Brands
// ---------------------------------------------------------------------------
export interface AdminBrand {
  id: string;
  slug: string;
  name: string;
  description: string;
  logo: string;
  website: string;
  sort_order: number;
  is_active: boolean;
}

export const adminBrandKeys = {
  all: ["admin", "brands"] as const,
  list: () => [...adminBrandKeys.all, "list"] as const,
};

export function useAdminBrands() {
  return useQuery({
    queryKey: adminBrandKeys.list(),
    queryFn: async () => {
      const res = await apiClient.get<{ status: string; data: AdminBrand[] }>(
        endpoints.admin.brands.list,
      );
      return res.data || [];
    },
  });
}

interface BrandFormData {
  name: string;
  description: string;
  logo: string;
  website: string;
  sort_order: number;
}

export function useCreateBrand() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: BrandFormData) => {
      return apiClient.post(endpoints.admin.brands.list, data);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: adminBrandKeys.all }),
  });
}

export function useUpdateBrand(brandId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Partial<BrandFormData>) => {
      return apiClient.patch(endpoints.admin.brands.detail(brandId), data);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: adminBrandKeys.all }),
  });
}

export function useDeleteBrand() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (brandId: string) => {
      return apiClient.del(endpoints.admin.brands.detail(brandId));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: adminBrandKeys.all }),
  });
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------
export interface AdminCategory {
  id: string;
  slug: string;
  name: string;
  description: string;
  parent: string | null;
  depth: number;
  sort_order: number;
  is_active: boolean;
  /**
   * "How to measure" guide inherited by every product in this category.
   * Empty strings mean "no guide" — the PDP's Size & Fit section hides
   * the measure-guide block when both are empty.
   */
  measure_guide_text?: string;
  measure_guide_image_url?: string;
}

export const adminCategoryKeys = {
  all: ["admin", "categories"] as const,
  list: () => [...adminCategoryKeys.all, "list"] as const,
};

export function useAdminCategories() {
  return useQuery({
    queryKey: adminCategoryKeys.list(),
    queryFn: async () => {
      const res = await apiClient.get<{ status: string; data: AdminCategory[] }>(
        endpoints.admin.categories.list,
      );
      return res.data || [];
    },
  });
}

interface CategoryFormData {
  name: string;
  description: string;
  parent_id: string | null;
  sort_order: number;
}

export function useCreateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: CategoryFormData) => {
      return apiClient.post(endpoints.admin.categories.list, data);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: adminCategoryKeys.all }),
  });
}

export function useUpdateCategory(categoryId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Partial<CategoryFormData>) => {
      return apiClient.patch(endpoints.admin.categories.detail(categoryId), data);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: adminCategoryKeys.all }),
  });
}

export function useDeleteCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (categoryId: string) => {
      return apiClient.del(endpoints.admin.categories.detail(categoryId));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: adminCategoryKeys.all }),
  });
}
