import json
from django.http import JsonResponse, HttpResponseBadRequest
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from .models import CdapRevision, CdapActiveLearningAnalysisMapping
from .services.cdap_parser import parse_cdap_excel

def _require_auth(request):
    if not getattr(request, 'user', None) or not request.user.is_authenticated:
        return JsonResponse({'detail': 'Authentication required.'}, status=401)
    return None

def _body_json(request):
    try:
        return json.loads((request.body or b'{}').decode('utf-8'))
    except Exception:
        return None

@csrf_exempt
@require_http_methods(['POST'])
def upload_cdap(request):
    auth = _require_auth(request)
    if auth:
        return auth
    if 'file' not in request.FILES:
        return HttpResponseBadRequest('Missing file')
    parsed = parse_cdap_excel(request.FILES['file'])
    return JsonResponse(parsed)

@csrf_exempt
@require_http_methods(['GET', 'PUT'])
def cdap_revision(request, subject_id):
    auth = _require_auth(request)
    if auth:
        return auth

    if request.method == 'GET':
        rev = CdapRevision.objects.filter(subject_id=subject_id).first()
        if not rev:
            return JsonResponse({
                'subject_id': str(subject_id),
                'status': 'draft',
                'rows': [],
                'books': {'textbook': '', 'reference': ''},
                'active_learning': {'grid': [], 'dropdowns': []},
            })
        return JsonResponse({
            'subject_id': str(rev.subject_id),
            'status': rev.status,
            'rows': rev.rows,
            'books': rev.books,
            'active_learning': rev.active_learning,
        })

    body = _body_json(request)
    if body is None:
        return HttpResponseBadRequest('Invalid JSON')

    defaults = {
        'rows': body.get('rows', []),
        'books': body.get('books', {}),
        'active_learning': body.get('active_learning', {}),
        'status': body.get('status', 'draft'),
        'updated_by': getattr(request.user, 'id', None),
    }

    obj = CdapRevision.objects.filter(subject_id=subject_id).first()
    if obj:
        for k, v in defaults.items():
            setattr(obj, k, v)
        obj.save(update_fields=list(defaults.keys()) + ['updated_at'])
    else:
        obj = CdapRevision(subject_id=subject_id, created_by=getattr(request.user, 'id', None), **defaults)
        obj.save()

    return JsonResponse({
        'subject_id': str(obj.subject_id),
        'status': obj.status,
        'rows': obj.rows,
        'books': obj.books,
        'active_learning': obj.active_learning,
    })

@csrf_exempt
@require_http_methods(['GET', 'PUT'])
def active_learning_mapping(request):
    auth = _require_auth(request)
    if auth:
        return auth

    row = CdapActiveLearningAnalysisMapping.objects.filter(id=1).first()

    if request.method == 'GET':
        return JsonResponse({
            'mapping': row.mapping if row else {},
            'updated_at': row.updated_at.isoformat() if row and row.updated_at else None,
        })

    body = _body_json(request)
    if body is None:
        return HttpResponseBadRequest('Invalid JSON')

    mapping = body.get('mapping', {})
    if row:
        row.mapping = mapping
        row.updated_by = getattr(request.user, 'id', None)
        row.save(update_fields=['mapping', 'updated_by', 'updated_at'])
    else:
        row = CdapActiveLearningAnalysisMapping(id=1, mapping=mapping, updated_by=getattr(request.user, 'id', None))
        row.save()

    return JsonResponse({'mapping': row.mapping, 'updated_at': row.updated_at.isoformat()})
