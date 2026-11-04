# -*- coding: utf-8 -*-
"""Grava direto no banco do portal (Supabase) o que os agentes leram. O banco é a base principal; a planilha
Base_Faturas_Vidas.xlsx vira só uma cópia para consulta (o gravar_<op>.py continua rodando depois, se der).

Uso (dentro de FATURAS\\Scripts, no PC ou na nuvem):
  python gravar_banco.py faturas <porto|bradesco|hapvida> <json do faturas_<op>.py>
  python gravar_banco.py comissao <porto|bradesco> <arquivos...> [--comp AAAA-MM]

- Lê o MESMO JSON que o gravar_<op>.py recebe (ou os mesmos arquivos de comissão) e manda para as funções
  agente_gravar_faturas / agente_gravar_comissao do banco, com o token dos agentes (banco.py).
- Empresa, apólice e subestipulante são achadas pelo cadastro do banco (código da sub, apólice/estipulante,
  contrato ou CNPJ), sem planilha. O que não tiver cadastro volta em "pendencias" e não é gravado.
- Fatura excluída no master não é gravada de novo. Fatura já existente é atualizada (mesmo número no mês).
- Imprime uma linha JSON no fim: {gravadas, atualizadas, vidas, excluidas, pendencias} (comissão: {ordens, lancamentos,
  sem_empresa}). Código de saída 1 se o banco não respondeu (sem rede, sem token ou erro): quem chamou decide.
"""
import json, os, re, sys, datetime
import banco

LOTE = 400_000  # bytes por chamada (o banco corta pedidos grandes demais)
SEG = {'porto': 'porto_saude', 'bradesco': 'bradesco_saude', 'hapvida': 'hapvida'}


def iso(x):
    if not x:
        return None
    if isinstance(x, (datetime.date, datetime.datetime)):
        return x.strftime('%Y-%m-%d')
    s = str(x)
    m = re.match(r'(\d\d)/(\d\d)/(\d{4})$', s)
    return f'{m.group(3)}-{m.group(2)}-{m.group(1)}' if m else s[:10]


def r2(v):
    return round(float(v), 2) if isinstance(v, (int, float)) else None


def _enviar(funcao, seguradora, chave, itens, campo):
    """Manda em lotes e soma as respostas. Devolve o total ou None se algum lote falhou."""
    tot, lote, tam = {}, [], 0

    def manda(lote):
        for tentativa in range(3):  # sem resposta: tenta de novo (o banco às vezes demora)
            r = banco._rpc(funcao, {'p_corretora': banco.CORRETORA, 'p_seguradora': seguradora, chave: lote})
            if r is not None:
                return r
        return None

    ok = True
    for it in itens:
        n = len(json.dumps(it, ensure_ascii=False, default=str).encode())
        if lote and tam + n > LOTE:
            r = manda(lote); ok &= r is not None; _somar(tot, r); lote, tam = [], 0
        lote.append(it); tam += n
    if lote:
        r = manda(lote); ok &= r is not None; _somar(tot, r)
    return tot if ok else None


def _somar(tot, r):
    for k, v in (r or {}).items():
        if isinstance(v, list):
            tot.setdefault(k, []).extend(v)
        elif isinstance(v, (int, float)):
            tot[k] = tot.get(k, 0) + v


# ---------------------------------------------------------------- faturas: Porto
def faturas_porto(js):
    out = []
    for f in json.load(open(js, encoding='utf-8')):
        if f.get('tipo') != 'fatura':
            continue
        b = f.get('boleto') or {}
        subs = sorted({t['sub'] for t in f.get('txts', [])})
        obs = [f'Layout {f.get("layout")}. Gravado direto no banco pelo agente.']
        if not b:
            obs.append('Boleto já pago (botão Boleto desabilitado no portal).')
        if len(subs) > 1:
            obs.append(f'Fatura única do grupo: {len(subs)} subestipulantes no mesmo título.')
        obs += f.get('avisos', [])
        vidas = []
        for v in f.get('vidas_linhas', []):
            cop = round(sum((v.get('copart') or {}).values()) + (v.get('despesas') or 0), 2)
            vidas.append(dict(familia=v.get('seguro'), dependente_num=v.get('dep'), nome=v.get('nome'), cpf=v.get('cpf'),
                              idade=v.get('idade'), parentesco=v.get('parentesco'), titular=bool(v.get('titular')),
                              plano_codigo=v.get('cod_plano'), plano=v.get('plano'), matricula=v.get('matricula'),
                              situacao=v.get('situacao'), adesao=v.get('adesao'), exclusao=v.get('exclusao'),
                              premio_base=v.get('premio_base'), pro_rata=v.get('prorata'), copart_total=cop,
                              valor_total=v.get('valor_premio'), subestipulante=v.get('sub'),
                              movimento='Exclusão' if v.get('situacao') == 'Excluído' else ('Inclusão (pró-rata)' if (v.get('prorata') or 0) > 0 else None)))
        cob = f.get('cob') or (None, None)
        out.append(dict(
            numero=f['titulo'], competencia=f['comp'], seguradora='porto_odonto' if f.get('produto') == 'Porto Odonto' else 'porto_saude',
            emissao=f.get('emissao'), vencimento=f.get('venc'), cobertura_inicio=cob[0], cobertura_fim=cob[1],
            valor_total=f.get('total'), valor_boleto=b.get('valor'), vidas_informadas=f.get('vidas'),
            nosso_numero=b.get('nosso'), linha_digitavel=b.get('linha'), observacoes=' '.join(obs),
            cadastro=dict(estipulante=str(int(f['estipulante'])) if f.get('estipulante') else None, apolice=f.get('apolice'),
                          sub=f.get('sub'), unidade=f.get('unidade'), cnpj=b.get('cnpj')),
            vidas=vidas if f.get('txts') else None))
    return out


# ---------------------------------------------------------------- faturas: Bradesco
def faturas_bradesco(js):
    from gravar_bradesco import excluido, PAREN as PAR_B, operadora
    out = []
    for f in json.load(open(js, encoding='utf-8')):
        c, b = f.get('cab') or {}, f.get('boleto') or {}
        if not c or not b.get('end_fatura'):
            continue
        subs = sorted(f.get('subfaturas') or {})
        obs = ['Origem: PDF (fatura técnica + boleto no mesmo arquivo). Gravado direto no banco pelo agente.']
        if len(subs) > 1:
            obs.append(f'{len(subs)} subfaturas no mesmo boleto ({", ".join(subs)}).')
        if b.get('debito_automatico'):
            obs.append(b['debito_automatico'] + '.')
        obs += f.get('avisos', [])[:5]
        pessoas = {}
        for v in f.get('vidas', []):
            pessoas.setdefault((v['sub'], v['cert'], v['dep']), []).append(v)
        cop = {}
        for x in f.get('copart', []):
            k = (x['sub'], x['cert'], x['dep']); cop[k] = cop.get(k, 0) + x['part']
        ini = iso(b.get('vig_ini')) or c['competencia'] + '-01'
        vidas = []
        for k, ls in pessoas.items():
            v0 = ls[0]
            nasc = iso(v0.get('nasc'))
            idade = None
            if nasc:
                a, n = datetime.date.fromisoformat(ini), datetime.date.fromisoformat(nasc)
                idade = a.year - n.year - ((a.month, a.day) < (n.month, n.day))
            planos = list(dict.fromkeys(x['plano'] for x in ls))
            base = round(sum(x['valor'] for x in ls if not x['mov']), 2)
            pr = round(sum(x['valor'] for x in ls if x['mov']), 2)
            cp = round(cop.get(k, 0), 2)
            exc = excluido(ls)
            vidas.append(dict(familia=v0['cert'], dependente_num=int(v0['dep']) + 1, nome=v0['nome'], nascimento=nasc, idade=idade,
                              sexo=(v0.get('sexo') or None) and v0['sexo'][:1],
                              parentesco='Titular' if v0['dep'] == '00' else PAR_B.get(v0.get('paren') or '', v0.get('paren') or 'Dependente'),
                              titular=v0['dep'] == '00', plano_codigo=' / '.join(planos) or None,
                              plano=(operadora(f) + ' ' + ' / '.join(planos)) if planos else None,
                              situacao='Excluído' if exc else 'Ativo', adesao=min((iso(x['inicio']) for x in ls if x.get('inicio')), default=None),
                              premio_base=base, pro_rata=pr, copart_total=cp, valor_total=round(base + pr + cp, 2),
                              subestipulante=k[0], movimento='Exclusão' if exc else ('Inclusão (pró-rata)' if pr > 0 else None)))
        out.append(dict(
            numero=b['end_fatura'], competencia=c['competencia'],
            seguradora='bradesco_dental' if c.get('produto') == 'DENTAL' else 'bradesco_saude',
            emissao=iso(c.get('emissao')), vencimento=iso(b.get('vencimento')), cobertura_inicio=iso(b.get('vig_ini')),
            cobertura_fim=iso(b.get('vig_fim')), valor_total=f.get('total_fatura'), valor_boleto=b.get('valor'),
            vidas_informadas=f.get('vidas_informadas'), nosso_numero=b.get('nosso_numero') or None,
            linha_digitavel=b.get('linha_digitavel') or None, observacoes=' '.join(obs),
            cadastro=dict(apolice=c.get('apolice'), estipulante=c.get('apolice'), sub=subs[0] if len(subs) == 1 else None,
                          cnpj=b.get('cnpj_pagador')),
            vidas=vidas))
    return out


# ---------------------------------------------------------------- faturas: Hapvida
def faturas_hapvida(js):
    import gravar_hapvida as G
    docs = json.load(open(js, encoding='utf-8'))
    fats, info = G.preparar(docs, [], set())
    out = []
    for f in fats:
        if not f.get('venc'):
            continue
        per = f.get('periodo') or (None, None)
        vidas = []
        for x in f['linhas']:
            par = (x.get('parentesco') or '').upper()
            tit = par == 'TITULAR' or (not par and x.get('dep') == '00')
            vidas.append(dict(familia=x.get('familia'), dependente_num=int(x['dep']) if str(x.get('dep') or '').isdigit() else None,
                              nome=x.get('nome'), cpf=x.get('cpf') or None, nascimento=iso(x.get('nasc')), idade=x.get('idade'),
                              parentesco=G.PAREN.get(par, par.title() if par else ('Titular' if tit else None)), titular=tit,
                              plano_codigo=x.get('plano_cod'), plano=x.get('plano') or x.get('plano_cod'), matricula=x.get('mat'),
                              situacao='Ativo', adesao=iso(x.get('inicio')), premio_base=x.get('valor'), pro_rata=0, copart_total=0,
                              valor_total=x.get('valor'), subestipulante=x.get('empresa'),
                              observacoes=f'Credencial {x.get("cod")}' if x.get('cod') else None))
        obs = ['Gravado direto no banco pelo agente.', f'Vidas lidas do {f["fonte"]}.' if f['linhas'] else 'Sem relação de vidas (só boleto).']
        if f.get('portal'):
            obs.insert(0, f'Portal Empresa: {f["portal"].get("status")} ({f["portal"].get("tipo_fatura")}).')
        out.append(dict(
            numero=f['nf'], competencia=f['comp'], seguradora='hapvida', emissao=iso(f.get('emissao')), vencimento=iso(f.get('venc')),
            cobertura_inicio=iso(per[0]), cobertura_fim=iso(per[1]), valor_total=f.get('valor'), valor_boleto=f.get('boleto_valor'),
            vidas_informadas=len(f['linhas']) or None, nosso_numero=f.get('nosso'), linha_digitavel=f.get('linha'),
            observacoes=' '.join(obs),
            cadastro=dict(contrato=f['principal'], estipulante=f['principal'], sub=f['principal'], cnpj=f.get('cnpj')),
            vidas=vidas if f['linhas'] else None))
    return out


FATURAS = {'porto': faturas_porto, 'bradesco': faturas_bradesco, 'hapvida': faturas_hapvida}


def gravar_faturas(op, js):
    itens = FATURAS[op](js)
    # cada seguradora (Porto Saúde × Odonto, Bradesco Saúde × Dental) é mandada separada: o rpc procura o cadastro nela
    tot = {'lidas': len(itens)}
    for seg in sorted({i['seguradora'] for i in itens}):
        r = _enviar('agente_gravar_faturas', seg, 'p_faturas', [i for i in itens if i['seguradora'] == seg], 'faturas')
        if r is None:
            return None
        _somar(tot, r)
    return tot


# ---------------------------------------------------------------- comissão
def classe(taxa, tipo=''):
    if (tipo or '').startswith('AN') or (taxa or 0) > 50:
        return 'agenciamento'
    if (tipo or '').startswith('226'):
        return 'bonus'
    return 'vitalicio' if (taxa or 0) <= 10 else 'outros'


def comissao_porto(arquivos, comp):
    from comissao_porto import ler_analitico, codigo_estipulante
    out = []
    for p in arquivos:
        cab, lanc, deb, tot = ler_analitico(p)
        if 'GERAIS' in (cab.get('empresa') or '').upper():
            continue  # Porto Seguros Gerais (auto/residencial) não é plano de saúde
        dt = datetime.datetime.strptime(cab['data_pg'], '%d/%m/%Y').date()
        out.append(dict(
            ordem=cab['op'], competencia=comp or dt.strftime('%Y-%m'), data_pagamento=dt.isoformat(),
            bruta=tot['bruta'], inss=tot['inss'], irrf=tot['irrf'], iss=tot['iss'], liquido=tot['liquido'],
            debito_credito=tot['debcred'], a_pagar=tot['apagar'],
            descricao_debitos='; '.join(f"{d['desc']} ({d['valor']:.2f})".replace('.', ',') for d in deb) or None,
            observacoes=f'Seguradora no extrato: {cab.get("empresa")}; Arquivo: {os.path.basename(p)}; gravado direto no banco pelo agente.',
            lancamentos=[dict(segurado=l['hist'], codigo_estipulante=codigo_estipulante(l) or None, apolice=l['apl'],
                              numero_fatura=l['fat'] or None, parcela=int(l['parc']) if l['parc'].isdigit() else None,
                              data_lancamento=l['data'], premio_liquido=l['premio'], taxa=l['taxa'], comissao=l['comissao'],
                              tipo_original=l['tipo'], classe=classe(l['taxa'], l['tipo']),
                              observacoes='Porto Odonto' if l['ramo'] == '96' else None) for l in lanc]))
    return out


def comissao_bradesco(arquivos, comp):
    from comissao_bradesco import ler_xls, TIPOS
    por = {}
    for p in arquivos:
        for l in ler_xls(p):
            por.setdefault(l['op'], []).append(l)
    out = []
    for op, ls in por.items():
        dt = min(l['data'] for l in ls)
        dt = dt.date() if isinstance(dt, datetime.datetime) else dt
        lanc = []
        for l in ls:
            # o extrato traz só o endosso; a fatura é sucursal + 3 + endosso (o rpc acha pelo número)
            fat = f"{l['suc']}3{int(l['endosso']):05d}" if l['endosso'].isdigit() else None
            lanc.append(dict(segurado=l['segurado'], codigo_estipulante=l['apolice'], apolice=l['apolice'], numero_fatura=fat,
                             parcela=int(l['parcela']) if l['parcela'].isdigit() else None, data_lancamento=iso(l['data']),
                             premio_liquido=l['premio'], taxa=l['taxa'], comissao=l['valor'], tipo_original=TIPOS.get(l['tipo'], l['tipo']),
                             classe=classe(l['taxa'], l['tipo']), observacoes=f"sub {l['sub']}, endosso {l['endosso']}"))
        out.append(dict(ordem=op, competencia=comp or dt.strftime('%Y-%m'), data_pagamento=dt.isoformat(),
                        bruta=round(sum(l['valor'] for l in ls), 2),
                        observacoes='Extrato Bradesco (.xls) não traz tributações nem crédito líquido; gravado direto no banco pelo agente.',
                        lancamentos=lanc))
    return out


COMISSAO = {'porto': comissao_porto, 'bradesco': comissao_bradesco}


def gravar_comissao(op, arquivos, comp=None):
    ordens = COMISSAO[op](arquivos, comp)
    r = _enviar('agente_gravar_comissao', SEG[op], 'p_ordens', ordens, 'ordens')
    if r is None:
        return None
    r['lidas'] = len(ordens)
    return r


def main():
    a = sys.argv[1:]
    comp = None
    if '--comp' in a:
        i = a.index('--comp'); comp = a[i + 1]; del a[i:i + 2]
    if len(a) < 3 or a[0] not in ('faturas', 'comissao') or a[1] not in (FATURAS if a[0] == 'faturas' else COMISSAO):
        print(__doc__); return 2
    if not banco._token():
        print(json.dumps({'erro': 'sem o token dos agentes: nada gravado no banco'}, ensure_ascii=False)); return 1
    if a[0] == 'faturas':
        r = gravar_faturas(a[1], a[2])
    else:
        arqs = []
        for p in a[2:]:
            arqs += sorted(os.path.join(p, f) for f in os.listdir(p) if not f.startswith('~')) if os.path.isdir(p) else [p]
        r = gravar_comissao(a[1], arqs, comp)
    if r is None:
        print(json.dumps({'erro': 'o banco não respondeu: nada ou só parte foi gravada'}, ensure_ascii=False)); return 1
    for p in r.get('pendencias', [])[:20]:
        print(f"  pendência: fatura {p.get('numero')} ({p.get('competencia')}): {p.get('motivo')} {json.dumps(p.get('cadastro'), ensure_ascii=False)}")
    print(json.dumps(r, ensure_ascii=False))
    return 0


if __name__ == '__main__':
    sys.exit(main())
