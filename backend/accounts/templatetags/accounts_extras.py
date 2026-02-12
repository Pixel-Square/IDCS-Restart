from django import template

register = template.Library()


@register.filter
def get_item(obj, key):
    """Template helper: dict access by dynamic key."""
    try:
        return obj.get(key)
    except Exception:
        try:
            return obj[key]
        except Exception:
            return ''
