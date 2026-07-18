# 🧪 Testing Salary Slip Module

## Quick Start Test

### 1. Start Development Server
```bash
cd frontend
npm run dev
```

### 2. Login
- Navigate to: http://localhost:5173/login
- Login with: `NV001` / `NV001` (or `admin` / `admin`)

### 3. Access Salary Slip
- Click "Phiếu lương" in sidebar
- Or navigate to: http://localhost:5173/salary-slip

### 4. Expected States (without backend)

#### Initial State ✅
- Header shows: "Phiếu Lương Cá Nhân"
- Subtitle shows: "Nhân viên: NV001"
- Month selector shows current month
- Content area shows: "Chọn tháng để xem phiếu lương"

#### After clicking "Xem phiếu lương" ⚠️
**Expected error (backend not ready)**:
```
❌ Lỗi kết nối máy chủ
```

This is NORMAL - backend endpoint not implemented yet.

---

## Mock Backend for Testing

### Option 1: Mock API Response
Edit `frontend/src/hooks/useSalarySlip.js`:

```javascript
// Add this at top
const MOCK_MODE = true

// In fetchSalarySlip function, add before try block:
if (MOCK_MODE) {
  setIsLoading(true)
  setTimeout(() => {
    // Simulate no data
    setError('Chưa có phiếu lương cho tháng này')
    setIsLoading(false)
  }, 1000)
  return
}
```

### Option 2: Use Sample PDF
1. Place a sample PDF in `frontend/public/sample-salary.pdf`
2. Temporarily modify hook to use local file:

```javascript
// In fetchSalarySlip
const response = await fetch('/sample-salary.pdf')
const blob = await response.blob()
const blobUrl = URL.createObjectURL(blob)
setPdfBlobUrl(blobUrl)
setHasData(true)
```

### Option 3: Backend Mock Server
Create `backend/mock_salary.py`:

```python
from fastapi import FastAPI, Query
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
import os

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/salary-slips/my")
def get_salary_mock(month: str):
    # Return any PDF file for testing
    pdf_path = "sample.pdf"  # Place a sample PDF here
    if os.path.exists(pdf_path):
        return FileResponse(pdf_path, media_type="application/pdf")
    return {"error": "Not found"}, 404

# Run: uvicorn mock_salary:app --reload --port 8080
```

---

## Test Scenarios

### ✅ Scenario 1: UI Render
- [ ] Component loads without errors
- [ ] Header displays correctly
- [ ] Month selector shows current month
- [ ] Buttons are visible and clickable
- [ ] Responsive on mobile (resize browser)

### ✅ Scenario 2: Month Selection
- [ ] Click month selector → calendar picker opens
- [ ] Select different month → updates state
- [ ] Cannot select future months (max validation)

### ✅ Scenario 3: Loading State
- [ ] Click "Xem phiếu lương" → spinner appears
- [ ] Loading text shows: "Đang tải dữ liệu..."
- [ ] Buttons disabled during loading

### ⏳ Scenario 4: Success State (needs backend)
- [ ] PDF displays in viewer
- [ ] "Tải về" button appears
- [ ] Click download → PDF downloads
- [ ] Filename format: `phieu-luong-YYYY-MM.pdf`

### ✅ Scenario 5: Error State
- [ ] 404 error → shows "Chưa có phiếu lương cho tháng này"
- [ ] Network error → shows "Lỗi kết nối máy chủ"
- [ ] Error icon displays (red)

### ✅ Scenario 6: Cleanup
- [ ] Navigate away from page
- [ ] Check console → no memory leak warnings
- [ ] Return to page → state resets correctly

---

## Browser Compatibility

Test in these browsers:

- ✅ Chrome/Edge (Chromium) - Full support
- ✅ Firefox - Full support
- ⚠️ Safari - May show fallback
- ❌ IE11 - Not supported (OK for modern app)

---

## Debug Checklist

### Issue: Component not found
```
Error: Cannot find module './pages/SalarySlip'
```
**Solution**: 
```bash
# Verify files exist
ls frontend/src/pages/SalarySlip.*
# Restart dev server
npm run dev
```

### Issue: Route not working
**Check**:
1. `App.jsx` has import + route
2. `Layout.jsx` has menu item
3. Clear browser cache (Ctrl+Shift+R)

### Issue: API call fails
**Check**:
1. Backend running on port 8080
2. Vite proxy configured correctly
3. Browser Network tab (F12) → see actual error
4. CORS headers in backend

### Issue: PDF not displaying
**Check**:
1. Response Content-Type = `application/pdf`
2. Response data is actual PDF (not JSON)
3. Try "Tải về" button instead
4. Check browser PDF support

---

## Performance Testing

### Memory Leak Check
```javascript
// In browser console:
performance.memory.usedJSHeapSize

// Navigate to salary slip
// Load PDF
// Navigate away
// Check memory again - should not increase significantly
```

### Network Throttling
1. Open DevTools → Network tab
2. Set throttling to "Slow 3G"
3. Load PDF → Loading state should show
4. Verify timeout handling

---

## Accessibility Testing

- [ ] Tab navigation works
- [ ] Enter key submits form
- [ ] Screen reader announces states
- [ ] Color contrast meets WCAG AA
- [ ] Focus indicators visible

---

## Console Checklist

Should NOT see:
- ❌ Warning: Memory leak
- ❌ Error: Cannot read property
- ❌ Warning: Unknown prop
- ❌ CORS errors (when backend ready)

Should see (normal):
- ℹ️ HMR connected (Vite)
- ℹ️ Network requests in DevTools

---

## Final Validation

Before declaring "DONE":

1. ✅ All files created and in correct location
2. ✅ No ESLint errors
3. ✅ No console errors (without backend)
4. ✅ Responsive design works
5. ✅ Code follows project conventions
6. ⏳ Backend endpoint implemented
7. ⏳ End-to-end test passed

---

## Next: Backend Integration

Once backend implements `/api/salary-slips/my`:

1. Remove mock code (if added)
2. Test with real PDF files
3. Verify auth token works
4. Test all error scenarios (404, 401, 500)
5. Load test: Multiple users downloading simultaneously
6. Security audit: Users cannot access others' files

**Expected behavior**: Everything works seamlessly! 🎉
