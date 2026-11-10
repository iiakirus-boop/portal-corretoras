-- p34 (2026-11-09): Faturas SulAmérica passa a baixar sozinha do Saúde Online Empresa (um login por empresa, atalho
-- "Cadastrar login empresa SulAmerica"); o vigia roda baixar_sulamerica.js faturas -> rodar.py (grava e roda o Vidas).
-- Faturas Amil continua pausado até os passos do Portal Empresa Amil serem acertados.
update agentes set situacao = 'ativo',
       como = 'baixar_sulamerica.js faturas (Saúde Online Empresa, um login por empresa) + pasta "boletos a enviar\SUL AMERICA"'
 where agente = 'faturas' and seguradora_id = 'sulamerica';
