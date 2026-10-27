-- p24: Projeção e Conferência sem espera. Antes a Projeção esperava o cron da hora cheia (min 7) e a Conferência o de 10 min.
-- Agora agente_fim chama a edge function agente-projecao na hora (pg_net, depois do commit) e a Conferência roda a cada minuto
-- (sem pedido pendente ela não faz nada). Sem drop: mesma assinatura e cron.schedule com o mesmo nome atualiza o job.

create or replace function public.agente_fim(p_token text, p_ordem uuid, p_status text, p_mensagem text default null)
returns void
language plpgsql
security definer
set search_path to 'public', 'privado'
as $function$
declare o ordens_execucao;
begin
  if not privado.token_agente_ok(p_token) then raise exception 'token inválido'; end if;
  update ordens_execucao set status = p_status::status_ordem, mensagem = coalesce(p_mensagem, mensagem),
    terminada_em = case when p_status in ('concluida','erro') then now() else terminada_em end,
    modo = coalesce(modo, case when sessao_url is not null then 'claude' else 'codigo' end)
  where id = p_ordem returning * into o;
  if o.id is not null and p_status = 'concluida' and o.agente in ('comissao', 'faturas')
     and coalesce(o.mensagem, '') not ilike 'nada novo%' then
    if not exists (select 1 from ordens_execucao x where x.agente = 'projecao' and x.status = 'pendente' and x.corretora_id = o.corretora_id) then
      insert into ordens_execucao(corretora_id, agente, competencia, origem, ordem_pai_id, prioridade, mensagem)
      values (o.corretora_id, 'projecao', o.competencia, 'encadeamento', o.id, 2,
              'Depois de ' || case when o.agente = 'comissao' then 'comissão ' else 'faturas ' end || coalesce(o.seguradora_id, ''));
    end if;
    -- chama o agente Projeção na nuvem agora (a mesma chamada do cron agente-projecao); falha aqui não derruba o fim da rodada
    begin
      perform net.http_post(
        url := 'https://hfhsuvgltmjyjivkcopn.supabase.co/functions/v1/agente-projecao',
        headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhmaHN1dmdsdG1qeWppdmtjb3BuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI0Njc1NzgsImV4cCI6MjEwODA0MzU3OH0.ppgKcr0I_iSuiyuw4WR7sxq1_j1-RpTY9qeCQNJEeQ0"}'::jsonb,
        body := '{}'::jsonb,
        timeout_milliseconds := 60000);
    exception when others then null;
    end;
  end if;
  if o.id is not null and p_status = 'concluida' and o.agente in ('faturas', 'vidas', 'comissao')
     and coalesce(o.mensagem, '') not ilike 'nada novo%'
     and not exists (select 1 from ordens_execucao x where x.agente = 'conferencia' and x.status = 'pendente'
                      and x.corretora_id = o.corretora_id and coalesce(x.competencia, '') = coalesce(o.competencia, '')) then
    insert into ordens_execucao(corretora_id, agente, competencia, origem, ordem_pai_id, prioridade, mensagem)
    values (o.corretora_id, 'conferencia', o.competencia, 'encadeamento', o.id, 3,
            'Depois de ' || o.agente || coalesce(' ' || o.seguradora_id, ''));
  end if;
end $function$;

select cron.schedule('agente-conferencia', '* * * * *', 'select public.atender_conferencias()');
