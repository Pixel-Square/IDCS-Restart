from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from applications.services import inbox_service
from applications.serializers.inbox_serializers import ApproverInboxItemSerializer


class ApproverInboxView(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request, *args, **kwargs):
        user = request.user
        qs = inbox_service.get_pending_approvals_for_user(user)
        serializer = ApproverInboxItemSerializer(qs, many=True)
        return Response(serializer.data)
