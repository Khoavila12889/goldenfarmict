# GOLDENFARM ICT Management System — Design System & Strict UI Guidelines

> **Hiến pháp UI** cho toàn bộ team Dev và AI CLI.  
> Mọi module (Đặt lịch, Dashboard, Tickets, Employees, Licenses, Approvals, Workflows, Equipment) **PHẢI TUÂN THỦ** 100%.

---

## 1. Design Philosophy

### 1.1 Minimalist (Tối giản)
- Không trang trí thừa. Gradient, shadow, border-radius chỉ dùng có chủ đích để phân cấp thị giác.
- Mọi khoảng trắng (white space) đều có ý nghĩa: tách nhóm, phân luồng đọc.
- Font-size tối đa 3 mức: `0.85rem` (body), `1.1rem` (heading nhỏ), `1.35rem` (heading lớn).

### 1.2 Context-Aware (Hiển thị theo ngữ cảnh)
- Component thay đổi trạng thái dựa trên `status`, `role`, `tab`, `filter`, `dark/light mode`.
- KHÔNG có component "tĩnh" — tất cả phải phản ứng với CSS variables và class động.
- Ví dụ: `.bk-block` có variants `.finished`, `.expired`, `.upcoming`, `.active`, `.selected`.

### 1.3 Focus on Data (Dữ liệu là trung tâm)
- Data Grid, Timeline/Gantt, Dashboard cards là core UI patterns.
- Ưu tiên hiển thị số lượng, trạng thái, thời gian — trình bày dạng **stat-pill** (value + label).
- Tooltip, context menu phải cung cấp thông tin ngay lập tức, không cần click thêm.

### 1.4 Visual Hierarchy (Thứ bậc thị giác)
- Primary action → màu gradient xanh (`--bk-gradient`), nổi bật nhất.
- Secondary action → `.bk-btn` với border, muted text.
- Passive data → `.bk-stat-pill-label` màu muted, value đậm hơn.
- Mờ dần quá khứ: `.bk-row-past` (opacity 0.3), `.bk-block.finished` (opacity 0.55).

---

## 2. Design Tokens (CSS Variables)

Tất cả CSS variables đặt trong `:root` (light) và override trong `.dark-mode`.

### 2.1 Bảng màu

```css
:root {
  --bk-primary: #1e4fa8;          /* Màu chủ đạo */
  --bk-primary-light: #3b82f6;    /* Hover, active */
  --bk-primary-dark: #152e6b;     /* Text tương phản */

  --bk-bg: #f4f7fb;               /* Nền trang */
  --bk-surface: #ffffff;           /* Nền card/panel */
  --bk-surface-hover: #f8fafc;    /* Hover row/button */
  --bk-surface-alt: #f1f5f9;      /* Nền phụ (skeleton, hint) */

  --bk-border: #e2e8f0;           /* Viền chính */
  --bk-border-light: #f1f5f9;     /* Viền phụ (row separator) */
  --bk-grid-border: #E4E7EC;      /* Viền lưới timeline */

  --bk-text: #0f172a;             /* Text chính */
  --bk-text-secondary: #64748b;   /* Text phụ */
  --bk-text-muted: #94a3b8;       /* Text mờ (placeholder, caption) */

  --bk-danger: #ef4444;           /* Lỗi / Xoá */
  --bk-success: #16a34a;          /* Thành công */
  --bk-warning: #f59e0b;          /* Cảnh báo / Upcoming */
}
```

### 2.2 Dark Mode

```css
.dark-mode {
  --bk-bg: #0f172a;
  --bk-surface: #1e293b;
  --bk-surface-hover: #334155;
  --bk-border: #334155;
  --bk-text: #f1f5f9;
  --bk-text-secondary: #94a3b8;
  --bk-text-muted: #64748b;
  /* Toàn bộ biến còn lại override tương tự */
}
```

**Rule:** KHÔNG hard-code màu nào. Luôn dùng `var(--bk-*)`. Nếu cần màu đặc thù (ví dụ status badge), dùng `rgba(...)` với alpha nền.

### 2.3 Typography

```css
:root {
  --bk-font: Inter, system-ui, -apple-system, sans-serif;
  /* Không dùng font-size rem lẻ — chỉ dùng 3 mức: */
  /* heading-large: 1.35rem — .bk-header */
  /* heading-small: 1.1rem  — .bk-dialog-title */
  /* body:          0.85rem  — .bk-btn, .bk-input, .bk-stat-pill */
  /* caption:       0.72rem  — .bk-time-cell, .bk-stat-pill-label */
  /* tiny:          0.68rem  — .bk-block-sub, .bk-shortcuts-hint */
}
```

- **Heading:** 700 weight.
- **Body:** 400–500 weight.
- **Monospace:** KHÔNG dùng trừ trường hợp log/mã (chưa có).
- **Line-height:** Mặc định `1.4`, riêng row/button `1`.

### 2.4 Shadows & Elevation

```css
:root {
  --bk-shadow:    0 2px 8px rgba(15, 23, 42, 0.04);   /* Card, grid wrapper */
  --bk-shadow-lg: 0 4px 16px rgba(15, 23, 42, 0.08);  /* Modal, drawer, context menu */
  --bk-block-shadow:       0 1px 3px rgba(0,0,0,0.1);     /* Booking block */
  --bk-block-shadow-hover: 0 4px 12px rgba(0,0,0,0.12);  /* Block hover */
}
```

### 2.5 Z-Index Scale

| Layer | Value | Used by |
|-------|-------|---------|
| Grid header (sticky) | `20` | `.bk-grid-header` |
| Drawer overlay | `90` | `.bk-drawer-overlay` |
| Drawer panel | `100` | `.bk-drawer` |
| Trip detail modal | `100` | `.bt-detail` |
| Context menu | `1001` | `.bk-context-menu` |
| Dialog overlay | `200` | `.bk-dialog-overlay` |
| Tooltip | `1000` | `.bk-tooltip` |

**Rule:** KHÔNG dùng z-index tùy tiện ngoài thang này. Nếu cần thêm tầng mới, cập nhật tài liệu.

### 2.6 Border Radius

```css
:root {
  --bk-radius: 16px;    /* Card, Grid wrapper, Dialog */
  --bk-radius-sm: 10px; /* Button, Input, Select, Stat card */
  --bk-radius-xs: 6px;  /* Block nhỏ, Tooltip nhỏ */
}
```

---

## 3. Layout & Spacing System

### 3.1 Spacing Scale (8px-based)

| Token | rem | px (≈) | Usage |
|-------|-----|--------|-------|
| `0.25rem` | 0.25 | 4 | Gap vi nội dung |
| `0.4rem` | 0.4 | 6 | Toolbar gap |
| `0.5rem` | 0.5 | 8 | Form gap, pill padding |
| `0.75rem` | 0.75 | 12 | Section gap, card gap |
| `1rem` | 1 | 16 | Padding card, dialog |
| `1.25rem` | 1.25 | 20 | Drawer padding |
| `1.5rem` | 1.5 | 24 | Header margin, section margin |

**Rule:** KHÔNG dùng giá trị lẻ (7px, 13px, 22px). Chỉ dùng đúng scale trên.

### 3.2 Standard Heights (32px)

Mọi phần tử tương tác trên toolbar/row **PHẢI** cao đúng 32px:

| Component | height |
|-----------|--------|
| `.bk-btn` | `32px` |
| `.bk-btn-icon` | `32px` |
| `.bk-select` | `32px` |
| `.bk-input` | `32px` (tính cả padding) |
| `.bk-date-nav-btn` | `32px` |
| `.bk-date-display` | `32px` |
| `.bk-toolbar-filter-type` | `32px` |

### 3.3 Grid Layout Pattern

```css
/* Data grid / Scheduler timeline */
.bk-grid-wrapper {
  border-radius: var(--bk-radius);
  background: var(--bk-surface);
  box-shadow: var(--bk-shadow);
}
.bk-grid-header  { display: flex; position: sticky; top: 0; z-index: 20; }
.bk-row          { display: flex; height: 36px; }
.bk-time-cell    { width: 58px; flex-shrink: 0; }
.bk-slot-cell    { flex: 1; min-width: 100px; }
```

### 3.4 Sidebar + Timeline (Business Trip)

```css
.btg-wrap     { overflow: hidden; }
.btg-inner    { display: flex; }
.btg-sidebar  { flex-shrink: 0; width: 180px; }
.btg-timeline { flex: 1; overflow-x: auto; }
```

---

## 4. Component Anatomy

### 4.1 Topbars / Toolbars

```html
<div class="bk-toolbar-root">
  <div class="bk-toolbar-row">
    <div class="bk-toolbar-left">
      <button class="bk-btn bk-btn-primary">+ Action chính</button>
      <button class="bk-btn">Action phụ</button>
      <select class="bk-select bk-toolbar-filter-type">…</select>
    </div>
    <div class="bk-toolbar-right">
      <div class="bk-toolbar-stats">
        <span class="bk-stat-pill">
          <span class="bk-stat-pill-value">12</span>
          <span class="bk-stat-pill-label">Tổng số</span>
        </span>
      </div>
      <div class="bk-date-nav">
        <button class="bk-date-nav-btn">‹</button>
        <button class="bk-date-display">14/07/2026 📅</button>
        <input type="date" class="bk-date-hidden" />
        <button class="bk-date-nav-btn">›</button>
      </div>
      <button class="bk-btn-icon">☰</button>
    </div>
  </div>
</div>
```

**Rules:**
- Luôn có `.bk-toolbar-root` → `.bk-toolbar-row` → `.bk-toolbar-left` + `.bk-toolbar-right`.
- `.bk-toolbar-left` chứa actions chính.
- `.bk-toolbar-right` chứa stats, date nav, icon buttons (theo thứ tự đó).
- KHÔNG dùng `flex: 1` spacer giữa left và right — dùng `margin-left: auto` trên `.bk-toolbar-right`.

### 4.2 Buttons Hierarchy

| Class | Purpose | Style |
|-------|---------|-------|
| `.bk-btn` | Secondary | Border + surface bg, muted text |
| `.bk-btn-primary` | Primary action | Gradient xanh, white text |
| `.bk-btn-sm` | Small variant | Smaller padding, 0.78rem |
| `.bk-btn-icon` | Icon only | 32×32, centered icon |
| `.bk-btn-active` | Toggle active | Primary bg, white text |

```css
.bk-btn {
  height: 32px;
  padding: 0.35rem 0.85rem;
  border: 1px solid var(--bk-border);
  border-radius: var(--bk-radius-sm);
  background: var(--bk-surface);
  color: var(--bk-text-secondary);
  font-size: 0.82rem;
  font-weight: 500;
  font-family: inherit;
  white-space: nowrap;
  transition: all 0.15s;
}

.bk-btn-primary {
  background: var(--bk-gradient);
  color: #fff;
  border: none;
}

.bk-btn-danger {
  color: var(--bk-danger);
  border-color: var(--bk-danger);
}
```

### 4.3 Badges & Status Legends

**Stat pills (compact stats):**
```html
<div class="bk-toolbar-stats">
  <span class="bk-stat-pill">
    <span class="bk-stat-pill-value">5</span>
    <span class="bk-stat-pill-label">Đang sử dụng</span>
  </span>
</div>
```

**Status badges (detail panel / legend):**
```css
.bk-card-badge {
  display: inline-block;
  padding: 0.15rem 0.5rem;
  border-radius: 20px;
  font-size: 0.75rem;
  font-weight: 500;
  white-space: nowrap;
}
```

**Color conventions for status:**
| Status | Color | Icon |
|--------|-------|------|
| active / Đang sử dụng | `#16a34a` (green) | 🟢 |
| finished / Đã kết thúc | `#6b7280` (gray) | ✅ |
| expired / Đã hết giờ | `#94a3b8` (muted) | ⏰ |
| upcoming / Sắp diễn ra | `#f59e0b` (amber) | 🟡 |
| cancelled / Đã hủy | `#dc2626` (red) | ❌ |

**Rule:** KHÔNG hard-code màu status. Dùng CSS variable mapping.

### 4.4 Data Table / Grid

```html
<div class="bk-grid-wrapper">
  <div class="bk-grid-header">
    <div class="bk-time-header">Giờ</div>
    <div class="bk-resource-header">Tài nguyên A</div>
    <div class="bk-resource-header">Tài nguyên B</div>
  </div>
  <div class="bk-grid-body">
    <div class="bk-row bk-row-even">
      <div class="bk-time-cell">08:00</div>
      <div class="bk-slot-cell bk-col-even"></div>
      <div class="bk-slot-cell bk-col-odd"></div>
    </div>
    <div class="bk-row bk-row-odd">...</div>
  </div>
</div>
```

**Alignment rules:**
- Text: **trái** (tên, mô tả, ghi chú)
- Số: **phải** (giá trị, số lượng)
- Thời gian: **phải** (time cells)
- Hành động: **phải** (buttons, icons)

**Alternating rows:**
```css
.bk-row-even { background: var(--bk-row-even); }
.bk-row-odd  { background: var(--bk-row-odd); }
```

**Rule:** Row height fixed = `36px`. Tuyệt đối không dùng `auto-height` trong grid.

### 4.5 Booking Block (Scheduler)

```html
<div class="bk-block active" style="top: 60px; height: 72px; left: 60px; width: 96px; --block-color: #3b82f6; background: rgba(59,130,246,0.12);">
  <div class="bk-block-title">Họp team</div>
  <div class="bk-block-sub">Nguyễn Văn A · 08:00→09:00</div>
  <div class="bk-resize-handle"></div>
</div>
```

**Status variants:** `.active`, `.finished`, `.expired`, `.upcoming`, `.selected`

### 4.6 Modals / Dialogs

```html
<div class="bk-dialog-overlay" onClick={onClose}>
  <div class="bk-dialog" onClick={e => e.stopPropagation()}>
    <div class="bk-dialog-header">
      <div class="bk-dialog-title">📝 Đặt lịch mới</div>
      <button class="bk-dialog-close">✕</button>
    </div>
    <form>
      <div class="bk-form-group">
        <label class="bk-form-label">Tên</label>
        <input class="bk-input" />
      </div>
      <button type="submit" class="bk-submit-btn">📤 Gửi</button>
    </form>
  </div>
</div>
```

- Overlay dùng `z-index: 200`.
- Dialog max-width `440px`, max-height `90vh`, overflow-y auto.
- Footer actions PHẢI có border-top ngăn cách với body.
- Animation: `bkFadeIn` 0.2s ease.

### 4.7 Drawers

```html
<div class="bk-drawer-overlay open"></div>
<div class="bk-drawer open">
  <div class="bk-drawer-header">
    <div class="bk-drawer-title">🔍 Bộ lọc</div>
    <button class="bk-drawer-close">✕</button>
  </div>
  <div class="bk-drawer-body">...</div>
</div>
```

- Width: `380px` (desktop), `100%` (mobile <768px).
- Slide from right với transition 0.3s ease.
- Overlay backdrop dùng `.bk-overlay`.

### 4.8 Business Trip Timeline

```html
<div class="btg-wrap">
  <div class="btg-inner">
    <div class="btg-sidebar" style="width: 180px;">
      <div class="btg-sh">Nhân viên</div>
      <div class="btg-sr"><!-- Sidebar row --></div>
    </div>
    <div class="btg-timeline">
      <div class="btg-th"><!-- Header days --></div>
      <div class="btg-tr"><!-- Timeline row với .btg-bars --></div>
    </div>
  </div>
</div>
```

- Sidebar width: `180px`.
- Column width: `42px` per day.
- Row height: `30px` (`LANE_H`), bar height: `24px` (`BAR_H`).
- Top header height: `38px` (`HEADER_H`).

---

## 5. Form Controls

```css
.bk-input {
  width: 100%;
  padding: 0.6rem 0.8rem;
  background: var(--bk-surface);
  border: 1px solid var(--bk-border);
  border-radius: var(--bk-radius-sm);
  font-size: 0.85rem;
  color: var(--bk-text);
  outline: none;
  font-family: inherit;
  transition: border-color 0.15s;
}
.bk-input:focus { border-color: var(--bk-primary-light); }

.bk-select {
  height: 32px;
  padding: 0 0.6rem;
  border: 1px solid var(--bk-border);
  border-radius: var(--bk-radius-sm);
  font-size: 0.82rem;
  color: var(--bk-text);
  font-family: inherit;
  cursor: pointer;
}

.bk-form-group  { margin-bottom: 0.85rem; }
.bk-form-label  { font-size: 0.8rem; font-weight: 500; color: var(--bk-text-secondary); margin-bottom: 0.3rem; }
.bk-form-row    { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; }
.bk-submit-btn  { width: 100%; padding: 0.7rem; background: var(--bk-gradient); color: #fff; border: none; border-radius: var(--bk-radius-sm); font-weight: 600; font-size: 0.9rem; cursor: pointer; font-family: inherit; }
```

---

## 6. Naming Convention

| Prefix | Scope | Examples |
|--------|-------|---------|
| `bk-` | Shared design system (toàn module booking) | `.bk-btn`, `.bk-card`, `.bk-dialog`, `.bk-toolbar-row` |
| `btg-` | Business Trip Grid | `.btg-wrap`, `.btg-sidebar`, `.btg-bar` |
| `bt-` | Business Trip Panel | `.bt-container`, `.bt-detail`, `.bt-loading` |

**Rule:** Module mới PHẢI dùng prefix riêng (vd `dash-` cho Dashboard, `emp-` cho Employees) và chỉ override design tokens khi thật sự cần.

### Shared CSS

Các pattern dùng chung giữa nhiều module (Employees, Tickets, Licenses) được đặt trong `src/styles/shared.css`:

| Class | Mô tả |
|-------|-------|
| `.tbl` | Data table chuẩn |
| `.tbl-wrap` | Table wrapper (border, shadow) |
| `.panel-overlay` | Overlay cho side panel |
| `.panel-overlay.open` | Visible state |
| `.side-panel` | Slide-in panel từ phải |
| `.side-panel.open` | Visible state |
| `.panel-body` | Scrollable panel content |

---

## 7. Animation & Transition

| Property | Duration | Easing | Used by |
|----------|----------|--------|---------|
| `background` | 0.12s | ease | Row hover, cell hover |
| `opacity` | 0.15s | ease | Block finished/expired |
| `transform` | 0.12s | ease | Block hover lift |
| `box-shadow` | 0.15s | ease | Block hover |
| `right` | 0.3s | ease | Drawer slide |
| `opacity` | 0.3s | ease | Drawer overlay |

```css
@keyframes bkFadeIn {
  from { opacity: 0; transform: scale(0.95) translateY(10px); }
  to   { opacity: 1; transform: scale(1) translateY(0); }
}
```

---

## 8. Responsive Breakpoints

| Breakpoint | Target |
|------------|--------|
| `768px` | Tablet / mobile drawer full-width |
| `480px` | Small phone: grid max-height, block-sub ẩn |

```css
@media (max-width: 768px) {
  .bk-layout-drawer-open .bk-layout-main { margin-right: 0; }
  .bk-drawer { width: 100%; right: -100%; }
  .bk-form-row { grid-template-columns: 1fr; }
}

@media (max-width: 480px) {
  .bk-grid-wrapper { max-height: 450px; }
  .bk-block-sub { display: none; }
}
```

---

## 9. Strict Rules for AI Assistants

> **⚠️ CÁC LỆNH NÀY LÀ BẮT BUỘC. AI VI PHẠM SẼ BỊ REJECT.**

### R1 — KHÔNG hard-code màu sắc, kích thước, border-radius
```jsx
// ❌ SAI:
<div style={{ background: '#f8fafc', borderRadius: 10, padding: '0.75rem' }}>
// ✅ ĐÚNG:
<div className="bk-card" style={{ padding: '0.75rem' }}>
// hoặc dùng CSS class với var(--bk-surface), var(--bk-radius-sm)
```

Mọi giá trị màu, size, spacing, radius PHẢI lấy từ CSS variables.  
Nếu chưa có biến phù hợp, thêm biến mới vào `:root` + `.dark-mode`.

### R2 — KHÔNG dùng inline `style={{...}}` cho layout/styling
Ngoại lệ duy nhất: dynamic position (top, left, width, height của block/grid item).

```jsx
// ❌ SAI (kể cả trong style tag <style>{`...`}</style>):
<div style={{ display: 'flex', justifyContent: 'space-between', padding: '1rem' }}>

// ✅ ĐÚNG: Tạo CSS class trong booking.css
.bk-status-bar { display: flex; justify-content: space-between; padding: 1rem; }
```

### R3 — BẮT BUỘC tái sử dụng component và CSS class có sẵn
Trước khi tạo component mới:
1. Kiểm tra `README-UI.md` và `booking.css` — class `bk-btn`, `bk-card`, `bk-stat-pill` đã có chưa?
2. Kiểm tra component tương tự trong `src/components/booking/`.
3. Nếu pattern giống 80% → tái sử dụng, KHÔNG tạo mới.

```jsx
// ❌ SAI: tự tạo button mới
<button style={{ padding: '8px 16px', background: 'linear-gradient(...)', borderRadius: 8 }}>Submit</button>

// ✅ ĐÚNG: dùng class có sẵn
<button className="bk-btn bk-btn-primary">Submit</button>
```

### R4 — KHÔNG dùng magic number
```css
/* ❌ SAI: */
padding: 11px; font-size: 14.5px; gap: 13px;

/* ✅ ĐÚNG: */
padding: 0.75rem; font-size: 0.85rem; gap: 0.5rem;
/* Chỉ dùng giá trị trong spacing scale (mục 3.1) */
```

### R5 — ĐỒNG BỘ 100% khi nhân bản layout giữa các module
Ví dụ: Business Trip toolbar PHẢI dùng **cùng class** với Booking toolbar.

```jsx
// ✅ ĐÚNG — cả 2 module dùng chung cấu trúc:
<div className="bk-toolbar-root">
  <div className="bk-toolbar-row">
    <div className="bk-toolbar-left">...</div>
    <div className="bk-toolbar-right">...</div>
  </div>
</div>
```

### R6 — KHÔNG tự ý thêm z-index
Chỉ dùng các giá trị trong bảng z-index scale (mục 2.5).  
Nếu thực sự cần thêm, cập nhật tài liệu trước khi code.

### R7 — Dark mode PHẢI đi kèm mọi component
```css
/* Mọi class mới PHẢI có sẵn: */
.my-class { color: var(--bk-text); background: var(--bk-surface); }
/* KHÔNG code: */
.my-class { color: #333; background: #fff; } /* ❌ SAI */
```

### R8 — KHÔNG dùng `flex: 1` để đẩy nhóm trong toolbar
Dùng `margin-left: auto` trên `.bk-toolbar-right` (đã có sẵn trong class).

### R9 — Animation duration phải theo chuẩn
- Hover: `0.12s`
- Transition chung: `0.15s`
- Drawer slide: `0.3s`
- Dialog fade: `0.2s`

### R10 — Xoá code chết (dead code)
Khi AI thay thế implementation cũ:
1. Xoá CSS class không còn dùng đến (kiểm tra grep toàn bộ src).
2. Xoá import/function/component không còn reference.
3. Xoá prop không còn sử dụng khỏi component signature.

### R11 — Row height cố định
Data grid / timeline rows PHẢI dùng `height: 36px`.  
KHÔNG dùng `auto`, `min-height`, `max-height` cho row.

### R12 — KHÔNG tự ý thêm dependency / library
Nếu cần thêm thư viện npm → hỏi lại user.  
Tuyệt đối không thêm CSS framework (Tailwind, Bootstrap, Ant Design).

---

> **Tài liệu này có hiệu lực ngay khi được commit.**  
> Mọi AI CLI (Cursor, Copilot, opencode agent) PHẢI đọc và tuân thủ trước khi sinh code.  
> Team Dev review: nếu phát hiện vi phạm → reject ngay lập tức.
