-- p28: o master exclui o que veio errado (com desfazer) e resolve os avisos da Conferência.
-- Nada é apagado de verdade: excluir só marca o registro e guarda quem, quando e por quê.

-- 1) Marcas de exclusão
alter table public.faturas
  add column if not exists excluido_em timestamptz,
  add column if not exists excluido_por uuid,
  add column if not exists excluido_motivo text;
alter table public.comissao_lancamentos
  add column if not exists excluido_em timestamptz,
  add column if not exists excluido_por uuid,
  add column if not exists excluido_motivo text;
-- ordem velha some do histórico do master (não muda o que ela fez)
alter table public.ordens_execucao add column if not exists oculta_em timestamptz;
-- aviso marcado como "é normal" não volta na próxima Conferência
alter table public.conferencias
  add column if not exists ignorada_em timestamptz,
  add column if not exists ignorada_por uuid,
  add column if not exists nota text;

-- 2) Registro das exclusões. O PC regrava faturas e lançamentos a cada sincronização (os lançamentos são
-- apagados e inseridos de novo pelo mesmo id). Este registro faz o que foi excluído continuar excluído.
create table if not exists public.exclusoes (
  tabela        text not null check (tabela in ('faturas', 'comissao_lancamentos')),
  registro_id   uuid not null,
  corretora_id  uuid not null references public.corretoras(id),
  resumo        text,
  motivo        text,
  excluido_por  uuid,
  excluido_em   timestamptz not null default now(),
  desfeito_em   timestamptz,
  desfeito_por  uuid,
  primary key (tabela, registro_id)
);
alter table public.exclusoes enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'exclusoes' and policyname = 'master_tudo') then
    create policy master_tudo on public.exclusoes for all using (eh_master()) with check (eh_master());
  end if;
end $$;

-- 3) Nome do segurado no extrato -> empresa do cadastro (resolve "Comissão sem empresa" de vez)
create table if not exists public.apelidos_empresa (
  corretora_id  uuid not null references public.corretoras(id),
  seguradora_id text not null,
  segurado      text not null,
  empresa_id    uuid not null references public.empresas(id),
  criado_por    uuid,
  criado_em     timestamptz not null default now(),
  primary key (corretora_id, seguradora_id, segurado)
);
alter table public.apelidos_empresa enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'apelidos_empresa' and policyname = 'master_tudo') then
    create policy master_tudo on public.apelidos_empresa for all using (eh_master()) with check (eh_master());
  end if;
end $$;

-- 4) Ao gravar de novo (sincronização do PC), mantém a exclusão e liga a empresa pelo apelido
create or replace function public.tg_manter_correcoes() returns trigger
language plpgsql security definer set search_path = public as $$
declare x record; v_seg text;
begin
  select e.excluido_em, e.excluido_por, e.motivo into x
    from exclusoes e where e.tabela = tg_table_name and e.registro_id = new.id and e.desfeito_em is null;
  if found then
    new.excluido_em := x.excluido_em; new.excluido_por := x.excluido_por; new.excluido_motivo := x.motivo;
  end if;
  if tg_table_name = 'comissao_lancamentos' and new.empresa_id is null and new.segurado is not null then
    select p.seguradora_id into v_seg from comissao_pagamentos p where p.id = new.pagamento_id;
    select a.empresa_id into new.empresa_id from apelidos_empresa a
     where a.corretora_id = new.corretora_id and a.seguradora_id = v_seg and a.segurado = new.segurado;
  end if;
  return new;
end $$;
revoke execute on function public.tg_manter_correcoes() from public, anon, authenticated;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'manter_correcoes' and tgrelid = 'public.faturas'::regclass) then
    create trigger manter_correcoes before insert on public.faturas
      for each row execute function public.tg_manter_correcoes();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'manter_correcoes' and tgrelid = 'public.comissao_lancamentos'::regclass) then
    create trigger manter_correcoes before insert on public.comissao_lancamentos
      for each row execute function public.tg_manter_correcoes();
  end if;
end $$;

-- 5) Quem não é master não vê o que foi excluído
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'faturas' and policyname = 'esconder_excluidas') then
    create policy esconder_excluidas on public.faturas as restrictive for select using (excluido_em is null or eh_master());
  end if;
  if not exists (select 1 from pg_policies where tablename = 'comissao_lancamentos' and policyname = 'esconder_excluidos') then
    create policy esconder_excluidos on public.comissao_lancamentos as restrictive for select using (excluido_em is null or eh_master());
  end if;
end $$;

-- 6) Conferência ignora o que foi excluído e não reabre aviso marcado como normal
create or replace function public.conferir(p_corretora uuid, p_competencia character, p_ordem uuid default null::uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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
     where f.corretora_id = p_corretora and f.competencia = p_competencia and f.excluido_em is null),
  atual as (select seguradora_id, empresa_id, sum(nv) as nv from f group by 1, 2),
  ant as (
    select f.seguradora_id, f.empresa_id, max(coalesce(e.nome_curto, e.razao_social, 'Empresa sem cadastro')) as nome,
           sum((select count(*) from vidas v where v.fatura_id = f.id)) as nv
      from faturas f left join empresas e on e.id = f.empresa_id
     where f.corretora_id = p_corretora and f.competencia = v_ant and f.excluido_em is null
     group by 1, 2),
  l as (
    select l.id, p.seguradora_id, l.empresa_id, l.segurado, l.premio_liquido, l.taxa, l.comissao, l.classe
      from comissao_lancamentos l join comissao_pagamentos p on p.id = l.pagamento_id
     where l.corretora_id = p_corretora and p.competencia = p_competencia and l.excluido_em is null),
  achados (seguradora_id, empresa_id, tipo, gravidade, chave, mensagem, esperado, encontrado) as (
    select seguradora_id, empresa_id, 'fatura_duplicada', 'erro', seguradora_id || '|' || coalesce(empresa_id::text, '') || '|' || numero,
           max(nome) || ': a fatura ' || numero || ' está gravada ' || count(*) || ' vezes', 1::numeric, count(*)::numeric
      from f where numero is not null group by seguradora_id, empresa_id, numero having count(*) > 1
    union all
    select seguradora_id, empresa_id, 'valor_divergem', 'erro', id::text,
           nome || ': a fatura ' || coalesce(numero, '') || ' é de R$ ' || brl(valor_total) || ' e a soma das vidas dá R$ ' || brl(sv),
           valor_total, sv
      from f where sv is not null and valor_total is not null and abs(sv - valor_total) > 1
    union all
    select seguradora_id, empresa_id, 'vidas_divergem', 'aviso', id::text,
           nome || ': a fatura ' || coalesce(numero, '') || ' diz ' || vidas_informadas || ' vidas e a lista tem ' || nv,
           vidas_informadas, nv
      from f where nv > 0 and vidas_informadas is not null and vidas_informadas <> nv
    union all
    select a.seguradora_id, a.empresa_id, 'vidas_sumiram', 'aviso', a.seguradora_id || '|' || coalesce(a.empresa_id::text, ''),
           p.nome || ': tinha ' || p.nv || ' vidas em ' || v_ant || ' e nenhuma nesta competência', p.nv, 0
      from atual a join ant p on p.seguradora_id = a.seguradora_id and p.empresa_id is not distinct from a.empresa_id
     where a.nv = 0 and p.nv > 0
    union all
    select p.seguradora_id, p.empresa_id, 'fatura_faltando', 'aviso', p.seguradora_id || '|' || coalesce(p.empresa_id::text, ''),
           p.nome || ': tinha fatura em ' || v_ant || ' e ainda não tem nesta competência', 1, 0
      from ant p
     where exists (select 1 from atual a where a.seguradora_id = p.seguradora_id)
       and not exists (select 1 from atual a where a.seguradora_id = p.seguradora_id and a.empresa_id is not distinct from p.empresa_id)
    union all
    select seguradora_id, empresa_id, 'comissao_calculo', 'aviso', id::text,
           coalesce(segurado, 'Lançamento') || ': prêmio R$ ' || brl(premio_liquido) || ' × ' || brl(taxa) || '% dá R$ '
             || brl(round(premio_liquido * taxa / 100, 2)) || ', veio R$ ' || brl(comissao),
           round(premio_liquido * taxa / 100, 2), comissao
      from l where premio_liquido is not null and taxa is not null and comissao is not null
       and abs(premio_liquido * taxa / 100 - comissao) > greatest(0.05, abs(comissao) * 0.01)
    union all
    select seguradora_id, empresa_id, 'comissao_classe', 'aviso', id::text,
           coalesce(segurado, 'Lançamento') || ': taxa de ' || brl(taxa) || '% marcada como ' || classe::text, null, taxa
      from l where taxa is not null and ((classe = 'agenciamento' and taxa <= 50) or (classe = 'vitalicio' and taxa > 10))
    union all
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
          ultima_vez = excluded.ultima_vez,
          -- marcado como normal pelo master: continua resolvido
          resolvida_em = case when c.ignorada_em is null then null else c.resolvida_em end,
          ordem_id = coalesce(excluded.ordem_id, c.ordem_id)
    returning c.tipo, c.gravidade, (c.primeira_vez = v_agora) as novo, c.ignorada_em
  )
  select jsonb_build_object(
           'competencia', p_competencia,
           'erros',  count(*) filter (where gravidade = 'erro' and ignorada_em is null),
           'avisos', count(*) filter (where gravidade = 'aviso' and ignorada_em is null),
           'novos',  count(*) filter (where novo),
           'por_tipo', coalesce((select jsonb_object_agg(tipo, n) from (select tipo, count(*) n from gravados where ignorada_em is null group by tipo) t), '{}'::jsonb))
    into v_res from gravados;

  update conferencias set resolvida_em = v_agora
   where corretora_id = p_corretora and competencia = p_competencia and resolvida_em is null and ultima_vez < v_agora;
  get diagnostics v_resolvidas = row_count;
  return v_res || jsonb_build_object('resolvidas', v_resolvidas);
end $function$;
