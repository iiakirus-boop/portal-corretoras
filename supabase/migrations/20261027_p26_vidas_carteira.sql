-- p26: vidas da carteira deixam de ser "só a competência mais nova". A base é o último mês fechado (o mês antes da competência
-- mais nova da corretora; hoje out/26, porque os boletos de nov/26 estão saindo). Cada contrato (empresa, seguradora, apólice)
-- conta pela competência mais recente dele, desde que seja da base em diante: quem já tem o boleto novo conta o boleto novo,
-- quem ainda não tem continua com as vidas do último faturamento (não cai para zero nem diminui). Se o boleto novo veio sem a
-- contagem de vidas, vale a última competência que tem contagem. Por cima disso entram os pedidos concluídos de inclusão (+1) e
-- exclusão (−1) depois da última fatura gravada. Usada nas telas do master, da corretora e na cobrança da plataforma. Sem drop.

create or replace view public.vidas_carteira with (security_invoker = true) as
with teto as (
  -- ignora competência digitada errada no futuro (mais de um mês à frente)
  select to_char(now() - interval '3 hours' + interval '1 month', 'YYYY-MM') as mx
), mes as (
  select f.corretora_id, f.empresa_id, f.seguradora_id, f.apolice_id, f.competencia,
         sum(f.vidas_informadas)::integer as vidas,
         max(coalesce(f.processado_em, to_date(f.competencia, 'YYYY-MM')::timestamptz)) as gravada_em
    from faturas f, teto t
   where f.competencia <= t.mx
   group by 1, 2, 3, 4, 5
), base as (
  select corretora_id, to_char(to_date(max(competencia), 'YYYY-MM') - interval '1 month', 'YYYY-MM') as base
    from mes group by 1
), contrato as (
  select distinct on (m.corretora_id, m.empresa_id, m.seguradora_id, m.apolice_id) m.*, b.base
    from mes m join base b on b.corretora_id = m.corretora_id
   where m.competencia >= b.base
   order by m.corretora_id, m.empresa_id, m.seguradora_id, m.apolice_id, (m.vidas is not null) desc, m.competencia desc
), fat as (
  select corretora_id, empresa_id, seguradora_id, base,
         max(competencia)::text as competencia,
         sum(coalesce(vidas, 0))::integer as vidas_faturadas,
         max(gravada_em) as gravada_em
    from contrato
   group by 1, 2, 3, 4
), mov as (
  select p.corretora_id, p.empresa_id, a.seguradora_id,
         count(*) filter (where p.tipo = 'inclusao')::integer as inclusoes,
         count(*) filter (where p.tipo = 'exclusao')::integer as exclusoes
    from pedidos p
    left join apolices a on a.id = p.apolice_id
   where p.status = 'concluido' and p.tipo in ('inclusao', 'exclusao')
     and p.atualizado_em > coalesce((select max(x.gravada_em) from fat x
                                      where x.empresa_id = p.empresa_id and (a.seguradora_id is null or x.seguradora_id = a.seguradora_id)),
                                    '-infinity'::timestamptz)
   group by 1, 2, 3
)
select coalesce(f.corretora_id, m.corretora_id) as corretora_id,
       coalesce(f.empresa_id, m.empresa_id) as empresa_id,
       coalesce(f.seguradora_id, m.seguradora_id) as seguradora_id,
       f.competencia,
       coalesce(f.base, b.base, to_char(now() - interval '3 hours', 'YYYY-MM')) as base,
       coalesce(f.vidas_faturadas, 0) as vidas_faturadas,
       coalesce(m.inclusoes, 0) as inclusoes,
       coalesce(m.exclusoes, 0) as exclusoes,
       greatest(0, coalesce(f.vidas_faturadas, 0) + coalesce(m.inclusoes, 0) - coalesce(m.exclusoes, 0))::integer as vidas
  from fat f
  full join mov m on m.empresa_id = f.empresa_id and m.seguradora_id = f.seguradora_id
  left join base b on b.corretora_id = m.corretora_id;

grant select on public.vidas_carteira to authenticated;
