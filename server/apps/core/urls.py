from django.urls import path

from apps.core.views import (
    BrandSlugRedirectView,
    CategorySlugRedirectView,
    ProductSlugRedirectView,
    SiteLegalView,
    SitemapSlugsView,
)

urlpatterns = [
    path("sitemap/slugs/", SitemapSlugsView.as_view()),
    path("site/legal/", SiteLegalView.as_view()),
    path("redirect/products/<slug:slug>/", ProductSlugRedirectView.as_view()),
    path("redirect/categories/<slug:slug>/", CategorySlugRedirectView.as_view()),
    path("redirect/brands/<slug:slug>/", BrandSlugRedirectView.as_view()),
]
