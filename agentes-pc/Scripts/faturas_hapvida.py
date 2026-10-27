# -*- coding: utf-8 -*-
"""Agente Faturas Hapvida - leitura.
Lê a pasta de faturamentos Hapvida / NotreDame Intermédica que a equipe salva (sem portal) e gera um JSON para gravar_hapvida.py.
Uso: python3 faturas_hapvida.py <pasta HAPVIDA> <saida.json> [portal_hapvida_AAAA-MM-DD.json]
Arquivos lidos:
- Portal Empresa Hapvida/NotreDame (opcional): JSON da coleta no Extrato financeiro (faturas em aberto + histórico, status de pagamento
  e o Relatório.csv de cada fatura). Só cobre os contratos do login usado no portal; o resto vem da pasta.
- "Analítico Fatura Mensal" (PDF FATURADOS): obrigação (= nº fatura do extrato de comissão), controle (= nosso número),
  vencimento, nota fiscal, valor, empresas (contrato + subestipulantes), beneficiários e descontos/acréscimos.
- "Analitico Fatura" (CSV FATURADOS): mesmos beneficiários, preferidos ao PDF (nomes completos). Os CSV "_ATUALIZADO"
  (sem cabeçalho, editados pela equipe) e cópias repetidas ficam de fora.
- Boleto NotreDame (DISCRIMINAÇÃO DA FATURA): contrato, nº documento, vencimento, nosso número, valor, linha digitável, NF, período.
- Boleto antigo "Impressão de Bloqueto" (impresso do navegador, sem valores no texto): contrato, obrigação (link), NF.
- Boleto individual "PAGAR ESTA FATURA" (planos PF 3010V): carteira, beneficiário, vencimento, valor, nosso número.
- NF-e (Prefeitura de SP): nº da nota, contrato, valor, tomador.
- Copart: "FATURA DE CO-PARTICIPAÇÃO" (PDF) lida só pelo total; planilhas de coparticipação (CSV/XLSX) ficam como ignoradas.
"""
import os, re, sys, json, csv, io, subprocess, multiprocessing
from collections import Counter

DT = r'\d\d/\d\d/\d{2,4}'
US = r'-?[\d,]*\d\.\d\d'      # 1,234.56 (relatórios NotreDame)
BRN = r'-?[\d.]*\d,\d\d'      # 1.234,56
PAREN = r'DEPENDENT\S*|TITULAR|CONJUGE|CÔNJUGE|COMPANHEIR\S*|FILHO\(A\)|FILHA?O?|ENTEADO\(A\)|ENTEAD\S*|PAI|MAE|MÃE|AGREGAD\S*|NETO\(A\)|OUTROS?|SOGR\S*|IRM\S*|GENRO|NORA|MENOR\S*'


def us(s):
    return round(float(s.replace(',', '')), 2) if s else None


def brn(s):
    return round(float(s.replace('.', '').replace(',', '.')), 2) if s else None


def iso(d):
    if not d: return None
    a = d[6:]
    a = a if len(a) == 4 else '20' + a
    return f'{a}-{d[3:5]}-{d[0:2]}'


def txt(p, raw=False, first=False):
    a = ['pdftotext', '-enc', 'UTF-8', '-raw' if raw else '-layout']
    if first: a += ['-l', '1']
    r = subprocess.run(a + [p, '-'], capture_output=True)
    return r.stdout.decode('utf-8', 'replace')


def g(pat, t, k=1, fl=0):
    m = re.search(pat, t, fl)
    return m.group(k) if m else None


def cod_arquivo(f):
    m = re.match(r'^\s*([0-9A-Z]{5})\s*-', f)
    return m.group(1) if m else None


def mmaa_arquivo(f):
    m = re.search(r'(\d\d)-(\d{2})(?=\D*$)', f)
    return f'20{m.group(2)}-{m.group(1)}' if m else None


def pasta_mes(rel):
    m = re.match(r'(\d\d)-(\d\d)/', rel)
    return f'20{m.group(2)}-{m.group(1)}' if m else None


# ---------------------------------------------------------------- analítico (PDF)
CAB = re.compile(r'Obriga..o\s+(\d+)\s+Controle\s+(\w+)\s+Vencimento\s+(' + DT + r')\s+Nota Fiscal\s+(\d*)\s*Valor\s+(' + US + r')\s+Bruto\s+(' + US + ')')
VIDA = re.compile(r'^\s*([0-9A-Z]{5})\.(\d{6})-(\d\d) ?(\d)?\s+(?:(\S+)\s+)?(\d{9}-\d\d|\d{3,11})\s+(.*?)\s+(?:(' + PAREN + r')\s+)?(.*?)\s*(' + DT + r')\s+(\d+)\s+(' + DT + r')\s+(\d+)\s+(' + US + r')\s+(\d+)\s+(' + US + r')\s+(' + US + r')\s+(' + US + r')\s+(' + US + r')\s+(' + US + r')\s*$')


def ler_analitico(p, t, com_csv=()):
    d = dict(tipo='fatura', layout='analitico', arquivo=p, fonte_vidas='pdf')
    cabs = CAB.findall(t)
    if not cabs: return dict(tipo='erro', arquivo=p, erro='Analítico sem linha de Obrigação')
    obr = Counter(c[0] for c in cabs)
    d['obrigacoes'] = list(obr)
    c = cabs[0]
    d['obrigacao'], d['controle'], d['venc'] = c[0], c[1], iso(c[2])
    d['nf'] = next((x[3] for x in cabs if x[3]), None)
    d['valor'], d['bruto'] = us(c[4]), us(c[5])
    d['emissao'] = iso(g(r'^\s*AV .*?(\d\d/\d\d/\d\d)\s+\d\d:\d\d', t, fl=re.M))
    emp = []
    for m in re.finditer(r'^Empresa\s+([0-9A-Z]{5})\s+(.+?)\s*$', t, re.M):
        if m.group(1) not in [e[0] for e in emp]: emp.append((m.group(1), m.group(2).strip()))
    d['empresas'] = emp
    linhas, erros = [], []
    # regra: com CSV (portal ou pasta) da mesma obrigação, as vidas vêm do CSV e as linhas do PDF nem são lidas
    ls = [] if d['obrigacao'] in com_csv else t.splitlines(); cur = None
    if not ls: d['fonte_vidas'] = 'csv'
    for l in ls:
        m = VIDA.match(l)
        if m:
            g_ = m.groups()
            cur = dict(empresa=g_[0], familia=f'{g_[0]}.{g_[1]}', dep=g_[2], cod=f'{g_[0]}.{g_[1]}-{g_[2]} {g_[3] or ""}'.strip(),
                       mat=g_[4], cpf=re.sub(r'\D', '', g_[5]).zfill(11), nome=g_[6].strip(), parentesco=g_[7] or '', mae=g_[8].strip(),
                       nasc=iso(g_[9]), idade=int(g_[10]), inicio=iso(g_[11]), plano_cod=g_[12], ac=g_[14],
                       mensalidade=us(g_[15]), adicional=us(g_[16]), desconto=us(g_[17]), multa=us(g_[18]), valor=us(g_[19]))
            cur['_cn'] = (m.start(7), m.start(9) if g_[7] is None else m.start(8), m.start(9), m.start(10))
            linhas.append(cur); continue
        if cur and l.strip() and not re.match(r'^\s*(Titular|Credencial|Empresa|Unidade|Obriga|Plano)\b', l) and not re.search(US + r'\s*$', l):
            a, b, c2, e = cur['_cn']
            nm = l[max(a - 3, 0):b - 1].strip(); mae = l[max(c2 - 2, 0):e - 1].strip() if len(l) > c2 else ''
            if nm and not re.search(r'\d', nm): cur['nome'] += ' ' + nm
            if mae and not re.search(r'\d', mae): cur['mae'] += ' ' + mae
        elif l.strip() == '' or re.match(r'^\s*(Titular|Empresa|Obriga)', l):
            cur = None
        if re.match(r'^\s*\d\.\d{3}?|^\s*' + US + r'\s', l):
            cur = None
    for x in linhas: x.pop('_cn', None)
    # linhas com credencial que a regex não leu
    for l in ls:
        if re.match(r'^\s*[0-9A-Z]{5}\.\d{6}-\d\d', l) and not VIDA.match(l):
            erros.append('Linha não lida: ' + ' '.join(l.split())[:150])
    d['linhas'], d['erros'] = linhas, erros
    # descontos e acréscimos
    aj = []
    for m in re.finditer(r'^\s*(DESCONTO|ACRESCIMO|ACRÉSCIMO|MULTA|JUROS|PRO-?RATA|AJUSTE)\s+(' + US + r')\s+(.*)$', t, re.M):
        aj.append(dict(tipo=m.group(1), valor=us(m.group(2)), obs=' '.join(m.group(3).split())[:200]))
    d['ajustes'] = aj
    d['taxa_implantacao'] = us(g(r'Taxa de Implatacao:\s*(' + US + ')', t))
    return d


# ---------------------------------------------------------------- analítico (CSV)
def ler_csv(p):
    raw = open(p, 'rb').read()
    for enc in ('utf-8-sig', 'cp1252'):
        try: t = raw.decode(enc); break
        except UnicodeDecodeError: continue
    return ler_csv_txt(t, p)


def ler_csv_txt(t, p):
    L = t.splitlines()
    if not L: return dict(tipo='ignorado', arquivo=p, motivo='CSV vazio')
    h = L[0].upper().lstrip('\ufeff')
    if 'COPARTICIPA' in ' '.join(L[:3]).upper() or h.startswith('BENEFICIARIO;PROCED'):
        return dict(tipo='ignorado', arquivo=p, motivo='planilha de coparticipação (CSV)')
    if not h.startswith('NOTRE DAME'):
        return dict(tipo='ignorado', arquivo=p, motivo='CSV sem cabeçalho da operadora (cópia editada pela equipe, ex. _ATUALIZADO)')
    cab = ' '.join(L[:7])
    d = dict(tipo='csv', arquivo=p, obrigacao=g(r'obrigacao\s+(\d+)', cab), venc=iso(g(r'vencimento em\s+(' + DT + ')', cab)))
    i = next((k for k, l in enumerate(L) if l.startswith('empresa;')), None)
    if i is None: return dict(tipo='ignorado', arquivo=p, motivo='CSV sem linha de cabeçalho dos beneficiários')
    linhas, erros, aj = [], [], []
    def v(s):
        s = (s or '').strip()
        if not s: return 0.0
        if ',' in s and '.' not in s: return brn(s)
        if '.' in s or ',' in s: return us(s)
        return round(int(s) / 100, 2)   # sem separador = centavos
    for r in csv.reader(L[i + 1:], delimiter=';'):
        if not r or not re.match(r'^[0-9A-Z]{5}$', r[0].strip()):
            k = next((j for j, x in enumerate(r[:2]) if re.match(r'^(DESCONTO|ACR.SCIMO|ACRESCIMO)$', x.strip().upper())), None)
            if k is not None and len(r) > k + 1:
                aj.append(dict(tipo='DESCONTO' if r[k].strip().upper().startswith('DESC') else 'ACRÉSCIMO', valor=v(r[k + 1]),
                               obs=' '.join(';'.join(r[k + 2:]).split()).strip(' ;')[:200]))
            continue
        try:
            cr = r[3].strip()
            m = re.match(r'([0-9A-Z]{5})\.(\d{6})-(\d\d)', cr)
            linhas.append(dict(empresa=r[0].strip(), unidade=r[1].strip(), familia=f'{m.group(1)}.{m.group(2)}', dep=m.group(3), cod=cr,
                               mat=(r[4].strip().lstrip('0') or None), cpf=re.sub(r'\D', '', r[5]).zfill(11), nome=r[6].strip(), mae=r[7].strip(),
                               nasc=iso(r[8].strip()), inicio=iso(r[9].strip()), idade=int(r[10] or 0), parentesco=r[11].strip(),
                               plano_cod=r[12].strip(), ac=r[13].strip(), mensalidade=v(r[14]), adicional=v(r[15]), taxa_adesao=v(r[16]),
                               desconto=v(r[17]), valor=v(r[18])))
        except Exception as e:
            erros.append(f'Linha não lida: {";".join(r)[:150]} ({e!r})')
    d['linhas'], d['erros'], d['ajustes'] = linhas, erros, aj
    return d


def ler_portal(pj):
    """JSON gerado pela coleta no Portal Empresa Hapvida/NotreDame (Extrato financeiro: em aberto + histórico, com o Relatório.csv de cada fatura)."""
    P = json.load(open(pj, encoding='utf-8'))
    out = []
    for c in P['contratos']:
        for f in c['faturas']:
            if 'COPARTIC' in (f.get('billType') or '').upper():
                out.append(dict(tipo='copart', arquivo=pj, rel=f'portal/{c["contrato"]}/{f["billingNumber"]} (copart)', contrato=c['contrato'],
                                venc=iso(f['dueDate']), valor=f.get('amount'), controle=f.get('number')))
                continue
            d = dict(tipo='portal', arquivo=pj, rel=f'portal/{c["contrato"]}/{f["billingNumber"]}', contrato=c['contrato'], razao=c['razao'],
                     cnpj=c.get('cnpj'), status_contrato=c.get('status'), filhos=c.get('filhos', []), obrigacao=f['billingNumber'], nosso=f.get('number'),
                     venc=iso(f['dueDate']), emissao=iso(f.get('period')), valor=f.get('amount'), status=f.get('status'), aba=f.get('aba'),
                     tipo_fatura=f.get('billType'), nf=f.get('nf'), remessa=f.get('remittence'))
            if f.get('csv'):
                x = ler_csv_txt(f['csv'], d['rel'])
                d['linhas'], d['erros'], d['ajustes'] = x.get('linhas', []), x.get('erros', []), x.get('ajustes', [])
                d['csv_txt'] = f['csv']
            else:
                d['linhas'], d['erros'], d['ajustes'] = [], ['Relatório.csv não baixado: ' + str(f.get('csvErro'))], []
            out.append(d)
    return out


# ---------------------------------------------------------------- boletos
def ler_boleto_nd(p, t):
    d = dict(tipo='boleto', layout='notredame', arquivo=p)
    m = re.search(r'Num Documento:\s*([0-9A-Z]{5})\.(\d{6})\s+(\d\d/\d{4})', t)
    d['contrato'], d['documento'] = (m.group(1), f'{m.group(1)}.{m.group(2)} {m.group(3)}') if m else (None, None)
    d['venc'] = iso(g(r'VENCIMENTO\s+(' + DT + ')', t))
    d['nosso'] = g(r'N\.Num\.:\s*(\d+)', t)
    d['valor'] = us(g(r'Valor do Documento\s*\n\s*(' + US + ')', t))
    d['linha'] = g(r'(\d{5}\.\d{5}\s+\d{5}\.\d{6}\s+\d{5}\.\d{6}\s+\d\s+\d{14})', t)
    d['nf'] = g(r'Nota fiscal:\s*(\d+)', t)
    d['emissao'] = iso(g(r'Data Doc\.:\s*(' + DT + ')', t))
    d['periodo'] = (iso(g(r'PER.ODO\s+(' + DT + ')', t)), iso(g(r'PER.ODO\s+' + DT + r'\s+.\s+(' + DT + ')', t)))
    d['razao'] = (g(r'^\s*NOME\s+(.+?)\s*$', t, fl=re.M) or '').strip() or None
    d['cnpj'] = g(r'(\d\d\.\d{3}\.\d{3}/\d{4}-\d\d)\s+' + (d['contrato'] or 'X') + r'\.', t) or g(r'- (\d\d\.\d{3}\.\d{3}/\d{4}-\d\d)\s*$', t, fl=re.M)
    m = re.search(r'Mensalidade Plano Sa.de.*?\n\s*\n?\s*(' + US + r')\s+(' + US + r')\s+(' + US + r')\s+(' + US + r')\s+(' + US + r')\s+(' + US + ')', t, re.S)
    if m:
        v = [us(x) for x in m.groups()]
        d['itens'] = dict(mensalidade=v[0], odonto=v[1], tarifa=v[2], fator_moderador=v[3], outros=v[4], total=v[5])
    else: d['itens'] = {}
    return d


def ler_bloqueto(p, t):
    d = dict(tipo='boleto', layout='bloqueto', arquivo=p, valor=None, venc=None, linha=None, periodo=(None, None), itens={})
    d['obrigacao'] = g(r'pObrigacao=(\d+)', t)
    m = re.search(r'^\s*(.+?)\s+(\d\d\.\d{3}\.\d{3}/\d{4}-\d\d)\s+([0-9A-Z]{5})\s*$', t, re.M)
    d['razao'], d['cnpj'], d['contrato'] = (m.group(1).strip(), m.group(2), m.group(3)) if m else (None, None, None)
    if not m:
        m = re.search(r'^\s*(.+?)\s+(\d{3}\.\d{3}\.\d{3}-\d\d)\s+(\S+)\s*$', t, re.M)
        if m: d['razao'], d['cnpj'], d['contrato'] = m.group(1).strip(), m.group(2), m.group(3)[:5]
    d['nf'] = g(r'^\s{20,}(\d{8})\s*$', t, fl=re.M)
    d['emissao'] = iso(g(r'^\s*(' + DT + r')\s+REC', t, fl=re.M))
    d['nosso'] = None
    d['copart'] = 'CO-PARTICIPA' in t.upper() or 'COPART' in os.path.basename(p).upper()
    return d


def ler_individual(p, t):
    d = dict(tipo='boleto', layout='individual', arquivo=p, itens={})
    m = re.search(r'N\. Documento:\s*([0-9A-Z]{5})(\d{6})\s+(\d\d/\d{4})', t)
    d['contrato'] = m.group(1) if m else None
    d['carteira'] = f'{m.group(1)}.{m.group(2)}' if m else None
    d['documento'] = f'{m.group(1)}{m.group(2)} {m.group(3)}' if m else None
    d['venc'] = iso(g(r'Vencimento\s*\n.*?(' + DT + r')\s*$', t, fl=re.M) or g(r'AT.\s+(' + DT + ')', t))
    d['nosso'] = g(r'N\.Num\.:\s*(\d+)', t)
    d['valor'] = us(g(r'\(=\) Total da Fatura\s*\n\s*(?:' + US + r'\s+){5}(' + US + ')', t)) or us(g(r'Valor do Documento\s*\n.*?(' + US + r')\s*$', t, fl=re.M))
    d['linha'] = g(r'(\d{5}\.\d{5}\s+\d{5}\.\d{6}\s+\d{5}\.\d{6}\s+\d\s+\d{14})', t)
    d['emissao'] = iso(g(r'Dt Doc\.:\s*(' + DT + ')', t))
    d['periodo'] = (iso(g(r'COMPETENCIA DESSA MENSALIDADE.*?(' + DT + ')', t, fl=re.S)), iso(g(r'(' + DT + r')\s+.\s+(' + DT + ')', t, 2)))
    d['razao'] = (g(r'Nome:\s*(.+?)\s{2,}', t) or '').strip() or None
    d['cpf'] = g(r'(\d{3}\.\d{3}\.\d{3}-\d\d)', t)
    d['nf'] = None
    vid = []
    for m in re.finditer(r'^\s*([0-9A-Z]{5}\.\d{6}\.\d\d-\d)\s+(M.dica|Odontol.gica|Serv\. Adicional)\s+(.+?)\s{2,}(.+?)\s+R\$\s*(' + US + ')', t, re.M):
        vid.append(dict(carteira=m.group(1), tipo=m.group(2), nome=m.group(3).strip(), plano=' '.join(m.group(4).split()), valor=us(m.group(5))))
    d['beneficiarios'] = vid
    return d


def ler_copart(p, t):
    d = dict(tipo='copart', arquivo=p)
    m = re.search(r'^\s*([0-9A-Z]{5})-(.+?)\s*$', t, re.M)
    d['contrato'], d['razao'] = (m.group(1), m.group(2).strip()) if m else (None, None)
    m = re.search(r'^\s*(\d{12})\s+(' + DT + r')\s+(' + BRN + r')\s*$', t, re.M)
    d['controle'], d['venc'], d['valor'] = (m.group(1), iso(m.group(2)), brn(m.group(3))) if m else (None, None, None)
    return d


def ler_nf(p, t):
    d = dict(tipo='nf', arquivo=p)
    d['nf'] = g(r'N.mero da Nota\s*\n.*?(\d{6,})', t) or g(r'nf=(\d+)', t)
    d['contrato'] = g(r'CONTRATO N\s*([0-9A-Z]{5})', t)
    d['valor'] = brn(g(r'VALOR TOTAL D[OA] (?:SERVI.O|NOTA)\s*=\s*R\$\s*(' + BRN + ')', t))
    d['emissao'] = iso(g(r'Data e Hora de Emiss.o\s*\n.*?(' + DT + ')', t))
    d['tomador'] = (g(r'TOMADOR DE SERVI.OS\s*\n\s*Nome/Raz.o Social:\s*(.+?)\s*$', t, fl=re.M) or '').strip() or None
    d['cnpj'] = g(r'TOMADOR DE SERVI.OS\s*\n.*?\n\s*CPF/CNPJ:\s*([\d./-]+)', t)
    d['competencia'] = g(r'COMPETENCIA\s+(\d\d/\d\d/\d{4}|\d{6})', t)
    return d


LIMITE_PDF = 20  # segundos por analítico em PDF
_pool = None


def ler_analitico_limite(p, t, com_csv):
    """Analítico com layout diferente faz a regex VIDA levar segundos por linha; passou do limite, vira erro e as vidas vêm do CSV."""
    global _pool
    obr = g(r'Obriga..o\s+(\d+)', t)
    if obr in com_csv:
        return ler_analitico(p, t, com_csv)  # só cabeçalho: rápido, sem processo separado
    _pool = _pool or multiprocessing.Pool(1)
    try:
        return _pool.apply_async(ler_analitico, (p, t)).get(LIMITE_PDF)
    except multiprocessing.TimeoutError:
        _pool.terminate(); _pool = None
        # sem CSV e PDF lento: fica o cabeçalho (obrigação, valor, empresas) sem as vidas, e o aviso vai para o log
        d = ler_analitico(p, t, {obr})
        if d['tipo'] == 'fatura':
            d['fonte_vidas'] = 'pdf'
            d['erros'] = [f'Vidas do PDF analítico não lidas em {LIMITE_PDF} s (layout diferente); sem CSV na pasta. Conferir no analítico.']
        return d


def main(root, out, portal=None):
    docs = ler_portal(portal) if portal else []
    analiticos = []  # lidos no fim, quando já se sabe quais obrigações têm CSV
    for dp, dn, fn in os.walk(root):
        dn.sort()
        for f in sorted(fn):
            p = os.path.join(dp, f); rel = os.path.relpath(p, root).replace('\\', '/')
            low = f.lower()
            try:
                if low.endswith('.pdf'):
                    t = txt(p); h = t[:1500]
                    if 'Analítico Fatura' in h or 'Anal\u00edtico Fatura' in h: d = dict(tipo='_analitico', arquivo=p); analiticos.append((len(docs), p, t))
                    elif 'FATURA DE CO-PARTICIPA' in h: d = ler_copart(p, t)
                    elif 'PAGAR ESTA FATURA' in h: d = ler_individual(p, t)
                    elif 'Impressão de Bloqueto' in h: d = ler_bloqueto(p, t)
                    elif 'DISCRIMINAÇÃO DA FATURA' in t and 'Num Documento' in t: d = ler_boleto_nd(p, t)
                    elif 'NFS-e' in h or 'Nota Fiscal Eletrônica' in h or 'nfe.prefeitura' in t: d = ler_nf(p, t)
                    elif 'REAJUSTE' in h.upper(): d = dict(tipo='ignorado', arquivo=p, motivo='carta/estudo de reajuste')
                    else: d = dict(tipo='ignorado', arquivo=p, motivo='não é fatura, boleto nem NF', inicio=' '.join(t.split())[:100])
                elif low.endswith('.csv'):
                    d = ler_csv(p)
                else:
                    ext = f.rsplit('.', 1)[-1].lower() if '.' in f else ''
                    mot = {'xlsx': 'planilha da equipe (matrículas / copart / conferência)', 'xlsm': 'planilha da equipe', 'txt': 'TXT de coparticipação',
                           'zip': 'arquivo compactado', 'rar': 'arquivo compactado', 'py': 'script da equipe', 'pptx': 'apresentação'}.get(ext, 'formato ' + ext)
                    d = dict(tipo='ignorado', arquivo=p, motivo=mot)
            except Exception as e:
                d = dict(tipo='erro', arquivo=p, erro=repr(e))
            d['rel'] = rel
            d['cod_arquivo'] = cod_arquivo(f)
            d['mes_arquivo'] = mmaa_arquivo(f)
            d['mes_pasta'] = pasta_mes(rel)
            docs.append(d)
    com_csv = {str(x.get('obrigacao')) for x in docs if x['tipo'] in ('portal', 'csv') and x.get('linhas')}
    for i, p, t in analiticos:
        try:
            d = ler_analitico_limite(p, t, com_csv)
        except Exception as e:
            d = dict(tipo='erro', arquivo=p, erro=repr(e))
        docs[i] = {**d, **{k: docs[i][k] for k in ('rel', 'cod_arquivo', 'mes_arquivo', 'mes_pasta')}}
    if _pool: _pool.close()
    json.dump(docs, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
    print(Counter((x['tipo'], x.get('layout')) for x in docs))


if __name__ == '__main__':
    main(*sys.argv[1:4])
