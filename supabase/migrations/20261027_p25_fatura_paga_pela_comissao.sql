-- p25: comissão caiu → boleto da empresa foi pago. Quando um lançamento de comissão (vitalício ou agenciamento, valor positivo)
-- aponta para uma fatura sem baixa, a fatura ganha pago_pela_comissao = data do lançamento. data_pagamento continua sendo só a
-- baixa real da seguradora (Bradesco). Roda sozinho a cada carga de faturas ou de comissões (gatilho por comando). Sem drop.

alter table faturas add column if not exists pago_pela_comissao date;

create or replace function public.marcar_faturas_pagas()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare n integer;
begin
  update faturas f set pago_pela_comissao = c.primeira
    from (select l.fatura_id, min(l.data_lancamento) primeira from comissao_lancamentos l
           where l.fatura_id is not null and l.comissao > 0 and l.classe in ('vitalicio', 'agenciamento')
           group by l.fatura_id) c
   where f.id = c.fatura_id and f.data_pagamento is null and f.pago_pela_comissao is null;
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.tg_marcar_faturas_pagas()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if pg_trigger_depth() = 1 then perform marcar_faturas_pagas(); end if;
  return null;
end $$;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'marcar_pagas_lancamentos') then
    create trigger marcar_pagas_lancamentos after insert or update on comissao_lancamentos
      for each statement execute function tg_marcar_faturas_pagas();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'marcar_pagas_faturas') then
    create trigger marcar_pagas_faturas after insert or update on faturas
      for each statement execute function tg_marcar_faturas_pagas();
  end if;
end $$;

revoke all on function public.marcar_faturas_pagas() from public, anon, authenticated;

select marcar_faturas_pagas();
