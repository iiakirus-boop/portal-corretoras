# -*- coding: utf-8 -*-
"""Agente Vidas -> Central: gera _painel/vidasdist.json (um documento por empresa) para a coleção 'vidasdist'."""
import json, os, collections, datetime as dt
import vidas, vidas_dist, sexo as SX, csv
from vidas_dist import faixa, FAIXAS

emp, det, fat = vidas.ler()
linhas = vidas.conferir(emp, det, fat)
conf = {(l[0], l[1]): {'inf': l[4], 'st': l[11], 'acao': l[12]} for l in linhas if l[0] != '—'}
bloq = {(l[0], l[1], l[3]) for l in linhas if l[11] == '❌ Faltam vidas no detalhe'}
nomes, V = vidas_dist.carregar(vidas.BASE)
_, _, _, mov = vidas_dist.tabelas(vidas.BASE, bloq)

# valor por vida (precisa do prêmio): reler rápido
import openpyxl
wb = openpyxl.load_workbook(vidas.BASE, read_only=True, data_only=True)
val = collections.defaultdict(float)
for r in wb['Vidas'].iter_rows(min_row=2, values_only=True):
    if r[0] and r[15] in ('Ativo', None):
        val[(r[1], r[0], r[13] or '(sem plano)')] += (r[26] if isinstance(r[26], (int, float)) else (r[18] or 0) or 0)

over, brad = SX.carregar()
fontes = collections.Counter(); semsexo = collections.Counter()
docs = {}
for (eid, op, comp), vs in V.items():
    d = docs.setdefault(eid, {'eid': eid, 'nome': nomes.get(eid, eid), 'op': op, 'comps': {}, 'mov': [], 'faixas': [f.replace('-', '–') for f in FAIXAS]})
    fT = [0] * 10; fD = [0] * 10; sem = 0; ids = []
    G = {k: [0] * 11 for k in ('TM', 'TF', 'TN', 'DM', 'DF', 'DN')}  # posição 10 = sem idade
    for v in vs:
        sx, fo = SX.sexo(v['nome'], v.get('par'), over, brad); fontes[fo] += 1
        if sx == '?': semsexo[str(v['nome']).split()[0].upper() if v['nome'] else '?'] += 1
        f = faixa(v['idade']); i = FAIXAS.index(f) if f else 10
        G[('T' if v['td'] == 'T' else 'D') + {'M': 'M', 'F': 'F'}.get(sx, 'N')][i] += 1
    pl = collections.defaultdict(lambda: [0, 0])
    for v in vs:
        f = faixa(v['idade'])
        if f is None: sem += 1
        else:
            i = FAIXAS.index(f); (fT if v['td'] == 'T' else fD)[i] += 1; ids.append(v['idade'])
        pl[v['plano']][0 if v['td'] == 'T' else 1] += 1
    c = conf.get((comp, eid), {})
    d['comps'][comp] = {'at': len(vs), 'T': sum(fT) + sum(1 for v in vs if v['td'] == 'T' and v['idade'] is None),
                        'fT': fT, 'fD': fD, 'sem': sem,
                        'media': round(sum(ids) / len(ids), 1) if ids else None, 'max': max(ids) if ids else None, 'min': min(ids) if ids else None,
                        'planos': sorted([[p, a, b, round(val[(eid, comp, p)], 2)] for p, (a, b) in pl.items()], key=lambda x: -(x[1] + x[2])),
                        'inf': c.get('inf'), 'st': c.get('st'), 'acao': c.get('acao'), 'sx': G}
    d['comps'][comp]['D'] = len(vs) - d['comps'][comp]['T']
for m in mov:
    eid = m[0]
    if eid in docs:
        docs[eid]['mov'].append({'comp': m[3], 'de': m[4], 'antes': m[5], 'ent': m[6], 'sai': m[7], 'agora': m[8],
                                 'entN': m[10].split('; ') if m[10] else [], 'saiN': m[11].split('; ') if m[11] else [], 'obs': m[12]})
agora = dt.datetime.now().isoformat(timespec='seconds')
for d in docs.values():
    d['ult'] = max(d['comps']); d['atualizadoEm'] = agora
    # fatura sem relação (Bradesco etc.): marca as competências
for l in linhas:
    if l[11] == '❌ Sem relação de vidas' and l[1] in docs:
        docs[l[1]]['comps'].setdefault(l[0], {'at': 0, 'semRel': True, 'inf': l[4], 'st': l[11], 'acao': l[12]})
# nomes sem sexo identificado -> planilha para a equipe completar (coluna sexo = M ou F)
ja = set()
if os.path.exists(SX.CSV):
    ja = {SX._s(r['nome']) for r in csv.DictReader(open(SX.CSV, encoding='utf-8-sig'), delimiter=';')}
novos = [n for n in sorted(semsexo) if SX._s(n) not in ja]
if novos or not os.path.exists(SX.CSV):
    nova = not os.path.exists(SX.CSV)
    with open(SX.CSV, 'a', encoding='utf-8-sig' if nova else 'utf-8', newline='') as fh:
        w = csv.writer(fh, delimiter=';')
        if nova: w.writerow(['nome', 'sexo', 'vidas', 'observacao'])
        for n in novos: w.writerow([n, '', semsexo[n], 'primeiro nome não identificado: preencha M ou F'])
print('fontes do sexo:', dict(fontes), '| nomes sem sexo:', len(semsexo), sum(semsexo.values()))
out = os.path.join(vidas.AQUI, '_painel', 'vidasdist.json')
json.dump(docs, open(out, 'w', encoding='utf-8'), ensure_ascii=False)
sz = sorted((len(json.dumps(d, ensure_ascii=False)), k) for k, d in docs.items())
print(len(docs), 'empresas; maior doc', sz[-1], 'total', sum(s for s, _ in sz))
