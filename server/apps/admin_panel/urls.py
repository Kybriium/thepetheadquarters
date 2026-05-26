from django.urls import path

from apps.admin_panel.views.dashboard import DashboardView
from apps.admin_panel.views.roles import (
    AdminRoleCatalogueView,
    AdminRoleCloneView,
    AdminRoleDetailView,
    AdminRoleListView,
)
from apps.admin_panel.views.team import AdminTeamListView, AdminTeamRoleView
from apps.admin_panel.views.orders import (
    AdminDropshipPendingView,
    AdminOrderCancelView,
    AdminOrderDetailView,
    AdminOrderEmailCustomerView,
    AdminOrderForwardItemView,
    AdminOrderListView,
    AdminOrderNotesView,
    AdminOrderRefundView,
    AdminOrderShipView,
    AdminOrderStatusView,
)
from apps.admin_panel.views.products import (
    AdminImageDetailView,
    AdminProductDetailView,
    AdminProductImagesView,
    AdminProductListView,
    AdminProductVariantsBulkView,
    AdminProductVariantsView,
    AdminVariantDetailView,
)
from apps.admin_panel.views.option_types import (
    AdminOptionTypeDetailView,
    AdminOptionTypeListView,
    AdminOptionTypeValuesView,
    AdminOptionValueDetailView,
    AdminProductOptionTypeDetailView,
    AdminProductOptionTypesView,
)
from apps.admin_panel.views.inventory import (
    AdminInventoryBatchesView,
    AdminInventoryListView,
    AdminInventoryMovementsView,
    AdminInventoryUpdateView,
)
from apps.admin_panel.views.customers import (
    AdminCustomerDetailView,
    AdminCustomerListView,
)
from apps.admin_panel.views.suppliers import (
    AdminSupplierDetailView,
    AdminSupplierListView,
    AdminSupplierProductsView,
    AdminSupplierProductDetailView,
    AdminSupplierPurchasesView,
    AdminVariantSuppliersView,
)
from apps.admin_panel.views.purchase_orders import (
    AdminPurchaseOrderCancelView,
    AdminPurchaseOrderDetailView,
    AdminPurchaseOrderListView,
    AdminPurchaseOrderReceiveView,
    AdminPurchaseOrderSendView,
)
from apps.admin_panel.views.catalog import (
    AdminBrandDetailView,
    AdminBrandListView,
    AdminCategoryDetailView,
    AdminCategoryListView,
)
from apps.admin_panel.views.audit import AdminAuditDetailView, AdminAuditListView
from apps.admin_panel.views.contact import (
    AdminContactMessageDetailView,
    AdminContactMessageListView,
)
from apps.admin_panel.views.promotions import (
    AdminPromotionDetailView,
    AdminPromotionListView,
    AdminPromotionRedemptionsView,
)
from apps.admin_panel.views.reviews import (
    AdminReviewDetailView,
    AdminReviewListView,
)
from apps.admin_panel.views.analytics import (
    AdminAnalyticsOverviewView,
    AdminAnalyticsVisitorDetailView,
    AdminAnalyticsVisitorListView,
)
from apps.admin_panel.views.upload import AdminImageUploadView, AdminUploadInfoView
from apps.admin_panel.views.integrations import (
    AdminTelegramConfigView,
    AdminTelegramDiscoverView,
    AdminTelegramTestView,
)
from apps.admin_panel.views.customizations import (
    AdminCustomizationTemplateDetailView,
    AdminCustomizationTemplateListView,
    AdminFieldDetailView,
    AdminFieldOptionDetailView,
    AdminFieldOptionsView,
    AdminProductCustomizationDetailView,
    AdminProductCustomizationsView,
    AdminProductFieldsView,
    AdminTemplateFieldsView,
)
from apps.admin_panel.views.reports import (
    AdminInventoryValuationView,
    AdminPromotionsReportView,
    AdminSalesReportExportView,
    AdminSalesReportView,
    AdminTopProductsView,
    AdminTopSuppliersView,
    AdminVatReturnExportView,
    AdminVatReturnView,
)
from apps.admin_panel.views.finances import (
    AdminExpenseDetailView,
    AdminExpenseListView,
    AdminExpenseReceiptFileView,
    AdminExpenseReceiptView,
    AdminFinancesExportView,
    AdminFinancesOverviewView,
)

urlpatterns = [
    path("dashboard/", DashboardView.as_view()),

    # Orders
    path("orders/", AdminOrderListView.as_view()),
    path("orders/dropship/", AdminDropshipPendingView.as_view()),
    path("orders/<str:order_number>/", AdminOrderDetailView.as_view()),
    path("orders/<str:order_number>/status/", AdminOrderStatusView.as_view()),
    path("orders/<str:order_number>/ship/", AdminOrderShipView.as_view()),
    path("orders/<str:order_number>/cancel/", AdminOrderCancelView.as_view()),
    path("orders/<str:order_number>/refund/", AdminOrderRefundView.as_view()),
    path("orders/<str:order_number>/notes/", AdminOrderNotesView.as_view()),
    path("orders/<str:order_number>/email/", AdminOrderEmailCustomerView.as_view()),
    path("orders/<str:order_number>/items/<uuid:item_id>/forward/", AdminOrderForwardItemView.as_view()),

    # Products
    path("products/", AdminProductListView.as_view()),
    path("products/<uuid:product_id>/", AdminProductDetailView.as_view()),
    path("products/<uuid:product_id>/variants/", AdminProductVariantsView.as_view()),
    path("products/<uuid:product_id>/variants/bulk/", AdminProductVariantsBulkView.as_view()),
    path("products/<uuid:product_id>/option-types/", AdminProductOptionTypesView.as_view()),
    path("products/<uuid:product_id>/option-types/<uuid:link_id>/", AdminProductOptionTypeDetailView.as_view()),
    path("products/<uuid:product_id>/images/", AdminProductImagesView.as_view()),
    path("variants/<uuid:variant_id>/", AdminVariantDetailView.as_view()),
    path("images/<uuid:image_id>/", AdminImageDetailView.as_view()),

    # Option Types (global axes: Size, Color, etc.)
    path("option-types/", AdminOptionTypeListView.as_view()),
    path("option-types/<uuid:option_type_id>/", AdminOptionTypeDetailView.as_view()),
    path("option-types/<uuid:option_type_id>/values/", AdminOptionTypeValuesView.as_view()),
    path("option-values/<uuid:value_id>/", AdminOptionValueDetailView.as_view()),

    # Inventory
    path("inventory/", AdminInventoryListView.as_view()),
    path("inventory/<uuid:variant_id>/", AdminInventoryUpdateView.as_view()),
    path("inventory/<uuid:variant_id>/movements/", AdminInventoryMovementsView.as_view()),
    path("inventory/<uuid:variant_id>/batches/", AdminInventoryBatchesView.as_view()),

    # Customers
    path("customers/", AdminCustomerListView.as_view()),
    path("customers/<uuid:customer_id>/", AdminCustomerDetailView.as_view()),

    # Suppliers
    path("suppliers/", AdminSupplierListView.as_view()),
    path("suppliers/<uuid:supplier_id>/", AdminSupplierDetailView.as_view()),
    path("suppliers/<uuid:supplier_id>/products/", AdminSupplierProductsView.as_view()),
    path("suppliers/<uuid:supplier_id>/purchases/", AdminSupplierPurchasesView.as_view()),
    path("variants/<uuid:variant_id>/suppliers/", AdminVariantSuppliersView.as_view()),
    path("supplier-products/<uuid:sp_id>/", AdminSupplierProductDetailView.as_view()),

    # Purchase Orders
    path("purchase-orders/", AdminPurchaseOrderListView.as_view()),
    path("purchase-orders/<uuid:po_id>/", AdminPurchaseOrderDetailView.as_view()),
    path("purchase-orders/<uuid:po_id>/send/", AdminPurchaseOrderSendView.as_view()),
    path("purchase-orders/<uuid:po_id>/receive/", AdminPurchaseOrderReceiveView.as_view()),
    path("purchase-orders/<uuid:po_id>/cancel/", AdminPurchaseOrderCancelView.as_view()),

    # Brands & Categories
    path("brands/", AdminBrandListView.as_view()),
    path("brands/<uuid:brand_id>/", AdminBrandDetailView.as_view()),
    path("categories/", AdminCategoryListView.as_view()),
    path("categories/<uuid:category_id>/", AdminCategoryDetailView.as_view()),

    # Audit
    path("audit/", AdminAuditListView.as_view()),
    path("audit/<uuid:log_id>/", AdminAuditDetailView.as_view()),

    # Contact messages
    path("contact-messages/", AdminContactMessageListView.as_view()),
    path("contact-messages/<uuid:message_id>/", AdminContactMessageDetailView.as_view()),

    # Promotions
    path("promotions/", AdminPromotionListView.as_view()),
    path("promotions/<uuid:promotion_id>/", AdminPromotionDetailView.as_view()),
    path("promotions/<uuid:promotion_id>/redemptions/", AdminPromotionRedemptionsView.as_view()),

    # Reviews
    path("reviews/", AdminReviewListView.as_view()),
    path("reviews/<uuid:review_id>/", AdminReviewDetailView.as_view()),

    # Analytics
    path("analytics/overview/", AdminAnalyticsOverviewView.as_view()),
    path("analytics/visitors/", AdminAnalyticsVisitorListView.as_view()),
    path("analytics/visitors/<uuid:visitor_id>/", AdminAnalyticsVisitorDetailView.as_view()),

    # Uploads
    path("upload/info/", AdminUploadInfoView.as_view()),
    path("upload/image/", AdminImageUploadView.as_view()),

    # Integrations (Telegram)
    path("integrations/telegram/", AdminTelegramConfigView.as_view()),
    path("integrations/telegram/discover/", AdminTelegramDiscoverView.as_view()),
    path("integrations/telegram/test/", AdminTelegramTestView.as_view()),

    # Customizations
    path("customizations/templates/", AdminCustomizationTemplateListView.as_view()),
    path("customizations/templates/<uuid:template_id>/", AdminCustomizationTemplateDetailView.as_view()),
    path("customizations/templates/<uuid:template_id>/fields/", AdminTemplateFieldsView.as_view()),
    path("customizations/fields/<uuid:field_id>/", AdminFieldDetailView.as_view()),
    path("customizations/fields/<uuid:field_id>/options/", AdminFieldOptionsView.as_view()),
    path("customizations/options/<uuid:option_id>/", AdminFieldOptionDetailView.as_view()),
    path("products/<uuid:product_id>/customizations/", AdminProductCustomizationsView.as_view()),
    path("products/<uuid:product_id>/customizations/<uuid:link_id>/", AdminProductCustomizationDetailView.as_view()),
    path("products/<uuid:product_id>/customizations/fields/", AdminProductFieldsView.as_view()),

    # Reports
    path("reports/sales/", AdminSalesReportView.as_view()),
    path("reports/sales/export/", AdminSalesReportExportView.as_view()),
    path("reports/inventory-valuation/", AdminInventoryValuationView.as_view()),
    path("reports/top-products/", AdminTopProductsView.as_view()),
    path("reports/top-suppliers/", AdminTopSuppliersView.as_view()),
    path("reports/vat-return/", AdminVatReturnView.as_view()),
    path("reports/vat-return/export/", AdminVatReturnExportView.as_view()),
    path("reports/promotions/", AdminPromotionsReportView.as_view()),

    # Finances (expense ledger + P&L overview + year-end CSV)
    path("finances/overview/", AdminFinancesOverviewView.as_view()),
    path("finances/export/", AdminFinancesExportView.as_view()),
    path("expenses/", AdminExpenseListView.as_view()),
    path("expenses/<uuid:expense_id>/", AdminExpenseDetailView.as_view()),
    path("expenses/<uuid:expense_id>/receipt/", AdminExpenseReceiptView.as_view()),
    path("expenses/<uuid:expense_id>/receipt/file/", AdminExpenseReceiptFileView.as_view()),

    # Team / RBAC management — list staff and change roles. Both
    # gated by team.* permissions; Owner is the only role that holds
    # team.manage out of the box.
    path("team/", AdminTeamListView.as_view()),
    path("team/<uuid:user_id>/role/", AdminTeamRoleView.as_view()),

    # Role CRUD + permission catalogue for custom roles.
    path("roles/catalogue/", AdminRoleCatalogueView.as_view()),
    path("roles/", AdminRoleListView.as_view()),
    path("roles/<str:code>/", AdminRoleDetailView.as_view()),
    path("roles/<str:code>/clone/", AdminRoleCloneView.as_view()),
]
