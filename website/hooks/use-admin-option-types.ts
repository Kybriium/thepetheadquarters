"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { endpoints } from "@/config/endpoints";

export interface AdminOptionValue {
  id: string;
  label: string;
  swatch_hex: string;
  swatch_image_url: string;
  sort_order: number;
}

export interface AdminOptionType {
  id: string;
  code: string;
  name: string;
  sort_order: number;
  values: AdminOptionValue[];
}

export interface AdminProductOptionTypeLink {
  id: string;
  option_type_id: string;
  code: string;
  name: string;
  sort_order: number;
  values: AdminOptionValue[];
}

export const optionTypeKeys = {
  all: ["admin", "option-types"] as const,
  list: () => [...optionTypeKeys.all, "list"] as const,
  detail: (id: string) => [...optionTypeKeys.all, "detail", id] as const,
  forProduct: (productId: string) =>
    [...optionTypeKeys.all, "product", productId] as const,
};

// ---------------------------------------------------------------------------
// Global types
// ---------------------------------------------------------------------------

export function useOptionTypes() {
  return useQuery({
    queryKey: optionTypeKeys.list(),
    queryFn: async () => {
      const res = await apiClient.get<{ status: string; data: AdminOptionType[] }>(
        endpoints.admin.optionTypes.list,
      );
      return res.data;
    },
  });
}

export function useCreateOptionType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { code: string; name: string }) => {
      const res = await apiClient.post<{ status: string; data: AdminOptionType }>(
        endpoints.admin.optionTypes.list,
        data,
      );
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: optionTypeKeys.all }),
  });
}

export function useUpdateOptionType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: { name?: string; sort_order?: number } }) =>
      apiClient.patch(endpoints.admin.optionTypes.detail(id), data),
    onSuccess: () => qc.invalidateQueries({ queryKey: optionTypeKeys.all }),
  });
}

export function useDeleteOptionType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      apiClient.del(endpoints.admin.optionTypes.detail(id)),
    onSuccess: () => qc.invalidateQueries({ queryKey: optionTypeKeys.all }),
  });
}

// ---------------------------------------------------------------------------
// Values
// ---------------------------------------------------------------------------

export interface OptionValueWriteData {
  label: string;
  swatch_hex?: string;
  swatch_image_url?: string;
  sort_order?: number;
}

export function useCreateOptionValue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ typeId, data }: { typeId: string; data: OptionValueWriteData }) => {
      const res = await apiClient.post<{ status: string; data: AdminOptionValue }>(
        endpoints.admin.optionTypes.values(typeId),
        data,
      );
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: optionTypeKeys.all }),
  });
}

export function useUpdateOptionValue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<OptionValueWriteData> }) =>
      apiClient.patch(endpoints.admin.optionTypes.value(id), data),
    onSuccess: () => qc.invalidateQueries({ queryKey: optionTypeKeys.all }),
  });
}

export function useDeleteOptionValue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      apiClient.del(endpoints.admin.optionTypes.value(id)),
    onSuccess: () => qc.invalidateQueries({ queryKey: optionTypeKeys.all }),
  });
}

// ---------------------------------------------------------------------------
// Product ↔ axes
// ---------------------------------------------------------------------------

export function useProductOptionTypes(productId: string) {
  return useQuery({
    queryKey: optionTypeKeys.forProduct(productId),
    queryFn: async () => {
      const res = await apiClient.get<{ status: string; data: AdminProductOptionTypeLink[] }>(
        endpoints.admin.optionTypes.forProduct(productId),
      );
      return res.data;
    },
    enabled: !!productId,
  });
}

export function useAttachOptionTypeToProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ productId, optionTypeId }: { productId: string; optionTypeId: string }) =>
      apiClient.post(endpoints.admin.optionTypes.forProduct(productId), {
        option_type_id: optionTypeId,
      }),
    onSuccess: (_, vars) =>
      qc.invalidateQueries({ queryKey: optionTypeKeys.forProduct(vars.productId) }),
  });
}

export function useDetachOptionTypeFromProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ productId, linkId }: { productId: string; linkId: string }) =>
      apiClient.del(endpoints.admin.optionTypes.productLink(productId, linkId)),
    onSuccess: (_, vars) =>
      qc.invalidateQueries({ queryKey: optionTypeKeys.forProduct(vars.productId) }),
  });
}

// ---------------------------------------------------------------------------
// Bulk variant generator
// ---------------------------------------------------------------------------

export function useBulkCreateVariants() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      productId,
      data,
    }: {
      productId: string;
      data: {
        combinations: string[][]; // each inner array is the OptionValue IDs for one variant
        default_price: number;
        default_stock?: number;
        sku_prefix?: string;
      };
    }) =>
      apiClient.post<{ status: string; data: { created: number } }>(
        endpoints.admin.variants.bulk(productId),
        data,
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "products"] }),
  });
}
