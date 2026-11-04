# Agentes na nuvem

Agentes de portal que rodam sem o PC do escritório, no GitHub Actions (grátis para este repositório). Começa pela Porto,
que entra por endereços e não depende de menu.

## Porto (`porto.py`, workflow `.github/workflows/porto-nuvem.yml`)

- Roda de segunda a sexta às 08:30 de Brasília e quando alguém clica em **Run workflow** na aba Actions.
- Abre um Chromium sem janela, entra no Corretor Online com o login guardado nos segredos do GitHub, baixa faturas,
  boletos, vidas e o analítico de comissão (os mesmos `baixar_porto.js`, `faturas_porto.py` e `comissao_porto.py` do PC)
  e registra a rodada no master como máquina **Nuvem (GitHub)**.
- **Modo medição (padrão):** não grava nada. A rodada aparece no master como agente "Teste na nuvem", com tempo e
  contagens, e não conta como Porto atualizada para o Supervisor. Serve para ver se a Porto deixa entrar pela nuvem
  (captcha, código de acesso, bloqueio de servidor de fora do Brasil) e se os números batem com os do PC.
- **Modo gravar:** variável do repositório `SHADDAI_PORTO_MODO = gravar`. Grava direto no banco com o `gravar_banco.py`
  (quando ele existir). Antes de ligar, pausar a Porto no PC para os dois não gravarem juntos.

### Para ligar (uma vez)

Em GitHub > repositório > Settings > Secrets and variables > Actions > New repository secret:

| Segredo | O que é |
|---|---|
| `PORTO_USER` | CPF do login do Corretor Online |
| `PORTO_PASS` | senha |
| `PORTO_COD` | código de acesso, se a Porto pedir (pode ficar sem) |
| `SHADDAI_AGENTES_TOKEN` | o mesmo token dos agentes do PC (`FATURAS\Scripts\.token_agentes`) |

O repositório é público: segredos não aparecem para ninguém, mas o log das rodadas sim. Por isso o `porto.py` só escreve
contagens e o passo em que parou; nomes, valores e vidas vão só para o master. Os arquivos baixados somem no fim da rodada.
