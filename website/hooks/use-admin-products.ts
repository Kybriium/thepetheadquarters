"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { endpoints } from "@/config/endpoints";
import type { PaginatedResponse } from "@/types/api";

export interface AdminProductListItem {
  id: string;
  slug: string;
  name: string;
  primary_image: string;
  brand_id: string | null;
  fulfillment_type: string;
  is_featured: boolean;
  is_active: boolean;
  variant_count: number;
  total_stock: number;
  min_price: number | null;
  created_at: string;
}

export interface AdminVariantOptionValue {
  id: string;
  label: string;
  swatch_hex: string;
  swatch_image_url: string;
  option_type_id: string;
  option_type_code: string;
  sort_order: number;
}

export interface AdminVariant {
  id: string;
  sku: string;
  price: number;
  compare_at_price: number | null;
  cost_price: number | null;
  stock_quantity: number;
  weight_grams: number | null;
  sort_order: number;
  is_active: boolean;
  option_values: AdminVariantOptionValue[];
}

export interface AdminProductOptionTypeRef {
  id: string;
  option_type_id: string;
  code: string;
  name: string;
  sort_order: number;
}

export interface AdminProductImage {
  id: string;
  url: string;
  alt_text: string;
  is_primary: boolean;
  sort_order: number;
  variant: string | null;
}

export interface AdminProductDetail {
  id: string;
  slug: string;
  name: string;
  description: string;
  short_description: string;
  brand_id: string | null;
  fulfillment_type: string;
  is_featured: boolean;
  is_active: boolean;
  meta_title: string;
  meta_description: string;
  category_ids: string[];
  variants: AdminVariant[];
  images: AdminProductImage[];
  option_types: AdminProductOptionTypeRef[];
}

export const adminProductKeys = {
  all: ["admin", "products"] as const,
  lists: () => [...adminProductKeys.all, "list"] as const,
  list: (filters: Record<string, string>) =>
    [...adminProductKeys.lists(), filters] as const,
  details: () => [...adminProductKeys.all, "detail"] as const,
  detail: (id: string) => [...adminProductKeys.details(), id] as const,
};

export function useAdminProducts(filters: { search?: string }) {
  return useQuery({
    queryKey: adminProductKeys.list(filters as Record<string, string>),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.search) params.set("search", filters.search);
      const url = `${endpoints.admin.products.list}${params.toString() ? `?${params.toString()}` : ""}`;
      return apiClient.get<PaginatedResponse<AdminProductListItem>>(url);
    },
  });
}

export function useAdminProduct(productId: string) {
  return useQuery({
    queryKey: adminProductKeys.detail(productId),
    queryFn: async () => {
      const res = await apiClient.get<{ status: string; data: AdminProductDetail }>(
        endpoints.admin.products.detail(productId),
      );
      return res.data;
    },
    enabled: !!productId,
  });
}

interface ProductFormData {
  name: string;
  description: string;
  short_description: string;
  brand_id: string | null;
  fulfillment_type: "self" | "dropship";
  is_featured: boolean;
  is_active: boolean;
  category_ids: string[];
}

export function useCreateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: ProductFormData) => {
      const res = await apiClient.post<{ status: string; data: AdminProductDetail }>(
        endpoints.admin.products.list,
        data,
      );
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: adminProductKeys.all }),
  });
}

export function useUpdateProduct(productId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Partial<ProductFormData>) => {
      return apiClient.patch(endpoints.admin.products.detail(productId), data);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: adminProductKeys.all });
    },
  });
}

export function useDeleteProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (productId: string) => {
      return apiClient.del(endpoints.admin.products.detail(productId));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: adminProductKeys.all }),
  });
}

interface VariantFormData {
  sku: string;
  price: number;
  compare_at_price: number | null;
  cost_price: number | null;
  stock_quantity: number;
  weight_grams: number | null;
  sort_order: number;
  is_active: boolean;
  /** Optional — list of OptionValue IDs the variant represents. */
  option_value_ids?: string[];
}

export function useCreateVariant(productId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: VariantFormData) => {
      return apiClient.post(endpoints.admin.products.variants(productId), data);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: adminProductKeys.detail(productId) });
      qc.invalidateQueries({ queryKey: adminProductKeys.lists() });
    },
  });
}

export function useUpdateVariant(productId: string, variantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Partial<VariantFormData>) => {
      return apiClient.patch(endpoints.admin.variants.detail(variantId), data);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: adminProductKeys.detail(productId) });
      qc.invalidateQueries({ queryKey: adminProductKeys.lists() });
    },
  });
}

export function useDeleteVariant(productId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (variantId: string) => {
      return apiClient.del(endpoints.admin.variants.detail(variantId));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: adminProductKeys.detail(productId) });
      qc.invalidateQueries({ queryKey: adminProductKeys.lists() });
    },
  });
}

interface ImageFormData {
  url: string;
  alt_text: string;
  is_primary: boolean;
  sort_order: number;
  variant_id?: string | null;
}

export function useAddImage(productId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: ImageFormData) => {
      return apiClient.post(endpoints.admin.products.images(productId), data);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: adminProductKeys.detail(productId) });
      qc.invalidateQueries({ queryKey: adminProductKeys.lists() });
    },
  });
}

export function useDeleteImage(productId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (imageId: string) => {
      return apiClient.del(endpoints.admin.images.detail(imageId));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: adminProductKeys.detail(productId) });
      qc.invalidateQueries({ queryKey: adminProductKeys.lists() });
    },
  });
}

export function useUpdateImage(productId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      imageId,
      data,
    }: {
      imageId: string;
      data: { is_primary?: boolean; alt_text?: string; sort_order?: number; variant_id?: string | null };
    }) => {
      return apiClient.patch(endpoints.admin.images.detail(imageId), data);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: adminProductKeys.detail(productId) });
      qc.invalidateQueries({ queryKey: adminProductKeys.lists() });
    },
  });
}
