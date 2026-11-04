@echo off
rem Cadastra (ou troca a senha de) um login de faturas da SulAmerica. Pode cadastrar varios: um por grupo de contratos.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0FATURAS\Scripts\cadastrar_login.ps1" -Operadora sulamerica
pause
