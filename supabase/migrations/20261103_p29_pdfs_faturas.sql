-- p29: PDFs de fatura e boleto no portal.
-- Os agentes do PC (documentos.py) sobem os PDFs pela função agente-arquivo, que guarda no bucket "documentos"
-- e chama agente_documento: a fatura ganha fatura_doc_id / boleto_doc_id e a empresa baixa no login dela.
-- Sem DROP: só create or replace.

-- 1. Faturas que ainda não têm PDF no portal (desde a competência pedida)
create or replace function public.agente_docs_faltando(p_token text, p_corretora uuid, p_desde text default null)
returns jsonb language plpgsql security definer set search_path to 'public', 'privado' as $$
begin
  if not privado.token_agente_ok(p_token) then raise exception 'token inválido'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', f.id, 'seguradora', f.seguradora_id, 'competencia', f.competencia,
                                        'numero', f.numero, 'falta_fatura', f.fatura_doc_id is null,
                                        'falta_boleto', f.boleto_doc_id is null))
      from faturas f
     where f.corretora_id = p_corretora
       and (p_desde is null or f.competencia >= p_desde)
       and (f.fatura_doc_id is null or f.boleto_doc_id is null)), '[]'::jsonb);
end $$;

-- 2. Fatura de destino de um upload (a função agente-arquivo confere antes de gravar no bucket)
create or replace function public.agente_documento_alvo(p_token text, p_fatura uuid)
returns jsonb language plpgsql security definer set search_path to 'public', 'privado' as $$
declare r jsonb;
begin
  if not privado.token_agente_ok(p_token) then raise exception 'token inválido'; end if;
  select jsonb_build_object('id', id, 'corretora_id', corretora_id, 'empresa_id', empresa_id, 'competencia', competencia)
    into r from faturas where id = p_fatura;
  if r is null then raise exception 'fatura não encontrada'; end if;
  return r;
end $$;

-- 3. Registra o PDF já guardado no bucket e liga à fatura. p_tipo: fatura, boleto ou ambos (Bradesco: o mesmo PDF).
create or replace function public.agente_documento(p_token text, p_fatura uuid, p_tipo text, p_caminho text, p_nome text)
returns uuid language plpgsql security definer set search_path to 'public', 'privado' as $$
declare f faturas; d uuid;
begin
  if not privado.token_agente_ok(p_token) then raise exception 'token inválido'; end if;
  if p_tipo not in ('fatura', 'boleto', 'ambos') then raise exception 'tipo inválido: %', p_tipo; end if;
  select * into f from faturas where id = p_fatura;
  if f.id is null then raise exception 'fatura não encontrada'; end if;
  insert into documentos (corretora_id, empresa_id, tipo, competencia, caminho_storage, nome_arquivo, visivel_empresa)
  values (f.corretora_id, f.empresa_id, (case when p_tipo = 'boleto' then 'boleto_pdf' else 'fatura_pdf' end)::tipo_documento,
          f.competencia, p_caminho, p_nome, true)
  on conflict (caminho_storage) do update set nome_arquivo = excluded.nome_arquivo, empresa_id = excluded.empresa_id,
                                              criado_em = now()
  returning id into d;
  update faturas set fatura_doc_id = case when p_tipo in ('fatura', 'ambos') then d else fatura_doc_id end,
                     boleto_doc_id = case when p_tipo in ('boleto', 'ambos') then d else boleto_doc_id end
   where id = p_fatura;
  return d;
end $$;

grant execute on function public.agente_docs_faltando(text, uuid, text) to anon, authenticated, service_role;
grant execute on function public.agente_documento_alvo(text, uuid) to anon, authenticated, service_role;
grant execute on function public.agente_documento(text, uuid, text, text, text) to anon, authenticated, service_role;

-- 4. A sincronização da planilha não apaga mais a ligação com os PDFs (a planilha não conhece os ids dos documentos)
create or replace function public.sincronizar_lote(p_token text, p_tabela text, p_linhas jsonb)
returns integer language plpgsql security definer set search_path to 'public', 'privado' as $function$
declare cols text; upd text; n integer;
begin
  if not privado.token_agente_ok(p_token) then raise exception 'token inválido'; end if;
  if p_tabela not in ('empresas', 'apolices', 'subestipulantes',
                      'faturas', 'vidas', 'comissao_pagamentos', 'comissao_lancamentos') then
    raise exception 'tabela não permitida: %', p_tabela;
  end if;
  if jsonb_array_length(p_linhas) = 0 then return 0; end if;
  select string_agg(quote_ident(k), ','),
         string_agg(case when p_tabela = 'faturas' and k in ('fatura_doc_id', 'boleto_doc_id', 'vidas_doc_id')
                         then format('%1$I = coalesce(excluded.%1$I, %2$I.%1$I)', k, p_tabela)
                         else format('%1$I = excluded.%1$I', k) end, ',') filter (where k <> 'id')
    into cols, upd from jsonb_object_keys(p_linhas->0) k;
  if p_tabela = 'vidas' then
    delete from vidas v using (select distinct corretora_id, empresa_id, seguradora_id, competencia
                               from jsonb_populate_recordset(null::vidas, p_linhas)) g
     where v.corretora_id = g.corretora_id and v.empresa_id = g.empresa_id and v.seguradora_id = g.seguradora_id and v.competencia = g.competencia;
  elsif p_tabela = 'comissao_lancamentos' then
    delete from comissao_lancamentos l using (select distinct corretora_id, pagamento_id
                                              from jsonb_populate_recordset(null::comissao_lancamentos, p_linhas)) g
     where l.corretora_id = g.corretora_id and l.pagamento_id = g.pagamento_id;
  end if;
  execute format('insert into public.%I (%s) select %s from jsonb_populate_recordset(null::public.%I, $1) on conflict (id) do update set %s',
                 p_tabela, cols, cols, p_tabela, upd) using p_linhas;
  get diagnostics n = row_count;
  return n;
end $function$;
