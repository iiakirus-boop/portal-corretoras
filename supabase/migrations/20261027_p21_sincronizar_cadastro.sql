-- p21: o sincronizar do PC passa a enviar também o cadastro (empresas, apólices e subestipulantes).
-- Antes só faturas/vidas/comissões subiam; um subestipulante novo na planilha derrubava o lote
-- inteiro de faturas por chave estrangeira. Cadastro entra só com upsert (nada é apagado).

create or replace function public.sincronizar_lote(p_token text, p_tabela text, p_linhas jsonb)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public', 'privado'
as $function$
declare cols text; upd text; n integer;
begin
  if not privado.token_agente_ok(p_token) then raise exception 'token inválido'; end if;
  if p_tabela not in ('empresas', 'apolices', 'subestipulantes',
                      'faturas', 'vidas', 'comissao_pagamentos', 'comissao_lancamentos') then
    raise exception 'tabela não permitida: %', p_tabela;
  end if;
  if jsonb_array_length(p_linhas) = 0 then return 0; end if;
  select string_agg(quote_ident(k), ','), string_agg(format('%1$I = excluded.%1$I', k), ',') filter (where k <> 'id')
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
