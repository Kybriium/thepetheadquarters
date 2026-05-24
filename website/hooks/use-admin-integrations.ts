"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { endpoints } from "@/config/endpoints";

export interface TelegramChatTarget {
  id: number;
  title: string;
  type: string;
  enabled: boolean;
}

export interface TelegramConfigShape {
  configured: boolean;
  bot_token_mask: string;
  bot_username: string;
  bot_name: string;
  chat_targets: TelegramChatTarget[];
  enabled_events: Record<string, boolean>;
  low_stock_threshold: number;
  is_enabled: boolean;
  last_polled_at: string | null;
  available_events: { key: string; label: string }[];
}

export const telegramKeys = {
  all: ["admin", "integrations", "telegram"] as const,
};

export function useTelegramConfig() {
  return useQuery({
    queryKey: telegramKeys.all,
    queryFn: async () => {
      const res = await apiClient.get<{ status: string; data: TelegramConfigShape }>(
        endpoints.admin.integrations.telegram,
      );
      return res.data;
    },
  });
}

export interface TelegramSavePayload {
  /** Only sent on first save or when rotating to a new bot. */
  bot_token?: string;
  chat_targets?: TelegramChatTarget[];
  enabled_events?: Record<string, boolean>;
  low_stock_threshold?: number;
  is_enabled?: boolean;
}

export function useSaveTelegramConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: TelegramSavePayload) => {
      const res = await apiClient.patch<{ status: string; data: TelegramConfigShape }>(
        endpoints.admin.integrations.telegram,
        data,
      );
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: telegramKeys.all }),
  });
}

export function useDisconnectTelegram() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => apiClient.del(endpoints.admin.integrations.telegram),
    onSuccess: () => qc.invalidateQueries({ queryKey: telegramKeys.all }),
  });
}

export function useDiscoverChats() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await apiClient.post<{
        status: string;
        data: { chat_targets: TelegramChatTarget[] };
      }>(endpoints.admin.integrations.telegramDiscover);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: telegramKeys.all }),
  });
}

export function useTestTelegram() {
  return useMutation({
    mutationFn: async () => {
      const res = await apiClient.post<{
        status: string;
        data: { results: { chat_id: number; ok: boolean; error?: string }[] };
      }>(endpoints.admin.integrations.telegramTest);
      return res.data;
    },
  });
}
