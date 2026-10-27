# -*- coding: utf-8 -*-
"""Agente Faturas - Bradesco Saude / Bradesco Dental (SPG).
Le o PDF "kit de faturamento" (fatura tecnica + boleto) baixado do Portal de Negocios
e devolve um dicionario por arquivo: cabecalho, boleto, subfaturas, vidas e coparticipacao.
Uso: python3 faturas_bradesco.py arquivo.pdf [...]  -> imprime JSON
"""
import re, sys, json, subprocess
from datetime import date

def num(s):
    s = s.strip().replace('*', '')
    neg = s.endswith('-') or s.startswith('-')
    s = s.strip('-').replace('.', '').replace(',', '.')
    v = float(s) if s else 0.0
    return -v if neg else v

def dt(s):
    d, m, y = re.split(r'[./]', s)
    return date(int(y), int(m), int(d)).isoformat()

RE_HDR = re.compile(r'^\s*(\d{3})\s+(\d{3})\s+(\d{6,8})\s+(\w+)\s+(\d{2})/(\d{4})\s+(\d{2})\s+Subfatura\s+(\d{4}) - (.+?)\s{2,}(\d{3})\s*-?\s*(.+?)\s{2,}(\d{2}/\d{2}/\d{4})\s+(\d+)\s*$')
RE_EST = re.compile(r'(Estipulante|Contratante)\s+(.+?)\s{2,}Ramo')
RE_RES = re.compile(r'^\((\w\w| )\)(.+?)\s{2,}(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(-?[\d.]+,\d\d-?)\s+(-?[\d.]+,\d\d-?)\s*$')
RE_VIDA = re.compile(r'^\s+(\d{7})/(\d{2}) (.+?)\s{2,}(?:(N|[A-Z]?\d{3,4})\s+)?(\d{2}/\d{2}/\d{4})\s+(MAS|FEM)\s+(\w+)\s+(?:(FILH|CONJ|OUTR|PAI|MAE|AGRE|ENTE|NETO|SOBR|IRMA|IRMÃ|\w{4})\s+)??(\w{4})\s+(\d{2}/\d{2}/\d{4})\s+(?:(\w\w)\s+)?(\d{2}/\d{4})\s+(-?[\d.]+,\d\d-?)\s+(-?[\d.]+,\d\d-?)\s*$')
RE_CONT = re.compile(r'^\s{60,}(\w{4})\s+(\d{2}/\d{2}/\d{4})\s+(?:(\w\w)\s+)?(\d{2}/\d{4})\s+(-?[\d.]+,\d\d-?)\s+(-?[\d.]+,\d\d-?)?\s*$')
RE_AVULSO = re.compile(r'^\s{5,}(\S.+?)\s{2,}(\w\w)\s+(-?[\d.]+,\d\d-?)\s+(-?[\d.]+,\d\d-?)\s*$')
RE_COP1 = re.compile(r'^\s+(\d{7})/(\d{2}) (.+?)\s{2,}(\S.+?)\s{2,}(\d{2}/\d{2}/\d{4})\s+(\S+)\s+(-?[\d.]+,\d\d)\s+(-?[\d.]+,\d\d)\s*$')
RE_COP2 = re.compile(r'^\s{40,}(\S.+?)\s{2,}(\d{2}/\d{2}/\d{4})\s+(\S+)\s+(-?[\d.]+,\d\d)\s+(-?[\d.]+,\d\d)\s*$')
RE_LD = re.compile(r'(\d{5}\.\d{5} \d{5}\.\d{6} \d{5}\.\d{6} \d \d{14})')

def parse(path):
    # -table: o pdftotext do Windows (xpdf, vem com o Git) parte as linhas no -layout
    txt = subprocess.run(['pdftotext', '-table', '-enc', 'UTF-8', '-eol', 'unix', path, '-'], capture_output=True).stdout.decode('utf-8', 'replace')
    txt = re.sub(r'\n[ \t]*(?=\n)', '', txt).replace('(  )', '( )')  # sem linhas em branco, como no -layout do poppler
    txt = re.sub(r'(?m)^ {1,3}(?=\S)', '', txt)  # rótulos do boleto (Pagador, Ag. Benef.) na coluna 0
    txt = re.sub(r'(?m)^(?=\d{7}/\d{2} )', ' ', txt)  # linhas de vida/copart com recuo, como no poppler
    pages = txt.split('\f')
    out = {'arquivo': path, 'subfaturas': {}, 'vidas': [], 'avulsos': [], 'copart': [], 'avisos': []}
    first_res = None
    for pno, pg in enumerate(pages, 1):
        lines = pg.split('\n')
        hdr = None
        for i, l in enumerate(lines[:8]):
            m = RE_HDR.match(l)
            if m:
                hdr = m
                break
        if not hdr:
            continue
        cia, suc, apol, cob, mm, aaaa, nr, sub, subnome, ramo_cod, ramo, emis, pag = hdr.groups()
        gns = '(GNS)' in subnome
        subnome = subnome.replace('(GNS)', '').strip()
        if 'cab' not in out:
            me = RE_EST.search(pg)
            out['cab'] = dict(cia=cia, suc=suc, apolice=str(int(apol)), cobertura=cob,
                              competencia=f'{aaaa}-{mm}', nr=nr, ramo=f'{ramo_cod} - {ramo.strip()}',
                              emissao=dt(emis), estipulante=me.group(2).strip() if me else subnome,
                              produto='DENTAL' if 'DENTAL - FATURA' in pg else 'SAUDE')
        S = out['subfaturas'].setdefault(sub, {'nome': subnome, 'resumo': {}})
        tipo = 'outra'
        if re.search(r'^\s+Resumo\s', pg, re.M):
            tipo = 'resumo'
            res = {}
            for l in lines:
                m = RE_RES.match(l)
                if m:
                    cod = m.group(1).strip() or 'VR'
                    res.setdefault(cod, dict(desc=m.group(2).strip(), tit=int(m.group(3)), dep=int(m.group(4)),
                                             tot=int(m.group(5)), lanc=int(m.group(6)), valor=num(m.group(7)), part=num(m.group(8))))
            if first_res is None:
                first_res = res
                out['resumo_geral'] = res
                out['resumo_geral_sub'] = sub if not gns else 'GNS'
            if not gns:
                S['resumo'] = res
            elif sub not in [k for k in out['subfaturas'] if out['subfaturas'][k]['resumo']]:
                S['resumo_gns'] = True
        if 'Fator Moderador' in pg:
            tipo = 'copart'
            cur = None
            for l in lines:
                m = RE_COP1.match(l)
                if m:
                    cur = (m.group(1), m.group(2), m.group(3).strip())
                    out['copart'].append(dict(sub=sub, cert=cur[0], dep=cur[1], nome=cur[2], prestador=m.group(4).strip(),
                                              data=dt(m.group(5)), doc=m.group(6), pago=num(m.group(7)), part=num(m.group(8))))
                    continue
                m = RE_COP2.match(l)
                if m and cur:
                    out['copart'].append(dict(sub=sub, cert=cur[0], dep=cur[1], nome=cur[2], prestador=m.group(1).strip(),
                                              data=dt(m.group(2)), doc=m.group(3), pago=num(m.group(4)), part=num(m.group(5))))
                elif re.match(r'^\s+\d{7}/\d{2} ', l):
                    out['avisos'].append(f'pag {pno}: linha de copart nao lida: {l.strip()}')
        elif re.search(r'Certif\.', pg):
            tipo = 'lista'
            for l in lines:
                m = RE_VIDA.match(l)
                if m:
                    g = m.groups()
                    out['vidas'].append(dict(sub=sub, cert=g[0], dep=g[1], nome=g[2].strip(), nova=(g[3] == 'N'), sub_origem=(g[3] if g[3] and g[3] != 'N' else ''), nasc=dt(g[4]),
                                             sexo=g[5], civil=g[6], paren=g[7] or '', plano=g[8], inicio=dt(g[9]), mov=g[10] or '',
                                             mesano=g[11], valor=num(g[12]), part=num(g[13]), pag=pno))
                    continue
                m = RE_CONT.match(l)
                if m and out['vidas'] and out['vidas'][-1]['sub'] == sub:
                    p0 = out['vidas'][-1]
                    out['vidas'].append(dict(p0, plano=m.group(1), inicio=dt(m.group(2)), mov=m.group(3) or '', mesano=m.group(4),
                                             valor=num(m.group(5)), part=num(m.group(6) or '0,00'), pag=pno, continuacao=True))
                    continue
                m = RE_AVULSO.match(l)
                if m and not re.match(r'^\s+\d{7}/', l):
                    out['avulsos'].append(dict(sub=sub, desc=m.group(1).strip(), cod=m.group(2), valor=num(m.group(3)), part=num(m.group(4))))
                elif re.match(r'^\s+\d{7}/\d{2} ', l):
                    out['avisos'].append(f'pag {pno}: linha de vida nao lida: {l.strip()}')
        # boleto (so a primeira ficha preenchida)
        if 'boleto' not in out and re.search(r'(Custo|Prêmio) Total\s+Nome do Corretor\n.*\*+[\d.]+,\d\d', pg):
            b = {}
            ld = RE_LD.search(pg)
            b['linha_digitavel'] = ld.group(1) if ld else ''
            dm = re.search(r'DEBITADO NO BCO (\d+) AG ([\d-]+) C/C ([\d-]+)', pg)
            b['debito_automatico'] = f'Débito automático BCO {dm.group(1)} AG {dm.group(2)} C/C {dm.group(3)}' if dm else ''
            for i, l in enumerate(lines):
                if re.match(r'^(Operadora|Seguradora)\s+CNPJ', l):
                    nx = next(x for x in lines[i + 1:i + 4] if x.strip())
                    v = [x for x in re.split(r'\s{2,}', nx.strip())]
                    b['operadora'], b['cnpj_operadora'] = v[0], v[1]
                    b['proposta'] = v[2] if len(v) > 3 else ''
                    b['vencimento'] = dt(v[-1])
                if l.startswith('Data Emissão') and 'End./Fatura' in l:
                    nx = next(x for x in lines[i + 1:i + 4] if x.strip())
                    v = re.split(r'\s{2,}', nx.strip())
                    b['contrato'], b['end_fatura'] = v[1], v[2]
                    b['info'] = v[3] if len(v) > 4 else ''
                m = re.search(r'DE (\d\d[./]\d\d[./]\d{4}) A (\d\d[./]\d\d[./]\d{4})', l)
                if m:
                    b['vig_ini'], b['vig_fim'] = dt(m.group(1)), dt(m.group(2))
                if l.startswith('Moeda') and ('Custo Total' in l or 'Prêmio Total' in l):
                    b['valor'] = num(re.search(r'\*+([\d.]+,\d\d)', lines[i + 1]).group(1))
                if l.startswith('Ag. Benef'):
                    m = re.search(r'\s(\d)\s+(\d{14})\s', lines[i + 1] + ' ')
                    b['carteira'], b['nosso_numero'] = (m.group(1), m.group(2)) if m else ('', '')
                if 'Valor do IOF' in l:
                    m = re.search(r'\*+([\d.]+,\d\d)', ' '.join(lines[i + 1:i + 3]))
                    b['iof'] = num(m.group(1)) if m else 0.0
                if l.startswith('Pagador'):
                    m = re.search(r'^(.+?)\s{2,}CNPJ:\s*([\d./-]+)', lines[i + 1])
                    if m:
                        b['pagador'], b['cnpj_pagador'] = m.group(1).strip(), m.group(2)
            out['boleto'] = b
    # totais
    rg = out.get('resumo_geral', {})
    ts = rg.get('TS', {})
    out['total_fatura'] = ts.get('valor')
    b = out.get('boleto', {})
    if b and not b.get('iof') and ts.get('valor') is not None and b.get('valor') is not None and out.get('cab', {}).get('produto') == 'SAUDE':
        dif = round(b['valor'] - ts['valor'], 2)
        if 0 < dif <= 0.03 * ts['valor']:
            b['iof'] = dif
            b['iof_calculado'] = True
    out['vidas_informadas'] = ts.get('tot')
    soma_vidas = round(sum(v['valor'] for v in out['vidas']) + sum(a['valor'] for a in out['avulsos']), 2)
    out['soma_linhas'] = soma_vidas
    out['soma_copart'] = round(sum(c['part'] for c in out['copart']), 2)
    out['soma_avulsos_rs'] = round(sum(a['valor'] for a in out['avulsos'] if a['cod'] == 'RS'), 2)
    for k, S in out['subfaturas'].items():
        if S['resumo']:
            sv = round(sum(v['valor'] for v in out['vidas'] if v['sub'] == k) + sum(a['valor'] for a in out['avulsos'] if a['sub'] == k), 2)
            if abs(sv - S['resumo']['TS']['valor']) > 0.01:
                out['avisos'].append(f'sub {k}: soma das linhas {sv} <> total da subfatura {S["resumo"]["TS"]["valor"]}')
    return out

if __name__ == '__main__':
    print(json.dumps([parse(p) for p in sys.argv[1:]], ensure_ascii=False, indent=1))
