# JSON Parsing Error Fix - Feedback Module

## Issue
Users were encountering the error: **"Unexpected token '<', '<!doctype' is not valid JSON"** when submitting or creating feedback forms.

This error occurs when the frontend expects JSON but receives HTML instead (typically a Django error page or authentication redirect).

## Root Causes Identified
1. **Database Migration Not Applied**: The schema changes for `allow_rating` and `allow_comment` fields were not applied to the database.
2. **Insufficient Error Handling**: Backend views could throw unhandled exceptions, causing Django to return HTML error pages instead of JSON responses.
3. **Frontend JSON Parsing**: Frontend didn't check Content-Type headers before attempting to parse responses as JSON.

## Changes Implemented

### Backend Changes (feedback/views.py)

#### 1. CreateFeedbackFormView - Enhanced Error Handling
```python
def post(self, request):
    try:
        # Check permissions
        user_permissions = get_user_permissions(request.user)
        if 'feedback.create' not in user_permissions:
            return Response({
                'detail': 'You do not have permission to create feedback forms.'
            }, status=status.HTTP_403_FORBIDDEN)
        
        # Get staff profile
        try:
            staff_profile = StaffProfile.objects.get(user=request.user)
        except StaffProfile.DoesNotExist:
            return Response({
                'detail': 'Staff profile not found.'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # ... rest of the logic
        
        serializer = FeedbackFormCreateSerializer(data=mutable_data)
        if serializer.is_valid():
            feedback_form = serializer.save(created_by=request.user)
            response_serializer = FeedbackFormSerializer(feedback_form)
            return Response(response_serializer.data, status=status.HTTP_201_CREATED)
        
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    except Exception as e:
        # Catch any unexpected errors and return JSON
        return Response({
            'detail': f'An error occurred while creating the feedback form: {str(e)}'
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
```

**Key improvements:**
- Wrapped entire method in try-except to catch all unexpected errors
- Returns JSON error responses instead of letting Django render HTML error pages
- Provides specific error messages with HTTP status codes

### Frontend Changes (FeedbackPage.tsx)

#### 1. Enhanced handleSubmitForm - Content-Type Check
```typescript
const response = await fetchWithAuth('/api/feedback/create/', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(payload),
});

// Check if response is JSON before parsing
const contentType = response.headers.get('content-type');
if (!contentType || !contentType.includes('application/json')) {
  throw new Error('Server returned non-JSON response. Please check server logs.');
}

let data;
try {
  data = await response.json();
} catch (jsonError) {
  console.error('Failed to parse response as JSON:', jsonError);
  throw new Error('Invalid response from server. Expected JSON but received HTML.');
}

if (!response.ok) {
  throw new Error(data.detail || data.error || 'Failed to create feedback form');
}
```

**Key improvements:**
- Checks Content-Type header before attempting JSON parsing
- Wraps JSON parsing in try-catch to provide better error messages
- Provides clear error messages indicating the actual problem (HTML vs JSON)

### Database Changes

#### Migration Applied
```bash
python manage.py migrate feedback
# Successfully applied: feedback.0007_add_allow_rating_and_comment_fields
```

This migration adds the following fields to the `FeedbackQuestion` model:
- `allow_rating` (BooleanField, default=False)
- `allow_comment` (BooleanField, default=False)

## Testing Recommendations

### 1. Test API Endpoints Directly
Use curl, Postman, or browser DevTools to verify JSON responses:

```bash
# Test GET endpoint
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:8000/api/feedback/forms/

# Test POST endpoint
curl -X POST \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Test Form",...}' \
  http://localhost:8000/api/feedback/create/
```

### 2. Check Django Console Logs
Monitor backend console during form submission to see actual Python exceptions if any occur.

### 3. Verify Authentication
Ensure JWT tokens are valid and not expired. Check:
- Token exists in localStorage
- Token format is correct (Bearer token)
- Token expiration time
- Backend authentication middleware is working

### 4. Test Error Scenarios
- Try creating forms without required fields
- Test with expired/invalid tokens
- Test with users lacking permissions
- Test with network timeouts

## Prevention Strategies

### Backend Best Practices
1. **Always use Response objects**: Never use raw HttpResponse or render() in API views
2. **Wrap views in try-except**: Catch all unexpected errors and return JSON
3. **Apply migrations**: Always run `python manage.py migrate` after creating migrations
4. **Use DRF's APIView**: Automatically serializes responses to JSON

### Frontend Best Practices
1. **Check Content-Type**: Verify response is JSON before parsing
2. **Wrap JSON parsing**: Always use try-catch around `response.json()`
3. **Log full errors**: Log the actual response text when JSON parsing fails
4. **Handle all error types**: 400, 401, 403, 404, 500, network errors

## Related Files
- Backend: [feedback/views.py](../backend/feedback/views.py)
- Frontend: [frontend/src/pages/feedback/FeedbackPage.tsx](../frontend/src/pages/feedback/FeedbackPage.tsx)
- Migration: [backend/feedback/migrations/0007_add_allow_rating_and_comment_fields.py](../backend/feedback/migrations/0007_add_allow_rating_and_comment_fields.py)

## Status
✅ Migration applied successfully
✅ Backend error handling enhanced
✅ Frontend JSON parsing safety improved
✅ No syntax errors detected
✅ Ready for testing
