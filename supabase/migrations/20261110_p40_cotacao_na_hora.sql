-- p40 — Cotação calculada na hora e de>para pela categoria do plano
--  * cot_categorias: categoria de mercado de cada plano (1 mínimo, 2 básico, 3 mediano, 4 muito bom, 5 executivo, 6 ultra premium),
--    pela tabela de equivalência de categorias usada no mercado (Bradesco Nacional Plus = SulAmérica Executivo = Amil One = Porto Diamante...)
--  * de>para: mesma operadora → o próprio plano; outra operadora → mesma categoria (ou a mais próxima), depois mais hospitais em comum, depois preço
--  * rede válida: pelo menos 70% dos hospitais do plano atual que a outra operadora atende e 40% dos hospitais do plano atual
--  * cot_cotacao(empresa, operadoras, trocas, fora): calcula na hora; dá para escolher operadoras, trocar o plano de cada grupo e tirar grupos
--  * cot_empresas: lista das empresas com vidas para a aba Cotação (nada pré-calculado)

create table if not exists public.cot_categorias (
  operadora text not null, plano text not null, categoria integer not null, fonte text,
  primary key (operadora, plano)
);
alter table public.cot_categorias enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'cot_categorias' and policyname = 'ler') then
    create policy ler on cot_categorias for select to authenticated using (true);
    create policy gravar on cot_categorias for insert to authenticated with check (eh_master());
    create policy mudar on cot_categorias for update to authenticated using (eh_master()) with check (eh_master());
  end if;
end $$;
grant select, insert, update on cot_categorias to authenticated;
insert into cot_categorias (operadora, plano, categoria, fonte) values
('amil','Bronze SP',1,'estimado (rede, reembolso e preço)'),
('amil','Bronze SP Mais',1,'estimado (rede, reembolso e preço)'),
('amil','S380',2,'tabela de equivalência de categorias (mercado)'),
('amil','Prata',2,'estimado (rede, reembolso e preço)'),
('amil','Prata II',2,'estimado (rede, reembolso e preço)'),
('amil','S450',3,'tabela de equivalência de categorias (mercado)'),
('amil','Ouro',3,'estimado (rede, reembolso e preço)'),
('amil','Ouro II',3,'estimado (rede, reembolso e preço)'),
('amil','S750 R1',4,'tabela de equivalência de categorias (mercado)'),
('amil','S750 R2',4,'tabela de equivalência de categorias (mercado)'),
('amil','S750 R3',4,'tabela de equivalência de categorias (mercado)'),
('amil','Platinum R1',4,'tabela de equivalência de categorias (mercado)'),
('amil','Platinum R2',4,'tabela de equivalência de categorias (mercado)'),
('amil','S2500 R1',5,'tabela de equivalência de categorias (mercado)'),
('amil','S2500 R2',5,'tabela de equivalência de categorias (mercado)'),
('amil','Black I R1',5,'tabela de equivalência de categorias (mercado)'),
('amil','Black I R2',5,'tabela de equivalência de categorias (mercado)'),
('amil','Black I R3',5,'tabela de equivalência de categorias (mercado)'),
('amil','Black II R1',5,'tabela de equivalência de categorias (mercado)'),
('amil','Black II R2',5,'tabela de equivalência de categorias (mercado)'),
('amil','Black II R3',5,'tabela de equivalência de categorias (mercado)'),
('amil','S6500 Black R1',6,'tabela de equivalência de categorias (mercado)'),
('amil','S6500 Black R2',6,'tabela de equivalência de categorias (mercado)'),
('amil','S6500 Black R3',6,'tabela de equivalência de categorias (mercado)'),
('bradesco','Saúde +',1,'tabela de equivalência de categorias (mercado)'),
('bradesco','Efetivo',1,'tabela de equivalência de categorias (mercado)'),
('bradesco','Efetivo Plus',2,'estimado (rede, reembolso e preço)'),
('bradesco','Nacional II',4,'tabela de equivalência de categorias (mercado)'),
('bradesco','Nacional III',4,'tabela de equivalência de categorias (mercado)'),
('bradesco','Nacional III 2',4,'tabela de equivalência de categorias (mercado)'),
('bradesco','Nacional III 3',4,'tabela de equivalência de categorias (mercado)'),
('bradesco','Nacional Plus 4',5,'tabela de equivalência de categorias (mercado)'),
('bradesco','Nacional Plus 6',5,'tabela de equivalência de categorias (mercado)'),
('bradesco','Nacional Plus 8',5,'tabela de equivalência de categorias (mercado)'),
('bradesco','Premium 6',6,'tabela de equivalência de categorias (mercado)'),
('bradesco','Premium 8',6,'tabela de equivalência de categorias (mercado)'),
('bradesco','Premium 10',6,'tabela de equivalência de categorias (mercado)'),
('hapvida','Nosso Médico RMSP',1,'estimado (rede, reembolso e preço)'),
('hapvida','Smart UP',1,'estimado (rede, reembolso e preço)'),
('hapvida','Smart Flex',2,'estimado (rede, reembolso e preço)'),
('hapvida','Smart Prime',2,'estimado (rede, reembolso e preço)'),
('notredame','600',2,'tabela de equivalência de categorias (mercado)'),
('notredame','700',3,'tabela de equivalência de categorias (mercado)'),
('notredame','900',3,'tabela de equivalência de categorias (mercado)'),
('notredame','900 Care',4,'tabela de equivalência de categorias (mercado)'),
('notredame','Infinity',5,'tabela de equivalência de categorias (mercado)'),
('notredame','Prata',3,'estimado (rede, reembolso e preço)'),
('notredame','Prata Max',3,'estimado (rede, reembolso e preço)'),
('notredame','Ouro',4,'estimado (rede, reembolso e preço)'),
('notredame','Ouro Max',4,'estimado (rede, reembolso e preço)'),
('notredame','Diamante',5,'estimado (rede, reembolso e preço)'),
('notredame','Diamante Max',5,'estimado (rede, reembolso e preço)'),
('new_leader','Essencial',1,'estimado (rede, reembolso e preço)'),
('new_leader','Controle',1,'estimado (rede, reembolso e preço)'),
('new_leader','Confort',2,'estimado (rede, reembolso e preço)'),
('new_leader','Class Control',2,'estimado (rede, reembolso e preço)'),
('new_leader','Class',2,'estimado (rede, reembolso e preço)'),
('new_leader','Black',3,'estimado (rede, reembolso e preço)'),
('porto','Bronze Brasil I',2,'tabela de equivalência de categorias (mercado)'),
('porto','Prata Mais I',3,'tabela de equivalência de categorias (mercado)'),
('porto','Prata Pró E',3,'tabela de equivalência de categorias (mercado)'),
('porto','Prata Pró Q',3,'tabela de equivalência de categorias (mercado)'),
('porto','Ouro Mais I',4,'tabela de equivalência de categorias (mercado)'),
('porto','Ouro Max I',4,'tabela de equivalência de categorias (mercado)'),
('porto','Ouro Pró Q',4,'tabela de equivalência de categorias (mercado)'),
('porto','Diamante Mais I',5,'tabela de equivalência de categorias (mercado)'),
('porto','Diamante Pró Q',5,'tabela de equivalência de categorias (mercado)'),
('porto','P220',2,'estimado (rede, reembolso e preço)'),
('porto','P320',3,'estimado (rede, reembolso e preço)'),
('porto','P420',4,'estimado (rede, reembolso e preço)'),
('porto','P470',4,'estimado (rede, reembolso e preço)'),
('porto','P520',5,'estimado (rede, reembolso e preço)'),
('sagrada','SFS PME',1,'estimado (rede, reembolso e preço)'),
('santa','Santa Helena Plus',1,'estimado (rede, reembolso e preço)'),
('sul_america','Direto Nacional',1,'tabela de equivalência de categorias (mercado)'),
('sul_america','Clássico 100',3,'tabela de equivalência de categorias (mercado)'),
('sul_america','Clássico Vital',3,'tabela de equivalência de categorias (mercado)'),
('sul_america','Especial RC',4,'tabela de equivalência de categorias (mercado)'),
('sul_america','Especial 100 RC',4,'tabela de equivalência de categorias (mercado)'),
('sul_america','Especial 100 R1',4,'tabela de equivalência de categorias (mercado)'),
('sul_america','Especial Mais',4,'tabela de equivalência de categorias (mercado)'),
('sul_america','Especial Vital',4,'tabela de equivalência de categorias (mercado)'),
('sul_america','Especial Vital R1',4,'tabela de equivalência de categorias (mercado)'),
('sul_america','Especial Mais Vital',4,'tabela de equivalência de categorias (mercado)'),
('sul_america','Executivo R1',5,'tabela de equivalência de categorias (mercado)'),
('sul_america','Executivo R2',5,'tabela de equivalência de categorias (mercado)'),
('sul_america','Executivo R3',5,'tabela de equivalência de categorias (mercado)'),
('sul_america','Prestige',6,'tabela de equivalência de categorias (mercado)'),
('porto_bairro','Portomed Alphaville',1,'estimado (rede regional)'),
('porto_bairro','Portomed Centro',1,'estimado (rede regional)'),
('porto_bairro','Portomed Centro Osasco',1,'estimado (rede regional)'),
('porto_bairro','Portomed Centro Santo André',1,'estimado (rede regional)'),
('porto_bairro','Portomed Ipiranga',1,'estimado (rede regional)'),
('porto_bairro','Portomed Itaquera',1,'estimado (rede regional)'),
('porto_bairro','Portomed Lapa',1,'estimado (rede regional)'),
('porto_bairro','Portomed Moema',1,'estimado (rede regional)'),
('porto_bairro','Portomed Morumbi',1,'estimado (rede regional)'),
('porto_bairro','Portomed Paulista',1,'estimado (rede regional)'),
('porto_bairro','Portomed Pirituba',1,'estimado (rede regional)'),
('porto_bairro','Portomed Pompéia',1,'estimado (rede regional)'),
('porto_bairro','Portomed Santana',1,'estimado (rede regional)'),
('porto_bairro','Portomed São Caetano',1,'estimado (rede regional)'),
('porto_bairro','Portomed Tatuapé',1,'estimado (rede regional)'),
('porto_bairro','Portomed Vila Maria',1,'estimado (rede regional)')
on conflict (operadora, plano) do update set categoria = excluded.categoria, fonte = excluded.fonte;

alter table public.cot_equivalencias add column if not exists categoria_o integer;
alter table public.cot_equivalencias add column if not exists categoria_d integer;
alter table public.cot_equivalencias add column if not exists valida boolean not null default false;

create or replace function public.cot_recalcular_equivalencias() returns integer
language plpgsql as $$
declare n integer;
begin
  if auth.uid() is not null and not eh_master() then raise exception 'só o master recalcula o de>para'; end if;
  with hosp as (select distinct operadora, plano, prestador_id from cot_rede where atendimento ~ '(^|,)H'),
  univ as (select distinct operadora, prestador_id from hosp),
  pl as (select p.operadora, p.plano, p.acomodacao, p.preco_ref, c.categoria from cot_planos p left join cot_categorias c on c.operadora = p.operadora and c.plano = p.plano),
  na as (select operadora, plano, count(*) na from hosp group by 1, 2),
  nab as (select a.operadora op_o, a.plano plano_o, b.operadora op_d, b.plano plano_d, count(*) nab
          from hosp a join hosp b on b.prestador_id = a.prestador_id group by 1, 2, 3, 4),
  nau as (select a.operadora op_o, a.plano plano_o, u.operadora op_d, count(*) nau
          from hosp a join univ u on u.prestador_id = a.prestador_id group by 1, 2, 3),
  par as (
    select s.operadora op_o, s.plano plano_o, s.acomodacao acom_o, d.operadora op_d, d.plano plano_d, d.acomodacao acom_d,
           s.categoria cat_o, d.categoria cat_d,
           coalesce(x.nab, 0)::numeric / na.na cobertura,
           case when coalesce(u.nau, 0) = 0 then 0 else coalesce(x.nab, 0)::numeric / u.nau end cobertura_rel,
           d.preco_ref
    from pl s join na on na.operadora = s.operadora and na.plano = s.plano
    join pl d on (s.acomodacao = '' or d.acomodacao = '' or s.acomodacao = d.acomodacao)
    join na nd on nd.operadora = d.operadora and nd.plano = d.plano
    left join nab x on x.op_o = s.operadora and x.plano_o = s.plano and x.op_d = d.operadora and x.plano_d = d.plano
    left join nau u on u.op_o = s.operadora and u.plano_o = s.plano and u.op_d = d.operadora
  )
  insert into cot_equivalencias (op_o, plano_o, acom_o, op_d, plano_d, acom_d, cobertura, cobertura_rel, preco_ref, categoria_o, categoria_d, valida, ordem)
  select op_o, plano_o, acom_o, op_d, plano_d, acom_d, round(cobertura, 4), round(cobertura_rel, 4), preco_ref, cat_o, cat_d,
         case when op_d = op_o then plano_d = plano_o
              else cobertura_rel >= 0.70 and cobertura >= 0.40 and abs(coalesce(cat_d, 0) - coalesce(cat_o, 0)) <= 1 end,
         row_number() over (partition by op_o, plano_o, acom_o, op_d
           order by (op_d = op_o and plano_d = plano_o) desc,
                    abs(coalesce(cat_d, 9) - coalesce(cat_o, 0)) asc,
                    coalesce(cat_d, 0) desc,
                    (cobertura_rel >= 0.70 and cobertura >= 0.40) desc,
                    round(cobertura, 2) desc,
                    preco_ref asc nulls last)
  from par
  on conflict (op_o, plano_o, acom_o, op_d, plano_d, acom_d) do update set
    cobertura = excluded.cobertura, cobertura_rel = excluded.cobertura_rel, preco_ref = excluded.preco_ref,
    categoria_o = excluded.categoria_o, categoria_d = excluded.categoria_d, valida = excluded.valida, ordem = excluded.ordem, faltam = null;
  get diagnostics n = row_count;
  update cot_equivalencias e set faltam = (
    select array_agg(pr.nome order by pr.nome) from cot_rede a join cot_prestadores pr on pr.id = a.prestador_id
    where a.operadora = e.op_o and a.plano = e.plano_o and a.atendimento ~ '(^|,)H'
      and exists (select 1 from cot_rede u where u.operadora = e.op_d and u.prestador_id = a.prestador_id and u.atendimento ~ '(^|,)H')
      and not exists (select 1 from cot_rede b where b.operadora = e.op_d and b.plano = e.plano_d and b.prestador_id = a.prestador_id and b.atendimento ~ '(^|,)H'))
  where e.ordem <= 8;
  return n;
end $$;

-- empresas para a aba Cotação: vidas de saúde da última fatura de cada seguradora
create or replace view public.cot_empresas with (security_invoker = true) as
with ult as (select empresa_id, seguradora_id, max(competencia) c from vidas group by 1, 2)
select e.id empresa_id, e.corretora_id, e.razao_social, e.nome_curto, e.codigo_interno, e.cnpj,
       count(*) vidas, max(u.c) competencia, string_agg(distinct s.nome, ', ') seguradoras
from empresas e
join ult u on u.empresa_id = e.id
join vidas v on v.empresa_id = u.empresa_id and v.seguradora_id = u.seguradora_id and v.competencia = u.c
join seguradoras s on s.id = u.seguradora_id and s.nome not ilike '%dental%'
where e.ativa
group by e.id;
grant select on cot_empresas to authenticated;

-- cotação de uma empresa, calculada na hora
--   ops    operadoras a cotar; null = automático (as até 3 mais baratas que hoje, com rede e categoria equivalentes)
--   trocas {"porto": {"0": "Ouro Mais I|Quarto"}} — plano escolhido à mão para o grupo 0 na Porto
--   fora   grupos que saem da cotação
create or replace function public.cot_cotacao(e uuid, ops text[] default null, trocas jsonb default '{}', fora int[] default '{}')
returns jsonb
language plpgsql stable as $$
declare
  emp record; info record; g record; eq record; tb record; v_op text; achou boolean; manual boolean := ops is not null;
  grupos jsonb := '[]'; gs jsonb; opcoes jsonb := '[]'; linhas jsonb; faltando jsonb; t text; v_plano text; v_acom text; v_escolha text; v_fora boolean;
  n_vidas int := 0; n_tit int := 0; custo numeric := 0; tem_copart boolean := false; comp text;
  v_mei boolean; v_simples boolean; tot numeric; cob_soma numeric; status text := null; v_cob numeric; v_faltam text[];
  iof constant numeric := 0.0238;
begin
  select * into emp from empresas where id = e;
  if emp is null then return null; end if;
  trocas := coalesce(trocas, '{}'); fora := coalesce(fora, '{}');
  select mei, simples, municipio, situacao into info from empresas_cnpj where cnpj = regexp_replace(coalesce(emp.cnpj, ''), '\D', '', 'g');
  v_mei := coalesce(info.mei, false); v_simples := coalesce(info.simples, false);

  with ult as (select seguradora_id, max(competencia) c from vidas where empresa_id = e group by 1),
  v as (select v.*, s.nome seg,
          coalesce(v.idade, extract(year from age((v.competencia || '-01')::date, v.nascimento))::int) id2
        from vidas v join ult u on u.seguradora_id = v.seguradora_id and u.c = v.competencia
        join seguradoras s on s.id = v.seguradora_id
        where v.empresa_id = e and s.nome not ilike '%dental%'),
  r as (select v.*, ref.operadora_ref, ref.plano_ref, coalesce(ref.nome_plano, v.plano) nome_atual,
          coalesce(nullif(ref.acomodacao, ''), (select pl.acomodacao from cot_planos pl where pl.operadora = ref.operadora_ref and pl.plano = ref.plano_ref order by pl.preco_ref limit 1), '') acom,
          coalesce(ref.copart, false) cp,
          least(9, greatest(0, case when id2 <= 18 then 0 else (id2 - 19) / 5 + 1 end)) fx
        from v left join cotacao_plano_atual_ref ref on ref.seguradora = v.seg and ref.plano_original = v.plano
        where coalesce(ref.confianca, '') <> 'odonto'),
  custo_seg as (select r.seg, r.seguradora_id, sum(coalesce(r.valor_total, 0)) soma, count(*) nv from r group by 1, 2),
  cs as (select c.seg, c.nv, case when c.soma > 0 then null else (select f.valor from faturas_ultimas f where f.empresa_id = e and f.seguradora_id = c.seguradora_id) end fat from custo_seg c),
  gr as (
    select r.operadora_ref op, r.plano_ref plano, r.acom,
           array[count(*) filter (where fx = 0), count(*) filter (where fx = 1), count(*) filter (where fx = 2), count(*) filter (where fx = 3), count(*) filter (where fx = 4),
                 count(*) filter (where fx = 5), count(*) filter (where fx = 6), count(*) filter (where fx = 7), count(*) filter (where fx = 8), count(*) filter (where fx = 9)]::int[] fx,
           case when max(cs.fat) is null then sum(coalesce(r.valor_total, 0)) else max(cs.fat) * count(*) / max(cs.nv) end valor,
           count(*) filter (where r.titular or r.parentesco ilike 'titular%') tit,
           r.seg, string_agg(distinct r.nome_atual, ', ') plano_atual, bool_or(r.plano_ref is null) sem_ref, bool_or(r.cp) copart
    from r join cs on cs.seg = r.seg
    group by r.operadora_ref, r.plano_ref, r.acom, r.seg)
  select coalesce(jsonb_agg(to_jsonb(z) order by z.i), '[]') into gs from (
    select (row_number() over (order by seg, op nulls last, plano nulls last, acom) - 1)::int i, op, plano, acom, fx, valor, tit, seg, plano_atual, sem_ref, copart
    from gr) z;
  select coalesce(jsonb_agg(x || jsonb_build_object('excluido', (x->>'i')::int = any(fora))), '[]') into gs from jsonb_array_elements(gs) x;

  select coalesce(sum((select sum(x) from unnest(fx) x)), 0), coalesce(sum(tit), 0), coalesce(sum(valor), 0), coalesce(bool_or(copart), false)
    into n_vidas, n_tit, custo, tem_copart from jsonb_to_recordset(gs) as _cot_h(i int, op text, plano text, acom text, fx int[], valor numeric, tit int, seg text, plano_atual text, sem_ref boolean, copart boolean, excluido boolean) where not _cot_h.excluido;
  select max(v.competencia) into comp from vidas v where v.empresa_id = e;
  select coalesce(jsonb_agg(jsonb_build_object('i', i, 'seguradora', seg, 'plano_atual', plano_atual, 'operadora', op, 'plano', plano, 'acomodacao', acom,
           'faixas', fx, 'vidas', (select sum(x) from unnest(fx) x), 'valor', round(valor, 2), 'sem_equivalente', sem_ref, 'copart', copart, 'fora', _cot_h.excluido) order by i), '[]')
    into grupos from jsonb_to_recordset(gs) as _cot_h(i int, op text, plano text, acom text, fx int[], valor numeric, tit int, seg text, plano_atual text, sem_ref boolean, copart boolean, excluido boolean);

  if n_vidas = 0 then status := 'sem vidas de saúde';
  elsif n_vidas >= 100 then status := '100 vidas ou mais';
  end if;

  if status is null then
    for v_op in select x from unnest(coalesce(ops, array(select distinct operadora from cot_tabelas where ativa and operadora <> 'porto_bairro' order by 1))) x loop
      linhas := '[]'; faltando := '[]'; tot := 0; cob_soma := 0;
      for g in select * from jsonb_to_recordset(gs) as _cot_h(i int, op text, plano text, acom text, fx int[], valor numeric, tit int, seg text, plano_atual text, sem_ref boolean, copart boolean, excluido boolean) where not _cot_h.excluido order by i loop
        achou := false; v_fora := false; v_cob := null; v_faltam := null;
        t := trocas -> v_op ->> g.i::text;
        if t is not null and t <> '' then
          v_plano := split_part(t, '|', 1); v_acom := split_part(t, '|', 2); v_escolha := 'manual';
          select q.cobertura, q.faltam into v_cob, v_faltam from cot_equivalencias q
            where q.op_o = g.op and q.plano_o = g.plano and q.acom_o = g.acom and q.op_d = v_op and q.plano_d = v_plano and q.acom_d = v_acom;
          select t2.id, t2.titulo, t2.condicoes, p.valores, (select sum(g.fx[k] * p.valores[k]) from generate_series(1, 10) k) total into tb
            from cot_precos p join cot_tabelas t2 on t2.id = p.tabela_id
            where t2.ativa and t2.operadora = v_op and p.plano = v_plano and p.acomodacao = v_acom
              and n_vidas between t2.vidas_min and t2.vidas_max and (t2.mei <> 'so' or v_mei) and (t2.mei <> 'nao' or not v_mei)
              and t2.copart = tem_copart and (t2.regime is distinct from 'simples' or v_simples) and (t2.regime is distinct from 'pme' or not v_simples)
              and (t2.regime is distinct from 'ei' or v_mei) and coalesce(t2.meses, 12) = 12 and t2.titulares_min <= greatest(n_tit, 1)
            order by 5 limit 1;
          achou := found;
        elsif not g.sem_ref then
          v_escolha := 'automatico';
          for eq in select * from cot_equivalencias q
                    where q.op_o = g.op and q.plano_o = g.plano and q.acom_o = g.acom and q.op_d = v_op and (q.valida or manual)
                    order by q.valida desc, q.ordem loop
            select t2.id, t2.titulo, t2.condicoes, p.valores, (select sum(g.fx[k] * p.valores[k]) from generate_series(1, 10) k) total into tb
              from cot_precos p join cot_tabelas t2 on t2.id = p.tabela_id
              where t2.ativa and t2.operadora = v_op and p.plano = eq.plano_d and p.acomodacao = eq.acom_d
                and n_vidas between t2.vidas_min and t2.vidas_max and (t2.mei <> 'so' or v_mei) and (t2.mei <> 'nao' or not v_mei)
                and t2.copart = tem_copart and (t2.regime is distinct from 'simples' or v_simples) and (t2.regime is distinct from 'pme' or not v_simples)
                and (t2.regime is distinct from 'ei' or v_mei) and coalesce(t2.meses, 12) = 12 and t2.titulares_min <= greatest(n_tit, 1)
              order by 5 limit 1;
            achou := found;
            if achou then
              v_plano := eq.plano_d; v_acom := eq.acom_d; v_cob := eq.cobertura; v_faltam := eq.faltam; v_fora := not eq.valida;
              exit;
            end if;
          end loop;
        end if;
        if not achou then
          faltando := faltando || to_jsonb(g.i);
          continue;
        end if;
        tot := tot + tb.total;
        cob_soma := cob_soma + coalesce(v_cob, 0) * (select sum(x) from unnest(g.fx) x);
        linhas := linhas || jsonb_build_object('grupo', g.i,
          'origem', jsonb_build_object('seguradora', g.seg, 'operadora', g.op, 'plano', g.plano, 'acomodacao', g.acom, 'plano_atual', g.plano_atual),
          'plano', v_plano, 'acomodacao', v_acom, 'cobertura', v_cob, 'faltam', to_jsonb(v_faltam), 'escolha', v_escolha, 'fora_criterio', v_fora,
          'tabela', jsonb_build_object('id', tb.id, 'titulo', tb.titulo, 'condicoes', tb.condicoes),
          'faixas', g.fx, 'valores', tb.valores, 'total', round(tb.total, 2));
      end loop;
      if jsonb_array_length(faltando) = 0 and tot > 0 then
        if manual or custo - tot * (1 + iof) > 0 then
          opcoes := opcoes || jsonb_build_object('operadora', v_op, 'completa', true, 'total', round(tot, 2), 'iof', round(tot * iof, 2),
            'total_iof', round(tot * (1 + iof), 2), 'economia', round(custo - tot * (1 + iof), 2),
            'cobertura', round(cob_soma / greatest(n_vidas, 1), 4), 'linhas', linhas, 'faltando', faltando);
        end if;
      elsif manual then
        opcoes := opcoes || jsonb_build_object('operadora', v_op, 'completa', false, 'total', round(tot, 2), 'linhas', linhas, 'faltando', faltando);
      end if;
    end loop;
    if not manual then
      select coalesce(jsonb_agg(o order by (o->>'economia')::numeric desc), '[]') into opcoes
        from (select o from jsonb_array_elements(opcoes) o order by (o->>'economia')::numeric desc limit 3) z;
    end if;
    status := case when exists (select 1 from jsonb_array_elements(opcoes) o where (o->>'completa')::boolean and (o->>'economia')::numeric > 0) then 'com opção mais barata'
                   when exists (select 1 from jsonb_to_recordset(gs) as _cot_h(i int, op text, plano text, acom text, fx int[], valor numeric, tit int, seg text, plano_atual text, sem_ref boolean, copart boolean, excluido boolean) where sem_ref and not _cot_h.excluido) then 'plano atual sem equivalente: escolha o plano'
                   when custo <= 0 then 'sem valor atual'
                   else 'sem opção mais barata com rede equivalente' end;
  end if;

  return jsonb_build_object('empresa_id', e, 'status', status, 'vidas', n_vidas, 'titulares', n_tit,
    'custo_atual', round(custo, 2), 'competencia', comp, 'mei', info.mei, 'simples', info.simples, 'municipio', info.municipio,
    'situacao_cnpj', info.situacao, 'copart', tem_copart, 'grupos', grupos, 'opcoes', opcoes, 'automatico', not manual,
    'operadoras', (select jsonb_agg(x order by x) from (select distinct operadora x from cot_tabelas where ativa) z),
    'calculado_em', now());
end $$;
revoke execute on function cot_cotacao(uuid, text[], jsonb, int[]) from public, anon;
grant execute on function cot_cotacao(uuid, text[], jsonb, int[]) to authenticated;

select cot_recalcular_equivalencias();
