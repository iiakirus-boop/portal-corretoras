-- p36: resumo, e-mails e anexos nos cards do quadro.
-- O agente de e-mail do PC lê as conversas no Outlook, escreve o resumo do card, registra cada e-mail
-- (agente_quadro_card) e grava os anexos e o e-mail inteiro (.msg) no próprio banco (agente_quadro_anexo, bytea).
-- Quem é da corretora baixa por /quadro-arquivo/<id> (quadro_arquivo_baixar). Sem DROP: só create / create or replace.
-- (Aplicada no banco em partes: p36a tabelas, p36b leitura no bucket, p36c funções do agente, p36d arquivo no banco.)

alter table quadro_cards add column if not exists resumo text;
alter table quadro_cards add column if not exists resumo_em timestamptz;

create table if not exists quadro_emails (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references quadro_cards(id),
  corretora_id uuid not null references corretoras(id),
  mensagem_id text not null,            -- id do e-mail no Outlook (Internet Message-ID ou EntryID)
  em timestamptz,
  de text, para text, cc text,
  assunto text,
  trecho text,                          -- o começo do texto, sem a parte citada
  criado_em timestamptz not null default now(),
  unique (card_id, mensagem_id)
);
create index if not exists quadro_emails_card on quadro_emails (card_id, em);

create table if not exists quadro_arquivos (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references quadro_cards(id),
  corretora_id uuid not null references corretoras(id),
  email_id uuid references quadro_emails(id),
  tipo text not null check (tipo in ('email', 'anexo')),
  nome text not null,
  caminho_storage text not null unique,
  tamanho bigint,
  criado_em timestamptz not null default now()
);
create index if not exists quadro_arquivos_card on quadro_arquivos (card_id);

alter table quadro_emails   enable row level security;
alter table quadro_arquivos enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'quadro_emails' and policyname = 'ler') then
    create policy ler on quadro_emails for select using (eh_master() or eh_da_corretora(corretora_id));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'quadro_arquivos' and policyname = 'ler') then
    create policy ler on quadro_arquivos for select using (eh_master() or eh_da_corretora(corretora_id));
  end if;
  -- o link temporário do arquivo é gerado com o login da pessoa: ela precisa poder ler o objeto no bucket
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'quadro_ler') then
    create policy quadro_ler on storage.objects for select using (
      bucket_id = 'documentos' and exists (select 1 from public.quadro_arquivos a where a.caminho_storage = objects.name));
  end if;
end $$;
grant select on quadro_emails, quadro_arquivos to authenticated;

-- Cria ou atualiza um card a partir de uma conversa de e-mail.
-- Acha o card pelo nº (p_dados.numero, do [QT#n] no assunto) ou pela conversa do Outlook (p_dados.conversa).
-- Só muda os campos que vierem; coluna e responsável de card que já existe só mudam se vierem.
-- p_dados: numero, conversa, titulo, tipo (nome), responsavel (e-mail ou apelido), apoio, prioridade, coluna, resumo,
--          proximo_passo, empresa_nome, seguradora, prazo, email_assunto, origem,
--          emails: [{mensagem_id, em, de, para, cc, assunto, trecho}]
create or replace function public.agente_quadro_card(p_token text, p_corretora uuid, p_dados jsonb)
returns jsonb language plpgsql security definer set search_path to 'public', 'privado' as $$
declare
  c quadro_cards; novo boolean := false; e jsonb; eid uuid; ids jsonb := '{}'::jsonb;
  v_tipo uuid; v_resp uuid; v_apoio uuid;
  pessoa text;
begin
  if not privado.token_agente_ok(p_token) then raise exception 'token inválido'; end if;
  if not exists (select 1 from corretoras where id = p_corretora) then raise exception 'corretora não encontrada'; end if;

  if p_dados ? 'numero' and nullif(p_dados->>'numero', '') is not null then
    select * into c from quadro_cards where corretora_id = p_corretora and numero = (p_dados->>'numero')::bigint;
  end if;
  if c.id is null and nullif(p_dados->>'conversa', '') is not null then
    select * into c from quadro_cards where corretora_id = p_corretora and email_conversa = p_dados->>'conversa'
     order by arquivado, criado_em desc limit 1;
  end if;

  select id into v_tipo from quadro_tipos where corretora_id = p_corretora and lower(nome) = lower(p_dados->>'tipo');
  pessoa := lower(coalesce(p_dados->>'responsavel', ''));
  select id into v_resp from quadro_equipe where corretora_id = p_corretora and pessoa <> ''
     and (lower(email) = pessoa or lower(apelido) = pessoa or lower(nome) = pessoa or lower(split_part(nome, ' ', 1)) = pessoa) limit 1;
  pessoa := lower(coalesce(p_dados->>'apoio', ''));
  select id into v_apoio from quadro_equipe where corretora_id = p_corretora and pessoa <> ''
     and (lower(email) = pessoa or lower(apelido) = pessoa or lower(nome) = pessoa or lower(split_part(nome, ' ', 1)) = pessoa) limit 1;
  if v_resp is null and v_tipo is not null and c.id is null then
    select responsavel_padrao into v_resp from quadro_tipos where id = v_tipo;
  end if;

  if c.id is null then
    if nullif(p_dados->>'titulo', '') is null then raise exception 'card novo precisa de título'; end if;
    insert into quadro_cards (corretora_id, titulo, tipo_id, coluna, prioridade, responsavel_id, apoio_id, proximo_passo,
                              empresa_nome, seguradora, prazo, origem, email_assunto, email_conversa, resumo, resumo_em)
    values (p_corretora, p_dados->>'titulo', v_tipo, coalesce(nullif(p_dados->>'coluna', ''), 'entrada'),
            coalesce((p_dados->>'prioridade')::smallint, 3), v_resp, v_apoio, p_dados->>'proximo_passo',
            p_dados->>'empresa_nome', p_dados->>'seguradora', nullif(p_dados->>'prazo', '')::date,
            coalesce(nullif(p_dados->>'origem', ''), 'email'), p_dados->>'email_assunto', p_dados->>'conversa',
            p_dados->>'resumo', case when p_dados ? 'resumo' then now() end)
    returning * into c;
    novo := true;
  else
    update quadro_cards set
      titulo        = coalesce(nullif(p_dados->>'titulo', ''), titulo),
      tipo_id       = coalesce(v_tipo, tipo_id),
      coluna        = coalesce(nullif(p_dados->>'coluna', ''), coluna),
      prioridade    = coalesce((p_dados->>'prioridade')::smallint, prioridade),
      responsavel_id= coalesce(v_resp, responsavel_id),
      apoio_id      = coalesce(v_apoio, apoio_id),
      proximo_passo = case when p_dados ? 'proximo_passo' then p_dados->>'proximo_passo' else proximo_passo end,
      empresa_nome  = coalesce(nullif(p_dados->>'empresa_nome', ''), empresa_nome),
      seguradora    = coalesce(nullif(p_dados->>'seguradora', ''), seguradora),
      prazo         = coalesce(nullif(p_dados->>'prazo', '')::date, prazo),
      email_assunto = coalesce(nullif(p_dados->>'email_assunto', ''), email_assunto),
      email_conversa= coalesce(email_conversa, nullif(p_dados->>'conversa', '')),
      resumo        = case when p_dados ? 'resumo' then p_dados->>'resumo' else resumo end,
      resumo_em     = case when p_dados ? 'resumo' then now() else resumo_em end
    where id = c.id returning * into c;
  end if;

  for e in select * from jsonb_array_elements(coalesce(p_dados->'emails', '[]'::jsonb)) loop
    continue when nullif(e->>'mensagem_id', '') is null;
    insert into quadro_emails (card_id, corretora_id, mensagem_id, em, de, para, cc, assunto, trecho)
    values (c.id, p_corretora, e->>'mensagem_id', nullif(e->>'em', '')::timestamptz, e->>'de', e->>'para', e->>'cc',
            e->>'assunto', left(e->>'trecho', 4000))
    on conflict (card_id, mensagem_id) do update set em = excluded.em, de = excluded.de, para = excluded.para, cc = excluded.cc,
                                                    assunto = excluded.assunto, trecho = excluded.trecho
    returning id into eid;
    ids := ids || jsonb_build_object(e->>'mensagem_id', eid);
  end loop;

  if not novo and jsonb_array_length(coalesce(p_dados->'emails', '[]'::jsonb)) > 0 then
    insert into quadro_eventos (card_id, corretora_id, autor_nome, tipo, texto)
    values (c.id, p_corretora, 'Claude', 'email', 'Card atualizado pelo e-mail');
  end if;
  return jsonb_build_object('id', c.id, 'numero', c.numero, 'novo', novo, 'emails', ids);
end $$;

-- Card de destino de um upload (reserva para quando os arquivos forem para o bucket)
create or replace function public.agente_quadro_alvo(p_token text, p_card uuid)
returns jsonb language plpgsql security definer set search_path to 'public', 'privado' as $$
declare r jsonb;
begin
  if not privado.token_agente_ok(p_token) then raise exception 'token inválido'; end if;
  select jsonb_build_object('id', id, 'corretora_id', corretora_id) into r from quadro_cards where id = p_card;
  if r is null then raise exception 'card não encontrado'; end if;
  return r;
end $$;

-- Registra um arquivo já guardado no bucket (anexo ou o e-mail inteiro)
create or replace function public.agente_quadro_arquivo(p_token text, p_card uuid, p_email uuid, p_tipo text, p_caminho text, p_nome text, p_tamanho bigint)
returns uuid language plpgsql security definer set search_path to 'public', 'privado' as $$
declare k quadro_cards; d uuid;
begin
  if not privado.token_agente_ok(p_token) then raise exception 'token inválido'; end if;
  if p_tipo not in ('email', 'anexo') then raise exception 'tipo inválido: %', p_tipo; end if;
  select * into k from quadro_cards where id = p_card;
  if k.id is null then raise exception 'card não encontrado'; end if;
  if p_email is not null and not exists (select 1 from quadro_emails where id = p_email and card_id = p_card) then
    raise exception 'e-mail não é deste card';
  end if;
  insert into quadro_arquivos (card_id, corretora_id, email_id, tipo, nome, caminho_storage, tamanho)
  values (p_card, k.corretora_id, p_email, p_tipo, p_nome, p_caminho, p_tamanho)
  on conflict (caminho_storage) do update set nome = excluded.nome, tamanho = excluded.tamanho, email_id = excluded.email_id
  returning id into d;
  return d;
end $$;

grant execute on function public.agente_quadro_card(text, uuid, jsonb) to anon, authenticated, service_role;
grant execute on function public.agente_quadro_alvo(text, uuid) to anon, authenticated, service_role;
grant execute on function public.agente_quadro_arquivo(text, uuid, uuid, text, text, text, bigint) to anon, authenticated, service_role;

-- p36d: arquivos guardados no próprio banco (bytea), enviados pelo agente do PC com o token dos agentes.
alter table quadro_arquivos add column if not exists conteudo bytea;
alter table quadro_arquivos add column if not exists tipo_mime text;
revoke select on quadro_arquivos from authenticated;
grant select (id, card_id, corretora_id, email_id, tipo, nome, caminho_storage, tamanho, criado_em, tipo_mime) on quadro_arquivos to authenticated;

create or replace function public.quadro_arquivo_baixar(p_id uuid)
returns table (nome text, tipo_mime text, conteudo bytea) language sql stable security definer set search_path = public as $$
  select a.nome, a.tipo_mime, a.conteudo from quadro_arquivos a
   where a.id = p_id and (eh_master() or eh_da_corretora(a.corretora_id));
$$;
revoke all on function public.quadro_arquivo_baixar(uuid) from public, anon;
grant execute on function public.quadro_arquivo_baixar(uuid) to authenticated;

create or replace function public.agente_quadro_anexo(p_token text, p_card uuid, p_email uuid, p_tipo text, p_nome text, p_mime text, p_base64 text)
returns uuid language plpgsql security definer set search_path to 'public', 'privado' as $$
declare k quadro_cards; d uuid; b bytea; chave text;
begin
  if not privado.token_agente_ok(p_token) then raise exception 'token inválido'; end if;
  if p_tipo not in ('email', 'anexo') then raise exception 'tipo inválido: %', p_tipo; end if;
  select * into k from quadro_cards where id = p_card;
  if k.id is null then raise exception 'card não encontrado'; end if;
  if p_email is not null and not exists (select 1 from quadro_emails where id = p_email and card_id = p_card) then
    raise exception 'e-mail não é deste card';
  end if;
  b := decode(p_base64, 'base64');
  if length(b) = 0 then raise exception 'arquivo vazio'; end if;
  if length(b) > 15 * 1024 * 1024 then raise exception 'arquivo maior que 15 MB'; end if;
  chave := 'banco:' || p_card || '/' || coalesce(p_email::text, 'geral') || '/' || p_tipo || '/' || left(p_nome, 200);
  insert into quadro_arquivos (card_id, corretora_id, email_id, tipo, nome, caminho_storage, tamanho, conteudo, tipo_mime)
  values (p_card, k.corretora_id, p_email, p_tipo, left(p_nome, 200), chave, length(b), b, nullif(p_mime, ''))
  on conflict (caminho_storage) do update set conteudo = excluded.conteudo, tamanho = excluded.tamanho, tipo_mime = excluded.tipo_mime
  returning id into d;
  return d;
end $$;
grant execute on function public.agente_quadro_anexo(text, uuid, uuid, text, text, text, text) to anon, authenticated, service_role;
