const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

export const endpoints = {
  categories: {
    list: `${API_BASE}/categories/`,
    tree: `${API_BASE}/categories/tree/`,
    detail: (slug: string) => `${API_BASE}/categories/${slug}/`,
  },
  brands: {
    list: `${API_BASE}/brands/`,
    detail: (slug: string) => `${API_BASE}/brands/${slug}/`,
  },
  products: {
    list: `${API_BASE}/products/`,
    featured: `${API_BASE}/products/featured/`,
    detail: (slug: string) => `${API_BASE}/products/${slug}/`,
  },
  seo: {
    sitemapSlugs: `${API_BASE}/sitemap/slugs/`,
    redirectProduct: (slug: string) => `${API_BASE}/redirect/products/${slug}/`,
    redirectCategory: (slug: string) => `${API_BASE}/redirect/categories/${slug}/`,
    redirectBrand: (slug: string) => `${API_BASE}/redirect/brands/${slug}/`,
  },
  attributes: {
    list: `${API_BASE}/attributes/`,
    byProduct: (productId: string) => `${API_BASE}/attributes/product/${productId}/`,
  },
  customizations: {
    byProduct: (slug: string) => `${API_BASE}/products/${slug}/customizations/`,
    upload: `${API_BASE}/customizations/upload/`,
  },
  newsletter: {
    subscribe: `${API_BASE}/newsletter/subscribe/`,
  },
  contact: {
    send: `${API_BASE}/contact/`,
  },
  auth: {
    register: `${API_BASE}/auth/register/`,
    login: `${API_BASE}/auth/login/`,
    logout: `${API_BASE}/auth/logout/`,
    refresh: `${API_BASE}/auth/token/refresh/`,
    verifyEmail: `${API_BASE}/auth/verify-email/`,
    resendVerification: `${API_BASE}/auth/verify-email/resend/`,
    passwordReset: `${API_BASE}/auth/password/reset/`,
    passwordResetConfirm: `${API_BASE}/auth/password/reset/confirm/`,
    passwordChange: `${API_BASE}/auth/password/change/`,
    me: `${API_BASE}/auth/me/`,
    deleteAccount: `${API_BASE}/auth/me/delete/`,
  },
  addresses: {
    list: `${API_BASE}/addresses/`,
    detail: (id: string) => `${API_BASE}/addresses/${id}/`,
  },
  orders: {
    checkout: `${API_BASE}/orders/checkout/`,
    list: `${API_BASE}/orders/`,
    detail: (orderNumber: string) => `${API_BASE}/orders/${orderNumber}/`,
    bySession: (sessionId: string) => `${API_BASE}/orders/by-session/${sessionId}/`,
  },
  promotions: {
    validate: `${API_BASE}/promotions/validate/`,
    trackClick: `${API_BASE}/promotions/track-click/`,
  },
  reviews: {
    list: (slug: string) => `${API_BASE}/products/${slug}/reviews/`,
    stats: (slug: string) => `${API_BASE}/products/${slug}/reviews/stats/`,
    eligibility: (slug: string) => `${API_BASE}/products/${slug}/reviews/eligibility/`,
    detail: (slug: string, id: string) => `${API_BASE}/products/${slug}/reviews/${id}/`,
    helpful: (slug: string, id: string) => `${API_BASE}/products/${slug}/reviews/${id}/helpful/`,
    mine: `${API_BASE}/me/reviews/`,
  },
  admin: {
    dashboard: `${API_BASE}/admin/dashboard/`,
    orders: {
      list: `${API_BASE}/admin/orders/`,
      detail: (n: string) => `${API_BASE}/admin/orders/${n}/`,
      status: (n: string) => `${API_BASE}/admin/orders/${n}/status/`,
      ship: (n: string) => `${API_BASE}/admin/orders/${n}/ship/`,
      cancel: (n: string) => `${API_BASE}/admin/orders/${n}/cancel/`,
      refund: (n: string) => `${API_BASE}/admin/orders/${n}/refund/`,
      notes: (n: string) => `${API_BASE}/admin/orders/${n}/notes/`,
      dropship: `${API_BASE}/admin/orders/dropship/`,
      forwardItem: (n: string, itemId: string) => `${API_BASE}/admin/orders/${n}/items/${itemId}/forward/`,
    },
    products: {
      list: `${API_BASE}/admin/products/`,
      detail: (id: string) => `${API_BASE}/admin/products/${id}/`,
      variants: (id: string) => `${API_BASE}/admin/products/${id}/variants/`,
      images: (id: string) => `${API_BASE}/admin/products/${id}/images/`,
    },
    variants: {
      detail: (id: string) => `${API_BASE}/admin/variants/${id}/`,
      bulk: (productId: string) => `${API_BASE}/admin/products/${productId}/variants/bulk/`,
    },
    images: {
      detail: (id: string) => `${API_BASE}/admin/images/${id}/`,
    },
    optionTypes: {
      list: `${API_BASE}/admin/option-types/`,
      detail: (id: string) => `${API_BASE}/admin/option-types/${id}/`,
      values: (id: string) => `${API_BASE}/admin/option-types/${id}/values/`,
      value: (id: string) => `${API_BASE}/admin/option-values/${id}/`,
      forProduct: (productId: string) => `${API_BASE}/admin/products/${productId}/option-types/`,
      productLink: (productId: string, linkId: string) =>
        `${API_BASE}/admin/products/${productId}/option-types/${linkId}/`,
    },
    inventory: {
      list: `${API_BASE}/admin/inventory/`,
      update: (id: string) => `${API_BASE}/admin/inventory/${id}/`,
      movements: (id: string) => `${API_BASE}/admin/inventory/${id}/movements/`,
      batches: (id: string) => `${API_BASE}/admin/inventory/${id}/batches/`,
    },
    customers: {
      list: `${API_BASE}/admin/customers/`,
      detail: (id: string) => `${API_BASE}/admin/customers/${id}/`,
    },
    suppliers: {
      list: `${API_BASE}/admin/suppliers/`,
      detail: (id: string) => `${API_BASE}/admin/suppliers/${id}/`,
      products: (id: string) => `${API_BASE}/admin/suppliers/${id}/products/`,
      purchases: (id: string) => `${API_BASE}/admin/suppliers/${id}/purchases/`,
    },
    purchaseOrders: {
      list: `${API_BASE}/admin/purchase-orders/`,
      detail: (id: string) => `${API_BASE}/admin/purchase-orders/${id}/`,
      send: (id: string) => `${API_BASE}/admin/purchase-orders/${id}/send/`,
      receive: (id: string) => `${API_BASE}/admin/purchase-orders/${id}/receive/`,
      cancel: (id: string) => `${API_BASE}/admin/purchase-orders/${id}/cancel/`,
    },
    brands: {
      list: `${API_BASE}/admin/brands/`,
      detail: (id: string) => `${API_BASE}/admin/brands/${id}/`,
      reorder: `${API_BASE}/admin/brands/reorder/`,
    },
    categories: {
      list: `${API_BASE}/admin/categories/`,
      detail: (id: string) => `${API_BASE}/admin/categories/${id}/`,
      reorder: `${API_BASE}/admin/categories/reorder/`,
    },
    reports: {
      sales: `${API_BASE}/admin/reports/sales/`,
      salesExport: `${API_BASE}/admin/reports/sales/export/`,
      inventoryValuation: `${API_BASE}/admin/reports/inventory-valuation/`,
      topProducts: `${API_BASE}/admin/reports/top-products/`,
      topSuppliers: `${API_BASE}/admin/reports/top-suppliers/`,
      vatReturn: `${API_BASE}/admin/reports/vat-return/`,
      vatReturnExport: `${API_BASE}/admin/reports/vat-return/export/`,
      promotions: `${API_BASE}/admin/reports/promotions/`,
    },
    audit: {
      list: `${API_BASE}/admin/audit/`,
      detail: (id: string) => `${API_BASE}/admin/audit/${id}/`,
    },
    contactMessages: {
      list: `${API_BASE}/admin/contact-messages/`,
      detail: (id: string) => `${API_BASE}/admin/contact-messages/${id}/`,
    },
    reviews: {
      list: `${API_BASE}/admin/reviews/`,
      detail: (id: string) => `${API_BASE}/admin/reviews/${id}/`,
    },
    analytics: {
      overview: `${API_BASE}/admin/analytics/overview/`,
      visitors: `${API_BASE}/admin/analytics/visitors/`,
      visitor: (id: string) => `${API_BASE}/admin/analytics/visitors/${id}/`,
    },
    promotions: {
      list: `${API_BASE}/admin/promotions/`,
      detail: (id: string) => `${API_BASE}/admin/promotions/${id}/`,
      redemptions: (id: string) => `${API_BASE}/admin/promotions/${id}/redemptions/`,
    },
    upload: {
      image: `${API_BASE}/admin/upload/image/`,
      info: `${API_BASE}/admin/upload/info/`,
    },
    customizations: {
      templates: `${API_BASE}/admin/customizations/templates/`,
      template: (id: string) => `${API_BASE}/admin/customizations/templates/${id}/`,
      templateFields: (id: string) => `${API_BASE}/admin/customizations/templates/${id}/fields/`,
      field: (id: string) => `${API_BASE}/admin/customizations/fields/${id}/`,
      fieldOptions: (id: string) => `${API_BASE}/admin/customizations/fields/${id}/options/`,
      option: (id: string) => `${API_BASE}/admin/customizations/options/${id}/`,
      forProduct: (productId: string) => `${API_BASE}/admin/products/${productId}/customizations/`,
      productAttachment: (productId: string, linkId: string) =>
        `${API_BASE}/admin/products/${productId}/customizations/${linkId}/`,
      productFields: (productId: string) =>
        `${API_BASE}/admin/products/${productId}/customizations/fields/`,
    },
  },
} as const;
