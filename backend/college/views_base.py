"""
Base classes and helpers for college-scoped views.

Usage with ModelViewSet::

    from college.views_base import CollegeScopedMixin

    class MyViewSet(CollegeScopedMixin, viewsets.ModelViewSet):
        queryset = MyModel.objects.all()
        serializer_class = MySerializer

Usage with plain APIView::

    from college.views_base import college_scoped_qs, college_get_object

    class MyListView(APIView):
        def get(self, request):
            qs = college_scoped_qs(MyModel).filter(is_active=True)
            ...

    class MyDetailView(APIView):
        def get(self, request, pk):
            obj = college_get_object(MyModel, pk=pk)
            ...
"""

from django.shortcuts import get_object_or_404

from .tenant import get_current_college_id


# ---------------------------------------------------------------------------
# Lightweight helpers for plain APIView-style views
# ---------------------------------------------------------------------------

def college_scoped_qs(model, request=None):
    """Return ``model.objects.all()`` filtered to the current college.

    When no college context is active (super-admin global mode) the full
    queryset is returned.
    """
    qs = model.objects.all()
    cid = get_current_college_id()
    if cid is not None:
        qs = qs.filter(college_id=cid)
    return qs


def college_get_object(model, **filters):
    """Shortcut: fetch one object scoped to the current college, or 404.

    >>> obj = college_get_object(Department, pk=42)
    """
    cid = get_current_college_id()
    qs = model.objects.filter(**filters)
    if cid is not None:
        qs = qs.filter(college_id=cid)
    return get_object_or_404(qs)


# ---------------------------------------------------------------------------
# Mixin for DRF ViewSets / GenericAPIViews
# ---------------------------------------------------------------------------

class CollegeScopedMixin:
    """Filter ``get_queryset`` by current college and auto-assign on create.

    * ``get_queryset()`` adds ``.filter(college_id=...)`` unless the user is
      in global mode.
    * ``perform_create()`` sets ``college_id`` on the new instance from the
      current context.
    * ``perform_update()`` prevents accidental college transfer by re-setting
      the existing college id (the serializer is expected to exclude
      ``college`` from writable fields).

    Override ``college_field`` on your class if the FK column is named
    differently.
    """

    college_field: str = 'college'

    def get_college_id(self) -> int | None:
        return get_current_college_id()

    def filter_by_college(self, qs):
        """Apply college filter.  Override if the FK path is indirect."""
        cid = self.get_college_id()
        if cid is not None:
            return qs.filter(**{f'{self.college_field}_id': cid})
        return qs

    def get_queryset(self):
        qs = super().get_queryset()  # type: ignore[misc]
        return self.filter_by_college(qs)

    def perform_create(self, serializer):
        cid = self.get_college_id()
        extra = {self.college_field + '_id': cid} if cid is not None else {}
        serializer.save(**extra)

    def perform_update(self, serializer):
        # Prevent college transfer by re-passing the existing row's college id.
        instance = serializer.instance
        cid = getattr(instance, f'{self.college_field}_id', None)
        extra = {self.college_field + '_id': cid} if cid is not None else {}
        serializer.save(**extra)
