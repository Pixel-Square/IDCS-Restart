# Fix: Settings Page Routing Issue

## Problem
When IQAC users clicked on "Settings" in the sidebar, the page was redirecting to the profile page instead of showing the Settings page with WhatsApp QR code access.

## Root Cause
The routes for `/settings` and `/settings/whatsapp-sender` were **missing** from the application routing configuration in `App.tsx`. 

While:
- ✅ The components existed (`SettingsPage.tsx`, `WhatsAppSenderPage.tsx`)
- ✅ The sidebar link was configured (`/settings`)
- ✅ The backend endpoints were working
- ❌ **The frontend routes were not defined**

This caused React Router to fall through to the wildcard route, which redirected to dashboard or profile.

## Solution

### Changes Made to `/frontend/src/App.tsx`

#### 1. Added Imports
```typescript
import SettingsPage from './pages/settings/SettingsPage';
import WhatsAppSenderPage from './pages/settings/WhatsAppSenderPage';
```

#### 2. Added Routes
```typescript
<Route
  path="/settings"
  element={<ProtectedRoute user={user} requiredRoles={['IQAC']} element={<SettingsPage />} />}
/>
<Route
  path="/settings/whatsapp-sender"
  element={<ProtectedRoute user={user} requiredRoles={['IQAC']} element={<WhatsAppSenderPage />} />}
/>
```

### Route Protection
Both routes are protected with:
- **Authentication Required**: Users must be logged in
- **IQAC Role Required**: Only users with the IQAC role can access

This matches the backend permission requirements where all WhatsApp gateway endpoints check for IQAC role.

## Testing

### Build & Deploy
```bash
cd /home/iqac/IDCS-Restart/frontend
npm run build
rsync -av --delete build/ /home/iqac/IDCS-Restart/backend/staticfiles/
```

### Verify Routes
1. **Login as IQAC user**: Username `000000`, Password `123`
2. **Navigate to Settings**: Click "Settings" in sidebar
3. **Access WhatsApp Settings**: Click "WhatsApp Sender Number" card
4. **Expected Result**: 
   - Settings page shows system integration options
   - WhatsApp page shows QR code (if status is `QR_READY`)
   - No redirect to profile

## Related Files

### Frontend
- `/frontend/src/App.tsx` - Added routes ✅
- `/frontend/src/pages/settings/SettingsPage.tsx` - Settings landing page
- `/frontend/src/pages/settings/WhatsAppSenderPage.tsx` - WhatsApp QR/status page
- `/frontend/src/components/layout/DashboardSidebar.tsx` - Sidebar navigation (already correct)

### Backend
- `/backend/accounts/views.py` - WhatsApp gateway proxy endpoints
  - `WhatsAppGatewayStatusView` - Get connection status
  - `WhatsAppGatewayQrView` - Get QR code
  - `WhatsAppGatewayRestartView` - Restart gateway
  - `WhatsAppGatewayDisconnectView` - Disconnect gateway
  - `WhatsAppGatewayClearSessionView` - Clear session

### WhatsApp Server
- `/whatsapp-server/server.js` - Node.js WhatsApp gateway (port 3000)
- Status: Running but awaiting QR scan to connect

## Navigation Flow

```
User clicks "Settings" in Sidebar
         ↓
   /settings route
         ↓
 SettingsPage component
         ↓
User clicks "WhatsApp Sender Number"
         ↓
/settings/whatsapp-sender route
         ↓
WhatsAppSenderPage component
         ↓
Backend API: GET /api/accounts/settings/whatsapp/status/
         ↓
Backend Proxy: GET http://localhost:3000/status
         ↓
WhatsApp Server Response: {"status": "QR_READY", ...}
         ↓
Page displays QR code for scanning
```

## Status After Fix

✅ **FIXED**: Settings page routing works correctly  
✅ **FIXED**: WhatsApp settings page accessible  
✅ **DEPLOYED**: Frontend build deployed to staticfiles  
⚠️ **PENDING**: WhatsApp needs phone pairing (QR scan)

## Next Steps

To complete WhatsApp OTP functionality:
1. Login as IQAC user
2. Navigate to Settings → WhatsApp Sender Number
3. Click "Connect to WhatsApp"
4. Scan QR code with phone
5. Status will change to `CONNECTED`
6. OTP sending will work

---

**Fixed**: March 11, 2026  
**Issue**: Missing route definitions  
**Impact**: IQAC users can now access WhatsApp settings  
