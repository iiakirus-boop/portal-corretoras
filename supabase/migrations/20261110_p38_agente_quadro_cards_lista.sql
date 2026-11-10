-- p38: o leitor de e-mails do PC lê os cards do portal (inclusive os criados na tela), para achar [QT#n] e a conversa.
create or replace function public.agente_quadro_cards_lista(p_token text, p_corretora uuid, p_desde timestamptz default null)
returns jsonb language plpgsql security definer set search_path to 'public', 'privado' as $$
begin
  if not privado.token_agente_ok(p_token) then raise exception 'token inválido'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', c.id, 'numero', c.numero, 'titulo', c.titulo, 'coluna', c.coluna, 'prioridade', c.prioridade,
      'tipo', t.nome, 'responsavel', coalesce(q.apelido, q.nome), 'empresa_nome', c.empresa_nome, 'seguradora', c.seguradora,
      'conversa', c.email_conversa, 'email_assunto', c.email_assunto, 'resumo', c.resumo, 'proximo_passo', c.proximo_passo,
      'arquivado', c.arquivado, 'atualizado_em', c.atualizado_em) order by c.numero)
      from quadro_cards c
      left join quadro_tipos t on t.id = c.tipo_id
      left join quadro_equipe q on q.id = c.responsavel_id
     where c.corretora_id = p_corretora
       and (p_desde is null or c.atualizado_em >= p_desde)), '[]'::jsonb);
end $$;
grant execute on function public.agente_quadro_cards_lista(text, uuid, timestamptz) to anon, authenticated, service_role;
