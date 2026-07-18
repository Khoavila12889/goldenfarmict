import ftplib
import os
import logging
from typing import List, Tuple, Union

logger = logging.getLogger(__name__)


class FTPUploader:
    def __init__(self, config_info: dict):
        self.config_info = config_info
        self.ftp = None

    def connect(self, ftp_type: str = 'FTP2') -> None:
        ftp_host = self.config_info.get(f'{ftp_type}_HOST')
        ftp_user = self.config_info.get(f'{ftp_type}_USER')
        ftp_pass = self.config_info.get(f'{ftp_type}_PASS')
        ftp_root = self.config_info.get(f'{ftp_type}_ROOT')

        if not all([ftp_host, ftp_user, ftp_pass, ftp_root]):
            raise ValueError(f"Cấu hình {ftp_type} chưa đầy đủ, kiểm tra config.xml")

        self.ftp = ftplib.FTP()
        self.ftp.connect(ftp_host)
        self.ftp.login(ftp_user, ftp_pass)
        self.ftp.encoding = 'utf-8'
        self.root = ftp_root

    def disconnect(self) -> None:
        if self.ftp:
            self.ftp.quit()
            self.ftp = None

    def ensure_directory(self, ftp_path: str) -> None:
        self.ftp.cwd('/')
        folders = ftp_path.strip('/').split('/')
        for folder in folders:
            if folder:
                try:
                    self.ftp.cwd(folder)
                except ftplib.error_perm:
                    self.ftp.mkd(folder)
                    self.ftp.cwd(folder)

    def upload_file(self, local_path: str, remote_path: str) -> None:
        if not os.path.isfile(local_path):
            raise FileNotFoundError(f"File không tồn tại: {local_path}")

        filename = os.path.basename(local_path)
        with open(local_path, 'rb') as file:
            self.ftp.storbinary(f'STOR {filename}', file)
        logger.info(f"Uploaded: {filename} -> {remote_path}")


def upload_file_to_ftp(pdf_info: List[Union[str, Tuple[str, str]]], config_info: dict) -> None:
    uploader = FTPUploader(config_info)
    errors = []
    try:
        uploader.connect('FTP2')
        for item in pdf_info:
            try:
                if isinstance(item, (tuple, list)) and len(item) >= 2:
                    pdf_path, staff_name = item[0], item[1]
                else:
                    pdf_path = str(item)
                    staff_name = os.path.basename(os.path.dirname(pdf_path))

                pdf_path = os.path.normpath(pdf_path)
                ftp_path = f"{uploader.root}/{staff_name}"
                uploader.ensure_directory(ftp_path)
                uploader.upload_file(pdf_path, ftp_path)
            except Exception as e:
                logger.error(f"Lỗi upload file {pdf_path}: {str(e)}")
                errors.append(str(e))
                continue
        if errors:
            raise Exception(f"FTP upload errors: {'; '.join(errors)}")
    except Exception as e:
        logger.error(f"Upload PDF failed: {str(e)}")
        raise
    finally:
        uploader.disconnect()


def upload_excel_to_ftp(file_path: str, config_info: dict) -> None:
    uploader = FTPUploader(config_info)
    try:
        uploader.connect('FTP1')
        file_path = os.path.normpath(file_path)
        uploader.ensure_directory(uploader.root)
        uploader.upload_file(file_path, uploader.root)
    except Exception as e:
        logger.error(f"Excel upload failed: {str(e)}")
        raise
    finally:
        uploader.disconnect()
