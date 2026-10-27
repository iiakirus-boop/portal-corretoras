-- p23: o vigia do PC informa a cada volta se cada login dos portais está ativo (master > Visão geral > Logins nas seguradoras).
-- Grava em sessoes_portal só quando muda ou a cada 10 min, para a tabela não crescer à toa. Sem drop.

insert into corretora_codigos (corretora_id, seguradora_id, codigo, rotulo, ativo)
select '17e3e5ee-591d-4dbf-8e47-44930ef2941f', 'bradesco_saude', 'Portal', 'Portal de Negócios', true
where not exists (select 1 from corretora_codigos where corretora_id = '17e3e5ee-591d-4dbf-8e47-44930ef2941f' and seguradora_id = 'bradesco_saude');

-- p_logins: [{"seguradora": "porto_saude", "codigo": "BA6QXJ", "ativa": true, "obs": "..."}]
create or replace function public.agente_logins(p_token text, p_corretora uuid, p_maquina text, p_logins jsonb)
returns integer
language plpgsql
security definer
set search_path to 'public', 'privado'
as $$
declare
  l jsonb; cc uuid; m uuid; ult sessoes_portal; n integer := 0;
begin
  if not privado.token_agente_ok(p_token) then raise exception 'token inválido'; end if;
  select id into m from maquinas where nome = p_maquina;
  for l in select * from jsonb_array_elements(coalesce(p_logins, '[]'::jsonb)) loop
    select id into cc from corretora_codigos
     where corretora_id = p_corretora and seguradora_id = l->>'seguradora' and codigo = l->>'codigo';
    continue when cc is null;
    select * into ult from sessoes_portal where corretora_codigo_id = cc order by verificado_em desc limit 1;
    if ult.id is null or ult.ativa is distinct from (l->>'ativa')::boolean or ult.verificado_em < now() - interval '10 minutes' then
      insert into sessoes_portal (corretora_codigo_id, maquina_id, verificado_em, ativa, observacao)
      values (cc, m, now(), (l->>'ativa')::boolean, left(l->>'obs', 300));
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;

revoke all on function public.agente_logins(text, uuid, text, jsonb) from public;
grant execute on function public.agente_logins(text, uuid, text, jsonb) to anon, authenticated;
