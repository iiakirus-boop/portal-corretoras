# Agentes do PC (cópia do código)

Cópia do código que roda no PC do escritório, em `Área de Trabalho\Shaddai Agentes`. Serve de histórico e de base para levar os agentes para a nuvem. **O PC continua sendo o lugar onde eles rodam**: mudar um arquivo aqui não muda nada lá.

- `Scripts/` = `FATURAS\Scripts` do PC: baixar (`baixar_*.js`), destrinchar faturas e comissões (`faturas_*.py`, `comissao_*.py`), gravar na base (`gravar_*.py`, `banco.py`), vidas (`vidas*.py`), projeção, sincronizar com o portal (`sincronizar.py`), o executor da fila (`rodar.py`) e o vigia (`vigia.py`).
- `Scripts/fumaca.py`: teste de fumaça que o `rodar.py` roda no fim de toda rodada de faturas (arquivos baixados = faturas lidas = gravadas). Se não bater, a rodada fica "Erro" no master com o nome dos arquivos.
- Situação do boleto: a Porto (`baixar_porto.js situacao AAAA-MM`, botão Boleto desabilitado) e a Hapvida (status Liquidado na coleta) mandam "pago no portal" ao banco por `banco.situacao_boletos` (tabela `faturas_situacao_portal`, coluna `faturas.pago_no_portal`, migração p29).
- `Scripts/testes/`: teste de regressão (o `esperado.json` guarda só contagens e hashes, sem dados).
- `atalhos/`: os `.bat` da pasta `Shaddai Agentes` (entrar nos portais, cadastrar login, iniciar o vigia).

Ficou de fora de propósito: o token dos agentes (`.token_agentes`), as senhas (cofre do Windows, `*.cred`), os `_ultimo_*.json`, o log do vigia, `vidas_para_central.json` e as pastas `_*` com cópias antigas e dados de clientes.
