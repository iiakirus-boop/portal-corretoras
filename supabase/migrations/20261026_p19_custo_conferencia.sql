-- p19 (2026-10-26): custo de cada rodada e Agente Conferência.
-- Ideia trazida da avaliação do Ruflo: o trabalho repetitivo roda como código (sem tokens) e o Claude
-- só entra onde o código não resolve. Aqui ficam as duas peças do banco para isso:
--   1. cada ordem guarda como rodou (código ou Claude) e, quando houver, tokens e custo;
--   2. o Agente Conferência confere faturas, vidas e comissões de uma competência só com SQL
--      e deixa a lista do que não bate em `conferencias`. Roda sozinho depois de Faturas, Vidas e Comissão.

-- ---------------------------------------------------------------------
-- 1. Modo e custo das rodadas
-- ---------------------------------------------------------------------
alter table ordens_execucao
  add column if not exists modo           text check (modo in ('codigo', 'claude', 'misto')),
  add column if not exists tokens_entrada int,
  add column if not exists tokens_saida   int,
  add column if not exists custo_usd      numeric(10,4);

-- Rodadas antigas: Projeção é a função da nuvem; com link de sessão foi o Claude; sem link foi o vigia (rodar.py)
update ordens_execucao
   set modo = case when agente = 'projecao' then 'codigo' when sessao_url is not null then 'claude' else 'codigo' end
 where modo is null and status in ('concluida', 'erro');

-- ---------------------------------------------------------------------
-- 2. O que a conferência achou
-- ---------------------------------------------------------------------
-- Uma linha por problema. A mesma divergência encontrada de novo só atualiza ultima_vez;
-- o que deixou de aparecer ganha resolvida_em (nunca é apagado, e não volta como pendência).
create table if not exists conferencias (
  id            uuid primary key default gen_random_uuid(),
  corretora_id  uuid not null references corretoras(id),
  competencia   char(7) not null,
  seguradora_id text references seguradoras(id),
  empresa_id    uuid references empresas(id),
  tipo          text not null,      -- fatura_duplicada, valor_divergem, vidas_divergem, vidas_sumiram, fatura_faltando, comissao_calculo, comissao_classe, comissao_sem_empresa
  gravidade     text not null default 'aviso' check (gravidade in ('erro', 'aviso')),
  chave         text not null,      -- o registro conferido (fatura, lançamento, empresa)
  mensagem      text not null,
  esperado      numeric,
  encontrado    numeric,
  primeira_vez  timestamptz not null default now(),
  ultima_vez    timestamptz not null default now(),
  resolvida_em  timestamptz,
  ordem_id      uuid references ordens_execucao(id),
  unique (corretora_id, competencia, tipo, chave)
);
create index if not exists conferencias_abertas on conferencias (corretora_id, competencia) where resolvida_em is null;

alter table conferencias enable row level security;
drop policy if exists master_tudo on conferencias;
drop policy if exists ler on conferencias;
create policy master_tudo on conferencias for all using (eh_master()) with check (eh_master());
-- O que é de comissão só o administrador da corretora vê, como em comissao_lancamentos
create policy ler on conferencias for select using (eh_da_corretora(corretora_id, tipo like 'comissao%'));

-- Valor no formato brasileiro (1.234,56), sem depender da configuração do banco
create or replace function brl(v numeric) returns text language sql immutable set search_path = public as $$
  select translate(to_char(v, 'FM999,999,990.00'), ',.', '.,')
$$;

-- Confere uma competência de uma corretora. Devolve o resumo e grava os achados.
create or replace function conferir(p_corretora uuid, p_competencia char(7), p_ordem uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_ant   char(7) := to_char((p_competencia || '-01')::date - interval '1 month', 'YYYY-MM');
  v_agora timestamptz := clock_timestamp();
  v_res   jsonb;
  v_resolvidas int;
begin
  with
  f as (
    select f.id, f.seguradora_id, f.empresa_id, f.numero, f.valor_total, f.vidas_informadas,
           coalesce(e.nome_curto, e.razao_social, 'Empresa sem cadastro') as nome,
           (select count(*) from vidas v where v.fatura_id = f.id) as nv,
           (select sum(v.valor_total) from vidas v where v.fatura_id = f.id) as sv
      from faturas f left join empresas e on e.id = f.empresa_id
     where f.corretora_id = p_corretora and f.competencia = p_competencia),
  atual as (select seguradora_id, empresa_id, sum(nv) as nv from f group by 1, 2),
  ant as (
    select f.seguradora_id, f.empresa_id, max(coalesce(e.nome_curto, e.razao_social, 'Empresa sem cadastro')) as nome,
           sum((select count(*) from vidas v where v.fatura_id = f.id)) as nv
      from faturas f left join empresas e on e.id = f.empresa_id
     where f.corretora_id = p_corretora and f.competencia = v_ant
     group by 1, 2),
  l as (
    select l.id, p.seguradora_id, l.empresa_id, l.segurado, l.premio_liquido, l.taxa, l.comissao, l.classe
      from comissao_lancamentos l join comissao_pagamentos p on p.id = l.pagamento_id
     where l.corretora_id = p_corretora and p.competencia = p_competencia),
  achados (seguradora_id, empresa_id, tipo, gravidade, chave, mensagem, esperado, encontrado) as (
    -- a mesma fatura gravada mais de uma vez
    select seguradora_id, empresa_id, 'fatura_duplicada', 'erro', seguradora_id || '|' || coalesce(empresa_id::text, '') || '|' || numero,
           max(nome) || ': a fatura ' || numero || ' está gravada ' || count(*) || ' vezes', 1::numeric, count(*)::numeric
      from f where numero is not null group by seguradora_id, empresa_id, numero having count(*) > 1
    union all
    -- soma das vidas diferente do valor da fatura (tolerância de R$ 1)
    select seguradora_id, empresa_id, 'valor_divergem', 'erro', id::text,
           nome || ': a fatura ' || coalesce(numero, '') || ' é de R$ ' || brl(valor_total) || ' e a soma das vidas dá R$ ' || brl(sv),
           valor_total, sv
      from f where sv is not null and valor_total is not null and abs(sv - valor_total) > 1
    union all
    -- número de vidas da fatura diferente da lista de vidas
    select seguradora_id, empresa_id, 'vidas_divergem', 'aviso', id::text,
           nome || ': a fatura ' || coalesce(numero, '') || ' diz ' || vidas_informadas || ' vidas e a lista tem ' || nv,
           vidas_informadas, nv
      from f where nv > 0 and vidas_informadas is not null and vidas_informadas <> nv
    union all
    -- tinha vidas no mês anterior e agora a fatura veio sem nenhuma
    select a.seguradora_id, a.empresa_id, 'vidas_sumiram', 'aviso', a.seguradora_id || '|' || coalesce(a.empresa_id::text, ''),
           p.nome || ': tinha ' || p.nv || ' vidas em ' || v_ant || ' e nenhuma nesta competência', p.nv, 0
      from atual a join ant p on p.seguradora_id = a.seguradora_id and p.empresa_id is not distinct from a.empresa_id
     where a.nv = 0 and p.nv > 0
    union all
    -- tinha fatura no mês anterior e não tem nesta (só para seguradora que já tem faturas nesta competência)
    select p.seguradora_id, p.empresa_id, 'fatura_faltando', 'aviso', p.seguradora_id || '|' || coalesce(p.empresa_id::text, ''),
           p.nome || ': tinha fatura em ' || v_ant || ' e ainda não tem nesta competência', 1, 0
      from ant p
     where exists (select 1 from atual a where a.seguradora_id = p.seguradora_id)
       and not exists (select 1 from atual a where a.seguradora_id = p.seguradora_id and a.empresa_id is not distinct from p.empresa_id)
    union all
    -- comissão diferente de prêmio × taxa (tolerância de 5 centavos ou 1%)
    select seguradora_id, empresa_id, 'comissao_calculo', 'aviso', id::text,
           coalesce(segurado, 'Lançamento') || ': prêmio R$ ' || brl(premio_liquido) || ' × ' || brl(taxa) || '% dá R$ '
             || brl(round(premio_liquido * taxa / 100, 2)) || ', veio R$ ' || brl(comissao),
           round(premio_liquido * taxa / 100, 2), comissao
      from l where premio_liquido is not null and taxa is not null and comissao is not null
       and abs(premio_liquido * taxa / 100 - comissao) > greatest(0.05, abs(comissao) * 0.01)
    union all
    -- classe que não combina com a taxa (acima de 50% = agenciamento, até 10% = vitalício)
    select seguradora_id, empresa_id, 'comissao_classe', 'aviso', id::text,
           coalesce(segurado, 'Lançamento') || ': taxa de ' || brl(taxa) || '% marcada como ' || classe::text, null, taxa
      from l where taxa is not null and ((classe = 'agenciamento' and taxa <= 50) or (classe = 'vitalicio' and taxa > 10))
    union all
    -- comissão de quem não está no cadastro de empresas (uma linha por segurado)
    select seguradora_id, null, 'comissao_sem_empresa', 'aviso', seguradora_id || '|' || coalesce(segurado, ''),
           coalesce(segurado, 'Sem nome') || ': ' || count(*) || case when count(*) = 1 then ' lançamento' else ' lançamentos' end
             || ' de comissão (R$ ' || brl(sum(comissao)) || ') sem empresa cadastrada', null, sum(comissao)
      from l where empresa_id is null group by seguradora_id, segurado
  ),
  gravados as (
    insert into conferencias as c (corretora_id, competencia, seguradora_id, empresa_id, tipo, gravidade, chave, mensagem, esperado, encontrado, primeira_vez, ultima_vez, ordem_id)
    select p_corretora, p_competencia, seguradora_id, empresa_id, tipo, gravidade, chave, mensagem, esperado, encontrado, v_agora, v_agora, p_ordem from achados
    on conflict (corretora_id, competencia, tipo, chave) do update
      set mensagem = excluded.mensagem, esperado = excluded.esperado, encontrado = excluded.encontrado, gravidade = excluded.gravidade,
          ultima_vez = excluded.ultima_vez, resolvida_em = null, ordem_id = coalesce(excluded.ordem_id, c.ordem_id)
    returning c.tipo, c.gravidade, (c.primeira_vez = v_agora) as novo
  )
  select jsonb_build_object(
           'competencia', p_competencia,
           'erros',  count(*) filter (where gravidade = 'erro'),
           'avisos', count(*) filter (where gravidade = 'aviso'),
           'novos',  count(*) filter (where novo),
           'por_tipo', coalesce((select jsonb_object_agg(tipo, n) from (select tipo, count(*) n from gravados group by tipo) t), '{}'::jsonb))
    into v_res from gravados;

  -- o que não apareceu desta vez está resolvido
  update conferencias set resolvida_em = v_agora
   where corretora_id = p_corretora and competencia = p_competencia and resolvida_em is null and ultima_vez < v_agora;
  get diagnostics v_resolvidas = row_count;
  return v_res || jsonb_build_object('resolvidas', v_resolvidas);
end $$;

-- Atende a fila do Agente Conferência (chamado pelo pg_cron). Sem competência na ordem = mês atual.
-- Várias ordens da mesma corretora e competência na fila: uma conferência atende todas.
create or replace function atender_conferencias() returns int
language plpgsql security definer set search_path = public as $$
declare
  o ordens_execucao; v_comp char(7); v_res jsonb; v_maq uuid; n int := 0; v_msg text;
begin
  insert into maquinas (nome, descricao, ultimo_sinal) values ('Nuvem (Supabase)', 'Agentes que rodam na nuvem, sem depender do PC', now())
    on conflict (nome) do update set ultimo_sinal = now() returning id into v_maq;
  for o in select * from ordens_execucao where agente = 'conferencia' and status = 'pendente' order by prioridade, criada_em for update skip locked loop
    v_comp := coalesce(o.competencia, to_char(now() - interval '3 hours', 'YYYY-MM'));
    if exists (select 1 from ordens_execucao x where x.agente = 'conferencia' and x.corretora_id = o.corretora_id
                  and coalesce(x.competencia, '') = coalesce(o.competencia, '') and x.status = 'concluida' and x.terminada_em >= o.criada_em) then
      update ordens_execucao set status = 'concluida', modo = 'codigo', custo_usd = 0, terminada_em = now(),
             mensagem = 'Atendida junto com a conferência anterior.' where id = o.id;
      continue;
    end if;
    update ordens_execucao set status = 'em_execucao', iniciada_em = now(), maquina_id = v_maq, tentativas = tentativas + 1 where id = o.id;
    begin
      v_res := conferir(o.corretora_id, v_comp, o.id);
      v_msg := case when (v_res->>'erros')::int + (v_res->>'avisos')::int = 0 then 'Conferência ' || v_comp || ': tudo bate.'
               else 'Conferência ' || v_comp || ': ' || (v_res->>'erros') || ' erros e ' || (v_res->>'avisos') || ' avisos (' || (v_res->>'novos') || ' novos)'
                    || case when (v_res->>'resolvidas')::int > 0 then ', ' || (v_res->>'resolvidas') || ' resolvidos desde a última.' else '.' end end;
      update ordens_execucao set status = 'concluida', modo = 'codigo', custo_usd = 0, terminada_em = now(), mensagem = v_msg where id = o.id;
    exception when others then
      update ordens_execucao set status = 'erro', modo = 'codigo', terminada_em = now(), mensagem = 'Conferência: ' || sqlerrm where id = o.id;
    end;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function conferir(uuid, char, uuid) from public, anon, authenticated;
revoke all on function atender_conferencias() from public, anon, authenticated;

-- agente_fim ganha modo, tokens e custo (opcionais: o rodar.py de hoje continua funcionando igual)
-- e passa a disparar a Conferência depois de Faturas, Vidas e Comissão.
drop function if exists agente_fim(text, uuid, text, text);
create or replace function agente_fim(p_token text, p_ordem uuid, p_status text, p_mensagem text default null,
                                      p_modo text default null, p_tokens_entrada int default null, p_tokens_saida int default null,
                                      p_custo_usd numeric default null)
returns void language plpgsql security definer set search_path = public, privado as $$
declare o ordens_execucao;
begin
  if not privado.token_agente_ok(p_token) then raise exception 'token inválido'; end if;
  update ordens_execucao set status = p_status::status_ordem, mensagem = coalesce(p_mensagem, mensagem),
    terminada_em = case when p_status in ('concluida','erro') then now() else terminada_em end,
    modo = coalesce(p_modo, modo, case when sessao_url is not null then 'claude' else 'codigo' end),
    tokens_entrada = coalesce(p_tokens_entrada, tokens_entrada), tokens_saida = coalesce(p_tokens_saida, tokens_saida),
    custo_usd = coalesce(p_custo_usd, custo_usd)
  where id = p_ordem returning * into o;
  if o.id is not null and p_status = 'concluida' and o.agente = 'comissao' then
    insert into ordens_execucao(corretora_id, agente, competencia, origem, ordem_pai_id, prioridade, mensagem)
    values (o.corretora_id, 'projecao', o.competencia, 'encadeamento', o.id, 2, 'Depois da comissão ' || coalesce(o.seguradora_id, ''));
  end if;
  if o.id is not null and p_status = 'concluida' and o.agente in ('faturas', 'vidas', 'comissao')
     and not exists (select 1 from ordens_execucao x where x.agente = 'conferencia' and x.status = 'pendente'
                      and x.corretora_id = o.corretora_id and coalesce(x.competencia, '') = coalesce(o.competencia, '')) then
    insert into ordens_execucao(corretora_id, agente, competencia, origem, ordem_pai_id, prioridade, mensagem)
    values (o.corretora_id, 'conferencia', o.competencia, 'encadeamento', o.id, 3,
            'Depois de ' || o.agente || coalesce(' ' || o.seguradora_id, ''));
  end if;
end $$;
revoke all on function agente_fim(text, uuid, text, text, text, int, int, numeric) from public;
grant execute on function agente_fim(text, uuid, text, text, text, int, int, numeric) to anon, authenticated, service_role;

-- A cada 10 minutos (custo zero: é só SQL dentro do banco)
select cron.unschedule('agente-conferencia') where exists (select 1 from cron.job where jobname = 'agente-conferencia');
select cron.schedule('agente-conferencia', '*/10 * * * *', 'select public.atender_conferencias()');
