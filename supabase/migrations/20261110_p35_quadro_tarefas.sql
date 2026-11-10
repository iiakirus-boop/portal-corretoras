-- p35: Quadro de tarefas da equipe da corretora (cards estilo Trello / Scrum)
-- Colunas: entrada (triagem) → a_fazer → fazendo → aguardando_seguradora / aguardando_cliente → feito.
-- numero: o nº do card, para o e-mail citar no assunto (ex.: [QT#12]) e cair no card certo.
-- Prioridade: 1 urgente, 2 alta, 3 normal, 4 baixa. Cor do card = tipo de demanda.
-- Os cards podem ser criados à mão pela equipe ou, depois, pelo Claude a partir dos e-mails
-- (campos email_*). Nada é apagado: card que sai do quadro ganha arquivado = true.

create table if not exists quadro_equipe (
  id uuid primary key default gen_random_uuid(),
  corretora_id uuid not null references corretoras(id),
  nome text not null,
  apelido text,
  email text,
  funcao text,
  ativo boolean not null default true,
  ordem int not null default 99,
  criado_em timestamptz not null default now()
);

create table if not exists quadro_tipos (
  id uuid primary key default gen_random_uuid(),
  corretora_id uuid not null references corretoras(id),
  nome text not null,
  cor text not null,
  descricao text,
  responsavel_padrao uuid references quadro_equipe(id),
  ativo boolean not null default true,
  ordem int not null default 99,
  unique (corretora_id, nome)
);

create table if not exists quadro_cards (
  id uuid primary key default gen_random_uuid(),
  numero bigint generated always as identity,
  corretora_id uuid not null references corretoras(id),
  titulo text not null,
  descricao text,
  tipo_id uuid references quadro_tipos(id),
  coluna text not null default 'entrada' check (coluna in ('entrada','a_fazer','fazendo','aguardando_seguradora','aguardando_cliente','feito')),
  prioridade smallint not null default 3 check (prioridade between 1 and 4),
  responsavel_id uuid references quadro_equipe(id),
  apoio_id uuid references quadro_equipe(id),
  proximo_passo text,
  empresa_id uuid references empresas(id),
  empresa_nome text,
  seguradora text,
  prazo date,
  origem text not null default 'manual' check (origem in ('manual','email','agente','exemplo')),
  email_assunto text,
  email_conversa text,
  ordem double precision not null default extract(epoch from now()),
  arquivado boolean not null default false,
  criado_por uuid,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  coluna_desde timestamptz not null default now(),
  concluido_em timestamptz
);
create index if not exists quadro_cards_corretora on quadro_cards (corretora_id, arquivado, coluna);
create unique index if not exists quadro_cards_numero on quadro_cards (numero);
create index if not exists quadro_cards_conversa on quadro_cards (corretora_id, email_conversa);

create table if not exists quadro_eventos (
  id bigint generated always as identity primary key,
  card_id uuid not null references quadro_cards(id),
  corretora_id uuid not null references corretoras(id),
  em timestamptz not null default now(),
  autor_id uuid,
  autor_nome text,
  tipo text not null default 'comentario' check (tipo in ('comentario','movido','alterado','criado','email')),
  texto text
);
create index if not exists quadro_eventos_card on quadro_eventos (card_id, em);

-- datas automáticas e histórico de troca de coluna
create or replace function quadro_cards_antes() returns trigger language plpgsql as $$
begin
  new.atualizado_em := now();
  if tg_op = 'UPDATE' and new.coluna is distinct from old.coluna then
    new.coluna_desde := now();
    new.concluido_em := case when new.coluna = 'feito' then now() else null end;
  end if;
  if tg_op = 'INSERT' and new.coluna = 'feito' then new.concluido_em := now(); end if;
  return new;
end $$;
create or replace trigger quadro_cards_antes before insert or update on quadro_cards for each row execute function quadro_cards_antes();

create or replace function quadro_cards_depois() returns trigger language plpgsql security definer set search_path = public as $$
declare rot jsonb := '{"entrada":"Entrada","a_fazer":"A fazer","fazendo":"Fazendo","aguardando_seguradora":"Aguardando seguradora","aguardando_cliente":"Aguardando cliente","feito":"Feito"}';
begin
  if tg_op = 'INSERT' then
    insert into quadro_eventos (card_id, corretora_id, autor_id, tipo, texto)
    values (new.id, new.corretora_id, auth.uid(), 'criado', 'Card criado' || case when new.origem = 'email' then ' pelo e-mail' else '' end);
  elsif new.coluna is distinct from old.coluna then
    insert into quadro_eventos (card_id, corretora_id, autor_id, tipo, texto)
    values (new.id, new.corretora_id, auth.uid(), 'movido', 'Movido de ' || (rot->>old.coluna) || ' para ' || (rot->>new.coluna));
  end if;
  return new;
end $$;
create or replace trigger quadro_cards_depois after insert or update on quadro_cards for each row execute function quadro_cards_depois();

-- quem é da corretora (admin ou operador) vê e mexe no quadro; ninguém apaga
alter table quadro_equipe  enable row level security;
alter table quadro_tipos   enable row level security;
alter table quadro_cards   enable row level security;
alter table quadro_eventos enable row level security;

do $$
declare t text;
begin
  foreach t in array array['quadro_equipe','quadro_tipos','quadro_cards'] loop
    if not exists (select 1 from pg_policies where tablename = t and policyname = 'ler') then
      execute format('create policy ler on %I for select using (eh_master() or eh_da_corretora(corretora_id))', t);
      execute format('create policy gravar on %I for insert with check (eh_master() or eh_da_corretora(corretora_id))', t);
      execute format('create policy mudar on %I for update using (eh_master() or eh_da_corretora(corretora_id)) with check (eh_master() or eh_da_corretora(corretora_id))', t);
    end if;
  end loop;
  if not exists (select 1 from pg_policies where tablename = 'quadro_eventos' and policyname = 'ler') then
    create policy ler on quadro_eventos for select using (eh_master() or eh_da_corretora(corretora_id));
    create policy gravar on quadro_eventos for insert with check ((eh_master() or eh_da_corretora(corretora_id)) and tipo = 'comentario' and autor_id = auth.uid());
  end if;
end $$;

grant select, insert, update on quadro_equipe, quadro_tipos, quadro_cards to authenticated;
grant select, insert on quadro_eventos to authenticated;
