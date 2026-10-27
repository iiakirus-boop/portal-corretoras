-- p22 (2026-10-27): regra do Bruno para o Supervisor. Depende da p20.
-- Em vez do calendário aprendido, o gatilho é simples: se a última rodada concluída de Faturas ou de
-- Comissão de uma seguradora passou de 24 horas, o supervisor põe um pedido na fila. O vigia do PC
-- pega o pedido e encadeia sozinho: baixar no portal → ler → gravar → Vidas/Conferência/Projeção → publicar.

-- Agentes que agora baixam sozinhos do portal (login guardado no PC)
update agentes set automatico = true, como = 'baixar_bradesco.js (Portal de Negócios, login guardado)'
 where agente in ('faturas', 'comissao') and seguradora_id = 'bradesco_saude';
update agentes set automatico = true, como = 'baixar_porto.js (Corretor Online, login guardado)'
 where agente in ('faturas', 'comissao') and seguradora_id = 'porto_saude';
update agentes set automatico = true, como = 'baixar_hapvida.js (Portal Empresa, lista de logins) + pasta "boletos a enviar\HAPVIDA"'
 where agente = 'faturas' and seguradora_id = 'hapvida';

create or replace view supervisor_previsao with (security_invoker = true) as
with
ag as (
  select c.id as corretora_id, a.agente, a.seguradora_id, a.cobre
    from agentes a cross join corretoras c
   where a.agente in ('faturas', 'comissao') and a.situacao = 'ativo' and a.automatico and a.seguradora_id is not null and c.ativa),
-- última rodada concluída do agente (rodar.py registra toda rodada em ordens_execucao)
ult_ordem as (
  select o.corretora_id, o.agente, o.seguradora_id, max(coalesce(o.terminada_em, o.criada_em)) as em
    from ordens_execucao o where o.status = 'concluida' group by 1, 2, 3),
-- sem rodada registrada: usa quando os dados chegaram no banco
ult_dado as (
  select corretora_id, 'faturas'::text as agente, seguradora_id, max(processado_em) as em from faturas group by 1, 3
  union all
  select corretora_id, 'comissao', seguradora_id, max(processado_em) from comissao_pagamentos group by 1, 3),
x as (
  select g.corretora_id, g.agente, g.seguradora_id,
         coalesce((select o.em from ult_ordem o where o.corretora_id = g.corretora_id and o.agente = g.agente and o.seguradora_id = g.seguradora_id),
                  (select max(d.em) from ult_dado d where d.corretora_id = g.corretora_id and d.agente = g.agente
                      and (d.seguradora_id = g.seguradora_id or d.seguradora_id = any(g.cobre)))) as ult
    from ag g)
select x.corretora_id, x.agente, x.seguradora_id,
       to_char(now() - interval '3 hours', 'YYYY-MM') as competencia,
       ((coalesce(x.ult, now() - interval '2 days') + interval '24 hours') - interval '3 hours')::date as esperado_em,
       x.ult is null or x.ult < now() - interval '24 hours' as atrasado,
       case when x.ult is null then 'nunca rodou'
            else 'última atualização em ' || to_char(x.ult - interval '3 hours', 'DD/MM HH24:MI')
                 || ' (há ' || floor(extract(epoch from now() - x.ult) / 3600)::int || ' h); atualiza a cada 24 h' end as motivo
  from x;
