import re

from rest_framework.views import exception_handler
from rest_framework import status


# Pattern for application-defined error codes like "auth.mfa_required".
# When a DRF exception's detail matches this, we treat it as a real code
# the caller chose and pass it through unchanged; otherwise we fall back
# to the generic per-status code so we don't leak DRF's prose messages
# ("You do not have permission to perform this action.") into the API.
_APP_CODE_RE = re.compile(r"^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$")


def api_exception_handler(exc, context):
    response = exception_handler(exc, context)

    if response is None:
        return None

    code_map = {
        status.HTTP_400_BAD_REQUEST: "common.bad_request",
        status.HTTP_401_UNAUTHORIZED: "common.unauthorized",
        status.HTTP_403_FORBIDDEN: "common.forbidden",
        status.HTTP_404_NOT_FOUND: "common.not_found",
        status.HTTP_405_METHOD_NOT_ALLOWED: "common.method_not_allowed",
        status.HTTP_429_TOO_MANY_REQUESTS: "common.rate_limited",
        status.HTTP_500_INTERNAL_SERVER_ERROR: "common.server_error",
    }

    error_code = code_map.get(response.status_code, "common.unknown_error")

    if isinstance(response.data, dict) and "detail" in response.data:
        detail = str(response.data.get("detail", ""))
        # Preserve well-formed app codes (e.g. permissions raising
        # PermissionDenied("auth.mfa_required")) so the frontend can
        # branch on them.
        if _APP_CODE_RE.match(detail):
            response.data = {"status": "error", "code": detail}
        else:
            response.data = {"status": "error", "code": error_code}
    elif isinstance(response.data, dict):
        response.data = {
            "status": "error",
            "code": "common.validation_error",
            "errors": response.data,
        }
    else:
        response.data = {"status": "error", "code": error_code}

    return response
