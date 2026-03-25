import logging

from django.core.exceptions import ValidationError as DjangoValidationError
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.pagination import PageNumberPagination
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Announcement, AnnouncementReadStatus
from .permissions import (
    HasAnnouncementCreatePermission,
    HasAnnouncementPagePermission,
)
from .serializers import (
    AnnouncementCreateSerializer,
    AnnouncementListSerializer,
    AnnouncementReadStatusSerializer,
    AnnouncementUpdateSerializer,
)
from .services import AnnouncementScopeService
from .services import ROLE_STUDENT, get_actor_role


logger = logging.getLogger(__name__)


class AnnouncementPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = 'page_size'
    max_page_size = 100


class AnnouncementListView(APIView):
    permission_classes = [IsAuthenticated, HasAnnouncementPagePermission]

    def get(self, request):
        scope = AnnouncementScopeService.build_scope(request.user)
        queryset = AnnouncementScopeService.queryset_for_user(request.user, scope)

        paginator = AnnouncementPagination()
        page = paginator.paginate_queryset(queryset, request)
        serializer = AnnouncementListSerializer(page, many=True, context={'request': request})
        return paginator.get_paginated_response(serializer.data)


class AnnouncementCreateView(APIView):
    permission_classes = [IsAuthenticated, HasAnnouncementCreatePermission]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def post(self, request):
        scope = AnnouncementScopeService.build_scope(request.user)
        serializer = AnnouncementCreateSerializer(data=request.data, context={'request': request})
        if not serializer.is_valid():
            logger.warning(
                'Announcement create serializer validation failed for user=%s errors=%s',
                getattr(request.user, 'id', None),
                serializer.errors,
            )
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        try:
            AnnouncementScopeService.validate_create_payload(
                user=request.user,
                scope=scope,
                payload=serializer.validated_data,
            )
            announcement = serializer.save(created_by=request.user)
            read_serializer = AnnouncementListSerializer(announcement, context={'request': request})
            return Response(read_serializer.data, status=status.HTTP_201_CREATED)
        except DRFValidationError as exc:
            logger.warning(
                'Announcement create scope validation failed for user=%s error=%s payload_keys=%s',
                getattr(request.user, 'id', None),
                exc.detail,
                list(serializer.validated_data.keys()),
            )
            return Response(exc.detail, status=status.HTTP_400_BAD_REQUEST)
        except DjangoValidationError as exc:
            logger.warning(
                'Announcement create model validation failed for user=%s error=%s payload_keys=%s',
                getattr(request.user, 'id', None),
                exc.message_dict or exc.messages,
                list(serializer.validated_data.keys()),
            )
            payload = exc.message_dict or {'detail': exc.messages[0] if exc.messages else 'Invalid announcement data'}
            return Response(payload, status=status.HTTP_400_BAD_REQUEST)
        except Exception:
            logger.exception('Unexpected announcement create failure for user=%s', getattr(request.user, 'id', None))
            return Response({'detail': 'Unexpected server error while creating announcement.'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class AnnouncementSentListView(APIView):
    permission_classes = [IsAuthenticated, HasAnnouncementPagePermission]

    def get(self, request):
        scope = AnnouncementScopeService.build_scope(request.user)
        if get_actor_role(roles=scope.roles) == ROLE_STUDENT:
            return Response({'detail': 'Students are not allowed to view sent announcements.'}, status=status.HTTP_403_FORBIDDEN)

        queryset = AnnouncementScopeService.sent_queryset_for_user(request.user)

        paginator = AnnouncementPagination()
        page = paginator.paginate_queryset(queryset, request)
        serializer = AnnouncementListSerializer(page, many=True, context={'request': request})
        return paginator.get_paginated_response(serializer.data)


class AnnouncementDetailView(APIView):
    permission_classes = [IsAuthenticated, HasAnnouncementPagePermission]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_object(self, request, announcement_id):
        scope = AnnouncementScopeService.build_scope(request.user)
        queryset = AnnouncementScopeService.queryset_for_user(request.user, scope)
        return queryset.filter(id=announcement_id).first()

    def put(self, request, announcement_id):
        obj = self.get_object(request, announcement_id)
        if obj is None:
            return Response({'detail': 'Announcement not found.'}, status=status.HTTP_404_NOT_FOUND)

        scope = AnnouncementScopeService.build_scope(request.user)
        if not (
            request.user.is_superuser
            or obj.created_by_id == request.user.id
            or 'announcements.manage_announcement' in scope.permissions
        ):
            return Response({'detail': 'You do not have permission to update this announcement.'}, status=status.HTTP_403_FORBIDDEN)

        serializer = AnnouncementUpdateSerializer(obj, data=request.data, partial=False, context={'request': request})
        serializer.is_valid(raise_exception=True)

        AnnouncementScopeService.validate_create_payload(
            user=request.user,
            scope=scope,
            payload=serializer.validated_data,
        )
        updated = serializer.save()
        return Response(AnnouncementListSerializer(updated, context={'request': request}).data)

    def delete(self, request, announcement_id):
        obj = self.get_object(request, announcement_id)
        if obj is None:
            return Response({'detail': 'Announcement not found.'}, status=status.HTTP_404_NOT_FOUND)

        scope = AnnouncementScopeService.build_scope(request.user)
        if not (
            request.user.is_superuser
            or obj.created_by_id == request.user.id
            or 'announcements.manage_announcement' in scope.permissions
        ):
            return Response({'detail': 'You do not have permission to delete this announcement.'}, status=status.HTTP_403_FORBIDDEN)

        obj.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class AnnouncementOptionsView(APIView):
    permission_classes = [IsAuthenticated, HasAnnouncementPagePermission]

    def get(self, request):
        scope = AnnouncementScopeService.build_scope(request.user)
        data = AnnouncementScopeService.create_options_for_user(request.user, scope)
        return Response(data)


class AnnouncementMarkReadView(APIView):
    permission_classes = [IsAuthenticated, HasAnnouncementPagePermission]

    def post(self, request, announcement_id):
        scope = AnnouncementScopeService.build_scope(request.user)
        announcement = AnnouncementScopeService.queryset_for_user(request.user, scope).filter(id=announcement_id).first()
        if announcement is None:
            return Response({'detail': 'Announcement not found.'}, status=status.HTTP_404_NOT_FOUND)

        AnnouncementReadStatus.objects.update_or_create(
            announcement=announcement,
            user=request.user,
            defaults={'is_read': True, 'read_at': timezone.now()},
        )
        return Response({'status': 'ok'})


class AnnouncementUnreadCountView(APIView):
    permission_classes = [IsAuthenticated, HasAnnouncementPagePermission]

    def get(self, request):
        scope = AnnouncementScopeService.build_scope(request.user)
        count = AnnouncementScopeService.unread_count_for_user(request.user, scope)
        return Response({'unread_count': count})


class AnnouncementReadersView(APIView):
    permission_classes = [IsAuthenticated, HasAnnouncementPagePermission]

    def get(self, request, announcement_id):
        scope = AnnouncementScopeService.build_scope(request.user)
        announcement = AnnouncementScopeService.queryset_for_user(request.user, scope).filter(id=announcement_id).first()
        if announcement is None:
            return Response({'detail': 'Announcement not found.'}, status=status.HTTP_404_NOT_FOUND)

        if not (
            request.user.is_superuser
            or announcement.created_by_id == request.user.id
            or 'announcements.manage_announcement' in scope.permissions
        ):
            return Response({'detail': 'You do not have permission to view readers for this announcement.'}, status=status.HTTP_403_FORBIDDEN)

        read_statuses = (
            AnnouncementReadStatus.objects.filter(announcement=announcement, is_read=True)
            .select_related('user')
            .order_by('-read_at')
        )

        serializer = AnnouncementReadStatusSerializer(read_statuses, many=True)
        payload = {
            'id': str(announcement.id),
            'title': announcement.title,
            'target_type': announcement.target_type,
            'target_roles': announcement.target_roles,
            'department_name': getattr(announcement.department, 'name', None),
            'class_name': str(getattr(announcement, 'target_class', '') or '') or None,
            'readers': serializer.data,
        }
        return Response(payload)


# Compatibility endpoints for existing clients using /announcements/announcements/...
class LegacyAnnouncementListView(AnnouncementListView):
    pass


class LegacyAnnouncementCreateView(AnnouncementCreateView):
    pass


class LegacyAnnouncementMarkReadView(AnnouncementMarkReadView):
    pass


class LegacyAnnouncementOptionsView(AnnouncementOptionsView):
    pass


class LegacyAnnouncementSentListView(AnnouncementSentListView):
    pass
