# -*- coding: utf-8 -*-
"""Gera os JSON da Central para a Bradesco Saúde e Bradesco Dental a partir da base (só lê a planilha).

Uso: python painel_bradesco.py [<Base_Faturas_Vidas.xlsx>] [--comp AAAA-MM ...] [--publicar]
Faturas: _painel/fat_AAAA-MM_bradesco.json e fat_AAAA-MM_bradescodental.json, um item por NF. Sem --comp, só as
competências que ainda não têm documento e a mais recente da base (as antigas já publicadas ficam como estão; NF que já
estava no documento mantém os ajustes feitos à mão).
Comissão: _painel/com_AAAA-MM_bradesco.json; o documento existente só ganha as ordens novas.
Mesmas regras do painel_porto.py (faturas, comissoes, juntar). Depois, banco.publicar() sobe para o site.
"""
import openpyxl, sys, os, datetime
from painel_porto import faturas, comissoes, escolher, gravar_faturas, gravar_comissoes

AQUI = os.path.dirname(os.path.abspath(__file__))
SLUG = {'Bradesco Saúde': 'bradesco', 'Bradesco Dental': 'bradescodental'}


def gerar(base, out, comps=None):
    wb = openpyxl.load_workbook(base, read_only=True)
    agora = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    fat, nfs, cop = faturas(wb, SLUG)
    os.makedirs(out, exist_ok=True)
    comps = escolher(fat, out, comps)
    arqs = gravar_faturas(fat, comps, out, lambda s: next(k for k, v in SLUG.items() if v == s), agora)
    # shortcut: fatura só procurada na aba Faturas (as fórmulas também olham "Bradesco Pagas"); sem ela o item sai "Sem fatura na base"
    com = comissoes(wb, lambda s: 'BRADESCO' in s, nfs, cop, lambda s: 'Bradesco Saúde S.A.')
    coms = gravar_comissoes(com, out, 'bradesco', 'Bradesco Saúde', lambda c: len(fat.get((c, 'bradesco'), [])), '', agora)
    print(f'Bradesco: faturas de {", ".join(sorted(comps))}; {len(coms)} documento(s) de comissão com ordens novas.')
    return arqs + coms


if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if a != '--publicar']
    comps = set()
    while '--comp' in args:
        i = args.index('--comp'); comps.add(args[i + 1]); del args[i:i + 2]
    base = args[0] if args else os.path.join(os.path.dirname(AQUI), 'Base_Faturas_Vidas.xlsx')
    arqs = gerar(base, os.path.join(AQUI, '_painel'), comps)
    for f in arqs:
        print('  _painel/' + f)
    if '--publicar' in sys.argv:
        import banco
        banco.publicar(arqs)
