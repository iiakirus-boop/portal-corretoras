# -*- coding: utf-8 -*-
"""Ligação dos agentes com o banco da plataforma (Supabase).

- registra cada rodada na fila do master (aparece em /master/agentes): começo, fim, erro ou "esperando você";
- publica os documentos da Central (os JSON de _painel) na tabela central_docs.

Entra com o token dos agentes, que só alcança estas funções (nada mais do banco).
O token vem da variável de ambiente SHADDAI_AGENTES_TOKEN ou do arquivo .token_agentes nesta pasta.
Sem token ou sem rede, avisa e segue: o agente nunca para por causa do banco.
"""
import json, os, urllib.request, urllib.error

AQUI = os.path.dirname(os.path.abspath(__file__))
URL = 'https://hfhsuvgltmjyjivkcopn.supabase.co/rest/v1/rpc/'
KEY = 'sb_publishable_r3e3m8qmrJ_GMa0qJ6aNfg_8S02HsDj'   # chave pública
CORRETORA = '17e3e5ee-591d-4dbf-8e47-44930ef2941f'          # Shaddai
LOTE = 600_000
SEG = {'porto': 'porto_saude', 'bradesco': 'bradesco_saude', 'amil': 'amil', 'hapvida': 'hapvida', 'sulamerica': 'sulamerica'}


def _token():
    t = os.environ.get('SHADDAI_AGENTES_TOKEN')
    p = os.path.join(AQUI, '.token_agentes')
    if not t and os.path.exists(p):
        t = open(p, encoding='utf-8').read().strip()
    return t or None


def _rpc(funcao, corpo):
    t = _token()
    if not t:
        print('[banco] sem token dos agentes: não registrei no banco.')
        return None
    corpo = dict(corpo, p_token=t)
    req = urllib.request.Request(URL + funcao, data=json.dumps(corpo, ensure_ascii=False).encode(),
                                 headers={'apikey': KEY, 'Authorization': 'Bearer ' + KEY, 'Content-Type': 'application/json'})
    try:
        r = urllib.request.urlopen(req, timeout=90).read()
        return json.loads(r) if r else True
    except urllib.error.HTTPError as e:
        print(f'[banco] {funcao}: erro {e.code} {e.read()[:200].decode(errors="ignore")}')
    except Exception as e:  # sem rede, proxy etc.
        print(f'[banco] {funcao}: sem conexão com o banco ({e.__class__.__name__}).')
    return None


def inicio(agente, seguradora=None, competencia=None, origem='manual', ordem=None, sessao=None, maquina=None, mensagem=None):
    """Abre (ou retoma, se veio da fila) a rodada. Devolve o id da ordem, ou None se não deu para registrar."""
    return _rpc('agente_inicio', dict(p_corretora=CORRETORA, p_agente=agente, p_seguradora=SEG.get(seguradora, seguradora),
                                      p_competencia=competencia, p_origem=origem, p_ordem=ordem,
                                      p_sessao_url=sessao or os.environ.get('CLAUDE_SESSAO_URL'),
                                      p_maquina=maquina or os.environ.get('SHADDAI_MAQUINA', 'PC do Bruno'), p_mensagem=mensagem))


def fim(ordem, status, mensagem=None):
    """status: concluida, erro ou aguardando_voce."""
    if ordem:
        _rpc('agente_fim', dict(p_ordem=ordem, p_status=status, p_mensagem=(mensagem or '')[:500] or None))


def fila():
    """Ordens pendentes (inclusive "rodar agora" do master) e rotinas ligadas."""
    return _rpc('agente_fila', dict(p_corretora=CORRETORA)) or {'ordens': [], 'rotinas': []}


CACHE_CADASTRO = os.path.join(AQUI, '_cadastro.json')
# só para o PC continuar de pé na 1ª vez sem rede (sem _cadastro.json ainda); o cadastro de verdade é o do banco
LOGINS_PADRAO = [
    dict(seguradora='porto_saude', codigo='BA6QXJ', pasta='PortoSaude', porta=9334, uso='ambos'),
    dict(seguradora='bradesco_saude', codigo='Portal', pasta=None, porta=9333, uso='ambos'),
    dict(seguradora='hapvida', codigo='045K', pasta='Hapvida', prefixo_ordem='HAP-', porta=9335, uso='comissao'),
    dict(seguradora='hapvida', codigo='045L', pasta='Hapvida_045L', prefixo_ordem='HAP-', porta=9336, uso='comissao'),
    dict(seguradora='hapvida', codigo='02JZ', pasta='Hapvida_02JZ', prefixo_ordem='HAP-02JZ-', porta=9337, uso='comissao'),
]
_cadastro = None


def cadastro(renovar=False):
    """Cadastro da corretora no banco (master > corretora): logins de cada seguradora e nomes curtos.
    {logins: [{seguradora, codigo, rotulo, pasta, prefixo_ordem, portal_url, porta, uso}],
     nomes: {seguradora: {apólice: nome curto}}, subnomes: {seguradora: {nome no portal: nome curto}}}
    Guarda uma cópia em _cadastro.json (também lida pelos .js e .ps1); sem rede, usa a última cópia."""
    global _cadastro
    if _cadastro is not None and not renovar:
        return _cadastro
    c = _rpc('agente_cadastro', dict(p_corretora=CORRETORA))
    if isinstance(c, dict) and c.get('logins') is not None:
        _portas_livres(c['logins'])
        try:
            with open(CACHE_CADASTRO, 'w', encoding='utf-8') as f:
                json.dump(c, f, ensure_ascii=False, indent=1)
        except OSError:
            pass
    else:
        try:
            c = json.load(open(CACHE_CADASTRO, encoding='utf-8'))
            print('[banco] cadastro: sem resposta do banco, usando a última cópia (_cadastro.json).')
        except (OSError, ValueError):
            c = dict(logins=[dict(x) for x in LOGINS_PADRAO], nomes={}, subnomes={})
            print('[banco] cadastro: sem banco e sem cópia; usando os logins de sempre.')
    _cadastro = c
    return c


def _portas_livres(logins):
    """Login novo sem porta no cadastro ganha a próxima porta livre (9340 em diante), sempre a mesma pela ordem."""
    usadas = {x['porta'] for x in logins if x.get('porta')}
    p = 9340
    for x in logins:
        if not x.get('porta'):
            while p in usadas:
                p += 1
            x['porta'] = p; usadas.add(p)


def logins_de(seguradora, uso=None):
    """Logins ativos de uma seguradora (ex.: 'hapvida', uso 'comissao')."""
    seg = SEG.get(seguradora, seguradora)
    return [x for x in cadastro()['logins'] if x['seguradora'] == seg and (not uso or x.get('uso') in (uso, 'ambos'))]


def nomes_curtos(*seguradoras):
    """(nomes por apólice, nomes por subestipulante) das seguradoras pedidas, juntos."""
    c = cadastro(); n, s = {}, {}
    for seg in seguradoras:
        n.update((c.get('nomes') or {}).get(seg) or {}); s.update((c.get('subnomes') or {}).get(seg) or {})
    return n, s


def _docs_do_painel(arquivos):
    pasta = os.path.join(AQUI, '_painel')
    for f in arquivos:
        d = json.load(open(os.path.join(pasta, f), encoding='utf-8'))
        d = d.get('data', d) if isinstance(d, dict) and set(d) == {'data'} else d
        if f.startswith('fat_'):
            yield 'faturas', f[4:-5], d
        elif f.startswith('com_'):
            yield 'comissoes', f[4:-5], d
        elif f.startswith('vidas_') and f.endswith('.json'):
            for eid, x in d.items():
                yield 'vidas', eid, x
        elif f == 'vidasdist.json':
            for eid, x in d.items():
                yield 'vidasdist', eid, x


def publicar(arquivos):
    """Sobe para a Central do site os arquivos de _painel indicados (só substitui, não duplica)."""
    lote, tam, total = [], 0, 0
    for col, did, d in _docs_do_painel(arquivos):
        item = {'col': col, 'id': did, 'dados': d}
        n = len(json.dumps(item, ensure_ascii=False).encode())
        if lote and tam + n > LOTE:
            total += _rpc('central_lote', dict(p_corretora=CORRETORA, p_docs=lote)) or 0; lote, tam = [], 0
        lote.append(item); tam += n
    if lote:
        total += _rpc('central_lote', dict(p_corretora=CORRETORA, p_docs=lote)) or 0
    print(f'[banco] Central do site: {total} documento(s) atualizados.')
    return total


def logins(lista, maquina=None):
    """Estado dos logins dos portais para o master (Logins nas seguradoras): [{seguradora, codigo, ativa, obs}]."""
    return _rpc('agente_logins', dict(p_corretora=CORRETORA, p_maquina=maquina or os.environ.get('SHADDAI_MAQUINA', 'PC do Bruno'),
                                      p_logins=lista))


def situacao_boletos(seguradora, itens):
    """Situação do boleto lida no portal (Porto, Hapvida): [{numero, competencia, situacao: 'pago'|'aberto', pago_em}].
    O site mostra "Pago no portal" a partir disto (tabela faturas_situacao_portal e faturas.pago_no_portal). Sem rede, só avisa."""
    itens = [i for i in itens if i.get('numero') and i.get('situacao') in ('pago', 'aberto')]
    if not itens:
        return None
    r = _rpc('agente_situacao_boletos', dict(p_corretora=CORRETORA, p_seguradora=SEG.get(seguradora, seguradora), p_itens=itens))
    if isinstance(r, dict):
        print(f"[banco] boletos {seguradora}: {r.get('pagos', 0)} pago(s) e {r.get('abertos', 0)} em aberto no portal; "
              f"{r.get('faturas_marcadas', 0)} fatura(s) marcadas como pagas no site.")
    return r


def situacao_do_download(op, saida):
    """Tira a situação dos boletos da saída do baixar_<op>.js e manda ao banco (Porto: faturas do mês + tarefa situacao)."""
    if op != 'porto' or not isinstance(saida, dict):
        return None
    itens = [dict(numero=str(f['titulo']), competencia=f.get('comp'), situacao=f.get('boleto'))
             for f in (saida.get('faturas') or []) + (saida.get('situacao') or []) if f.get('titulo')]
    return situacao_boletos('porto', itens)


def situacao_hapvida(portal_json):
    """Hapvida: status de cada boleto no JSON da coleta do Portal Empresa (Liquidado = pago)."""
    P = json.load(open(portal_json, encoding='utf-8'))
    def iso(d):
        d = str(d or '')
        return f'{d[6:10]}-{d[3:5]}-{d[0:2]}' if len(d) >= 10 and d[2] == '/' else (d[:10] or None)
    vistos, itens = set(), []
    lista = P.get('situacoes') or [dict(f, contrato=c.get('contrato')) for c in P.get('contratos', []) for f in c.get('faturas', [])]
    for f in lista:
        n = str(f.get('billingNumber') or '')
        if not n or n in vistos or 'COPARTIC' in str(f.get('billType') or '').upper():
            continue
        vistos.add(n)
        pago = 'LIQUID' in str(f.get('status') or '').upper()
        pg = f.get('paymentDate') or f.get('paidDate') or f.get('payDate')
        itens.append(dict(numero=n, competencia=(iso(f.get('dueDate')) or '')[:7] or None, situacao='pago' if pago else 'aberto',
                          pago_em=iso(pg) if pago and pg else None))
    return situacao_boletos('hapvida', itens)
