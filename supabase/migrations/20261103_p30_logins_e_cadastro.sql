-- p30: cadastro dos logins e dos nomes curtos sai do código dos agentes e vem do banco.
-- Sem DROP: só acrescenta colunas e cria uma função nova.
--
-- corretora_codigos já guarda um login por linha (Hapvida tem 045K, 045L e 02JZ). Agora também diz:
--   porta_pc : porta do Chrome que o atalho "Entrar na <seguradora>" abre no PC para esse login (o vigia confere nela);
--   uso      : 'comissao', 'faturas' ou 'ambos' (Hapvida: os logins do webhap são de comissão).
-- Login novo: basta uma linha nova aqui (o vigia escolhe a próxima porta livre quando porta_pc fica vazia).
-- A senha nunca fica no banco: continua no cofre do Windows do PC (ou nos segredos da nuvem).

alter table public.corretora_codigos add column if not exists porta_pc integer;
alter table public.corretora_codigos add column if not exists uso text not null default 'ambos';

update public.corretora_codigos set porta_pc = 9334 where seguradora_id = 'porto_saude' and codigo = 'BA6QXJ' and porta_pc is null;
update public.corretora_codigos set porta_pc = 9333 where seguradora_id = 'bradesco_saude' and codigo = 'Portal' and porta_pc is null;
update public.corretora_codigos set porta_pc = 9335, uso = 'comissao' where seguradora_id = 'hapvida' and codigo = '045K' and porta_pc is null;
update public.corretora_codigos set porta_pc = 9336, uso = 'comissao' where seguradora_id = 'hapvida' and codigo = '045L' and porta_pc is null;
update public.corretora_codigos set porta_pc = 9337, uso = 'comissao' where seguradora_id = 'hapvida' and codigo = '02JZ' and porta_pc is null;

-- Tudo o que o PC precisa do cadastro numa chamada só (com o token dos agentes):
--   logins: um por login ativo; nomes: nome curto por apólice/estipulante; subnomes: nome curto por nome da subestipulante no portal.
create or replace function public.agente_cadastro(p_token text, p_corretora uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'privado'
as $$
begin
  if not privado.token_agente_ok(p_token) then raise exception 'token inválido'; end if;
  return jsonb_build_object(
    'logins', coalesce((select jsonb_agg(jsonb_build_object(
                 'seguradora', c.seguradora_id, 'codigo', c.codigo, 'rotulo', c.rotulo, 'pasta', c.pasta_arquivos,
                 'prefixo_ordem', c.prefixo_ordem, 'portal_url', c.portal_url, 'porta', c.porta_pc, 'uso', c.uso)
                 order by c.seguradora_id, c.porta_pc nulls last, c.codigo)
               from corretora_codigos c where c.corretora_id = p_corretora and c.ativo), '[]'::jsonb),
    -- por seguradora: { "bradesco_saude": { "<apólice ou cód. estipulante>": "<nome curto>" } }
    'nomes', coalesce((select jsonb_object_agg(y.seguradora_id, y.m) from (
                 select x.seguradora_id, jsonb_object_agg(x.chave, x.nome_curto) m from (
                   select distinct on (a.seguradora_id, k.chave) a.seguradora_id, k.chave, e.nome_curto
                     from apolices a join empresas e on e.id = a.empresa_id
                     cross join lateral (values (a.apolice), (a.codigo_estipulante)) k(chave)
                    where a.corretora_id = p_corretora and k.chave is not null and coalesce(e.nome_curto, '') <> ''
                    order by a.seguradora_id, k.chave, a.ativa desc) x group by x.seguradora_id) y), '{}'::jsonb),
    -- por seguradora: { "bradesco_saude": { "<nome da subestipulante no portal>": "<nome curto>" } }
    'subnomes', coalesce((select jsonb_object_agg(y.seguradora_id, y.m) from (
                 select x.seguradora_id, jsonb_object_agg(x.nome_portal, x.nome_curto) m from (
                   select distinct on (a.seguradora_id, s.nome_portal) a.seguradora_id, s.nome_portal, s.nome_curto
                     from subestipulantes s join apolices a on a.id = s.apolice_id
                    where s.corretora_id = p_corretora and coalesce(s.nome_portal, '') <> '' and coalesce(s.nome_curto, '') <> ''
                    order by a.seguradora_id, s.nome_portal, s.ativa desc) x group by x.seguradora_id) y), '{}'::jsonb));
end $$;

revoke all on function public.agente_cadastro(text, uuid) from public;
grant execute on function public.agente_cadastro(text, uuid) to anon, authenticated;
