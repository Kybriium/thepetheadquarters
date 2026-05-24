"use client";

import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { endpoints } from "@/config/endpoints";
import type { SiteLegal } from "./site-legal.server";

/**
 * Client-side variant of getSiteLegal — used by components that render
 * inside client trees (cart, account, receipt). Cached in a module-level
 * variable so repeated renders never trigger more than one network call
 * across the session.
 */

let cached: SiteLegal | null = null;
let inflight: Promise<SiteLegal> | null = null;

export function useSiteLegal(): SiteLegal | null {
  const [legal, setLegal] = useState<SiteLegal | null>(cached);

  useEffect(() => {
    if (cached) return;
    if (!inflight) {
      inflight = apiClient
        .getSuccess<SiteLegal>(endpoints.site.legal)
        .catch((): SiteLegal => ({
          legal_name: "",
          trading_name: "The Pet Headquarters",
          company_number: "",
          registered_office: "",
          incorporation: "",
          vat_registered: false,
          vat_number: "",
        }))
        .then((data) => {
          cached = data;
          return data;
        });
    }
    inflight.then((data) => setLegal(data));
  }, []);

  return legal;
}
