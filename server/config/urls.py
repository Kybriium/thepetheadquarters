from django.conf import settings
from django.conf.urls.static import static
from django.http import JsonResponse
from django.urls import include, path

from apps.accounts.urls import address_urlpatterns, auth_urlpatterns

urlpatterns = [
    path("api/v1/auth/", include(auth_urlpatterns)),
    path("api/v1/addresses/", include(address_urlpatterns)),
    path("api/v1/", include("apps.categories.urls")),
    path("api/v1/", include("apps.brands.urls")),
    path("api/v1/", include("apps.products.urls")),
    path("api/v1/", include("apps.attributes.urls")),
    path("api/v1/", include("apps.customizations.urls")),
    path("api/v1/", include("apps.newsletter.urls")),
    path("api/v1/", include("apps.contact.urls")),
    path("api/v1/", include("apps.orders.urls")),
    path("api/v1/", include("apps.promotions.urls")),
    path("api/v1/", include("apps.reviews.urls")),
    path("api/v1/", include("apps.analytics.urls")),
    path("api/v1/", include("apps.core.urls")),
    path("api/v1/admin/", include("apps.admin_panel.urls")),
]

# Serve uploaded media files in dev (when not using Cloudinary).
# In production with Cloudinary, files live on the CDN, not the Django server.
if settings.DEBUG and not settings.CLOUDINARY_URL:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)


def handler404(request, exception):
    return JsonResponse({"status": "error", "code": "common.not_found"}, status=404)


handler404 = handler404
