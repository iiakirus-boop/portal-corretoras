-- p31 (2026-11-03): o banco vira a base principal (itens 8 e 9 da análise).
--
-- 1. Os agentes gravam direto nas tabelas, pelas funções agente_gravar_faturas e agente_gravar_comissao
--    (o mesmo token dos agentes). Elas acham empresa, apólice e subestipulante no cadastro do banco, sem planilha.
--    O que elas gravam fica com origem = 'agente'.
-- 2. A sincronização da planilha (sincronizar_lote) vira só cópia: não mexe no que o agente já gravou
--    (origem = 'agente'), não traz de volta o que foi excluído no master e não quebra o lote inteiro quando
--    uma linha aponta para fatura/ordem que não existe.
-- 3. As telas leem as faturas das tabelas, pela função central_faturas_docs (mesmo formato dos documentos
--    da Central). O código de empresa da Central (E001...) continua o mesmo pela tabela central_eid, para as
--    vidas, comissões e projeções antigas continuarem batendo.
-- Sem DROP.

alter table faturas add column if not exists origem text not null default 'planilha';
alter table vidas add column if not exists origem text not null default 'planilha';
alter table comissao_pagamentos add column if not exists origem text not null default 'planilha';
create index if not exists vidas_fatura_id_idx on vidas (fatura_id);

-- ---------------------------------------------------------------- código de empresa da Central
create table if not exists central_eid (
  corretora_id uuid not null references corretoras(id),
  chave text not null,          -- '<apolice_id>|<subestipulante_id>', '<apolice_id>|*' ou 'emp|<empresa_id>'
  eid text not null,
  nome text,
  competencia text,
  atualizado_em timestamptz not null default now(),
  primary key (corretora_id, chave));
alter table central_eid enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'central_eid' and policyname = 'ler') then
    create policy ler on central_eid for select using (eh_da_corretora(corretora_id));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'central_eid' and policyname = 'master_tudo') then
    create policy master_tudo on central_eid for all using (eh_master());
  end if;
end $$;

-- grava o mapa a partir de um documento de faturas da Central (titulo + competência -> fatura da tabela)
create or replace function privado.central_eid_gravar(p_corretora uuid, p_itens jsonb, p_comp text)
returns void language sql security definer set search_path to 'public', 'privado' as $$
  with i as (
    select x->>'eid' as eid, x->>'empresa' as nome, x->>'titulo' as numero
      from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) x where coalesce(x->>'eid', '') <> ''),
  m as (
    select i.eid, i.nome, f.apolice_id, f.subestipulante_id, f.empresa_id
      from i join faturas f on f.corretora_id = p_corretora and f.competencia = p_comp and f.numero = i.numero),
  k as (
    select m.apolice_id::text || '|' || coalesce(m.subestipulante_id::text, '') as chave, eid, nome from m where m.apolice_id is not null
    union all select m.apolice_id::text || '|*', eid, nome from m where m.apolice_id is not null
    union all select 'emp|' || m.empresa_id::text, eid, nome from m)
  insert into central_eid (corretora_id, chave, eid, nome, competencia)
  select distinct on (chave) p_corretora, chave, eid, nome, p_comp from k order by chave, eid
  on conflict (corretora_id, chave) do update
     set eid = excluded.eid, nome = excluded.nome, competencia = excluded.competencia, atualizado_em = now()
   where central_eid.competencia is null or central_eid.competencia <= excluded.competencia;
$$;

create or replace function privado.central_eid_trg() returns trigger
language plpgsql security definer set search_path to 'public', 'privado' as $$
begin
  if new.colecao = 'faturas' then
    perform privado.central_eid_gravar(new.corretora_id, new.dados->'itens', new.dados->>'comp');
  end if;
  return new;
end $$;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'central_eid_mapa') then
    create trigger central_eid_mapa after insert or update on central_docs
      for each row execute function privado.central_eid_trg();
  end if;
end $$;

-- carga inicial, do mês mais antigo para o mais novo
do $$ declare d record; begin
  for d in select corretora_id, dados from central_docs where colecao = 'faturas' order by dados->>'comp', doc_id loop
    perform privado.central_eid_gravar(d.corretora_id, d.dados->'itens', d.dados->>'comp');
  end loop;
end $$;

-- ---------------------------------------------------------------- faturas para as telas
-- Mesmo formato dos documentos "faturas" da Central: um documento por competência + seguradora, com itens
-- {eid, empresa, titulo, venc, valor, vidas, ativos, subs, boleto, confValor, confVidas, subsDet}.
-- Lê com a permissão de quem chama (regras de acesso de faturas, vidas e empresas).
create or replace function public.central_faturas_docs(p_corretora uuid, p_desde text default null)
returns jsonb language sql stable set search_path to 'public' as $$
  with
  f as (
    select f.*, e.codigo_interno, e.razao_social
      from faturas f join empresas e on e.id = f.empresa_id
     where f.corretora_id = p_corretora and f.vencimento is not null and f.excluido_em is null
       and f.competencia >= coalesce(p_desde, to_char(now() - interval '18 months', 'YYYY-MM'))),
  v as (
    select fatura_id, subestipulante as sub, count(*) as linhas, count(*) filter (where situacao = 'Ativo') as ativos,
           round(sum(coalesce(valor_total, coalesce(premio_base, 0) + coalesce(pro_rata, 0) + coalesce(copart_total, 0))), 2) as soma
      from vidas where corretora_id = p_corretora and fatura_id in (select id from f) group by 1, 2),
  vf as (
    select fatura_id, sum(linhas)::int as linhas, sum(ativos)::int as ativos, sum(soma) as soma, count(sub)::int as nsubs,
           jsonb_agg(jsonb_build_object('cod', sub, 'vidas', ativos, 'valorVidas', soma) order by sub) filter (where sub is not null) as subs
      from v group by 1),
  x as (
    select f.*, vf.linhas, vf.ativos, vf.soma, coalesce(vf.nsubs, 0) as nsubs, vf.subs,
           coalesce(m1.eid, m2.eid, m3.eid, f.codigo_interno) as eid,
           coalesce(m1.nome, m2.nome, m3.nome, f.razao_social) as nome,
           case f.seguradora_id when 'porto_saude' then 'porto' when 'bradesco_saude' then 'bradesco' else replace(f.seguradora_id, '_', '') end as slug,
           split_part(s.nome, ' / ', 1) as op,
           f.data_pagamento is not null or f.pago_pela_comissao is not null or (to_jsonb(f)->>'pago_no_portal') is not null as pago
      from f
      left join vf on vf.fatura_id = f.id
      left join seguradoras s on s.id = f.seguradora_id
      left join central_eid m1 on m1.corretora_id = p_corretora and m1.chave = f.apolice_id::text || '|' || coalesce(f.subestipulante_id::text, '')
      left join central_eid m2 on m2.corretora_id = p_corretora and m2.chave = f.apolice_id::text || '|*'
      left join central_eid m3 on m3.corretora_id = p_corretora and m3.chave = 'emp|' || f.empresa_id::text),
  it as (
    select x.competencia, x.slug, x.op, x.processado_em, x.eid, x.numero,
      jsonb_build_object(
        'eid', x.eid, 'empresa', left(x.nome, 60), 'titulo', x.numero, 'venc', to_char(x.vencimento, 'DD/MM/YYYY'),
        'valor', x.valor_total, 'valorBoleto', x.valor_boleto,
        'vidas', coalesce(x.vidas_informadas, case when x.linhas > 0 then x.ativos end),
        'ativos', case when x.linhas > 0 then x.ativos end,
        'subs', greatest(x.nsubs, 1),
        -- boleto: pago quando o banco sabe (baixa, portal ou comissão); sem informação, segue a regra que a Central
        -- sempre usou (vencido = pago, a vencer = em aberto). A tela troca pelo detalhe em lib/central/dados.ts.
        'boleto', case when x.pago then 'Pago' when x.vencimento >= (now() at time zone 'America/Sao_Paulo')::date then 'Em aberto' else 'Pago' end,
        'confValor', coalesce(x.conferencia_valor, case
            when x.seguradora_id like 'bradesco%' then 'OK'
            when coalesce(x.ativos, 0) = 0 then 'Sem vidas'
            when abs(x.valor_total - x.soma) <= 0.01 then 'OK' else 'Divergência' end),
        'confVidas', coalesce(x.conferencia_vidas, case
            when x.vidas_informadas is null then case when x.linhas is null then 'Sem relação de vidas' else '' end
            when x.ativos = x.vidas_informadas then 'OK' else 'Divergência' end),
        'origem', x.origem)
      || case when x.nsubs > 1 then jsonb_build_object('subsDet', (
           select jsonb_agg(jsonb_build_object(
                    'cod', e->>'cod', 'nome', s.nome_portal, 'cnpj', s.cnpj, 'vidas', (e->>'vidas')::int, 'vidasSub', (e->>'vidas')::int,
                    'valorVidas', (e->>'valorVidas')::numeric, 'titulo', f2.numero, 'valor', f2.valor_total,
                    'venc', to_char(f2.vencimento, 'DD/MM/YYYY'), 'boleto', case when f2.id is not null then 'Sem boleto' end,
                    'confValor', case when f2.id is not null then 'OK' end) order by e->>'cod')
             from jsonb_array_elements(x.subs) e
             left join lateral (select s.* from subestipulantes s join apolices a on a.id = s.apolice_id
                                 where a.corretora_id = p_corretora and a.seguradora_id = x.seguradora_id and s.codigo = e->>'cod'
                                 order by (s.apolice_id = x.apolice_id) desc limit 1) s on true
             left join lateral (select f2.* from faturas f2
                                 where f2.corretora_id = p_corretora and f2.competencia = x.competencia and f2.subestipulante_id = s.id
                                   and f2.excluido_em is null
                                 order by (f2.id = x.id) desc limit 1) f2 on true))
         else '{}'::jsonb end as item
      from x)
  select coalesce(jsonb_agg(d order by d->>'id'), '[]'::jsonb) from (
    select jsonb_build_object('id', competencia || '_' || slug, 'comp', competencia, 'operadora', op,
                              'atualizadoEm', max(processado_em), 'fonte', 'tabelas',
                              'itens', jsonb_agg(item order by eid, numero)) as d
      from it group by competencia, slug, op) q;
$$;
grant execute on function public.central_faturas_docs(uuid, text) to authenticated, service_role;

-- ---------------------------------------------------------------- gravação direta das faturas (agentes)
-- p_faturas: [{numero, competencia, seguradora?, emissao, vencimento, cobertura_inicio, cobertura_fim, valor_total,
--              valor_boleto, vidas_informadas, nosso_numero, linha_digitavel, data_pagamento, observacoes,
--              conferencia_valor, conferencia_vidas,
--              cadastro: {estipulante, apolice, contrato, sub, unidade, cnpj},
--              vidas: [linhas no formato da tabela vidas]}]
-- Devolve {gravadas, atualizadas, vidas, excluidas, pendencias: [{numero, competencia, motivo}]}.
create or replace function public.agente_gravar_faturas(p_token text, p_corretora uuid, p_seguradora text, p_faturas jsonb)
returns jsonb language plpgsql security definer set search_path to 'public', 'privado' as $$
declare
  f jsonb; c jsonb; v_seg text; v_un text; v_codes text[]; v_cnpj text;
  v_sub uuid; v_ap uuid; v_emp uuid; v_id uuid; v_exc timestamptz; k int;
  n_ins int := 0; n_upd int := 0; n_vid int := 0; n_exc int := 0; pend jsonb := '[]'::jsonb;
begin
  if not privado.token_agente_ok(p_token) then raise exception 'token inválido'; end if;
  for f in select * from jsonb_array_elements(coalesce(p_faturas, '[]'::jsonb)) loop
    c := coalesce(f->'cadastro', '{}'::jsonb);
    v_seg := coalesce(nullif(f->>'seguradora', ''), p_seguradora);
    v_un := nullif(c->>'unidade', '');
    v_codes := array_remove(array[nullif(c->>'estipulante', ''), nullif(c->>'apolice', ''), nullif(c->>'contrato', '')], null);
    v_cnpj := nullif(regexp_replace(coalesce(c->>'cnpj', ''), '\D', '', 'g'), '');
    v_sub := null; v_ap := null; v_emp := null;
    -- 1) subestipulante (com a apólice/estipulante quando vier; Bradesco tem "0001" em toda apólice)
    if nullif(c->>'sub', '') is not null then
      select s.id, a.id, a.empresa_id into v_sub, v_ap, v_emp
        from subestipulantes s join apolices a on a.id = s.apolice_id
       where a.corretora_id = p_corretora and a.seguradora_id = v_seg and s.codigo = c->>'sub'
         and (cardinality(v_codes) = 0 or a.apolice = any(v_codes) or a.codigo_estipulante = any(v_codes) or a.contrato = any(v_codes))
       order by (s.unidade_cobranca is not distinct from v_un) desc, s.ativa desc, a.ativa desc limit 1;
      if v_emp is null and (select count(*) from subestipulantes s join apolices a on a.id = s.apolice_id
                             where a.corretora_id = p_corretora and a.seguradora_id = v_seg and s.codigo = c->>'sub') = 1 then
        select s.id, a.id, a.empresa_id into v_sub, v_ap, v_emp
          from subestipulantes s join apolices a on a.id = s.apolice_id
         where a.corretora_id = p_corretora and a.seguradora_id = v_seg and s.codigo = c->>'sub';
      end if;
    end if;
    -- 2) apólice / estipulante / contrato
    if v_emp is null and cardinality(v_codes) > 0 then
      select a.id, a.empresa_id into v_ap, v_emp from apolices a
       where a.corretora_id = p_corretora and a.seguradora_id = v_seg
         and (a.apolice = any(v_codes) or a.codigo_estipulante = any(v_codes) or a.contrato = any(v_codes))
       order by a.ativa desc limit 1;
    end if;
    -- 3) CNPJ da empresa
    if v_emp is null and v_cnpj is not null then
      select e.id into v_emp from empresas e
       where e.corretora_id = p_corretora and regexp_replace(coalesce(e.cnpj, ''), '\D', '', 'g') = v_cnpj limit 1;
      if v_emp is not null then
        select a.id into v_ap from apolices a where a.empresa_id = v_emp and a.seguradora_id = v_seg order by a.ativa desc limit 1;
      end if;
    end if;
    if v_emp is null then
      pend := pend || jsonb_build_object('numero', f->>'numero', 'competencia', f->>'competencia',
                                         'motivo', 'sem cadastro no banco', 'cadastro', c);
      continue;
    end if;

    select id, excluido_em into v_id, v_exc from faturas
     where corretora_id = p_corretora and seguradora_id = v_seg and competencia = f->>'competencia' and numero = f->>'numero';
    if v_id is not null and v_exc is not null then
      n_exc := n_exc + 1; continue;  -- excluída no master: o agente não grava de novo
    end if;
    if v_id is null then
      insert into faturas (id, corretora_id, empresa_id, apolice_id, subestipulante_id, seguradora_id, competencia, numero,
                           emissao, vencimento, cobertura_inicio, cobertura_fim, valor_total, valor_boleto, vidas_informadas,
                           nosso_numero, linha_digitavel, data_pagamento, conferencia_valor, conferencia_vidas, observacoes,
                           processado_em, origem)
      values (gen_random_uuid(), p_corretora, v_emp, v_ap, v_sub, v_seg, f->>'competencia', f->>'numero',
              (f->>'emissao')::date, (f->>'vencimento')::date, (f->>'cobertura_inicio')::date, (f->>'cobertura_fim')::date,
              (f->>'valor_total')::numeric, (f->>'valor_boleto')::numeric, (f->>'vidas_informadas')::int,
              f->>'nosso_numero', f->>'linha_digitavel', (f->>'data_pagamento')::date,
              f->>'conferencia_valor', f->>'conferencia_vidas', f->>'observacoes', now(), 'agente')
      returning id into v_id;
      n_ins := n_ins + 1;
    else
      update faturas set
        empresa_id = v_emp, apolice_id = coalesce(v_ap, apolice_id), subestipulante_id = coalesce(v_sub, subestipulante_id),
        emissao = coalesce((f->>'emissao')::date, emissao), vencimento = coalesce((f->>'vencimento')::date, vencimento),
        cobertura_inicio = coalesce((f->>'cobertura_inicio')::date, cobertura_inicio),
        cobertura_fim = coalesce((f->>'cobertura_fim')::date, cobertura_fim),
        valor_total = coalesce((f->>'valor_total')::numeric, valor_total), valor_boleto = coalesce((f->>'valor_boleto')::numeric, valor_boleto),
        vidas_informadas = coalesce((f->>'vidas_informadas')::int, vidas_informadas),
        nosso_numero = coalesce(f->>'nosso_numero', nosso_numero), linha_digitavel = coalesce(f->>'linha_digitavel', linha_digitavel),
        data_pagamento = coalesce((f->>'data_pagamento')::date, data_pagamento),
        conferencia_valor = coalesce(f->>'conferencia_valor', conferencia_valor), conferencia_vidas = coalesce(f->>'conferencia_vidas', conferencia_vidas),
        observacoes = coalesce(f->>'observacoes', observacoes), processado_em = now(), origem = 'agente'
       where id = v_id;
      n_upd := n_upd + 1;
    end if;
    if jsonb_typeof(f->'vidas') = 'array' then
      delete from vidas where fatura_id = v_id;
      insert into vidas (id, corretora_id, empresa_id, fatura_id, seguradora_id, competencia, familia, dependente_num, nome, cpf,
                         nascimento, sexo, parentesco, titular, plano_codigo, plano, matricula, situacao, adesao, exclusao,
                         premio_base, pro_rata, copart_total, valor_total, movimento, subestipulante, observacoes, idade, origem)
      select gen_random_uuid(), p_corretora, v_emp, v_id, v_seg, f->>'competencia', r.familia, r.dependente_num, r.nome, r.cpf,
             r.nascimento, r.sexo, r.parentesco, r.titular, r.plano_codigo, r.plano, r.matricula, r.situacao, r.adesao, r.exclusao,
             r.premio_base, r.pro_rata, r.copart_total, r.valor_total, r.movimento, r.subestipulante, r.observacoes, r.idade, 'agente'
        from jsonb_populate_recordset(null::vidas, f->'vidas') r;
      get diagnostics k = row_count;
      n_vid := n_vid + k;
    end if;
  end loop;
  return jsonb_build_object('gravadas', n_ins, 'atualizadas', n_upd, 'vidas', n_vid, 'excluidas', n_exc, 'pendencias', pend);
end $$;
revoke all on function public.agente_gravar_faturas(text, uuid, text, jsonb) from public;
grant execute on function public.agente_gravar_faturas(text, uuid, text, jsonb) to anon, authenticated;

-- ---------------------------------------------------------------- gravação direta da comissão (agentes)
-- p_ordens: [{ordem, competencia, data_pagamento, bruta, inss, irrf, iss, liquido, debito_credito, a_pagar,
--             descricao_debitos, observacoes,
--             lancamentos: [{segurado, codigo_estipulante, apolice, sub, numero_fatura, parcela, data_lancamento,
--                            premio_liquido, taxa, comissao, tipo_original, classe, observacoes}]}]
create or replace function public.agente_gravar_comissao(p_token text, p_corretora uuid, p_seguradora text, p_ordens jsonb)
returns jsonb language plpgsql security definer set search_path to 'public', 'privado' as $$
declare o jsonb; v_id uuid; k int; n_ord int := 0; n_lan int := 0; n_sem int := 0;
begin
  if not privado.token_agente_ok(p_token) then raise exception 'token inválido'; end if;
  for o in select * from jsonb_array_elements(coalesce(p_ordens, '[]'::jsonb)) loop
    insert into comissao_pagamentos (id, corretora_id, seguradora_id, ordem, competencia, data_pagamento, bruta, inss, irrf, iss,
                                     liquido, debito_credito, a_pagar, descricao_debitos, observacoes, processado_em, origem)
    values (gen_random_uuid(), p_corretora, p_seguradora, o->>'ordem', o->>'competencia', (o->>'data_pagamento')::date,
            (o->>'bruta')::numeric, (o->>'inss')::numeric, (o->>'irrf')::numeric, (o->>'iss')::numeric, (o->>'liquido')::numeric,
            (o->>'debito_credito')::numeric, (o->>'a_pagar')::numeric, o->>'descricao_debitos', o->>'observacoes', now(), 'agente')
    on conflict (corretora_id, seguradora_id, ordem) do update set
      competencia = excluded.competencia, data_pagamento = excluded.data_pagamento, bruta = excluded.bruta, inss = excluded.inss,
      irrf = excluded.irrf, iss = excluded.iss, liquido = excluded.liquido, debito_credito = excluded.debito_credito,
      a_pagar = excluded.a_pagar, descricao_debitos = excluded.descricao_debitos,
      observacoes = coalesce(excluded.observacoes, comissao_pagamentos.observacoes), processado_em = now(), origem = 'agente'
    returning id into v_id;
    n_ord := n_ord + 1;
    -- os lançamentos da ordem são trocados; o que foi excluído no master fica excluído (e não volta)
    delete from comissao_lancamentos where pagamento_id = v_id and excluido_em is null;
    insert into comissao_lancamentos (id, corretora_id, pagamento_id, empresa_id, apolice_id, fatura_id, segurado, codigo_estipulante,
                                      numero_fatura, parcela, data_lancamento, premio_liquido, taxa, comissao, tipo_original, classe,
                                      observacoes)
    select gen_random_uuid(), p_corretora, v_id, coalesce(fa.empresa_id, ap.empresa_id), coalesce(fa.apolice_id, ap.id), fa.id,
           l->>'segurado', nullif(l->>'codigo_estipulante', ''), nullif(l->>'numero_fatura', ''),
           (l->>'parcela')::int, (l->>'data_lancamento')::date, (l->>'premio_liquido')::numeric, (l->>'taxa')::numeric,
           (l->>'comissao')::numeric, l->>'tipo_original', coalesce(nullif(l->>'classe', ''), 'outros')::classe_comissao, l->>'observacoes'
      from jsonb_array_elements(coalesce(o->'lancamentos', '[]'::jsonb)) l
      left join lateral (select f.id, f.empresa_id, f.apolice_id from faturas f
                          where f.corretora_id = p_corretora and f.numero = l->>'numero_fatura' and f.excluido_em is null
                            and split_part(f.seguradora_id, '_', 1) = split_part(p_seguradora, '_', 1)
                          order by f.competencia desc limit 1) fa on nullif(l->>'numero_fatura', '') is not null
      left join lateral (select a.id, a.empresa_id from apolices a
                          where a.corretora_id = p_corretora and split_part(a.seguradora_id, '_', 1) = split_part(p_seguradora, '_', 1)
                            and (a.codigo_estipulante in (l->>'codigo_estipulante', l->>'apolice') or a.apolice in (l->>'codigo_estipulante', l->>'apolice')
                                 or a.contrato = l->>'codigo_estipulante')
                          order by a.ativa desc limit 1) ap on true
     where not exists (select 1 from comissao_lancamentos x where x.pagamento_id = v_id and x.excluido_em is not null
                         and x.numero_fatura is not distinct from nullif(l->>'numero_fatura', '')
                         and x.comissao = (l->>'comissao')::numeric);
    get diagnostics k = row_count;
    n_lan := n_lan + k;
  end loop;
  select count(*) into n_sem from comissao_lancamentos l join comissao_pagamentos p on p.id = l.pagamento_id
   where p.corretora_id = p_corretora and p.seguradora_id = p_seguradora and p.origem = 'agente' and l.empresa_id is null
     and p.ordem in (select x->>'ordem' from jsonb_array_elements(coalesce(p_ordens, '[]'::jsonb)) x);
  return jsonb_build_object('ordens', n_ord, 'lancamentos', n_lan, 'sem_empresa', n_sem);
end $$;
revoke all on function public.agente_gravar_comissao(text, uuid, text, jsonb) from public;
grant execute on function public.agente_gravar_comissao(text, uuid, text, jsonb) to anon, authenticated;

-- ---------------------------------------------------------------- sincronização da planilha: só cópia
create or replace function public.sincronizar_lote(p_token text, p_tabela text, p_linhas jsonb)
returns integer language plpgsql security definer set search_path to 'public', 'privado' as $$
declare cols text; upd text; n integer; v jsonb := coalesce(p_linhas, '[]'::jsonb);
begin
  if not privado.token_agente_ok(p_token) then raise exception 'token inválido'; end if;
  if p_tabela not in ('empresas', 'apolices', 'subestipulantes',
                      'faturas', 'vidas', 'comissao_pagamentos', 'comissao_lancamentos') then
    raise exception 'tabela não permitida: %', p_tabela;
  end if;
  if jsonb_array_length(v) = 0 then return 0; end if;
  -- o banco é a base principal: a cópia da planilha não passa por cima do que o agente gravou direto,
  -- do que foi excluído no master, nem de linha com o mesmo número e outro id
  if p_tabela = 'faturas' then
    select coalesce(jsonb_agg(x), '[]'::jsonb) into v from jsonb_array_elements(v) x
     where not exists (select 1 from faturas f
                        where f.corretora_id = (x->>'corretora_id')::uuid and f.seguradora_id = x->>'seguradora_id'
                          and f.competencia = x->>'competencia' and f.numero = x->>'numero'
                          and (f.id <> (x->>'id')::uuid or f.origem = 'agente' or f.excluido_em is not null));
  elsif p_tabela = 'vidas' then
    select coalesce(jsonb_agg(x), '[]'::jsonb) into v from jsonb_array_elements(v) x
     where (x->>'fatura_id' is null or exists (select 1 from faturas f where f.id = (x->>'fatura_id')::uuid and f.origem <> 'agente'))
       and not exists (select 1 from vidas w
                        where w.corretora_id = (x->>'corretora_id')::uuid and w.empresa_id = (x->>'empresa_id')::uuid
                          and w.seguradora_id = x->>'seguradora_id' and w.competencia = x->>'competencia' and w.origem = 'agente');
  elsif p_tabela = 'comissao_pagamentos' then
    select coalesce(jsonb_agg(x), '[]'::jsonb) into v from jsonb_array_elements(v) x
     where not exists (select 1 from comissao_pagamentos p
                        where p.corretora_id = (x->>'corretora_id')::uuid and p.seguradora_id = x->>'seguradora_id'
                          and p.ordem = x->>'ordem' and (p.id <> (x->>'id')::uuid or p.origem = 'agente'));
  elsif p_tabela = 'comissao_lancamentos' then
    select coalesce(jsonb_agg(case when x->>'fatura_id' is not null
                                    and not exists (select 1 from faturas f where f.id = (x->>'fatura_id')::uuid)
                                   then x || '{"fatura_id": null}'::jsonb else x end), '[]'::jsonb) into v
      from jsonb_array_elements(v) x
     where exists (select 1 from comissao_pagamentos p where p.id = (x->>'pagamento_id')::uuid and p.origem <> 'agente');
  end if;
  if jsonb_array_length(v) = 0 then return 0; end if;
  select string_agg(quote_ident(k), ','), string_agg(format('%1$I = excluded.%1$I', k), ',') filter (where k <> 'id')
    into cols, upd from jsonb_object_keys(v->0) k;
  if p_tabela = 'vidas' then
    delete from vidas w using (select distinct corretora_id, empresa_id, seguradora_id, competencia
                               from jsonb_populate_recordset(null::vidas, v)) g
     where w.corretora_id = g.corretora_id and w.empresa_id = g.empresa_id and w.seguradora_id = g.seguradora_id
       and w.competencia = g.competencia and w.origem <> 'agente';
  elsif p_tabela = 'comissao_lancamentos' then
    delete from comissao_lancamentos l using (select distinct corretora_id, pagamento_id
                                              from jsonb_populate_recordset(null::comissao_lancamentos, v)) g
     where l.corretora_id = g.corretora_id and l.pagamento_id = g.pagamento_id and l.excluido_em is null;
  end if;
  execute format('insert into public.%I (%s) select %s from jsonb_populate_recordset(null::public.%I, $1) on conflict (id) do update set %s',
                 p_tabela, cols, cols, p_tabela, upd) using v;
  get diagnostics n = row_count;
  return n;
end $$;
