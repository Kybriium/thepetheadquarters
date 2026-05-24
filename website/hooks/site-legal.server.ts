import { apiClient } from "@/lib/api-client";
import { endpoints } from "@/config/endpoints";

/**
 * Business-identity info required on every page by Companies Act 2006 s.82.
 * Fetched server-side so it lands in the initial HTML and the print version
 * of the receipt has it without needing a client-side roundtrip.
 */
export interface SiteLegal {
  legal_name: string;
  trading_name: string;
  company_number: string;
  registered_office: string;
  incorporation: string;
  vat_registered: boolean;
  vat_number: string;
}

export async function getSiteLegal(): Promise<SiteLegal> {
  try {
    return await apiClient.getSuccess<SiteLegal>(endpoints.site.legal);
  } catch {
    // Fall back to empty strings — better than crashing the page if the
    // legal endpoint is unreachable. The disclosure block has a guard so
    // it just won't render when the legal name is empty.
    return {
      legal_name: "",
      trading_name: "The Pet Headquarters",
      company_number: "",
      registered_office: "",
      incorporation: "",
      vat_registered: false,
      vat_number: "",
    };
  }
}
