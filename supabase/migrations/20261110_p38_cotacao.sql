-- p38 — Cotação automática
-- Tabelas de preço, rede credenciada e de>para ficam no banco; a cotação de cada empresa é calculada
-- aqui mesmo (função cot_cotar) a partir das vidas da última fatura. Nada roda no PC.
--
-- Já aplicadas antes, nesta mesma frente (nomes no banco: p35_cotacao_dados_cnpj e p36_cotacao_plano_atual_ref):
--   empresas_cnpj            dados públicos da Receita por CNPJ (MEI, Simples, cidade)
--   cotacao_plano_atual_ref  liga o plano da fatura (código/nome) ao plano da tabela de venda

create table if not exists public.empresas_cnpj (
  cnpj text primary key, porte text, mei boolean, simples boolean, natureza_juridica text, situacao text,
  municipio text, uf text, cep text, bairro text, inicio_atividade date, fonte text default 'brasilapi',
  consultado_em timestamptz default now()
);
create table if not exists public.cotacao_plano_atual_ref (
  seguradora text not null, plano_original text not null, nome_plano text, operadora_ref text, plano_ref text,
  acomodacao text, copart boolean, confianca text, observacao text, atualizado_em timestamptz default now(),
  primary key (seguradora, plano_original)
);

-- ---------- tabelas de preço ----------
create table if not exists public.cot_tabelas (
  id integer primary key,
  operadora text not null,          -- chave curta: amil, bradesco, hapvida, notredame, porto, porto_bairro, sul_america, new_leader, sagrada, santa
  titulo text not null,             -- linha/título como vem no PDF
  condicoes text not null,          -- etiqueta do PDF (ex.: "3 a 29 Compulsória Completa 30% Não MEI")
  vidas_min integer not null,
  vidas_max integer not null,
  compulsoria boolean not null default false,
  copart boolean not null default false,
  mei text not null default 'qq',   -- so | nao | qq
  regime text,                      -- simples | pme | ei | null
  titulares_min integer not null default 1,
  meses integer,                    -- 12 / 24 (SulAmérica)
  pagina integer,
  ativa boolean not null default true,
  carregado_em timestamptz not null default now()
);
create table if not exists public.cot_precos (
  tabela_id integer not null references public.cot_tabelas(id) on delete cascade,
  plano text not null,
  acomodacao text not null default '',
  valores numeric(12,2)[] not null, -- 10 faixas ANS: 0-18 … 59+
  primary key (tabela_id, plano, acomodacao)
);

-- ---------- rede credenciada ----------
create table if not exists public.cot_prestadores (
  id integer primary key,
  nome text not null unique,
  regiao text,
  bairro text
);
create table if not exists public.cot_rede (
  operadora text not null,
  plano text not null,
  prestador_id integer not null references public.cot_prestadores(id) on delete cascade,
  atendimento text not null,        -- H, PS, M, LAB… (legenda do PDF)
  primary key (operadora, plano, prestador_id)
);

-- ---------- de>para (recalculado por cot_recalcular_equivalencias) ----------
create table if not exists public.cot_equivalencias (
  op_o text not null, plano_o text not null, acom_o text not null,
  op_d text not null, plano_d text not null, acom_d text not null,
  cobertura numeric not null,       -- % dos hospitais do plano de origem que o destino tem
  cobertura_rel numeric not null,   -- idem, contando só hospitais que a operadora destino atende em algum plano
  preco_ref numeric,                -- média das 10 faixas na tabela mais barata sem copart
  ordem integer not null,           -- 1 = escolhido
  faltam text[],
  primary key (op_o, plano_o, acom_o, op_d, plano_d, acom_d)
);
create index if not exists cot_equivalencias_busca on public.cot_equivalencias (op_o, plano_o, acom_o, op_d, ordem);

-- ---------- resultado por empresa ----------
create table if not exists public.cot_resultados (
  empresa_id uuid primary key references public.empresas(id) on delete cascade,
  corretora_id uuid not null,
  calculado_em timestamptz not null default now(),
  status text not null,
  vidas integer,
  custo_atual numeric,
  melhor_economia numeric,
  resultado jsonb not null
);
create index if not exists cot_resultados_corretora on public.cot_resultados (corretora_id);

-- ---------- acesso ----------
alter table public.empresas_cnpj enable row level security;
alter table public.cotacao_plano_atual_ref enable row level security;
alter table public.cot_tabelas enable row level security;
alter table public.cot_precos enable row level security;
alter table public.cot_prestadores enable row level security;
alter table public.cot_rede enable row level security;
alter table public.cot_equivalencias enable row level security;
alter table public.cot_resultados enable row level security;

do $$
declare t text;
begin
  -- tabelas de mercado: quem está logado lê; só o master grava
  foreach t in array array['empresas_cnpj','cotacao_plano_atual_ref','cot_tabelas','cot_precos','cot_prestadores','cot_rede','cot_equivalencias'] loop
    if not exists (select 1 from pg_policies where tablename = t and policyname = 'ler') then
      execute format('create policy ler on %I for select to authenticated using (true)', t);
      execute format('create policy gravar on %I for insert to authenticated with check (eh_master())', t);
      execute format('create policy mudar on %I for update to authenticated using (eh_master()) with check (eh_master())', t);
      execute format('create policy apagar on %I for delete to authenticated using (eh_master())', t);
    end if;
  end loop;
  if not exists (select 1 from pg_policies where tablename = 'cot_resultados' and policyname = 'ler') then
    create policy ler on cot_resultados for select using (eh_master() or eh_da_corretora(corretora_id, false));
    create policy gravar on cot_resultados for insert with check (eh_master() or eh_da_corretora(corretora_id, false));
    create policy mudar on cot_resultados for update using (eh_master() or eh_da_corretora(corretora_id, false)) with check (eh_master() or eh_da_corretora(corretora_id, false));
  end if;
end $$;
grant select on empresas_cnpj, cotacao_plano_atual_ref, cot_tabelas, cot_precos, cot_prestadores, cot_rede, cot_equivalencias to authenticated;
grant insert, update, delete on empresas_cnpj, cotacao_plano_atual_ref, cot_tabelas, cot_precos, cot_prestadores, cot_rede, cot_equivalencias to authenticated;
grant select, insert, update on cot_resultados to authenticated;

-- ---------- preço de referência de cada plano ----------
create or replace view public.cot_planos with (security_invoker = true) as
select t.operadora, p.plano, p.acomodacao,
       coalesce(min((select avg(x) from unnest(p.valores) x)) filter (where not t.copart),
                min((select avg(x) from unnest(p.valores) x))) as preco_ref
from cot_precos p join cot_tabelas t on t.id = p.tabela_id
where t.ativa
group by 1, 2, 3;
grant select on cot_planos to authenticated;

-- ---------- de>para: para cada plano, os equivalentes em cada operadora ----------
-- Escolha: entre os planos que chegam até 3 pontos da maior sobreposição de hospitais, o mais barato;
-- depois os demais, do mais parecido para o menos parecido. Mesma acomodação.
create or replace function public.cot_recalcular_equivalencias() returns integer
language plpgsql as $$
declare n integer;
begin
  if not eh_master() then raise exception 'só o master recalcula o de>para'; end if;
  delete from cot_equivalencias where true;
  with hosp as (select distinct operadora, plano, prestador_id from cot_rede where atendimento ~ '(^|,)H'),
  univ as (select distinct operadora, prestador_id from hosp),
  pl as (select operadora, plano, acomodacao, preco_ref from cot_planos),
  na as (select operadora, plano, count(*) na from hosp group by 1, 2),
  nab as (select a.operadora op_o, a.plano plano_o, b.operadora op_d, b.plano plano_d, count(*) nab
          from hosp a join hosp b on b.prestador_id = a.prestador_id group by 1, 2, 3, 4),
  nau as (select a.operadora op_o, a.plano plano_o, u.operadora op_d, count(*) nau
          from hosp a join univ u on u.prestador_id = a.prestador_id group by 1, 2, 3),
  par as (
    select s.operadora op_o, s.plano plano_o, s.acomodacao acom_o, d.operadora op_d, d.plano plano_d, d.acomodacao acom_d,
           coalesce(x.nab, 0)::numeric / na.na cobertura,
           case when coalesce(u.nau, 0) = 0 then 0 else coalesce(x.nab, 0)::numeric / u.nau end cobertura_rel,
           d.preco_ref
    from pl s join na on na.operadora = s.operadora and na.plano = s.plano
    join pl d on not (d.operadora = s.operadora and d.plano = s.plano and d.acomodacao = s.acomodacao)
             and (s.acomodacao = '' or d.acomodacao = '' or s.acomodacao = d.acomodacao)
    join na nd on nd.operadora = d.operadora and nd.plano = d.plano
    left join nab x on x.op_o = s.operadora and x.plano_o = s.plano and x.op_d = d.operadora and x.plano_d = d.plano
    left join nau u on u.op_o = s.operadora and u.plano_o = s.plano and u.op_d = d.operadora
  ),
  mx as (select *, max(cobertura_rel) over (partition by op_o, plano_o, acom_o, op_d) m from par)
  insert into cot_equivalencias (op_o, plano_o, acom_o, op_d, plano_d, acom_d, cobertura, cobertura_rel, preco_ref, ordem)
  select op_o, plano_o, acom_o, op_d, plano_d, acom_d, round(cobertura, 4), round(cobertura_rel, 4), preco_ref,
         row_number() over (partition by op_o, plano_o, acom_o, op_d
           order by (cobertura_rel >= m - 0.03) desc,
                    case when cobertura_rel >= m - 0.03 then preco_ref end asc nulls last,
                    cobertura_rel desc)
  from mx;
  get diagnostics n = row_count;
  -- hospitais do plano de origem que ficam de fora (só nas 5 primeiras opções, para a tela)
  update cot_equivalencias e set faltam = (
    select array_agg(pr.nome order by pr.nome) from cot_rede a join cot_prestadores pr on pr.id = a.prestador_id
    where a.operadora = e.op_o and a.plano = e.plano_o and a.atendimento ~ '(^|,)H'
      and exists (select 1 from cot_rede u where u.operadora = e.op_d and u.prestador_id = a.prestador_id and u.atendimento ~ '(^|,)H')
      and not exists (select 1 from cot_rede b where b.operadora = e.op_d and b.plano = e.plano_d and b.prestador_id = a.prestador_id and b.atendimento ~ '(^|,)H'))
  where e.ordem <= 5;
  return n;
end $$;

-- ---------- cotação de uma empresa ----------
create or replace function public.cot_cotar(e uuid) returns jsonb
language plpgsql as $$
declare
  emp record; info record; g record; eq record; tb record; op text; achou boolean;
  grupos jsonb := '[]'; opcoes jsonb := '[]'; linhas jsonb; ok boolean;
  n_vidas int := 0; n_tit int := 0; custo numeric := 0; tem_copart boolean := false; comp text;
  v_mei boolean; v_simples boolean; tot numeric; vidas_ok int; cob_soma numeric; status text := null;
  iof constant numeric := 0.0238; cob_min constant numeric := 0.70;
begin
  select * into emp from empresas where id = e;
  if emp is null then return null; end if;
  select mei, simples, municipio, situacao into info from empresas_cnpj where cnpj = regexp_replace(coalesce(emp.cnpj, ''), '\D', '', 'g');
  v_mei := coalesce(info.mei, false); v_simples := coalesce(info.simples, false);

  -- vidas da última fatura de cada seguradora (saúde), agrupadas pelo plano equivalente da tabela de venda
  create temp table if not exists _cot_g (op text, plano text, acom text, fx int[], valor numeric, tit int, seg text, sem_ref boolean, copart boolean);
  delete from _cot_g;
  with ult as (select seguradora_id, max(competencia) c from vidas where empresa_id = e group by 1),
  v as (select v.*, s.nome seg,
          coalesce(v.idade, extract(year from age((v.competencia || '-01')::date, v.nascimento))::int) id2
        from vidas v join ult u on u.seguradora_id = v.seguradora_id and u.c = v.competencia
        join seguradoras s on s.id = v.seguradora_id
        where v.empresa_id = e and s.nome not ilike '%dental%'),
  r as (select v.*, ref.operadora_ref, ref.plano_ref, coalesce(ref.acomodacao, '') acom, coalesce(ref.copart, false) cp, coalesce(ref.confianca, 'sem_equivalente') conf,
          least(9, greatest(0, case when id2 <= 18 then 0 else (id2 - 19) / 5 + 1 end)) fx
        from v left join cotacao_plano_atual_ref ref on ref.seguradora = v.seg and ref.plano_original = v.plano
        where coalesce(ref.confianca, '') <> 'odonto'),
  custo_seg as (select r.seg, r.seguradora_id, sum(coalesce(r.valor_total, 0)) soma, count(*) nv from r group by 1, 2),
  cs as (select c.seg, c.nv, case when c.soma > 0 then null else (select f.valor from faturas_ultimas f where f.empresa_id = e and f.seguradora_id = c.seguradora_id) end fat from custo_seg c)
  insert into _cot_g
  select r.operadora_ref, r.plano_ref, r.acom,
         array[count(*) filter (where fx = 0), count(*) filter (where fx = 1), count(*) filter (where fx = 2), count(*) filter (where fx = 3), count(*) filter (where fx = 4),
               count(*) filter (where fx = 5), count(*) filter (where fx = 6), count(*) filter (where fx = 7), count(*) filter (where fx = 8), count(*) filter (where fx = 9)]::int[],
         case when max(cs.fat) is null then sum(coalesce(r.valor_total, 0)) else max(cs.fat) * count(*) / max(cs.nv) end,
         count(*) filter (where r.titular or r.parentesco ilike 'titular%'),
         r.seg, bool_or(r.plano_ref is null), bool_or(r.cp)
  from r join cs on cs.seg = r.seg
  group by r.operadora_ref, r.plano_ref, r.acom, r.seg;

  select coalesce(sum((select sum(x) from unnest(fx) x)), 0), coalesce(sum(tit), 0), coalesce(sum(valor), 0), coalesce(bool_or(copart), false)
    into n_vidas, n_tit, custo, tem_copart from _cot_g;
  select max(v.competencia) into comp from vidas v where v.empresa_id = e;
  select coalesce(jsonb_agg(jsonb_build_object('seguradora', seg, 'operadora', op, 'plano', plano, 'acomodacao', acom, 'faixas', fx, 'valor', round(valor, 2), 'sem_equivalente', sem_ref)), '[]') into grupos from _cot_g;

  if n_vidas = 0 then status := 'sem vidas de saúde';
  elsif n_vidas >= 100 then status := '100 vidas ou mais';
  elsif exists (select 1 from _cot_g where sem_ref) then status := 'plano atual sem equivalente na tabela';
  elsif custo <= 0 then status := 'sem valor atual';
  elsif comp < to_char(now() - interval '6 months', 'YYYY-MM') then status := 'fatura antiga';
  end if;

  if status is null then
    for op in select distinct operadora from cot_tabelas where ativa and operadora <> 'porto_bairro' loop
      linhas := '[]'; ok := true; tot := 0; cob_soma := 0; vidas_ok := 0;
      for g in select * from _cot_g loop
        achou := false;
        for eq in select * from cot_equivalencias q
                  where q.op_o = g.op and q.plano_o = g.plano and q.acom_o = coalesce(g.acom, '') and q.op_d = op and q.cobertura >= cob_min
                  order by q.ordem loop
          select t.id, t.titulo, t.condicoes, p.valores,
                 (select sum(g.fx[i] * p.valores[i]) from generate_series(1, 10) i) total
            into tb
          from cot_precos p join cot_tabelas t on t.id = p.tabela_id
          where t.ativa and t.operadora = op and p.plano = eq.plano_d and p.acomodacao = eq.acom_d
            and n_vidas between t.vidas_min and t.vidas_max
            and (t.mei <> 'so' or v_mei) and (t.mei <> 'nao' or not v_mei)
            and t.copart = tem_copart
            and (t.regime is distinct from 'simples' or v_simples)
            and (t.regime is distinct from 'pme' or not v_simples)
            and (t.regime is distinct from 'ei' or v_mei)
            and coalesce(t.meses, 12) = 12
            and t.titulares_min <= greatest(n_tit, 1)
          order by 5 asc limit 1;
          achou := found;
          exit when achou;
        end loop;
        if not achou then ok := false; exit; end if;
        tot := tot + tb.total;
        cob_soma := cob_soma + eq.cobertura * (select sum(x) from unnest(g.fx) x);
        linhas := linhas || jsonb_build_object(
          'origem', jsonb_build_object('seguradora', g.seg, 'operadora', g.op, 'plano', g.plano, 'acomodacao', g.acom),
          'plano', eq.plano_d, 'acomodacao', eq.acom_d, 'cobertura', eq.cobertura, 'faltam', to_jsonb(eq.faltam),
          'tabela', jsonb_build_object('id', tb.id, 'titulo', tb.titulo, 'condicoes', tb.condicoes),
          'faixas', g.fx, 'valores', tb.valores, 'total', round(tb.total, 2));
      end loop;
      if ok and tot > 0 and custo - tot * (1 + iof) > 0 then
        opcoes := opcoes || jsonb_build_object('operadora', op, 'total', round(tot, 2), 'iof', round(tot * iof, 2),
          'total_iof', round(tot * (1 + iof), 2), 'economia', round(custo - tot * (1 + iof), 2),
          'cobertura', round(cob_soma / n_vidas, 4), 'linhas', linhas);
      end if;
    end loop;
    select coalesce(jsonb_agg(o order by (o->>'economia')::numeric desc), '[]') into opcoes
      from (select o from jsonb_array_elements(opcoes) o order by (o->>'economia')::numeric desc limit 3) z;
    status := case when jsonb_array_length(opcoes) > 0 then 'com opções' else 'sem opção mais barata com rede equivalente' end;
  end if;

  return jsonb_build_object('empresa_id', e, 'status', status, 'vidas', n_vidas, 'titulares', n_tit,
    'custo_atual', round(custo, 2), 'competencia', comp, 'mei', info.mei, 'simples', info.simples, 'municipio', info.municipio,
    'situacao_cnpj', info.situacao, 'copart', tem_copart, 'grupos', grupos, 'opcoes', opcoes, 'calculado_em', now());
end $$;

-- ---------- recalcula e guarda a cotação de todas as empresas da corretora ----------
create or replace function public.cot_recalcular(c uuid) returns integer
language plpgsql as $$
declare e record; r jsonb; n integer := 0;
begin
  if not (eh_master() or eh_da_corretora(c, false)) then raise exception 'sem acesso a esta corretora'; end if;
  for e in select distinct v.empresa_id from vidas v join empresas x on x.id = v.empresa_id where v.corretora_id = c and x.ativa loop
    r := cot_cotar(e.empresa_id);
    insert into cot_resultados (empresa_id, corretora_id, calculado_em, status, vidas, custo_atual, melhor_economia, resultado)
    values (e.empresa_id, c, now(), r->>'status', (r->>'vidas')::int, (r->>'custo_atual')::numeric,
            (r->'opcoes'->0->>'economia')::numeric, r)
    on conflict (empresa_id) do update set calculado_em = excluded.calculado_em, status = excluded.status, vidas = excluded.vidas,
      custo_atual = excluded.custo_atual, melhor_economia = excluded.melhor_economia, resultado = excluded.resultado;
    n := n + 1;
  end loop;
  return n;
end $$;

grant execute on function cot_recalcular_equivalencias(), cot_cotar(uuid), cot_recalcular(uuid) to authenticated;
