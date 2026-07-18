import os
import sys
import xml.etree.ElementTree as ET
import base64


def decrypt_base64_password(encrypted_password):
    return base64.b64decode(encrypted_password).decode('utf-8')


def read_xml_info():
    try:
        script_dir = os.path.dirname(os.path.abspath(__file__))
        config_file_path = os.path.join(script_dir, 'config.xml')

        if not os.path.exists(config_file_path):
            print(f"File config.xml không tồn tại tại {config_file_path}")
            return {}, {}

        tree = ET.parse(config_file_path)
        root = tree.getroot()

        def get_ftp_settings(prefix):
            return {
                f'{prefix}_HOST': root.find(f"./ftpSettings/add[@key='{prefix}_HOST']").attrib['value'],
                f'{prefix}_USER': root.find(f"./ftpSettings/add[@key='{prefix}_USER']").attrib['value'],
                f'{prefix}_PASS': decrypt_base64_password(root.find(f"./ftpSettings/add[@key='{prefix}_PASS']").attrib['value']),
                f'{prefix}_ROOT': root.find(f"./ftpSettings/add[@key='{prefix}_ROOT']").attrib['value']
            }

        config_info = {**get_ftp_settings('FTP1'), **get_ftp_settings('FTP2')}

        license_info = {
            'LicenseKey': root.find("./license/add[@key='LicenseKey']").attrib['value'],
            'ExpirationDate': root.find("./license/add[@key='ExpirationDate']").attrib['value']
        }

        return config_info, license_info

    except Exception as e:
        print(f"XML Config Reading Error: {str(e)}")
        return {}, {}
