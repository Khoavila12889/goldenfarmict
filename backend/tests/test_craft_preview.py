"""Run in the backend container: python -m unittest tests.test_craft_preview -v."""
import pathlib
import tempfile
import unittest
from unittest.mock import patch

from fastapi import HTTPException
from openpyxl import Workbook
from app.routers import craft


class CraftPreviewTests(unittest.TestCase):
    def test_real_workbook_all_visible_sheets(self):
        with tempfile.TemporaryDirectory() as folder:
            src, dst = pathlib.Path(folder) / 'Tiếng Việt.xlsx', pathlib.Path(folder) / 'out.html'
            book = Workbook()
            book.active.title = 'Đầu tiên'
            book.active['A1'] = 'FIRST_MARKER'
            book.create_sheet('Vật tư & thiết bị')['A1'] = 'SECOND_MARKER'
            hidden = book.create_sheet('Hidden')
            hidden['A1'] = 'HIDDEN_MARKER'
            hidden.sheet_state = 'hidden'
            book.save(src)
            craft._convert('sheet', str(src), str(dst))
            text = dst.read_text()
            for expected in ('FIRST_MARKER', 'SECOND_MARKER', 'Vật tư &amp; thiết bị', '#sheet-1'):
                self.assertIn(expected, text)
            self.assertNotIn('HIDDEN_MARKER', text)

    def test_cache_and_permissions(self):
        def convert(engine, src, dst):
            self.assertTrue(src.endswith('.docx'))
            pathlib.Path(dst).write_bytes(b'%PDF-test')

        with tempfile.TemporaryDirectory() as folder, \
             patch.object(craft, 'CRAFT_CACHE_DIR', folder), \
             patch.object(craft, 'fetchone', return_value={'id': 1}), \
             patch.object(craft, '_check_folder_permission', return_value=True) as permission, \
             patch.object(craft, '_check_share_access', return_value=None), \
             patch.object(craft, '_check_download_allowed', return_value=True), \
             patch.object(craft, '_get_file_bytes', return_value=b'docx-fixture') as read, \
             patch.object(craft, '_convert', side_effect=convert) as conversion:
            args = dict(config_id=1, file_path='/Tài liệu/A & B.docx', file_id='', user_code='test', user_role='user')
            first = craft.craft_preview(**args)
            second = craft.craft_preview(**args)
            self.assertEqual(first.path, second.path)
            self.assertEqual(conversion.call_count, 1)
            self.assertEqual(first.headers['cache-control'], 'private, no-store')
            permission.return_value = False
            with self.assertRaises(HTTPException) as error:
                craft.craft_preview(**args)
            self.assertEqual(error.exception.status_code, 403)
            self.assertEqual(read.call_count, 2)

    def test_preview_allowed_without_original_download_permission(self):
        def convert(engine, src, dst):
            pathlib.Path(dst).write_bytes(b'%PDF-test')

        with tempfile.TemporaryDirectory() as folder, \
             patch.object(craft, 'CRAFT_CACHE_DIR', folder), \
             patch.object(craft, 'fetchone', return_value={'id': 1}), \
             patch.object(craft, '_check_folder_permission', return_value=True), \
             patch.object(craft, '_check_share_access', return_value=None), \
             patch.object(craft, '_check_download_allowed', return_value=False), \
             patch.object(craft, '_get_file_bytes', return_value=b'docx-fixture'), \
             patch.object(craft, '_convert', side_effect=convert):
            response = craft.craft_preview(config_id=1, file_path='/read-only/test.docx',
                                           file_id='', user_code='test', user_role='user')
            self.assertEqual(response.headers['x-download-allowed'], 'false')
            self.assertEqual(response.media_type, 'application/pdf')

    def test_real_invalid_file(self):
        with tempfile.TemporaryDirectory() as folder:
            src = pathlib.Path(folder) / 'bad.xlsx'
            src.write_bytes(b'not-a-workbook')
            with self.assertRaises(HTTPException) as error:
                craft._convert('sheet', str(src), str(pathlib.Path(folder) / 'out.html'))
            self.assertEqual(error.exception.status_code, 422)


if __name__ == '__main__':
    unittest.main()
