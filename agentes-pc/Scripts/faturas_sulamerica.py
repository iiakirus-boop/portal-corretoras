# -*- coding: utf-8 -*-
"""Agente Faturas SulAmérica - leitura.
Lê a pasta de faturamentos SulAmérica Saúde que a equipe salva (sem portal) e gera um JSON para gravar_sulamerica.py.
Uso: python3 faturas_sulamerica.py <pasta SUL AMERICA> <saida.json>
Arquivos lidos (PDF):
- Boleto "Fatura Mensal" (recibo do pagador + ficha): empresa, período de competência, nº do documento
  (= apólice 5 díg. + endosso 9 díg.), vencimento, valor total, IOF, valor líquido, LF, nosso número, linha digitável.
- Boleto avulso "BENEFICIÁRIO : SUL AMERICA..." (2ª via / reemissão): apólice, endosso, parcela, vencimento, valor.
- "RELATÓRIO DE FATURAMENTO DE SEGURADOS ATIVOS" e "RELAÇÃO DE SEGURADOS ATIVOS" (faturados): razão social, empresa,
  apólice, período, fechamento, vencimento, total geral, IOF e total de segurados.
O resto (copart TXT/XLS, CSV/XLS que repetem o PDF, demonstrativo de IR, sinistralidade, seguro de vida, .zip/.rar)
fica como "ignorado" e vai para o Log de Erros na gravação.
"""
import os, re, sys, json, subprocess
from collections import Counter

NUM = r'[\d.]+,\d\d'
DT = r'\d\d/\d\d/\d{4}'


def n(s):
    return float(s.replace('.', '').replace(',', '.')) if s else None


def iso(d):
    return f'{d[6:10]}-{d[3:5]}-{d[0:2]}' if d else None


def txt(p, raw=False):
    r = subprocess.run(['pdftotext', '-enc', 'UTF-8', '-raw' if raw else '-layout', p, '-'], capture_output=True)
    return r.stdout.decode('utf-8', 'replace')


def g(pat, t, k=1, fl=0):
    m = re.search(pat, t, fl)
    return m.group(k) if m else None


def cod_arquivo(f):
    m = re.match(r'^\s*([0-9A-Z]{5})\s*-', f)
    return m.group(1) if m else None


def mmaa_arquivo(f):
    m = re.search(r'(\d\d)-(\d{2}|\d{4})(?=\D*$)', f)
    if not m: return None
    a = m.group(2); a = a if len(a) == 4 else '20' + a
    return f'{a}-{m.group(1)}'


PLANO = r'(\d{5})-(DIRETO NACIONAL|CLASSICO(?: 100)?|PRESTIGE(?: PLUS)?|EXATO(?: 100)?|ESPECIAL(?: 100)?|EXECUTIVO(?: 100)?|BASICO(?: 100)?|[A-Z0-9]+)'
FIM = re.compile(r'(?:(\d+)\s+)?(' + DT + r')\s+(\d{1,3})\s+(\S+(?: \S+)?)\s+(' + DT + r')\s+R\$\s*(' + NUM + r')\s*$')
RELACAO = re.compile(r'^(\d{17})\s+' + PLANO + r'\s+(.+?)\s+(\d{3}\.\d{3}\.\d{3}-\d{2})\s+' + FIM.pattern)


def vidas_raw(t):
    """Beneficiários do relatório/relação (texto -raw). Uma entrada por segurado."""
    out, erros, bloco = [], [], None
    def fecha(b):
        j = ' '.join(b)
        m = RELACAO.match(j)
        if m:
            cod, pc, pn, nome, cpf, mat, nasc, idade, par, ini, val = m.groups()
        else:
            m1 = re.match(r'^(\d{17})\s+(.+?)\s+(\d{9,11})\s+' + r'(?:' + PLANO + r'\s+)?(?:\d{1,3}\s+)?' + FIM.pattern, j)
            if not m1:
                erros.append('Linha não lida: ' + j[:150]); return
            cod, nome, cpf, pc, pn, mat, nasc, idade, par, ini, val = m1.groups()
        out.append(dict(cod=cod, familia=cod[:-4], dep=cod[-4:-1], nome=nome.strip(), cpf=re.sub(r'\D', '', cpf).zfill(11),
                        plano_cod=pc, plano=f'{pc}-{pn}' if pc else None, mat=mat, nasc=iso(nasc), idade=int(idade), parentesco=par.strip(),
                        inicio=iso(ini), valor=n(val)))
    for l in t.splitlines():
        l = l.strip()
        if re.match(r'^\d{17}\s', l):
            if bloco: fecha(bloco)
            bloco = [l]
        elif bloco is not None:
            if l.startswith(('Total da Familia', 'Total Geral', 'RELAÇÃO', 'RELATÓRIO')):
                fecha(bloco); bloco = None
            else:
                bloco.append(l)
                if FIM.search(l): fecha(bloco); bloco = None
    if bloco: fecha(bloco)
    return out, erros


def itens_raw(r):
    """Composição do boleto Fatura Mensal (texto -raw): rótulos antes de "Valor (R$)", valores na mesma ordem até "LF N.". Valores com IOF."""
    ls = [l.strip() for l in r.splitlines()]
    try:
        i = ls.index('Valor (R$)')
    except ValueError:
        return {}
    rot = []
    for l in reversed(ls[:i]):
        if re.search(r'@|CNPJ/CPF|\d{8}/\d{4}|\d\d\.\d{3}\.\d{3}/', l) or not l: break
        rot.insert(0, l)
    vals = []
    for l in ls[i + 1:]:
        if not re.fullmatch(NUM, l): break
        vals.append(n(l))
    return dict(zip(rot, vals)) if len(rot) == len(vals) else {}


def ler_boleto(p, t):
    d = dict(tipo='boleto', layout='fatura_mensal', arquivo=p)
    d['periodo'] = (iso(g(r'Competencia:\s*(' + DT + ')', t)), iso(g(r'Competencia:\s*' + DT + r'\s*A\s*(' + DT + ')', t)))
    m = re.search(r'^\s*([0-9A-Z]{5})\s+-\s+(.+?)(?:\s{2,}|$)', t, re.M)
    d['empresa'], d['razao'] = (m.group(1), m.group(2).strip()) if m else (None, None)
    m = re.search(r'(\d{12,16})\s+(' + DT + r')\s*$', t, re.M)
    d['documento'], d['venc'] = (m.group(1), iso(m.group(2))) if m else (None, None)
    c = g(r'(\d{8}/\d{4}-\d{2})', t)
    d['cnpj'] = f'{c[:2]}.{c[2:5]}.{c[5:8]}{c[8:]}' if c else None
    d['valor'] = n(g(r'VALOR TOTAL:\s*(' + NUM + ')', t))
    d['liquido'] = n(g(r'Valor Liquido:\s*(' + NUM + ')', t))
    d['iof'] = n(g(r'Valor IOF:\s*(' + NUM + ')', t) or g(r'Valor Liquido:\s*' + NUM + r'\s+(' + NUM + ')', t))
    if d['iof'] is None and d['valor'] and d['liquido']: d['iof'] = round(d['valor'] - d['liquido'], 2)
    d['lf'] = g(r'LF N\.:\s*(\d+)', t)
    d['nosso'] = g(r'Nosso N.mero[^\n]*\n(?:[^\n]*\n){0,2}?\s*(\d{12,13})\s', t)
    d['linha'] = g(r'(\d{5}\.\d{5}\s+\d{5}\.\d{6}\s+\d{5}\.\d{6}\s+\d\s+\d{14})', t)
    d['emissao'] = iso(g(r'Data documento[^\n]*\n(?:\s*\n)*\s*(' + DT + ')', t, fl=re.I))
    d['itens'] = itens_raw(txt(p, raw=True))
    d['copart'] = round(sum(v for k, v in d['itens'].items() if 'copart' in k.lower()), 2)
    doc = d['documento'] or ''
    d['apl5'] = doc[:5] if len(doc) == 14 else None
    d['endosso'] = str(int(doc[5:])) if len(doc) == 14 and int(doc[5:]) else None
    d['agrupado'] = 'agrupamento do faturamento' in t
    return d


def ler_boleto_avulso(p, t):
    d = dict(tipo='boleto', layout='avulso', arquivo=p, periodo=(None, None), lf=None, iof=None, liquido=None, agrupado=False, itens=[])
    m = re.search(r'01\.685\.053/0001-56\s+(' + DT + r')\s+(' + NUM + ')', t)
    d['venc'], d['valor'] = (iso(m.group(1)), n(m.group(2))) if m else (None, None)
    d['nosso'] = g(r'Nosso Número[^\n]*\n(?:\s*\n)*\s*\S+\s+(\d{6,}-\d)', t)
    d['linha'] = g(r'(\d{5}\.\d{5}\s+\d{5}\.\d{6}\s+\d{5}\.\d{6}\s+\d\s+\d{14})', t)
    ap = g(r'Da Apólice\s+(\d+)', t); en = g(r'Da Apólice\s+\d+\s+Endosso[ 	]+(\d+)', t)
    d['lancamento'] = g(r'Lançamento:\s*(\S+)', t)
    d['apolice'] = str(int(ap)) if ap else None
    d['apl5'] = d['apolice']
    d['endosso'] = str(int(en)) if en and int(en) else None
    d['documento'] = (d['apolice'] or '') + (en[-9:] if en else '')
    d['parcela'] = g(r'parcela\(s\)\s*(\d+)', t)
    d['emissao'] = iso(g(r'Data do Documento[^\n]*\n(?:\s*\n)*\s*(' + DT + ')', t))
    m = re.search(r'Pagador\s+(.+?)\s{2,}CPF/CNPJ:\s*([\d./-]+)', t)
    d['razao'], d['cnpj'] = (m.group(1).strip(), m.group(2)) if m else (None, None)
    d['empresa'] = cod_arquivo(os.path.basename(p))
    d['proposta'] = g(r'Proposta\s*:\s*(\d+)', t)
    return d


def ler_fatura(p, t):
    d = dict(tipo='fatura', arquivo=p)
    d['layout'] = 'relatorio' if 'RELATÓRIO DE FATURAMENTO' in t[:300].upper() else 'relacao'
    d['razao'] = (g(r'Raz.o Social:\s*(.+?)(?:\s{2,}|$)', t, fl=re.M) or '').strip() or None
    e = g(r'Empresa:\s*([0-9A-Z-]{5,6})\b', t)
    d['empresa'] = e.replace('-', '') if e else None
    d['apolice'] = g(r'Ap.lice:\s*(\d+)', t)
    d['cia'] = g(r'CIA:\s*(\d+)', t, fl=re.I)
    d['periodo'] = (iso(g(r'Per.odo de Compet.ncia:\s*(' + DT + ')', t)), iso(g(r'Per.odo de Compet.ncia:\s*' + DT + r'\s*a\s*(' + DT + ')', t)))
    d['emissao'] = iso(g(r'Fechamento:\s*(' + DT + ')', t))
    d['venc'] = iso(g(r'Vencimento:\s*(' + DT + ')', t))
    r = txt(p, raw=True)  # no -raw os totais saem colados ao rótulo (no -layout podem sair longe)
    tg = re.findall(r'Total Geral:\s*R\$\s*(' + NUM + ')', r)
    d['total'] = n(tg[0]) if tg else None                # prêmio líquido (sem IOF)
    d['total_iof'] = n(tg[-1]) if len(tg) > 1 else None  # resumo prêmio (com IOF)
    d['iof'] = n(g(r'IOF:\s*R\$\s*(' + NUM + ')', r))
    d['acertos'] = n(g(r'Acertos:\s*R\$\s*(' + NUM + ')', t))
    v = re.findall(r'Total de Segurados:\s*(\d+)', t)
    d['vidas'] = int(v[-1]) if v else None
    d['titulares'] = int(g(r'Total de Titulares:\s*(\d+)', t) or 0) if v else None
    d['deps'] = int(g(r'Total de Dependentes:\s*(\d+)', t) or 0) if v else None
    d['apl5'] = d['apolice'][:5] if d['apolice'] else None
    d['linhas'], d['erros'] = vidas_raw(r)
    return d


def main(root, out):
    docs = []
    for dp, dn, fn in os.walk(root):
        dn.sort()
        for f in sorted(fn):
            p = os.path.join(dp, f); rel = os.path.relpath(p, root).replace('\\', '/')
            low = f.lower()
            try:
                if low.endswith('.pdf'):
                    t = txt(p); h = t[:400].upper()
                    if h.lstrip().startswith('FATURA MENSAL'): d = ler_boleto(p, t)
                    elif 'BENEFICIÁRIO : SUL AMERICA' in h: d = ler_boleto_avulso(p, t)
                    elif 'SEGURADOS ATIVOS' in h and ('RELATÓRIO DE FATURAMENTO' in h or 'RELAÇÃO DE SEGURADOS' in h): d = ler_fatura(p, t)
                    elif 'SEGUROS DE PESSOAS' in h or 'VIDA' in f.upper().split('SUL AMERICA')[0]:
                        d = dict(tipo='ignorado', arquivo=p, motivo='seguro de vida (SulAmérica Seguros de Pessoas), não é saúde')
                    elif 'DEMONSTRATIVO' in f.upper() and 'IR' in f.upper():
                        d = dict(tipo='ignorado', arquivo=p, motivo='demonstrativo de IR')
                    else: d = dict(tipo='ignorado', arquivo=p, motivo='não é boleto nem relatório de faturamento (copart, sinistralidade, outro)', inicio=' '.join(t.split())[:100])
                else:
                    ext = f.rsplit('.', 1)[-1].lower() if '.' in f else ''
                    mot = {'txt': 'TXT de coparticipação (FATUCOPA)', 'csv': 'CSV (repete o relatório em PDF / sinistros)', 'xls': 'planilha (copart / repete o PDF)',
                           'xlsx': 'planilha (repete o PDF / copart)', 'zip': 'arquivo compactado', 'rar': 'arquivo compactado'}.get(ext, 'formato ' + ext)
                    d = dict(tipo='ignorado', arquivo=p, motivo=mot)
            except Exception as e:
                d = dict(tipo='erro', arquivo=p, erro=repr(e))
            d['rel'] = rel
            d['cod_arquivo'] = cod_arquivo(f)
            d['mes_arquivo'] = mmaa_arquivo(f)
            docs.append(d)
    json.dump(docs, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
    print(Counter((x['tipo'], x.get('layout')) for x in docs))


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
