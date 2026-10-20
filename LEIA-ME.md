# Portal das corretoras (site)

Next.js 15 ligado ao banco do Supabase (projeto `portal-corretoras`, São Paulo). Três áreas:

- **/master**: visão geral, corretoras (cadastro e acessos), agentes (fila, rotinas, máquinas, logins) e cobrança por vidas.
- **/central/<id>**: a Central de Agentes de hoje, igual (mesmas abas, gráficos e funções), com o nome da corretora. É a tela inicial da corretora. O operador não vê Comissões nem Projeção. Os pedidos do portal aparecem nas Pendências como tarefas do Agente Movimentações.
- **/corretora/<id>**: empresas e acessos, pedidos e equipe (equipe só para o administrador).
- **/empresa/<id>**: início, faturas e boletos, vidas por faixa de idade, pedidos (com aprovação do gestor) e pessoas.

Quem pode ver o quê é decidido pelo banco (regras de acesso). O site só usa a chave pública; a chave `service_role` nunca entra aqui.

## Ver sem banco (modo demonstração)

Sem as variáveis do Supabase o site abre com dados fictícios e uma tela para escolher o perfil (master, admin, operador, gestora, movimentação, financeiro, outra corretora).

```
npm install
npm run dev      # http://localhost:3000
```

## Publicar na Vercel

1. Suba esta pasta para um repositório no GitHub e importe na Vercel.
2. Em Settings > Environment Variables:
   - `NEXT_PUBLIC_SUPABASE_URL` = `https://hfhsuvgltmjyjivkcopn.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = `sb_publishable_r3e3m8qmrJ_GMa0qJ6aNfg_8S02HsDj` (chave pública, pode ficar no site)
   - `NEXT_PUBLIC_SITE_URL` = o endereço final, por exemplo `https://portal.shaddai.com.br`
3. No Supabase, em Authentication > URL Configuration, coloque o mesmo endereço em **Site URL** e acrescente `https://<endereço>/auth/callback` em **Redirect URLs**.
4. O e-mail padrão do Supabase manda poucos links por hora. Para uso real, configure um SMTP próprio em Authentication > SMTP Settings.

## Como as pessoas entram

- Entram com o e-mail e recebem um link (sem senha).
- O e-mail do Bruno já está em `master_convites`: no primeiro acesso vira master.
- Os outros entram por convite (criado no próprio site). Quando a pessoa entra com o e-mail convidado, o acesso aparece sozinho.

## Como a Central funciona aqui

- O arquivo `lib/central/central.html` é a Central publicada, sem mudanças. A rota `/central/<id>` serve esse arquivo e põe antes dele o `public/central-shim.js`, que troca o banco do artefato pela tabela `central_docs` do Supabase (via `/api/central/<id>`).
- Os agentes gravam os mesmos documentos de hoje (faturas `AAAA-MM_op`, comissoes, tarefas, eventos, vidas...) em `central_docs`, com `corretora_id`, `colecao` e `doc_id`.
- A tela relê cada coleção a cada minuto e logo depois de qualquer gravação.

## Agentes na nuvem e o master

- Cada agente é uma tarefa agendada do Claude. Ao começar, marca a ordem como `em_execucao` e grava `sessao_url` (o endereço da sessão). Ao terminar, grava `concluida`, `erro` ou `aguardando_voce` com uma mensagem.
- /master/agentes mostra o que está rodando, a fila e o que espera você, e se atualiza sozinha. Também tem o botão "Ver passo a passo" (abre a sessão), "Tentar de novo" ou "Já resolvi, continuar", "Tirar da fila", "Pausar" ou "Ligar" em cada rotina e "Colocar na fila".
- Os botões só escrevem no banco. Quem obedece é o agente, na próxima rodada.

## Arquivos

- Faturas, boletos e anexos ficam no bucket privado `documentos`. O download passa por `/arquivo/<id>`, que confere o acesso e gera um link de 60 segundos.
- Os anexos dos pedidos vão para `anexos/<id do pedido>/`.

## Testado (2026-10-20)

- Central em /central: admin vê as 5 abas; operador não vê Comissões/Projeção e a API devolve comissões vazias para ele; outra corretora recebe 403; pedido do portal não pode ser alterado pela Central (403). Master pausou rotina e repetiu ordem.

- `npm run build` sem erros.
- Modo demonstração com os 7 perfis: todas as páginas abrem. Pedido criado pela movimentação ficou esperando o gestor, a gestora aprovou, e o operador mudou a situação com uma mensagem. A financeira não abre Vidas, e a admin da Vértice não abre a Shaddai.
- Modo real: a tela de entrada mostra o formulário de e-mail e as áreas fechadas mandam para a entrada. Não foi possível testar o login, porque o ambiente de testes não alcança o Supabase.
