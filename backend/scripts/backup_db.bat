@echo off
set BACKUP_DIR=%~dp0..\backups
if not exist "%BACKUP_DIR%" mkdir "%BACKUP_DIR%"
set TIMESTAMP=%date:~-10,4%%date:~-4,2%%date:~-7,2%_%time:~0,2%%time:~3,2%%time:~6,2%
set TIMESTAMP=%TIMESTAMP: =0%
set BACKUP_FILE=%BACKUP_DIR%\company_%TIMESTAMP%.db

sqlite3 "%~dp0..\data\company.db" ".backup '%BACKUP_FILE%'"
echo Backup created: %BACKUP_FILE%
