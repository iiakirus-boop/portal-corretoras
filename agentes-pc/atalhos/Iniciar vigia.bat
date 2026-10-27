@echo off
rem Liga o vigia da fila dos agentes Shaddai. Deixe esta janela aberta (pode minimizar).
rem Para ligar sozinho quando o PC iniciar: Win+R, digite shell:startup e cole um atalho deste arquivo la.
cd /d "%~dp0FATURAS\Scripts"
title Vigia dos agentes Shaddai
python vigia.py
pause
