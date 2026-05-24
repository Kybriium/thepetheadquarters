export type CustomizationFieldType =
  | "text"
  | "long_text"
  | "image"
  | "select"
  | "position";

export interface CustomizationFieldOption {
  id: string;
  value: string;
  label: string;
  surcharge_pence: number;
  preview_image_url: string;
}

export interface CustomizationField {
  id: string;
  key: string;
  label: string;
  help_text: string;
  field_type: CustomizationFieldType;
  is_required: boolean;
  surcharge_pence: number;
  config: {
    max_length?: number;
    min_length?: number;
    max_file_mb?: number;
    min_resolution_px?: number;
    [k: string]: unknown;
  };
  options: CustomizationFieldOption[];
  source: string;
}

/** The customer's filled-in value for one field. Shape depends on field_type. */
export type CustomizationAnswerValue =
  | string
  | { url: string; public_id?: string };

export interface CustomizationAnswer {
  key: string;
  value: CustomizationAnswerValue;
}

/**
 * Per-line summary persisted in the cart and shown on cart/order UI. The
 * server stores a richer snapshot — this is the shape the client keeps
 * locally so each cart line can be rendered without an extra fetch.
 */
export interface CustomizationSummary {
  key: string;
  label: string;
  field_type: CustomizationFieldType;
  /** Raw value sent to the server. */
  value: CustomizationAnswerValue;
  /** Human-readable rendering ("Bella", "Back", "[uploaded image]"). */
  label_value: string;
  surcharge_pence: number;
  preview_image_url?: string;
}
