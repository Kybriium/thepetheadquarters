from django.urls import path

from .viewsets import ProductViewSet

viewset = ProductViewSet

urlpatterns = [
    path("products/", viewset.as_view({"get": "list"}), name="product-list"),
    path("products/featured/", viewset.as_view({"get": "featured"}), name="product-featured"),
    path("products/<slug:slug>/", viewset.as_view({"get": "retrieve"}), name="product-detail"),
    path("products/<slug:slug>/social-proof/", viewset.as_view({"get": "social_proof"}), name="product-social-proof"),
]
