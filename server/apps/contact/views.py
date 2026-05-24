from rest_framework.views import APIView
from rest_framework.permissions import AllowAny
from rest_framework.throttling import AnonRateThrottle

from apps.core.responses import created_response, validation_error_response

from apps.integrations.models import NotificationEvent
from apps.integrations.services import notify

from .models import ContactMessage
from .serializers import ContactSerializer


class ContactThrottle(AnonRateThrottle):
    rate = "3/minute"


class ContactView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ContactThrottle]

    def post(self, request):
        # Honeypot
        if request.data.get("website"):
            return created_response({"code": "contact.sent"})

        serializer = ContactSerializer(data=request.data)
        if not serializer.is_valid():
            return validation_error_response(serializer.errors)

        data = serializer.validated_data
        ContactMessage.objects.create(
            name=data["name"],
            email=data["email"],
            subject=data.get("subject", ""),
            message=data["message"],
        )

        # Fire-and-forget — never blocks the response.
        notify(NotificationEvent.CONTACT_MESSAGE, {
            "name": data["name"],
            "email": data["email"],
            "subject": data.get("subject", ""),
            "message": data["message"],
        })

        return created_response({"code": "contact.sent"})
