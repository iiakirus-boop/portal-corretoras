@echo off
rem Cadastra (ou troca a senha de) um login de EMPRESA da SulAmerica (Saude Online Empresa), usado pelo agente de faturas.
rem Um por empresa: apelido (ex.: lm_motos), codigo da empresa, usuario e senha. Fica guardado criptografado no PC.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0FATURAS\Scripts\cadastrar_login.ps1" -Operadora sulamerica_empresa
pause
