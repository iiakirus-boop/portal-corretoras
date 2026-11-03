-- p29: situação do boleto lida no portal da seguradora (Porto: botão Boleto desabilitado; Hapvida: status Liquidado).
-- Fica numa tabela própria (a sincronização da planilha não mexe nela) e é copiada para faturas.pago_no_portal,
-- coluna que os CSV da carga não trazem. O gatilho preenche a coluna também quando a fatura chega depois da leitura
-- (o vigia lê a situação logo depois do download, antes de a rodada gravar e sincronizar a fatura nova).
-- Sem DROP: só cria.

create table if not exists public.faturas_situacao_portal (
  corretora_id uuid not null references public.corretoras(id),
  seguradora_id text not null,
  numero text not null,
  competencia character(7),
  situacao text not null check (situacao in ('pago', 'aberto')),
  visto_em timestamptz not null default now(),
  pago_em date,
  primary key (corretora_id, seguradora_id, numero)
);
alter table public.faturas_situacao_portal enable row level security;
comment on table public.faturas_situacao_portal is
  'Situação do boleto lida pelo agente no portal da seguradora (p29). pago_em = data de pagamento do portal ou o dia em que o agente viu pago pela primeira vez.';

alter table public.faturas add column if not exists pago_no_portal date;
comment on column public.faturas.pago_no_portal is
  'O portal da seguradora mostra o boleto pago (p29): data de pagamento do portal ou o dia em que o agente viu pago.';

create or replace function privado.faturas_pago_no_portal() returns trigger
language plpgsql security definer set search_path to 'public', 'privado' as $$
begin
  if new.pago_no_portal is null then
    select s.pago_em into new.pago_no_portal from public.faturas_situacao_portal s
     where s.corretora_id = new.corretora_id and s.seguradora_id = new.seguradora_id and s.numero = new.numero and s.situacao = 'pago';
  end if;
  return new;
end $$;

create or replace trigger faturas_pago_no_portal before insert or update on public.faturas
  for each row execute function privado.faturas_pago_no_portal();

-- Chamada pelos agentes (banco.situacao_boletos). p_itens: [{numero, competencia?, situacao: 'pago'|'aberto', pago_em?: 'AAAA-MM-DD'}]
-- Uma vez pago no portal, fica pago: o portal às vezes tira o boleto antigo da lista e isso não é "voltou a aberto".
create or replace function public.agente_situacao_boletos(p_token text, p_corretora uuid, p_seguradora text, p_itens jsonb)
returns jsonb language plpgsql security definer set search_path to 'public', 'privado' as $$
declare n_pago integer; n_aberto integer; n_fat integer;
begin
  if not privado.token_agente_ok(p_token) then raise exception 'token inválido'; end if;
  with it as (
    select distinct on (numero) numero, nullif(competencia, '') competencia, situacao, nullif(pago_em, '')::date pago_em
      from jsonb_to_recordset(p_itens) as x(numero text, competencia text, situacao text, pago_em text)
     where numero is not null and situacao in ('pago', 'aberto')
     order by numero, (situacao = 'pago') desc
  )
  insert into public.faturas_situacao_portal as s (corretora_id, seguradora_id, numero, competencia, situacao, visto_em, pago_em)
  select p_corretora, p_seguradora, numero, competencia, situacao, now(),
         case when situacao = 'pago' then coalesce(pago_em, current_date) end
    from it
  on conflict (corretora_id, seguradora_id, numero) do update
     set situacao = case when s.situacao = 'pago' then 'pago' else excluded.situacao end,
         competencia = coalesce(excluded.competencia, s.competencia),
         visto_em = now(),
         pago_em = coalesce(s.pago_em, excluded.pago_em);
  update public.faturas f set pago_no_portal = s.pago_em
    from public.faturas_situacao_portal s
   where s.corretora_id = p_corretora and s.seguradora_id = p_seguradora and s.situacao = 'pago'
     and f.corretora_id = s.corretora_id and f.seguradora_id = s.seguradora_id and f.numero = s.numero
     and f.pago_no_portal is distinct from s.pago_em;
  get diagnostics n_fat = row_count;
  select count(*) filter (where situacao = 'pago'), count(*) filter (where situacao = 'aberto') into n_pago, n_aberto
    from jsonb_to_recordset(p_itens) as x(numero text, situacao text);
  return jsonb_build_object('pagos', n_pago, 'abertos', n_aberto, 'faturas_marcadas', n_fat);
end $$;
revoke all on function public.agente_situacao_boletos(text, uuid, text, jsonb) from public;
grant execute on function public.agente_situacao_boletos(text, uuid, text, jsonb) to anon, authenticated;

-- Carga inicial: o que o agente da Porto já tinha visto pago ao baixar (gravar_porto.py escreve na observação da fatura).
-- Sem data do portal: usa o vencimento como data aproximada.
insert into public.faturas_situacao_portal (corretora_id, seguradora_id, numero, competencia, situacao, pago_em)
select corretora_id, seguradora_id, numero, competencia, 'pago', vencimento
  from public.faturas
 where seguradora_id = 'porto_saude' and observacoes like 'Boleto já pago (botão Boleto desabilitado no portal)%'
on conflict do nothing;
-- Hapvida: gravar_hapvida.py escreve "Portal Empresa: Liquidado" na observação.
insert into public.faturas_situacao_portal (corretora_id, seguradora_id, numero, competencia, situacao, pago_em)
select corretora_id, seguradora_id, numero, competencia, 'pago', vencimento
  from public.faturas
 where seguradora_id = 'hapvida' and observacoes like 'Portal Empresa: Liquidado%'
on conflict do nothing;
update public.faturas f set pago_no_portal = s.pago_em
  from public.faturas_situacao_portal s
 where s.corretora_id = f.corretora_id and s.seguradora_id = f.seguradora_id and s.numero = f.numero
   and s.situacao = 'pago' and f.pago_no_portal is null;
