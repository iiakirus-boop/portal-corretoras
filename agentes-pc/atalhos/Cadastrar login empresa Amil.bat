@echo off
rem Cadastra (ou troca a senha de) um login de EMPRESA da Amil / Santa Helena (Portal Empresa), usado pelo agente de faturas.
rem Um por empresa ou grupo: apelido (ex.: metropole), usuario e senha. Fica guardado criptografado no PC.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0FATURAS\Scripts\cadastrar_login.ps1" -Operadora amil_empresa
pause
