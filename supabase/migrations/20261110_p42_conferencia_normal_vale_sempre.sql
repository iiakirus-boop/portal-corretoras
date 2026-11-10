-- p42: "Comissão sem empresa" marcada como normal vale para os meses seguintes.
-- Antes, o mesmo nome voltava como aviso novo a cada competência. Agora, se o master já marcou aquele
-- nome (mesma seguradora) como normal em qualquer mês, a Conferência não cria o aviso de novo.
-- A função conferir é longa: em vez de repetir tudo, troca só o trecho (não roda duas vezes).
do $$
declare v_def text; v_velho text := 'from l where empresa_id is null group by seguradora_id, segurado';
begin
  select pg_get_functiondef('public.conferir(uuid,character,uuid)'::regprocedure) into v_def;
  if position('ja_normal' in v_def) > 0 then return; end if;
  if position(v_velho in v_def) = 0 then raise exception 'trecho da conferir não encontrado'; end if;
  v_def := replace(v_def, v_velho,
    'from l where empresa_id is null
        and not exists (select 1 from conferencias ja_normal where ja_normal.corretora_id = p_corretora
                          and ja_normal.tipo = ''comissao_sem_empresa'' and ja_normal.ignorada_em is not null
                          and ja_normal.chave = l.seguradora_id || ''|'' || coalesce(l.segurado, ''''))
      group by seguradora_id, segurado');
  execute v_def;
end $$;
