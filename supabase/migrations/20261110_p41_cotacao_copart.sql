-- Cotação: tabelas só com coparticipação (Amil, Hapvida, NotreDame) entram quando a operadora não tem a versão sem;
-- "Super Simples" é a linha de 2 a 29 vidas, não o regime tributário: não filtra mais por Simples.
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
          select t2.id, t2.titulo, t2.condicoes, t2.copart, p.valores, (select sum(g.fx[k] * p.valores[k]) from generate_series(1, 10) k) total into tb
            from cot_precos p join cot_tabelas t2 on t2.id = p.tabela_id
            where t2.ativa and t2.operadora = v_op and p.plano = v_plano and p.acomodacao = v_acom
              and n_vidas between t2.vidas_min and t2.vidas_max and (t2.mei <> 'so' or v_mei) and (t2.mei <> 'nao' or not v_mei)
                            and (t2.regime is distinct from 'ei' or v_mei) and coalesce(t2.meses, 12) = 12 and t2.titulares_min <= greatest(n_tit, 1)
            order by t2.copart <> tem_copart, 6 limit 1;
          achou := found;
        elsif not g.sem_ref then
          v_escolha := 'automatico';
          for eq in select * from cot_equivalencias q
                    where q.op_o = g.op and q.plano_o = g.plano and q.acom_o = g.acom and q.op_d = v_op and (q.valida or manual)
                    order by q.valida desc, q.ordem loop
            select t2.id, t2.titulo, t2.condicoes, t2.copart, p.valores, (select sum(g.fx[k] * p.valores[k]) from generate_series(1, 10) k) total into tb
              from cot_precos p join cot_tabelas t2 on t2.id = p.tabela_id
              where t2.ativa and t2.operadora = v_op and p.plano = eq.plano_d and p.acomodacao = eq.acom_d
                and n_vidas between t2.vidas_min and t2.vidas_max and (t2.mei <> 'so' or v_mei) and (t2.mei <> 'nao' or not v_mei)
                                and (t2.regime is distinct from 'ei' or v_mei) and coalesce(t2.meses, 12) = 12 and t2.titulares_min <= greatest(n_tit, 1)
              order by t2.copart <> tem_copart, 6 limit 1;
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
          'tabela', jsonb_build_object('id', tb.id, 'titulo', tb.titulo, 'condicoes', tb.condicoes, 'copart', tb.copart),
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
