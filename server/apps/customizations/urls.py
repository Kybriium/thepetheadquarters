from django.urls import path

from .viewsets import CustomizationUploadView, ProductCustomizationsView

urlpatterns = [
    path(
        "products/<slug:slug>/customizations/",
        ProductCustomizationsView.as_view(),
        name="product-customizations",
    ),
    path(
        "customizations/upload/",
        CustomizationUploadView.as_view(),
        name="customization-upload",
    ),
]
