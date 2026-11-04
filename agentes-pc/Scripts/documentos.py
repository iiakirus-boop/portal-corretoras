# -*- coding: utf-8 -*-
"""Sobe para o portal os PDFs de fatura e boleto, para a empresa baixar no login dela.

O sincronizar.py chama sozinho no fim (depois de gravar as faturas no banco). Também dá para rodar à mão:
  python documentos.py             últimos 4 meses
  python documentos.py --meses 12  últimos 12 meses
  python documentos.py --seco      só mostra o que subiria, sem enviar

Como funciona: pergunta ao banco quais faturas ainda não têm PDF (agente_docs_faltando), acha a linha
da fatura na aba Faturas da Base_Faturas_Vidas.xlsx (competência + nº da fatura) e manda o arquivo das
colunas U (fatura) e W (boleto) para a função agente-arquivo, que guarda no bucket "documentos" e liga
à fatura. Só envia o que falta: rodar de novo não duplica. Só lê a planilha; nunca grava nela.
Sem rede ou sem token, avisa e segue.
"""
import datetime, json, os, sys, urllib.error, urllib.parse, urllib.request
import banco

AQUI = os.path.dirname(os.path.abspath(__file__))
FAT = os.path.dirname(AQUI)
BASE = os.path.join(FAT, 'Base_Faturas_Vidas.xlsx')
FUNCAO = banco.URL.replace('/rest/v1/rpc/', '/functions/v1/agente-arquivo')
COL_COMP, COL_NUM, COL_FATURA, COL_BOLETO = 1, 5, 21, 23  # A, E, U, W da aba Faturas


def _txt(v):
    if v is None:
        return ''
    if isinstance(v, float) and v.is_integer():
        v = int(v)
    return str(v).strip()


def _comp(v):
    if isinstance(v, (datetime.date, datetime.datetime)):
        return f'{v.year}-{v.month:02d}'
    return _txt(v)[:7]


def _arquivo(rel):
    """Caminho da planilha (a partir de 'Faturas/') -> arquivo no PC; só PDF que existe."""
    rel = _txt(rel)
    if not rel or not rel.lower().endswith('.pdf'):
        return None
    p = rel if os.path.isabs(rel) else os.path.join(FAT, *rel.replace('\\', '/').split('/'))
    return p if os.path.isfile(p) else None


def linhas_da_base(desde):
    import openpyxl
    wb = openpyxl.load_workbook(BASE, read_only=True, data_only=True)
    ws = wb['Faturas']
    out = {}
    for r in ws.iter_rows(min_row=2, values_only=True):
        if len(r) < COL_BOLETO or not r[COL_NUM - 1]:
            continue
        comp = _comp(r[COL_COMP - 1])
        if desde and comp < desde:
            continue
        out.setdefault((comp, _txt(r[COL_NUM - 1])), []).append((r[COL_FATURA - 1], r[COL_BOLETO - 1]))
    wb.close()
    return out


def enviar_pdf(fatura, tipo, caminho):
    q = urllib.parse.urlencode({'fatura': fatura, 'tipo': tipo, 'nome': os.path.basename(caminho)})
    req = urllib.request.Request(f'{FUNCAO}?{q}', data=open(caminho, 'rb').read(), method='POST',
                                 headers={'apikey': banco.KEY, 'x-agente-token': banco._token(),
                                          'Content-Type': 'application/pdf'})
    try:
        urllib.request.urlopen(req, timeout=120).read()
        return True
    except urllib.error.HTTPError as e:
        print(f'[documentos] {os.path.basename(caminho)}: erro {e.code} {e.read()[:200].decode(errors="ignore")}')
    except Exception as e:  # sem rede, proxy etc.
        print(f'[documentos] {os.path.basename(caminho)}: sem conexão ({e.__class__.__name__}).')
    return False


def main(meses=4, seco=False):
    if not banco._token():
        print('[documentos] sem o token dos agentes: nada enviado.'); return 0
    desde = None
    if meses:
        h = datetime.date.today().replace(day=1)
        y, m = h.year, h.month - (meses - 1)
        while m < 1:
            m += 12; y -= 1
        desde = f'{y}-{m:02d}'
    faltando = banco._rpc('agente_docs_faltando', dict(p_corretora=banco.CORRETORA, p_desde=desde))
    if faltando is None:
        return 1
    if not faltando:
        print('[documentos] todas as faturas já têm PDF no portal.'); return 0
    base = linhas_da_base(desde)
    enviados = sem_arquivo = erros = 0
    for f in faltando:
        achou = base.get((f['competencia'], _txt(f['numero'])))
        if not achou or len(achou) > 1:  # sem linha na planilha, ou duas faturas com o mesmo nº no mês: não arrisca
            sem_arquivo += 1; continue
        arq_f, arq_b = (_arquivo(x) for x in achou[0])
        envios = []
        if arq_f and arq_b and os.path.normcase(arq_f) == os.path.normcase(arq_b):
            if f['falta_fatura'] or f['falta_boleto']:
                envios.append(('ambos', arq_f))  # Bradesco: fatura e boleto no mesmo PDF
        else:
            if f['falta_fatura'] and arq_f:
                envios.append(('fatura', arq_f))
            if f['falta_boleto'] and arq_b:
                envios.append(('boleto', arq_b))
        if not envios:
            sem_arquivo += 1; continue
        for tipo, arq in envios:
            if seco:
                print(f'[documentos] (seco) {f["competencia"]} {f["numero"]} {tipo}: {os.path.basename(arq)}'); enviados += 1
            elif enviar_pdf(f['id'], tipo, arq):
                enviados += 1
            else:
                erros += 1
    print(f'[documentos] {enviados} PDF(s) {"para enviar" if seco else "enviados ao portal"}'
          f'{f", {erros} com erro" if erros else ""}; {sem_arquivo} fatura(s) sem PDF no PC.')
    return 1 if erros else 0


if __name__ == '__main__':
    a = sys.argv[1:]
    meses = None if '--tudo' in a else int(a[a.index('--meses') + 1]) if '--meses' in a else 4
    sys.exit(main(meses, '--seco' in a))
