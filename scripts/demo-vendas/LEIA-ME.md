# Corretora de demonstração (conta de vendas)

Uma segunda corretora, **Aurora Benefícios**, com dados 100% fictícios, para mostrar o portal a clientes sem expor a carteira da Shaddai.
Tudo sai no mesmo formato que os agentes gravam, então as telas (Início, Faturamento, Comissões, Projeção, Pendências, Empresas,
Pedidos e o portal da empresa) funcionam igual às da Shaddai.

## O que tem dentro

- 24 empresas fictícias, 25 contratos em Porto, Bradesco, Amil, Hapvida e SulAmérica, cerca de 950 vidas.
- Faturas dos últimos 10 meses, com boleto pago ou em aberto, e as vidas linha a linha dos últimos 3 meses.
- Comissões por extrato desde o 2º mês, com vitalício e agenciamento (4 contratos novos em andamento) e uma implantação prevista.
- Uma rodada da Projeção por dia nos últimos 2 meses, para a tela de Comissões mostrar "previsto × caiu" semana a semana.
- Situações de propósito, para a demonstração mostrar o que o sistema pega: 2 boletos vencidos sem pagamento, 1 boleto pago com atraso,
  1 fatura com uma vida a mais que a lista, 1 comissão paga com taxa abaixo do contrato, pedidos em vários passos.
- Nomes de pessoas sorteados de listas; CNPJs das empresas com dígito verificador inválido de propósito (não coincidem com empresa real);
  CNPJ da corretora é o número de exemplo usado em documentação.

## Logins de demonstração

São convites. No primeiro acesso a pessoa pede o link por e-mail na tela de entrada e cria a senha. Os e-mails são apelidos (+) do Gmail
do Bruno, então os links chegam na caixa dele:

| E-mail | Perfil |
|---|---|
| `…+demo-admin@gmail.com` | Administradora da corretora (vê tudo, inclusive comissões e projeção) |
| `…+demo-operador@gmail.com` | Operador da corretora (sem comissões) |
| `…+demo-empresa@gmail.com` | Gestora da Padaria Trigo de Ouro (portal da empresa) |
| `…+demo-financeiro@gmail.com` | Financeiro da Padaria Trigo de Ouro |

Para usar outro e-mail como base: `DEMO_EMAIL_BASE=fulano@empresa.com node scripts/demo-vendas/gerar.mjs <saída>`.

## Como gerar e carregar

```
node scripts/demo-vendas/gerar.mjs <pasta de saída>        # foto de hoje
DEMO_HOJE=2026-11-24 node scripts/demo-vendas/gerar.mjs <saída>   # foto de outro dia
```

Sai na pasta:

- `demo_vendas_carga.sql`: só insere (nada é apagado ou alterado); rodar duas vezes não duplica.
- `demo_vendas_atualizar_antes_da_carga.sql`: para "andar" a demonstração até a data de hoje antes de uma apresentação. Apaga só os dados
  que mudam com o tempo (faturas, vidas, comissões, Central, pedidos) da corretora de demonstração; depois roda a carga nova.
  Corretora, empresas, contratos e logins continuam.
- `demo_vendas_remover.sql`: apaga a corretora de demonstração inteira. Não toca em outra corretora.
- `resumo.json`: números para conferir.
- `central/`: os documentos da Central em pastas, para ver as telas sem banco:
  `CENTRAL_DEMO_DIR=<saída>/central npm run dev` e entrar como a administradora da Shaddai no seletor de perfil.

Antes da primeira carga, aplicar a migration `supabase/migrations/20261103_p28_demo_fora_do_supervisor.sql`: ela tira a corretora
de demonstração (`config_agentes.demo = true`) do Supervisor, para nenhum agente entrar num portal de seguradora por ela.
A demonstração não tem rotina de Projeção: ela é uma foto, refeita quando a demonstração é atualizada.
