import React, { useState } from 'react'

// Trang demo thử WordCraft / GridCraft / PdfCraft ngay trong webapp.
// Mỗi tab nhúng bản web WASM của ArtCraft qua iframe. Cách dùng:
//  1. Trên PC chạy 1-3 bản web (trunk serve hoặc giải nén release *-web-*.zip
//     rồi serve tĩnh), điền URL vào ô tương ứng.
//  2. Trong khung iframe dùng file picker của app để mở file docx/xlsx/pdf
//     của công ty (luong.docx, luong.xlsx, lương tháng, file chat...).
//  3. So sánh với OnlyOffice hiện tại rồi ghi kết quả vào checklist bên dưới.

// Mặc định dùng cùng domain qua nginx (/craft/*) để không bị mixed-content
// khi site chạy HTTPS (noibo.canhdongvang.vn). Chạy dev vite thì sửa thành
// http://127.0.0.1:8771 (word) / :8772 (grid) / :8773 (pdf).
const sameOrigin = (p) => `${window.location.origin}${p}`

const APPS = {
  word: {
    name: 'WordCraft (.docx)',
    defUrl: sameOrigin('/craft/word/'),
    repo: 'https://github.com/storytold/wordcraft',
    serve: 'cd wordcraft/apps/wordcraft-web && trunk serve',
    files: ['frontend/src/template/luong.docx', 'backend/temp_pdf_gen/*/template.docx'],
  },
  excel: {
    name: 'GridCraft (.xlsx)',
    defUrl: sameOrigin('/craft/grid/'),
    repo: 'https://github.com/storytold/gridcraft',
    serve: 'cd gridcraft/apps/gridcraft-web && trunk serve --port 8772',
    files: [
      'frontend/src/template/luong.xlsx',
      'backend/uploads/salary/2026-09/20261006_040040_luong_9.2026.xlsx',
      'backend/uploads/chat/873c54c4875b4b57800528312a06371a.xlsx',
    ],
  },
  pdf: {
    name: 'PdfCraft (.pdf)',
    defUrl: sameOrigin('/craft/pdf/'),
    repo: 'https://github.com/storytold/pdfcraft',
    serve: 'cd pdfcraft/apps/pdfcraft-web && trunk serve --port 8773',
    files: ['backend/uploads/documents/pages/_src/*.pdf (bản gốc trên SMB/Drive)'],
  },
}

const CHECKS = [
  'Mở được file, không crash/trắng trang',
  'Font chữ, tiếng Việt hiển thị đúng',
  'Bảng biểu, căn lề giống OnlyOffice',
  'Excel: công thức tính ra số đúng',
  'PDF: tìm kiếm + chọn/copy text được',
]

export default function CraftDemo() {
  const [tab, setTab] = useState('word')
  const [urls, setUrls] = useState({ word: APPS.word.defUrl, excel: APPS.excel.defUrl, pdf: APPS.pdf.defUrl })
  const [loaded, setLoaded] = useState({ word: false, excel: false, pdf: false })
  const app = APPS[tab]

  return (
    <div style={{ padding: 16, maxWidth: 1200, margin: '0 auto' }}>
      <h2 style={{ margin: '0 0 4px' }}>Demo ArtCraft (Word/Grid/Pdf) — branch wordcraft-viewer</h2>
      <p style={{ color: '#666', margin: '0 0 12px' }}>
        Chỉ để trải nghiệm/thử file thật. OnlyOffice hiện tại không bị ảnh hưởng.
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {Object.entries(APPS).map(([k, a]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            style={{
              padding: '8px 16px', cursor: 'pointer',
              background: tab === k ? '#1976d2' : '#eee',
              color: tab === k ? '#fff' : '#333',
              border: 'none', borderRadius: 6, fontWeight: 600,
            }}
          >
            {a.name} {loaded[k] ? '●' : '○'}
          </button>
        ))}
      </div>

      <div style={{ background: '#f5f7fa', border: '1px solid #ddd', borderRadius: 8, padding: 12, marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 600 }}>URL bản web:</span>
          <input
            value={urls[tab]}
            onChange={(e) => { setUrls({ ...urls, [tab]: e.target.value }); setLoaded({ ...loaded, [tab]: false }) }}
            style={{ flex: 1, minWidth: 260, padding: 6, fontFamily: 'monospace' }}
          />
          <a href={app.repo} target="_blank" rel="noreferrer">repo</a>
        </div>
        <div style={{ marginTop: 8, fontSize: 13 }}>
          <div>Chạy bản web: <code>{app.serve}</code> (cần Rust + trunk), hoặc tải release <code>*-web-*.zip</code> rồi serve tĩnh.</div>
          <div style={{ marginTop: 4 }}>File công ty để thử: {app.files.map((f) => <code key={f} style={{ marginRight: 8 }}>{f}</code>)}</div>
          {!loaded[tab] && <div style={{ color: '#b26a00', marginTop: 6 }}>Chưa tải được khung bên dưới? Kiểm tra bản web đã chạy và cho phép iframe (không set X-Frame-Options DENY).</div>}
        </div>
      </div>

      <iframe
        key={tab + urls[tab]}
        title={app.name}
        src={urls[tab]}
        allow="fullscreen; clipboard-read; clipboard-write"
        onLoad={() => setLoaded({ ...loaded, [tab]: true })}
        style={{ width: '100%', height: '70vh', border: '1px solid #ccc', borderRadius: 8, background: '#fff' }}
      />

      <div style={{ marginTop: 12, background: '#f5f7fa', border: '1px solid #ddd', borderRadius: 8, padding: 12 }}>
        <b>Checklist so với OnlyOffice (ghi Đạt/Lỗi cho từng file):</b>
        <ul style={{ margin: '8px 0 0', paddingLeft: 20 }}>
          {CHECKS.map((c) => <li key={c}>{c}</li>)}
        </ul>
      </div>
    </div>
  )
}
