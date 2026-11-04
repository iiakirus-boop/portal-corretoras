# -*- coding: utf-8 -*-
"""Teste de fumaça de uma rodada de faturas: o rodar.py chama no fim, em código e sem tokens.

Confere três contagens e devolve a lista de problemas (vazia = tudo certo):
  1. arquivos baixados  = faturas lidas   (Porto: um PDF FATURADOS por fatura; Bradesco: um kit por PDF; todos: nenhum
                                           arquivo com erro de leitura, como o pdftotext que não foi achado em 03/11/26)
  2. faturas lidas      = faturas gravadas (novas + as que já estavam na planilha; Porto: fatura sem cadastro não foi gravada)
Com problema, a rodada termina como "erro" no master com o nome dos arquivos, mesmo que o resto tenha ido para o banco.

Uso à mão: python fumaca.py <op> <json da leitura> <pasta de entrada> [<saída do gravar>]
"""
import glob, json, os, re, sys

MAX_NOMES = 6


def _nomes(lista):
    lista = [os.path.basename(str(x)) for x in lista]
    return ', '.join(lista[:MAX_NOMES]) + (f' e mais {len(lista) - MAX_NOMES}' if len(lista) > MAX_NOMES else '')


def _json(p):
    try:
        return json.load(open(p, encoding='utf-8'))
    except Exception:
        return None


def ultima_linha_json(p):
    """O gravar_<op>.py imprime o resumo numa linha JSON no fim."""
    try:
        linhas = open(p, encoding='utf-8', errors='replace').read().strip().splitlines()
    except OSError:
        return None
    for l in reversed(linhas):
        l = l.strip()
        if l.startswith('{') and l.endswith('}'):
            try:
                return json.loads(l)
            except ValueError:
                pass
    return None


# mesmo padrão do faturas_porto.py (ARQ): <sub> - <NOME> FATURADOS PORTO SAUDE|ODONTO MM-AA[ Unn].pdf, sem os PARCIAL
FATURADOS_PORTO = re.compile(r'^(\d+) - (.+?) FATURADOS PORTO (SAUDE|ODONTO) (\d\d)-(\d\d)( U\d\d)?\.pdf$', re.I)


def faturados_porto(entrada):
    """PDFs FATURADOS (um por título) nas pastas da competência Porto, como o faturas_porto.py procura."""
    return sorted(os.path.join(entrada, d, f) for d in os.listdir(entrada) if os.path.isdir(os.path.join(entrada, d))
                  for f in os.listdir(os.path.join(entrada, d)) if FATURADOS_PORTO.match(f))


def leitura(op, js, entrada, pdfs=None):
    """Arquivos baixados x faturas lidas. Devolve (problemas, lidas)."""
    docs = _json(js)
    if not isinstance(docs, list):
        return [f'a leitura não gerou o resultado ({os.path.basename(js)} vazio ou inválido)'], 0
    probs = []
    erros = [d for d in docs if isinstance(d, dict) and d.get('tipo') == 'erro']
    if erros:
        probs.append(f'{len(erros)} arquivo(s) não lido(s): {_nomes(d.get("arquivo") for d in erros)}')
    if op == 'porto':
        fats = [d for d in docs if isinstance(d, dict) and d.get('tipo') == 'fatura']
        baixados = faturados_porto(entrada)
        lidos = {os.path.normcase(os.path.abspath(d.get('arquivo') or '')) for d in fats}
        faltam = [p for p in baixados if os.path.normcase(os.path.abspath(p)) not in lidos
                  and not any(os.path.normcase(os.path.abspath(p)) == os.path.normcase(os.path.abspath(e.get('arquivo') or '')) for e in erros)]
        if faltam:
            probs.append(f'{len(baixados)} fatura(s) baixada(s) e {len(fats)} lida(s); faltou ler: {_nomes(faltam)}')
        return probs, len(fats)
    if op == 'bradesco':
        pdfs = pdfs or []
        if len(docs) != len(pdfs):
            probs.append(f'{len(pdfs)} PDF(s) baixado(s) e {len(docs)} lido(s)')
        vazios = [p for p, d in zip(pdfs, docs) if not isinstance(d, dict) or not d.get('subfaturas')]
        if vazios:
            probs.append(f'{len(vazios)} PDF(s) sem fatura lida: {_nomes(vazios)}')
        return probs, len(docs) - len(vazios)
    lidas = [d for d in docs if isinstance(d, dict) and d.get('tipo') != 'erro']
    return probs, len(lidas)


def gravacao(op, lidas, saida_gravar):
    """Faturas lidas x gravadas (novas + já na planilha)."""
    r = ultima_linha_json(saida_gravar)
    if r is None:
        return ['a gravação não mostrou o resumo (não dá para conferir o que foi gravado)']
    gravadas, ja = int(r.get('faturas') or 0), int(r.get('ja_na_planilha') or 0)
    probs = []
    if op == 'porto':
        pend = r.get('pendencias') or []
        if pend:
            probs.append(f'{len(pend)} fatura(s) lida(s) e não gravada(s): ' + '; '.join(pend[:3]) + (' ...' if len(pend) > 3 else ''))
        if lidas != gravadas + ja + len(pend):
            probs.append(f'{lidas} fatura(s) lida(s), {gravadas} gravada(s) agora e {ja} já estavam na planilha')
    elif lidas and not gravadas and not ja:
        probs.append(f'{lidas} documento(s) lido(s) e nenhuma fatura gravada nem já na planilha')
    return probs


if __name__ == '__main__':
    a = sys.argv[1:]
    if len(a) < 3:
        print(__doc__); sys.exit(2)
    op, js, entrada = a[:3]
    pdfs = sorted(glob.glob(os.path.join(entrada, '*.pdf'))) if op == 'bradesco' else None
    p, n = leitura(op, js, entrada, pdfs)
    if len(a) > 3:
        p += gravacao(op, n, a[3])
    print(f'{n} fatura(s) lida(s).')
    for x in p:
        print('PROBLEMA:', x)
    print('Teste da rodada: OK' if not p else 'Teste da rodada: com problema')
    sys.exit(1 if p else 0)
