"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { endpoints } from "@/config/endpoints";
import type {
  CustomizationField,
  CustomizationFieldOption,
  CustomizationFieldType,
} from "@/types/customization";

export interface AdminCustomizationTemplate {
  id: string;
  key: string;
  name: string;
  description: string;
  is_active: boolean;
  sort_order: number;
  fields: CustomizationField[];
}

export interface ProductCustomizationAttachment {
  id: string;
  template: AdminCustomizationTemplate;
  sort_order: number;
}

export interface ProductCustomizationsResponse {
  templates: ProductCustomizationAttachment[];
  ad_hoc_fields: CustomizationField[];
}

export const adminCustomizationKeys = {
  all: ["admin", "customizations"] as const,
  templates: () => [...adminCustomizationKeys.all, "templates"] as const,
  template: (id: string) => [...adminCustomizationKeys.templates(), id] as const,
  forProduct: (productId: string) =>
    [...adminCustomizationKeys.all, "product", productId] as const,
};

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

export function useAdminCustomizationTemplates() {
  return useQuery({
    queryKey: adminCustomizationKeys.templates(),
    queryFn: async () => {
      const res = await apiClient.get<{
        status: string;
        data: AdminCustomizationTemplate[];
      }>(endpoints.admin.customizations.templates);
      return res.data;
    },
  });
}

interface TemplateWriteData {
  key?: string;
  name: string;
  description?: string;
  is_active?: boolean;
  sort_order?: number;
}

export function useCreateCustomizationTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: TemplateWriteData) => {
      const res = await apiClient.post<{
        status: string;
        data: AdminCustomizationTemplate;
      }>(endpoints.admin.customizations.templates, data);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: adminCustomizationKeys.all }),
  });
}

export function useUpdateCustomizationTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<TemplateWriteData> }) => {
      return apiClient.patch(endpoints.admin.customizations.template(id), data);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: adminCustomizationKeys.all }),
  });
}

export function useDeleteCustomizationTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => apiClient.del(endpoints.admin.customizations.template(id)),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminCustomizationKeys.all }),
  });
}

// ---------------------------------------------------------------------------
// Fields (template OR product)
// ---------------------------------------------------------------------------

export interface FieldWriteData {
  key: string;
  label: string;
  field_type: CustomizationFieldType;
  help_text?: string;
  is_required?: boolean;
  surcharge_pence?: number;
  config?: Record<string, unknown>;
  sort_order?: number;
}

export function useCreateTemplateField() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ templateId, data }: { templateId: string; data: FieldWriteData }) =>
      apiClient.post<{ status: string; data: CustomizationField }>(
        endpoints.admin.customizations.templateFields(templateId),
        data,
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminCustomizationKeys.all }),
  });
}

export function useCreateProductField() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ productId, data }: { productId: string; data: FieldWriteData }) =>
      apiClient.post<{ status: string; data: CustomizationField }>(
        endpoints.admin.customizations.productFields(productId),
        data,
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminCustomizationKeys.all }),
  });
}

export function useUpdateField() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<FieldWriteData> }) =>
      apiClient.patch(endpoints.admin.customizations.field(id), data),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminCustomizationKeys.all }),
  });
}

export function useDeleteField() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => apiClient.del(endpoints.admin.customizations.field(id)),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminCustomizationKeys.all }),
  });
}

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface OptionWriteData {
  value: string;
  label: string;
  surcharge_pence?: number;
  preview_image_url?: string;
  sort_order?: number;
}

export function useCreateFieldOption() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ fieldId, data }: { fieldId: string; data: OptionWriteData }) =>
      apiClient.post<{ status: string; data: CustomizationFieldOption }>(
        endpoints.admin.customizations.fieldOptions(fieldId),
        data,
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminCustomizationKeys.all }),
  });
}

export function useDeleteFieldOption() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => apiClient.del(endpoints.admin.customizations.option(id)),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminCustomizationKeys.all }),
  });
}

// ---------------------------------------------------------------------------
// Product attachments
// ---------------------------------------------------------------------------

export function useProductCustomizations(productId: string) {
  return useQuery({
    queryKey: adminCustomizationKeys.forProduct(productId),
    queryFn: async () => {
      const res = await apiClient.get<{
        status: string;
        data: ProductCustomizationsResponse;
      }>(endpoints.admin.customizations.forProduct(productId));
      return res.data;
    },
    enabled: !!productId,
  });
}

export function useAttachTemplateToProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      productId,
      templateId,
    }: {
      productId: string;
      templateId: string;
    }) =>
      apiClient.post(endpoints.admin.customizations.forProduct(productId), {
        template_id: templateId,
      }),
    onSuccess: (_, vars) =>
      qc.invalidateQueries({ queryKey: adminCustomizationKeys.forProduct(vars.productId) }),
  });
}

export function useDetachTemplateFromProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      productId,
      linkId,
    }: {
      productId: string;
      linkId: string;
    }) =>
      apiClient.del(endpoints.admin.customizations.productAttachment(productId, linkId)),
    onSuccess: (_, vars) =>
      qc.invalidateQueries({ queryKey: adminCustomizationKeys.forProduct(vars.productId) }),
  });
}
