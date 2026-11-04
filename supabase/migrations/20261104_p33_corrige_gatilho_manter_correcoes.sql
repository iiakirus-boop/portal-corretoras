-- p33 (2026-11-04): o gatilho da p28 lia new.segurado também em faturas (coluna que só existe em comissao_lancamentos)
-- e toda fatura nova dava erro "record "new" has no field "segurado"". Separa os IFs; mesma função, sem DROP.
create or replace function public.tg_manter_correcoes() returns trigger
language plpgsql security definer set search_path = public as $$
declare x record; v_seg text;
begin
  select e.excluido_em, e.excluido_por, e.motivo into x
    from exclusoes e where e.tabela = tg_table_name and e.registro_id = new.id and e.desfeito_em is null;
  if found then
    new.excluido_em := x.excluido_em; new.excluido_por := x.excluido_por; new.excluido_motivo := x.motivo;
  end if;
  if tg_table_name = 'comissao_lancamentos' then
    if new.empresa_id is null and new.segurado is not null then
      select p.seguradora_id into v_seg from comissao_pagamentos p where p.id = new.pagamento_id;
      select a.empresa_id into new.empresa_id from apelidos_empresa a
       where a.corretora_id = new.corretora_id and a.seguradora_id = v_seg and a.segurado = new.segurado;
    end if;
  end if;
  return new;
end $$;
revoke execute on function public.tg_manter_correcoes() from public, anon, authenticated;
