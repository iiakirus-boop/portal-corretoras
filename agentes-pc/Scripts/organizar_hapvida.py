"""Organiza os CSV baixados do portal Hapvida (Relatório de Comissão Analítico por Data Pagamento).
Uso: python organizar_hapvida.py <pasta Downloads> <pasta destino Comissoes/AAAA-MM/Hapvida> <lotes.tsv> [arquivo marco: só arquivos mais novos]
Pega os arquivos R*_dyn_*.csv mais recentes (um por lote), casa cada um com o lote pelo total de VL RECEBER
(= valor da obrigação do card), copia com o nome '<lote> - <tipo> - <regra>.csv' e grava lotes.tsv no destino."""
import sys, os, glob, csv, shutil

def n(s):
    s = s.strip().replace('=', '').strip('"')
    return float(s.replace('.', '').replace(',', '.')) if s else 0.0

def total(p):
    rows = list(csv.reader(open(p, encoding='cp1252'), delimiter=';'))
    return round(sum(n(r[26]) for r in rows[1:] if len(r) > 26), 2)

down, dest, man = sys.argv[1:4]
lotes = [l.rstrip('\n').split('\t') for l in open(man, encoding='utf-8') if l.strip()]
if lotes[0][0] == 'lote':
    lotes = lotes[1:]
desde = os.path.getmtime(sys.argv[4]) if len(sys.argv) > 4 else 0
arqs = [a for a in sorted(glob.glob(os.path.join(down, 'R*_dyn_*.csv')), key=os.path.getmtime)
        if os.path.getmtime(a) > desde]
arqs = arqs[:len(lotes)] if desde else arqs[-len(lotes):]
os.makedirs(dest, exist_ok=True)
livres = {a: total(a) for a in arqs}
for i, L in enumerate(lotes):
    v = n(L[7])
    cand = [a for a, t in livres.items() if abs(t - v) <= 0.05]
    a = cand[0] if cand else None
    if a is None:
        print('SEM ARQUIVO', L[0]); continue
    t = livres.pop(a)
    nome = f"{L[0]} - {L[1]} - {L[2]}.csv"
    shutil.copyfile(a, os.path.join(dest, nome))
    print(L[0], L[7], '->', os.path.basename(a), t, 'OK' if abs(t - v) <= 0.05 else 'DIFERENTE')
with open(os.path.join(dest, 'lotes.tsv'), 'w', encoding='utf-8') as f:
    f.write('lote\ttipo\tregra\tintegracao\tini\tfim\tobrigacao\tvalor\n')
    for L in lotes:
        f.write('\t'.join(L) + '\n')
