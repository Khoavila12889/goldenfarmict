import { createSpreadsheet } from './sdk.js';
import './style.css';

const STORAGE_KEY = 'goldenfarm.univer.workbook.v1';
const status = document.querySelector('#status');
let editor;
let loadWarning = '';
let snapshot;
try {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) snapshot = JSON.parse(saved);
} catch {
  loadWarning = 'Không đọc được bản lưu. Bản lưu cũ chưa bị thay đổi. ';
}

try {
  editor = createSpreadsheet('editor', snapshot);
  status.textContent = loadWarning || 'Lưu thủ công trên trình duyệt này; tải JSON để giữ bản sao. Chưa đồng bộ lên máy chủ.';
  document.querySelectorAll('button').forEach((button) => { button.disabled = false; });
} catch (error) {
  console.error('Univer initialization failed', error);
  status.textContent = 'Không mở được bảng tính. Bản lưu cũ được giữ nguyên; xem console để kiểm tra lỗi.';
}

document.querySelector('#save').addEventListener('click', () => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(editor.getSnapshot()));
    status.textContent = `Đã lưu trên trình duyệt lúc ${new Date().toLocaleTimeString('vi-VN')}.`;
  } catch (error) {
    console.error('Save failed', error);
    status.textContent = 'Không lưu được (bộ nhớ đầy hoặc bị chặn). Hãy tải JSON để giữ dữ liệu.';
  }
});

document.querySelector('#export').addEventListener('click', () => {
  try {
    const blob = new Blob([JSON.stringify(editor.getSnapshot(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'goldenfarm-workbook.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    status.textContent = 'Đã tạo bản tải xuống JSON.';
  } catch (error) {
    console.error('Export failed', error);
    status.textContent = 'Không xuất được bảng tính. Dữ liệu đang mở chưa bị thay đổi.';
  }
});

if (import.meta.hot) import.meta.hot.dispose(() => editor?.dispose());
