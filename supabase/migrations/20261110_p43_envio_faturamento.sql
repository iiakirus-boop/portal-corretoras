-- p43: controle de envio do faturamento no site (substitui as cores da planilha mensal).
-- Uma linha por empresa (código da tela de Faturamento) e competência:
--   enviado    = o faturamento do mês já foi mandado ao cliente (e-mail ou WhatsApp)
--   nao_enviar = este mês não é para enviar
--   pendente   = marca desfeita (volta para "falta enviar")
-- Sem linha = falta enviar.
create table if not exists public.faturamento_envios (
  id            uuid primary key default gen_random_uuid(),
  corretora_id  uuid not null references public.corretoras(id),
  competencia   char(7) not null,
  eid           text not null,
  situacao      text not null default 'enviado' check (situacao in ('enviado', 'nao_enviar', 'pendente')),
  canal         text,
  nota          text,
  marcado_por   uuid,
  marcado_nome  text,
  marcado_em    timestamptz not null default now(),
  unique (corretora_id, competencia, eid)
);
alter table public.faturamento_envios enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'faturamento_envios' and policyname = 'ler') then
    create policy ler on public.faturamento_envios for select using (eh_master() or eh_da_corretora(corretora_id));
    create policy gravar on public.faturamento_envios for insert with check (eh_master() or eh_da_corretora(corretora_id));
    create policy mudar on public.faturamento_envios for update using (eh_master() or eh_da_corretora(corretora_id)) with check (eh_master() or eh_da_corretora(corretora_id));
  end if;
end $$;
grant select, insert, update on public.faturamento_envios to authenticated;
