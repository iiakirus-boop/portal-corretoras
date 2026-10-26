-- p20 (2026-10-26): Agente Supervisor e cadastro dos agentes.
-- O supervisor olha o banco e decide sozinho o que precisa rodar, sem gastar tokens:
--   * Faturas: aprende pelo histórico quando cada empresa costuma ter a fatura emitida
--     (última emissão + 1 mês). Passou do dia e a fatura não está no banco: põe Faturas <seguradora> na fila.
--   * Comissão: aprende de quantos em quantos dias cada seguradora paga. A última importação
--     ficou mais velha que isso (mínimo 3, máximo 7 dias): põe Comissão <seguradora> na fila.
--   * Seguradora com faturas ou comissões e sem agente cadastrado: cria o rascunho do agente e um
--     pedido "criar agente" para alguém montar com a skill criar-agente-seguradora.
--   * Pedido dele que não precisa mais (alguém já rodou): cancela sozinho.
-- Roda a cada 30 minutos, das 7h às 20h de Brasília. Depende da p19 (conferência e modo/custo).

-- ---------------------------------------------------------------------
-- 1. Cadastro dos agentes: quem existe, onde roda e quais seguradoras atende
-- ---------------------------------------------------------------------
create table if not exists agentes (
  id            uuid primary key default gen_random_uuid(),
  agente        text not null,                    -- faturas, comissao, vidas, projecao, conferencia, supervisor
  seguradora_id text references seguradoras(id),  -- vazio = não depende de seguradora
  cobre         text[] not null default '{}',     -- outras seguradoras que o mesmo agente atende (Amil -> Santa Helena)
  nome          text not null,
  onde          text not null check (onde in ('nuvem', 'pc')),
  automatico    boolean not null default false,   -- roda sem ninguém (true) ou precisa de alguém no portal ou dos arquivos
  como          text,                             -- de onde vêm os dados
  situacao      text not null default 'ativo' check (situacao in ('ativo', 'rascunho', 'pausado')),
  criado_por    text not null default 'cadastro', -- cadastro / supervisor
  criado_em     timestamptz not null default now()
);
create unique index if not exists agentes_unico on agentes (agente, coalesce(seguradora_id, ''));

alter table agentes enable row level security;
drop policy if exists master_tudo on agentes;
drop policy if exists ler on agentes;
create policy master_tudo on agentes for all using (eh_master()) with check (eh_master());
create policy ler on agentes for select using (auth.uid() is not null);

insert into agentes (agente, seguradora_id, cobre, nome, onde, automatico, como) values
  ('faturas',  'hapvida',        '{}',                           'Faturas Hapvida',      'pc', true,  'arquivos em "boletos a enviar\HAPVIDA" (ou API do portal)'),
  ('faturas',  'sulamerica',     '{}',                           'Faturas SulAmérica',   'pc', true,  'arquivos em "boletos a enviar\SUL AMERICA"'),
  ('faturas',  'amil',           '{amil_dental,santa_helena}',   'Faturas Amil',         'pc', true,  'arquivos em "boletos a enviar\AMIL"'),
  ('faturas',  'bradesco_saude', '{bradesco_dental}',            'Faturas Bradesco',     'pc', false, 'kits do Portal de Negócios (alguém loga)'),
  ('faturas',  'porto_saude',    '{}',                           'Faturas Porto',        'pc', false, 'Corretor Online pelo navegador (alguém loga)'),
  ('comissao', 'porto_saude',    '{}',                           'Comissão Porto',       'pc', false, 'extrato no portal (alguém loga)'),
  ('comissao', 'bradesco_saude', '{bradesco_dental}',            'Comissão Bradesco',    'pc', false, 'extrato .xls no Portal de Negócios (alguém loga)'),
  ('comissao', 'amil',           '{amil_dental,santa_helena}',   'Comissão Amil',        'pc', false, 'SisAmil, arquivo texto (alguém loga)'),
  ('comissao', 'hapvida',        '{}',                           'Comissão Hapvida',     'pc', false, 'webhap, logins 045K, 045L e 02JZ (alguém loga)'),
  ('comissao', 'sulamerica',     '{}',                           'Comissão SulAmérica',  'pc', false, 'extrato no portal (alguém loga)'),
  ('vidas',       null, '{}', 'Vidas',       'pc',    true, 'base de faturas (roda depois de Faturas)'),
  ('projecao',    null, '{}', 'Projeção',    'nuvem', true, 'faturas e comissões no banco'),
  ('conferencia', null, '{}', 'Conferência', 'nuvem', true, 'faturas, vidas e comissões no banco'),
  ('supervisor',  null, '{}', 'Supervisor',  'nuvem', true, 'calendário aprendido do histórico do banco')
on conflict do nothing;

-- O PC só recebe o que roda no PC (Projeção, Conferência e Supervisor ficam na nuvem; criar agente é com o Claude)
create or replace function agente_fila(p_token text, p_corretora uuid) returns jsonb
language plpgsql stable security definer set search_path = public, privado as $$
begin
  if not privado.token_agente_ok(p_token) then raise exception 'token inválido'; end if;
  return jsonb_build_object(
    'ordens', coalesce((select jsonb_agg(to_jsonb(o) order by o.prioridade, o.criada_em) from ordens_execucao o
               where o.corretora_id = p_corretora and o.status = 'pendente' and o.agente <> 'criar_agente'
                 and not exists (select 1 from agentes a where a.agente = o.agente and a.onde = 'nuvem')), '[]'::jsonb),
    'rotinas', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'nome', r.nome, 'agente', r.agente, 'seguradora_id', r.seguradora_id,
               'agenda', r.agenda, 'parametros', r.parametros)) from rotinas r
               where r.ativa and (r.corretora_id = p_corretora or r.corretora_id is null)), '[]'::jsonb));
end $$;

-- ---------------------------------------------------------------------
-- 2. O calendário que o supervisor aprendeu (também é o que o master mostra)
-- ---------------------------------------------------------------------
create or replace view supervisor_previsao with (security_invoker = true) as
with
hoje as (select (now() - interval '3 hours')::date as d),
-- seguradora -> seguradora do agente que a atende (Santa Helena -> Amil)
fam as (
  select s.id as seg,
         coalesce((select a.seguradora_id from agentes a where a.agente = 'faturas'  and a.situacao = 'ativo' and (a.seguradora_id = s.id or s.id = any(a.cobre)) limit 1), s.id) as seg_fat,
         coalesce((select a.seguradora_id from agentes a where a.agente = 'comissao' and a.situacao = 'ativo' and (a.seguradora_id = s.id or s.id = any(a.cobre)) limit 1), s.id) as seg_com
    from seguradoras s),
-- última fatura de cada empresa em cada seguradora
ult as (
  select distinct on (f.corretora_id, f.seguradora_id, f.empresa_id) f.corretora_id, f.seguradora_id, f.empresa_id, f.competencia, f.emissao, f.vencimento
    from faturas f where f.empresa_id is not null
   order by f.corretora_id, f.seguradora_id, f.empresa_id, f.competencia desc, f.emissao desc nulls last),
-- empresas ativas (fatura nos dois últimos meses seguidos) e quando a próxima deve sair
ativas as (
  select u.*, to_char((u.competencia || '-01')::date + interval '1 month', 'YYYY-MM') as prox,
         (coalesce(u.emissao, u.vencimento - 15) + interval '1 month')::date as esperada
    from ult u, hoje
   where u.competencia >= to_char(hoje.d - interval '2 months', 'YYYY-MM')
     and exists (select 1 from faturas f2 where f2.corretora_id = u.corretora_id and f2.seguradora_id = u.seguradora_id and f2.empresa_id = u.empresa_id
                    and f2.competencia = to_char((u.competencia || '-01')::date - interval '1 month', 'YYYY-MM'))),
fat as (
  select a.corretora_id, fm.seg_fat as seguradora_id, a.prox as competencia,
         min(a.esperada) as esperado_em,
         count(*) as empresas,
         count(*) filter (where a.esperada + 1 < hoje.d) as atrasadas,
         array_agg(coalesce(e.nome_curto, e.razao_social, '?') order by a.esperada) filter (where a.esperada + 1 < hoje.d) as nomes
    from ativas a join fam fm on fm.seg = a.seguradora_id left join empresas e on e.id = a.empresa_id, hoje
   where a.prox >= to_char(hoje.d, 'YYYY-MM')          -- atrasos de meses passados são da Conferência (fatura faltando)
   group by 1, 2, 3),
-- comissão: de quantos em quantos dias a seguradora paga e quando foi a última importação
pg as (
  select p.corretora_id, fm.seg_com as seg, p.data_pagamento as d, p.processado_em
    from comissao_pagamentos p join fam fm on fm.seg = p.seguradora_id),
gaps as (
  select corretora_id, seg, d - lag(d) over (partition by corretora_id, seg order by d) as gap
    from (select distinct pg.corretora_id, pg.seg, pg.d from pg, hoje where pg.d >= hoje.d - 120) x),
com as (
  select pg.corretora_id, pg.seg, max(pg.processado_em)::date as ult_import, max(pg.d) as ult_pag,
         (select percentile_cont(0.5) within group (order by g.gap) from gaps g where g.corretora_id = pg.corretora_id and g.seg = pg.seg and g.gap > 0) as gap
    from pg group by 1, 2)
select f.corretora_id, 'faturas'::text as agente, f.seguradora_id, f.competencia, f.esperado_em,
       f.atrasadas > 0 as atrasado,
       case when f.atrasadas > 0
            then f.atrasadas || ' de ' || f.empresas || ' empresas com fatura de ' || f.competencia || ' que já devia ter saído: '
                 || array_to_string(f.nomes[1:5], ', ') || case when f.atrasadas > 5 then ' e mais ' || (f.atrasadas - 5) else '' end
            else f.empresas || ' empresas; a primeira fatura de ' || f.competencia || ' costuma sair em ' || to_char(f.esperado_em, 'DD/MM') end as motivo
  from fat f
union all
select c.corretora_id, 'comissao', c.seg, to_char(hoje.d, 'YYYY-MM'),
       c.ult_import + least(7, greatest(3, ceil(coalesce(c.gap, 7))))::int,
       hoje.d > c.ult_import + least(7, greatest(3, ceil(coalesce(c.gap, 7))))::int,
       'última importação em ' || to_char(c.ult_import, 'DD/MM') || ' (último pagamento de ' || to_char(c.ult_pag, 'DD/MM')
         || '); costuma pagar ' || case when c.gap is null then 'sem frequência conhecida' when round(c.gap) <= 1 then 'quase todo dia' else 'a cada ' || round(c.gap) || ' dias' end
  from com c, hoje;

-- ---------------------------------------------------------------------
-- 3. O supervisor
-- ---------------------------------------------------------------------
create or replace function supervisionar() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r record; v_maq uuid; v_novas int := 0; v_canceladas int := 0; v_rascunhos int := 0;
begin
  insert into maquinas (nome, descricao, ultimo_sinal) values ('Nuvem (Supabase)', 'Agentes que rodam na nuvem, sem depender do PC', now())
    on conflict (nome) do update set ultimo_sinal = now() returning id into v_maq;

  -- a. o que está atrasado vira pedido (um por agente + seguradora + competência; no máximo um por dia)
  for r in
    select p.* from supervisor_previsao p
      join corretoras c on c.id = p.corretora_id and c.ativa
      join agentes a on a.agente = p.agente and a.seguradora_id = p.seguradora_id and a.situacao = 'ativo'
     where p.atrasado
       and not exists (select 1 from ordens_execucao o
                        where o.corretora_id = p.corretora_id and o.agente = p.agente and o.seguradora_id is not distinct from p.seguradora_id
                          and coalesce(o.competencia, '') = coalesce(p.competencia, '')
                          and (o.status in ('pendente', 'em_execucao', 'aguardando_voce') or o.criada_em > now() - interval '20 hours'))
  loop
    insert into ordens_execucao (corretora_id, agente, seguradora_id, competencia, origem, prioridade, mensagem, parametros)
    values (r.corretora_id, r.agente, r.seguradora_id, r.competencia, 'supervisor', 4, 'Supervisor: ' || r.motivo,
            jsonb_build_object('motivo', r.motivo, 'esperado_em', r.esperado_em));
    v_novas := v_novas + 1;
  end loop;

  -- b. pedido do supervisor que ainda não rodou e não precisa mais (alguém já trouxe os dados)
  update ordens_execucao o set status = 'cancelada', terminada_em = now(),
         mensagem = 'Supervisor: não precisa mais, os dados já estão no banco.'
   where o.origem = 'supervisor' and o.status in ('pendente', 'aguardando_voce')
     and not exists (select 1 from supervisor_previsao p
                      where p.corretora_id = o.corretora_id and p.agente = o.agente and p.seguradora_id is not distinct from o.seguradora_id
                        and p.competencia = o.competencia and p.atrasado);
  get diagnostics v_canceladas = row_count;

  -- c. seguradora com dados no banco e sem agente: rascunho do agente + pedido para alguém montar
  for r in
    with usadas as (
      select distinct f.corretora_id, 'faturas'::text as agente, f.seguradora_id from faturas f
       where f.competencia >= to_char(now() - interval '3 months', 'YYYY-MM')
      union
      select distinct p.corretora_id, 'comissao', p.seguradora_id from comissao_pagamentos p
       where p.data_pagamento >= current_date - 90)
    select u.* from usadas u join seguradoras s on s.id = u.seguradora_id
     where not exists (select 1 from agentes a where a.agente = u.agente and (a.seguradora_id = u.seguradora_id or u.seguradora_id = any(a.cobre)))
  loop
    insert into agentes (agente, seguradora_id, nome, onde, automatico, situacao, criado_por, como)
    values (r.agente, r.seguradora_id, initcap(r.agente) || ' ' || (select nome from seguradoras where id = r.seguradora_id),
            'pc', false, 'rascunho', 'supervisor', 'a definir')
    on conflict do nothing;
    insert into ordens_execucao (corretora_id, agente, seguradora_id, origem, prioridade, status, mensagem, parametros)
    values (r.corretora_id, 'criar_agente', r.seguradora_id, 'supervisor', 3, 'aguardando_voce',
            'Supervisor: tem ' || case when r.agente = 'faturas' then 'faturas' else 'comissões' end || ' da '
              || (select nome from seguradoras where id = r.seguradora_id)
              || ' no banco e nenhum agente para elas. Peça ao Claude "criar agente ' || r.agente || ' ' || r.seguradora_id || '".',
            jsonb_build_object('tipo', r.agente, 'skill', 'criar-agente-seguradora'));
    v_rascunhos := v_rascunhos + 1;
  end loop;

  return jsonb_build_object('pedidos_novos', v_novas, 'cancelados', v_canceladas, 'agentes_rascunho', v_rascunhos, 'em', now());
end $$;
revoke all on function supervisionar() from public, anon, authenticated;

-- Das 7h às 20h de Brasília, a cada 30 minutos (custo zero: é só SQL dentro do banco)
select cron.unschedule('agente-supervisor') where exists (select 1 from cron.job where jobname = 'agente-supervisor');
select cron.schedule('agente-supervisor', '*/30 10-23 * * *', 'select public.supervisionar()');
