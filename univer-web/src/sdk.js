import { createUniver, LocaleType, mergeLocales } from '@univerjs/presets';
import { UniverSheetsCorePreset } from '@univerjs/preset-sheets-core';
import enUS from '@univerjs/preset-sheets-core/locales/en-US';
import '@univerjs/preset-sheets-core/lib/index.css';

// Điểm tích hợp dùng lại khi nhúng vào frontend hoặc thêm các preset.
export function createSpreadsheet(container, snapshot) {
  const { univer, univerAPI } = createUniver({
    locale: LocaleType.EN_US,
    locales: { [LocaleType.EN_US]: mergeLocales(enUS) },
    presets: [UniverSheetsCorePreset({ container })],
  });
  try {
    univerAPI.createWorkbook(snapshot ?? { name: 'Dự án GoldenFarm' });
    if (!snapshot) {
      univerAPI.getActiveWorkbook().getActiveSheet().getRange('A1:D4').setValues([
        ['Hạng mục', 'Số lượng', 'Đơn giá', 'Thành tiền'],
        ['Vật tư A', 10, 25000, { f: '=B2*C2' }],
        ['Vật tư B', 5, 40000, { f: '=B3*C3' }],
        ['Tổng', null, null, { f: '=SUM(D2:D3)' }],
      ]);
    }
  } catch (error) {
    univer.dispose();
    throw error;
  }
  return {
    univerAPI,
    getSnapshot: () => univerAPI.getActiveWorkbook().save(),
    dispose: () => univer.dispose(),
  };
}
