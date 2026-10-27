# -*- coding: utf-8 -*-
"""Distribuição de vidas — usado por vidas.py. Só lê Empresas/Vidas; devolve tabelas."""
import openpyxl, collections
FAIXAS = ['0-18', '19-23', '24-28', '29-33', '34-38', '39-43', '44-48', '49-53', '54-58', '59+']


def faixa(idade):
    if idade is None:
        return None
    for i, lim in enumerate([18, 23, 28, 33, 38, 43, 48, 53, 58]):
        if idade <= lim:
            return FAIXAS[i]
    return '59+'


def carregar(base):
    wb = openpyxl.load_workbook(base, read_only=True, data_only=True)
    emp = {r[0]: (r[10] or r[1]) for r in wb['Empresas'].iter_rows(min_row=2, values_only=True) if r[0]}
    V = collections.defaultdict(list)  # (eid, op) -> comp -> list
    for r in wb['Vidas'].iter_rows(min_row=2, values_only=True):
        if not r[0] or r[15] not in ('Ativo', None):
            continue
        idade = r[9] if isinstance(r[9], (int, float)) else None
        chave = str(r[7]).strip() if r[7] else (str(r[6]).strip().upper() + '|' + str(r[8] or idade))
        V[(r[1], r[2], r[0])].append({'k': chave, 'nome': r[6], 'idade': idade, 'td': 'T' if r[11] == 'Titular' else 'D',
                                      'plano': r[13] or '(sem plano)', 'par': r[10]})
    return emp, V


def tabelas(base, bloqueados=()):
    """bloqueados: set de (comp, eid, op) com relação incompleta — fora do movimento."""
    emp, V = carregar(base)
    comps_por = collections.defaultdict(list)
    for (eid, op, comp) in V:
        comps_por[(eid, op)].append(comp)
    # 1) carteira por operadora x competência
    cart = collections.defaultdict(lambda: [set(), 0, 0, 0])
    for (eid, op, comp), vs in V.items():
        c = cart[(op, comp)]; c[0].add(eid); c[1] += len(vs); c[2] += sum(v['td'] == 'T' for v in vs); c[3] += sum(v['td'] == 'D' for v in vs)
    carteira = [[op, comp, len(c[0]), c[1], c[2], c[3]] for (op, comp), c in sorted(cart.items())]
    # 2) distribuição: última competência de cada empresa
    dist, planos = [], []
    todas = sorted({c for (_, _, c) in V}); corte = todas[-2] if len(todas) > 1 else todas[-1]
    tot = collections.defaultdict(lambda: collections.Counter())
    for (eid, op), comps in sorted(comps_por.items()):
        ult = max(comps); vs = V[(eid, op, ult)]
        fx = collections.Counter(faixa(v['idade']) for v in vs)
        t = sum(v['td'] == 'T' for v in vs)
        idades = [v['idade'] for v in vs if v['idade'] is not None]
        linha = [eid, emp.get(eid, eid), op, ult, len(vs), t, len(vs) - t] + [fx.get(f, 0) for f in FAIXAS] + \
                [fx.get(None, 0), round(sum(idades) / len(idades), 1) if idades else None,
                 round(fx.get('59+', 0) / len(vs) * 100, 1) if vs else None, 'Sim' if ult >= corte else 'Não']
        dist.append(linha)
        if ult < corte:
            continue
        T = tot[op]; T['vidas'] += len(vs); T['T'] += t
        for f in FAIXAS + [None]:
            T[f] += fx.get(f, 0)
        T['soma_idade'] += sum(idades); T['n_idade'] += len(idades)
        pc = collections.defaultdict(lambda: [0, 0])
        for v in vs:
            pc[v['plano']][0 if v['td'] == 'T' else 1] += 1
        for p, (a, b) in sorted(pc.items(), key=lambda x: -sum(x[1])):
            planos.append([eid, emp.get(eid, eid), op, ult, p, a, b, a + b])
    for op, T in sorted(tot.items()):
        dist.append(['TOTAL', 'Total ' + op, op, '', T['vidas'], T['T'], T['vidas'] - T['T']] + [T[f] for f in FAIXAS] +
                    [T[None], round(T['soma_idade'] / T['n_idade'], 1) if T['n_idade'] else None,
                     round(T['59+'] / T['vidas'] * 100, 1) if T['vidas'] else None, 'Carteira atual (última fatura ≥ %s)' % corte])
    # 3) movimento mês a mês
    mov = []
    for (eid, op), comps in sorted(comps_por.items()):
        comps = sorted(comps)
        for a, b in zip(comps, comps[1:]):
            ya, mo = int(a[:4]), int(a[5:])
            seguinte = '%04d-%02d' % (ya + mo // 12, mo % 12 + 1)
            ka = {v['k']: v for v in V[(eid, op, a)]}; kb = {v['k']: v for v in V[(eid, op, b)]}
            ent = [kb[k] for k in kb if k not in ka]; sai = [ka[k] for k in ka if k not in kb]
            obs = []
            if b != seguinte:
                obs.append('Mês(es) sem relação entre %s e %s' % (a, b))
            if (a, eid, op) in bloqueados or (b, eid, op) in bloqueados:
                obs.append('Relação incompleta num dos meses — não confiar')
            mov.append([eid, emp.get(eid, eid), op, b, a, len(ka), len(ent), len(sai), len(kb), len(kb) - len(ka),
                        '; '.join(sorted(v['nome'] or '' for v in ent))[:2000],
                        '; '.join(sorted(v['nome'] or '' for v in sai))[:2000], ' | '.join(obs)])
    return carteira, dist, planos, mov


CAB = {
    'Vidas Carteira': ['Operadora', 'Competência (AAAA-MM)', 'Empresas', 'Vidas ativas', 'Titulares', 'Dependentes'],
    'Vidas Distribuição': ['ID Empresa', 'Empresa', 'Operadora', 'Competência (última)', 'Vidas ativas', 'Titulares', 'Dependentes']
                          + ['Faixa ' + f for f in FAIXAS] + ['Sem idade', 'Idade média', '% 59+', 'Na carteira atual?'],
    'Vidas Planos': ['ID Empresa', 'Empresa', 'Operadora', 'Competência (última)', 'Plano', 'Titulares', 'Dependentes', 'Total'],
    'Vidas Movimento': ['ID Empresa', 'Empresa', 'Operadora', 'Competência', 'Comparada com', 'Vidas antes', 'Entradas', 'Saídas',
                        'Vidas agora', 'Saldo', 'Quem entrou', 'Quem saiu', 'Observações'],
}
