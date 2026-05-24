from django.contrib import admin

from .models import Expense


@admin.register(Expense)
class ExpenseAdmin(admin.ModelAdmin):
    list_display = (
        "paid_at",
        "category",
        "amount_display",
        "description",
        "supplier",
        "order",
        "auto_created",
        "has_receipt",
    )
    list_filter = ("category", "auto_created", "paid_at")
    search_fields = ("description", "notes", "external_ref")
    readonly_fields = ("external_ref", "auto_created", "created_at", "updated_at")
    date_hierarchy = "paid_at"
    autocomplete_fields = ("supplier", "order", "purchase_order")

    @admin.display(description="Amount", ordering="amount_pence")
    def amount_display(self, obj: Expense) -> str:
        return f"£{obj.amount_pounds:.2f}"

    @admin.display(boolean=True, description="Receipt")
    def has_receipt(self, obj: Expense) -> bool:
        return bool(obj.receipt_key)
