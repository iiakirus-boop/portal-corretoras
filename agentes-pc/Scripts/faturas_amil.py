# -*- coding: utf-8 -*-
"""Agente Faturas Amil - leitura.
Lê a pasta de faturamentos Amil (PDFs "Demonstrativo Analítico de Faturamento", boletos/NFS-e,
demonstrativos de coparticipação e TXT com delimitador #) e gera um JSON para gravar_amil.py.
Uso: python3 faturas_amil.py <pasta AMIL> <saida.json>
A Amil/Santa Helena não manda arquivo de vidas separado: a relação vem no próprio demonstrativo.
"""
import os, re, sys, json, subprocess
from collections import defaultdict

NUM = r'-?[\d.]+,\d\d-?'

def n(s):
    s = s.strip(); neg = s.endswith('-') or s.startswith('-')
    v = float(s.strip('-').replace('.', '').replace(',', '.'))
    return -v if neg else v

def iso(d):
    return f'{d[6:10]}-{d[3:5]}-{d[0:2]}' if d else None

def txt(p, raw=False):
    return subprocess.run(['pdftotext'] + ([] if raw else ['-layout']) + [p, '-'], capture_output=True, text=True).stdout

def cls_rubrica(r):
    r0 = r.lower()
    if r0.startswith('mens'): return 'base'
    if 'co-particip' in r0 or 'coparticip' in r0: return 'copart'
    return 'mov'

LINHA = re.compile(r'^\s*(\d{9})\s+(.*?)\s+([TDA])\s+(\d{1,3})\s*(.*?)\s*(\d\d/\d\d/\d{4})(?:\s+(\d\d/\d\d/\d{4}))?\s+(.+?)\s+(' + NUM + r')(?:\s+(' + NUM + r'))?\s*$')


def cpf_ok(c):
    if len(c) != 11 or c == c[0] * 11: return False
    for k in (9, 10):
        s = sum(int(c[i]) * (k + 1 - i) for i in range(k)); dv = (s * 10) % 11 % 10
        if dv != int(c[k]): return False
    return True


def quebrar(pre):
    """Separa nome, matrícula, CPF e plano do trecho antes do Tp."""
    ch = re.split(r'\s{2,}', pre.strip())
    plano = ch.pop() if len(ch) > 1 else ''
    nome, mat, cpf = ch[0] if ch else '', None, None
    m = re.match(r'^(.*?[^\d\s])\s*(\d+)$', nome)
    if m: nome, mat = m.group(1).strip(), m.group(2)
    dig = []
    for x in ch[1:]:
        x2 = x.replace(' ', '')
        if x2.isdigit(): dig.append(x2)
        else: nome += ' ' + x
    val = [k for k, x in enumerate(dig) if len(x) == 11 and cpf_ok(x)]
    if val:
        k = val[-1]; cpf = dig.pop(k)
    else:
        for k, x in enumerate(dig):
            if len(x) > 11 and cpf_ok(x[-11:]): cpf = x[-11:]; dig[k] = x[:-11]; break
            if len(x) > 11 and cpf_ok(x[:11]): cpf = x[:11]; dig[k] = x[11:]; break
        else:
            onze = [k for k, x in enumerate(dig) if len(x) == 11]
            if onze: cpf = dig.pop(onze[-1])
    dig = [x for x in dig if x]
    if dig: mat = ' '.join(([mat] if mat else []) + dig)
    if not plano and not cpf:
        plano = nome; nome = ''
    return nome.strip(), mat, cpf, plano.strip()


def split_nome(s):
    m = re.match(r'^(.*?)\s+(\d[\w]*)$', s.strip())
    return (m.group(1).strip(), m.group(2)) if m else (s.strip(), None)

def ler_fatura(p):
    t = txt(p)
    d = dict(tipo='fatura', arquivo=p, contratos={}, linhas=[], erros=[])
    m = re.search(r'Operadora:\s*(\S+)', t); d['operadora'] = m.group(1) if m else None
    m = re.search(r'Mensalidade\s*-\s*(\d\d)/(\d{4})', t); d['ref'] = f'{m.group(2)}-{m.group(1)}' if m else None
    m = re.search(r'Emissão:\s*(\d\d/\d\d/\d{4})', t); d['emissao_rel'] = iso(m.group(1)) if m else None
    cur = None
    for l in t.splitlines():
        m = re.match(r'\s*Contrato\s+(\d{10})\s*-\s*(.*)$', l)
        if m:
            cur = m.group(1); d['contratos'].setdefault(cur, dict(nome=m.group(2).strip())); continue
        m = re.match(r'\s*N\. Fiscal\s+(\d+)\s+Emissão\s+(\S+)\s+Vencimento\s+(\S+)', l)
        if m and cur:
            d['contratos'][cur].update(nf=m.group(1), emissao=iso(m.group(2)), venc=iso(m.group(3))); continue
        m = re.match(r'\s*Total Contrato\s+(\d+)\s+Titulares:\s*(\d+)\s+Dependentes:\s*(\d+)\s+Agregados:\s*(\d+).*Valor:\s*(' + NUM + ')', l)
        if m and cur:
            d['contratos'][cur].update(vidas=int(m.group(1)), titulares=int(m.group(2)), deps=int(m.group(3)), agreg=int(m.group(4)), valor=n(m.group(5))); continue
        m = re.match(r'\s*(Total Geral|Subtotal 1|Subtotal 2|\(-\) Desconto Concedido|\(\+\) Débitos|\(-\) Créditos)\s+(' + NUM + r')\s*$', l)
        if m:
            d[{'Total Geral': 'total', 'Subtotal 1': 'sub1', 'Subtotal 2': 'sub2', '(-) Desconto Concedido': 'desconto',
               '(+) Débitos': 'debitos', '(-) Créditos': 'creditos'}[m.group(1)]] = n(m.group(2)); continue
        if re.match(r'^\s*\d{9}\s', l):
            m = LINHA.match(l)
            if not m:
                d['erros'].append('Linha não lida: ' + l.strip()); continue
            nome, mat, cpf, plano = quebrar(m.group(2))
            dl, di = (m.group(6), m.group(7)) if m.group(7) else (None, m.group(6))
            d['linhas'].append(dict(contrato=cur, cod=m.group(1), nome=nome, mat=mat, cpf=cpf, plano=plano,
                                    tp=m.group(3), idade=int(m.group(4)), dep=m.group(5).strip() or None, limite=iso(dl), inclusao=iso(di),
                                    rubrica=m.group(8).strip(), classe=cls_rubrica(m.group(8)), valor=n(m.group(9))))
    return d

def ler_txt(p):
    t = open(p, encoding='latin1').read()
    d = dict(tipo='fatura', arquivo=p, contratos={}, linhas=[], erros=[], operadora=None, ref=None, origem='TXT')
    m = re.search(r'Contrato:\s*(\d{10})\s*-\s*([^#]*)#Fatura:\s*(\d+)#Emissão:\s*(\S+)#Vencimento:\s*([^#\s]+)', t)
    cur = m.group(1)
    d['contratos'][cur] = dict(nome=m.group(2).strip(), nf=m.group(3), emissao=iso(m.group(4)), venc=iso(m.group(5)))
    m2 = re.search(r'Empresa:\s*([\d./-]+)\s*-', t); d['cnpj'] = m2.group(1)[1:] if m2 and len(m2.group(1)) == 19 else (m2.group(1) if m2 else None)
    for l in t.splitlines():
        c = l.split('#')
        if len(c) >= 17 and re.match(r'\d{9}$', c[0]):
            rub = c[12]; mm = re.search(r'(\d\d)/(\d{4})', rub)
            if mm and not d['ref']: d['ref'] = f'{mm.group(2)}-{mm.group(1)}'
            rub = re.sub(r'^\s*-\s*\d\d/\d{4}', '', rub).strip()
            val = n(c[13]) + n(c[14]) + n(c[15])
            cpf = re.sub(r'\D', '', c[3]) or None
            d['linhas'].append(dict(contrato=cur, cod=c[0], nome=c[1].strip(), mat=None if c[2] in ('NA', '') else c[2], cpf=cpf,
                                    plano=c[4].strip(), tp=c[5], idade=int(c[6]) if c[6].isdigit() else None, dep=c[7] or None,
                                    limite=iso(c[8]) if c[8] else None, inclusao=iso(c[9]) if c[9] else None, exclusao=iso(c[10]) if c[10] else None,
                                    rubrica=rub, classe=cls_rubrica(rub), valor=round(val, 2)))
    d['total'] = round(sum(x['valor'] for x in d['linhas']), 2)
    d['contratos'][cur]['vidas'] = len({x['cod'] for x in d['linhas'] if x['classe'] == 'base'})
    return d

def ler_boleto(p):
    t = txt(p)
    d = dict(tipo='boleto', arquivo=p)
    m = re.search(r'Número da Nota:\s*\n.*?(\d{6,})', t); d['nf'] = m.group(1) if m else None
    m = re.search(r'VALOR TOTAL DA NOTA = R\$\s*(' + NUM + ')', t); d['valor_nota'] = n(m.group(1)) if m else None
    m = re.search(r'Valor do Documento[^\n]*\n[^\n]*R\$\s*(' + NUM + ')', t); d['valor'] = n(m.group(1)) if m else d['valor_nota']
    m = re.search(r'\d{3}-\d\s+(\d{5}\.\d{5}\s+\d{5}\.\d{6}\s+\d{5}\.\d{6}\s+\d\s+\d{14})', t); d['linha'] = m.group(1) if m else None
    m = re.search(r'(\d{3}-\d{8}-\d)\s*$', t, re.M); d['nosso'] = m.group(1) if m else None
    m = re.search(r'Vencto:\s*(\d\d/\d\d/\d{4})', t) or re.search(r'Vencimento\s*\n.*?(\d\d/\d\d/\d{4})', t)
    d['venc'] = iso(m.group(1)) if m else None
    m = re.search(r'Vencto:.*?(\d{9})/\d', t) or re.search(r'Número Documento[^\n]*\n\s*\S+\s+(\d{9})', t)
    d['contrato9'] = m.group(1) if m else None
    m = re.search(r'PERÍODO DE:\s*(\d\d/\d\d/\d{4})\s*À\s*(\d\d/\d\d/\d{4})', t); d['cob'] = (iso(m.group(1)), iso(m.group(2))) if m else (None, None)
    m = re.search(r'TOMADOR DE SERVIÇOS\s*\n\s*Nome/Razão\s+(.+?)\s*\n\s*CPF/CNPJ\s+([\d./-]+)', t)
    if m: d['tomador'], d['cnpj'] = m.group(1).strip(), m.group(2)
    else:
        m = re.search(r'Pagador\s+(.+?)\s*\n(?:.*\n){0,6}?\s*CPF/CNPJ:\s*([\d./-]+)', t)
        d['tomador'], d['cnpj'] = (m.group(1).strip(), m.group(2)) if m else (None, None)
    m = re.search(r'Prestador.*?\n.*?Nome/Razão\s+(.+)', t, re.S | re.I); d['prestador'] = m.group(1).split('\n')[0].strip() if m else None
    return d

def ler_copart(p):
    t = txt(p)
    m = re.search(r'Contrato:\s*(\d{10})', t); m2 = re.search(r'N\. Fiscal:\s*(\d+)', t)
    por = defaultdict(lambda: defaultdict(float)); nomes = {}; tit = {}; cur = None; grupo = None; titular = None
    for l in t.splitlines():
        mm = re.search(r'Titular:\s+(.*?)\s+Marca Ótica:\s*(\d{9})', l)
        if mm: titular = mm.group(2); nomes.setdefault(titular, mm.group(1).strip()); continue
        mm = re.search(r'Beneficiário:\s+(.*?)\s+Marca Ótica:\s*(\d{9})', l)
        if mm: cur = mm.group(2); nomes[cur] = mm.group(1).strip(); tit[cur] = titular; continue
        mm = re.search(r'Grupo de coparticipação:\s*(.+?)\s{2,}', l)
        if mm: grupo = mm.group(1).strip(); continue
        mm = re.search(r'Valor da Coparticipação:\s*(' + NUM + ')', l)
        if mm and cur: por[cur][grupo or ''] += n(mm.group(1))
    return dict(tipo='copart', arquivo=p, contrato=m.group(1) if m else None, nf=m2.group(1) if m2 else None,
                por={k: dict(v) for k, v in por.items()}, nomes=nomes, titular=tit)


def main(root, out):
    docs = []
    for dp, dn, fn in os.walk(root):
        for f in sorted(fn):
            p = os.path.join(dp, f); rel = os.path.relpath(p, root)
            low = f.lower()
            try:
                if low.endswith('.txt'):
                    d = ler_txt(p)
                elif low.endswith('.pdf'):
                    head = txt(p) if os.path.getsize(p) < 3_000_000 else ''
                    if 'Demonstrativo Analítico de Faturamento' in head: d = ler_fatura(p)
                    elif 'DEMONSTRATIVO DE UTILIZAÇÃO DE COPARTICIPAÇÃO' in head: d = ler_copart(p)
                    elif 'AMIL' in head.upper() or 'SANTA HELENA' in head.upper():
                        d = ler_boleto(p) if ('NOTA FISCAL' in head or 'Nosso Número' in head) else dict(tipo='outro', arquivo=p)
                    else: d = dict(tipo='ignorado', arquivo=p, motivo='não é documento Amil/Santa Helena', inicio=head[:120])
                else:
                    d = dict(tipo='ignorado', arquivo=p, motivo='formato ' + f.rsplit('.', 1)[-1])
            except Exception as e:
                d = dict(tipo='erro', arquivo=p, erro=repr(e))
            d['rel'] = rel
            docs.append(d)
    json.dump(docs, open(out, 'w', encoding='utf-8'), ensure_ascii=False)
    from collections import Counter
    print(Counter(x['tipo'] for x in docs))

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
