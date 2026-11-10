-- p37: o agente de e-mail não mexe mais na coluna de card que já existe (quem move é a equipe na tela).
-- agente_quadro_card marca a transação (quadro.agente = sim); o gatilho abaixo devolve a coluna antiga
-- e deixa no histórico a coluna que o Claude sugeriu. Card novo continua entrando na coluna enviada.
create or replace function public.quadro_cards_coluna_agente() returns trigger language plpgsql as $$
begin
  if current_setting('quadro.agente', true) = 'sim' and new.coluna is distinct from old.coluna then
    insert into quadro_eventos (card_id, corretora_id, autor_nome, tipo, texto)
    values (new.id, new.corretora_id, 'Claude', 'alterado', 'Pelos e-mails, o Claude acha que o card deveria estar em ' || new.coluna || '. A coluna não foi mudada.');
    new.coluna := old.coluna;
  end if;
  return new;
end $$;
create or replace trigger quadro_cards_coluna_agente before update on quadro_cards for each row execute function quadro_cards_coluna_agente();

-- (p37b) agente_quadro_card ganhou, logo depois da conferência do token:
--   perform set_config('quadro.agente', 'sim', true);
do $$
declare d text;
begin
  d := pg_get_functiondef('public.agente_quadro_card(text,uuid,jsonb)'::regprocedure);
  if position('quadro.agente' in d) = 0 then
    d := replace(d, $x$if not privado.token_agente_ok(p_token) then raise exception 'token inválido'; end if;
  if not exists (select 1 from corretoras where id = p_corretora)$x$,
                 $x$if not privado.token_agente_ok(p_token) then raise exception 'token inválido'; end if;
  perform set_config('quadro.agente', 'sim', true);
  if not exists (select 1 from corretoras where id = p_corretora)$x$);
    if position('quadro.agente' in d) = 0 then raise exception 'não achei o ponto para marcar a sessão'; end if;
    execute d;
  end if;
end $$;
