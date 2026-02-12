from rest_framework.decorators import api_view, permission_classes, authentication_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from rest_framework_simplejwt.authentication import JWTAuthentication

from .services.docx_scanner import scan_docx_file


@api_view(['POST'])
@authentication_classes([JWTAuthentication])
@permission_classes([IsAuthenticated])
def scan_docx(request):
    if 'file' not in request.FILES:
        return Response({'detail': 'Missing file'}, status=status.HTTP_400_BAD_REQUEST)

    f = request.FILES['file']
    questions = scan_docx_file(f)
    # Debug: log counts and sample image prefixes for troubleshooting
    debug = {}
    try:
        total_q = len(questions)
        total_imgs = sum(len(q.get('images') or []) for q in questions)
        sample_img = None
        sample_qs = [q.get('question_text') for q in questions[:3]]
        for q in questions:
            imgs = q.get('images') or []
            if imgs:
                s = imgs[0]
                sample_img = (s[:160] + '...') if isinstance(s, str) and len(s) > 160 else s
                break
        import logging
        logger = logging.getLogger('template_api.scan')
        logger.info('scan_docx: parsed_questions=%d total_images=%d sample_image_prefix=%s', total_q, total_imgs, sample_img)
        debug = {
            'parsed_questions': total_q,
            'total_images': total_imgs,
            'sample_image_prefix': sample_img,
            'sample_questions': sample_qs,
        }
    except Exception:
        debug = {'parsed_questions': len(questions)}

    return Response({'questions': questions, 'debug': debug})
