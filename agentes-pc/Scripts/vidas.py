# -*- coding: utf-8 -*-
"""Agente Vidas — conferência da base de vidas.
Uso:
  python vidas.py relatorio   -> só gera FATURAS/Vidas/Conferencia_Vidas_AAAA-MM-DD.xlsx (não mexe na base)
  python vidas.py gravar      -> backup + grava aba 'Conferência Vidas' e linhas em Agentes / Execuções / Log de Erros
Fonte: abas Empresas, Faturas e Vidas da Base_Faturas_Vidas.xlsx. Nunca altera Faturas nem Vidas.
"""
import openpyxl, collections, os, sys, shutil, datetime as dt
import vidas_dist
from openpyxl.styles import Font, PatternFill, Alignment

AQUI = os.path.dirname(os.path.abspath(__file__))
FAT = os.path.dirname(AQUI)
BASE = os.path.join(FAT, 'Base_Faturas_Vidas.xlsx')
HOJE = dt.datetime.now()
AGENTE = 'Vidas'
ABA = 'Conferência Vidas'
COLS = ['Competência (AAAA-MM)', 'ID Empresa', 'Empresa', 'Operadora', 'Vidas na fatura', 'Linhas no detalhe',
        'Ativos no detalhe', 'Titulares', 'Dependentes', 'Sem idade', 'Diferença (fatura − ativos)', 'Status',
        'O que fazer', 'Agente que resolve', 'Arquivo de vidas', 'Conferido em']
DONO = {'Porto Saúde': 'Faturas Porto', 'Bradesco Saúde': 'Faturas Bradesco', 'Bradesco Dental': 'Faturas Bradesco',
        'Amil': 'Faturas Amil', 'Amil Dental': 'Faturas Amil', 'Santa Helena': 'Faturas Amil', 'SulAmérica': 'Faturas SulAmérica'}
ULTIMA_ESPERADA = '2026-09'  # empresa ativa sem fatura desde antes disso entra como pendência


def ler():
    wb = openpyxl.load_workbook(BASE, read_only=True, data_only=True)
    emp = {r[0]: r for r in wb['Empresas'].iter_rows(min_row=2, values_only=True) if r[0]}
    det = collections.defaultdict(lambda: collections.Counter())
    for r in wb['Vidas'].iter_rows(min_row=2, values_only=True):
        if not r[0]:
            continue
        c = det[(r[0], r[1], r[2])]
        c['linhas'] += 1
        if r[15] in ('Ativo', None):
            c['ativos'] += 1
            c['T' if r[11] == 'Titular' else 'D'] += 1
            if r[9] is None and not r[8]:
                c['semidade'] += 1
    fat = collections.defaultdict(lambda: {'inf': 0, 'arq': None, 'n': 0})
    for r in wb['Faturas'].iter_rows(min_row=2, values_only=True):
        if not r[0]:
            continue
        f = fat[(r[0], r[1], r[3])]
        f['n'] += 1
        f['inf'] += r[10] if isinstance(r[10], (int, float)) else 0
        f['arq'] = f['arq'] or r[21] or r[20]
    return emp, det, fat


def conferir(emp, det, fat):
    linhas = []
    for k in sorted(set(fat) | set(det)):
        comp, eid, op = k
        f = fat.get(k, {'inf': 0, 'arq': None, 'n': 0}); d = det.get(k, collections.Counter())
        inf, lin, at = f['inf'], d['linhas'], d['ativos']
        e = emp.get(eid)
        nome = (e[10] or e[1]) if e else eid
        dono = DONO.get(op, 'Faturas ' + str(op))
        if not f['n']:
            st, acao = '⚠️ Vidas sem fatura', 'Conferir se a fatura desta competência foi gravada'
        elif lin == 0:
            st, acao = '❌ Sem relação de vidas', 'Baixar a relação de vidas (TXT/PDF) desta competência e rodar o agente de faturas'
        elif inf == 0:
            st, acao = '⚠️ Fatura sem nº de vidas', 'Preencher "Vidas informadas" na aba Faturas (o detalhe tem %d ativos)' % at
        elif at == inf or lin == inf:
            st, acao = '✅ OK', ''
        elif abs(inf - at) <= max(2, round(inf * 0.03)):
            st, acao = '✅ OK (diferença de excluídos/pró-rata)', ''
        elif at < inf:
            st, acao = '❌ Faltam vidas no detalhe', 'Relação incompleta: baixar de novo (faltam %d). Ver subestipulantes/unidades' % (inf - at)
        else:
            st, acao = '⚠️ Nº de vidas da fatura parece errado', 'Detalhe tem %d ativos e fatura diz %d: conferir o PDF e corrigir a aba Faturas' % (at, inf)
        linhas.append([comp, eid, nome, op, inf, lin, at, d['T'], d['D'], d['semidade'], inf - at, st, acao,
                       '' if st.startswith('✅') else dono, f['arq'], HOJE.replace(microsecond=0)])
    # empresas ativas sem fatura recente
    ult = collections.defaultdict(str)
    for (comp, eid, op) in fat:
        ult[eid] = max(ult[eid], comp)
    for eid, e in emp.items():
        if e[8] == 'Sim' and ult[eid] < ULTIMA_ESPERADA:
            linhas.append([ult[eid] or '—', eid, e[10] or e[1], e[3], None, None, None, None, None, None, None,
                           '❌ Empresa ativa sem fatura recente',
                           'Última fatura: %s. Conferir se cancelou (marcar Ativa? = Não) ou baixar as faturas' % (ult[eid] or 'nenhuma'),
                           DONO.get(e[3], ''), None, HOJE.replace(microsecond=0)])
    return linhas


def escrever_aba(ws, linhas):
    ws.append(COLS)
    for c in ws[1]:
        c.font = Font(bold=True, color='FFFFFF'); c.fill = PatternFill('solid', fgColor='1F3864')
        c.alignment = Alignment(wrap_text=True, vertical='center')
    for l in linhas:
        ws.append(l)
    larg = [12, 8, 26, 15, 10, 10, 10, 9, 11, 9, 12, 34, 60, 18, 50, 18]
    for i, w in enumerate(larg):
        ws.column_dimensions[openpyxl.utils.get_column_letter(i + 1)].width = w
    ws.freeze_panes = 'A2'; ws.auto_filter.ref = ws.dimensions
    for r in ws.iter_rows(min_row=2, min_col=16, max_col=16):
        r[0].number_format = 'dd/mm/yyyy hh:mm'


def escrever_dist(wb, linhas, primeira_pos=None):
    bloq = {(l[0], l[1], l[3]) for l in linhas if l[11] == '❌ Faltam vidas no detalhe'}
    carteira, dist, planos, mov = vidas_dist.tabelas(BASE, bloq)
    pos = primeira_pos
    for nome, dados in zip(vidas_dist.CAB, [carteira, dist, planos, mov]):
        if nome in wb.sheetnames:
            i = wb.sheetnames.index(nome); del wb[nome]; ws = wb.create_sheet(nome, i)
        else:
            ws = wb.create_sheet(nome, pos) if pos is not None else wb.create_sheet(nome)
            if pos is not None: pos += 1
        ws.append(vidas_dist.CAB[nome])
        for c in ws[1]:
            c.font = Font(bold=True, color='FFFFFF'); c.fill = PatternFill('solid', fgColor='1F3864')
            c.alignment = Alignment(wrap_text=True, vertical='center')
        for d in dados:
            ws.append(d)
            if d[0] == 'TOTAL':
                for c in ws[ws.max_row]: c.font = Font(bold=True)
        for i in range(1, len(vidas_dist.CAB[nome]) + 1):
            ws.column_dimensions[openpyxl.utils.get_column_letter(i)].width = 12
        ws.column_dimensions['B'].width = 26
        if nome == 'Vidas Planos': ws.column_dimensions['E'].width = 55
        if nome == 'Vidas Movimento':
            for c in 'KL': ws.column_dimensions[c].width = 50
            ws.column_dimensions['M'].width = 40
        ws.freeze_panes = 'A2'; ws.auto_filter.ref = ws.dimensions
    return len(carteira), len(dist), len(planos), len(mov)


def resumo(linhas):
    c = collections.Counter(l[11] for l in linhas)
    return c


def main():
    modo = sys.argv[1] if len(sys.argv) > 1 else 'relatorio'
    emp, det, fat = ler()
    linhas = conferir(emp, det, fat)
    c = resumo(linhas)
    ok = sum(v for k, v in c.items() if k.startswith('✅'))
    erro = sum(v for k, v in c.items() if k.startswith('❌'))
    pend = sum(v for k, v in c.items() if k.startswith('⚠️'))
    print('Itens', len(linhas), '| OK', ok, '| pendência', pend, '| erro', erro)
    for k, v in c.most_common():
        print('  ', k, v)
    if modo == 'relatorio':
        os.makedirs(os.path.join(FAT, 'Vidas'), exist_ok=True)
        out = os.path.join(FAT, 'Vidas', 'Conferencia_Vidas_%s.xlsx' % HOJE.strftime('%Y-%m-%d'))
        wb = openpyxl.Workbook(); ws = wb.active; ws.title = ABA
        escrever_aba(ws, linhas); print('Distribuição:', escrever_dist(wb, linhas)); wb.save(out); print('Relatório:', out)
        return
    lock = os.path.join(FAT, '~$Base_Faturas_Vidas.xlsx')
    if os.path.exists(lock) and '--forcar' not in sys.argv:
        print('PARADO: a base está aberta no Excel (~$Base_Faturas_Vidas.xlsx). Feche e rode de novo.'); sys.exit(2)
    bk = os.path.join(FAT, 'Backups', 'Base_Faturas_Vidas antes Vidas %s.xlsx' % HOJE.strftime('%Y-%m-%d'))
    if not os.path.exists(bk):
        shutil.copy2(BASE, bk)
    wb = openpyxl.load_workbook(BASE)
    if ABA in wb.sheetnames:  # aba do Agente Vidas: é refeita a cada rodada
        idx = wb.sheetnames.index(ABA); del wb[ABA]; ws = wb.create_sheet(ABA, idx)
    else:
        ws = wb.create_sheet(ABA, wb.sheetnames.index('Vidas') + 1)
    escrever_aba(ws, linhas)
    print('Distribuição:', escrever_dist(wb, linhas, wb.sheetnames.index(ABA) + 1))
    ag = wb['Agentes']
    if not any(r[0].value == AGENTE for r in ag.iter_rows(min_row=2)):
        row = next((r[0].row for r in ag.iter_rows(min_row=2) if not r[0].value), ag.max_row + 1)
        for col, v in zip('ABCDEFGH', [AGENTE, 'Confere a base de vidas (fatura × relação de vidas), aponta buracos e monta a distribuição de vidas (faixa ANS, titular/dependente, plano, entradas/saídas)',
                                       'Todas', ABA + ', Vidas Carteira, Vidas Distribuição, Vidas Planos, Vidas Movimento, Log de Erros', 'Mensal', 12, 'Fichas/Vidas.md', 'Ativo']):
            ag[col + str(row)] = v
    ex = wb['Execuções']
    row = next((r[0].row for r in ex.iter_rows(min_row=2) if not r[0].value), ex.max_row + 1)
    comp = max(l[0] for l in linhas if l[0] != '—')
    for col, v in zip('ABCDEFGHIJKLM', [AGENTE, comp, HOJE.replace(microsecond=0), HOJE.replace(microsecond=0),
                                        '⚠️ OK com pendência' if (pend + erro) else '✅ OK', len(linhas), ok, pend, erro,
                                        'Ver aba Conferência Vidas (filtro Status ≠ ✅)', os.path.relpath(bk, FAT),
                                        'Conferência fatura × relação de vidas', 'Bruno']):
        ex[col + str(row)] = v
    lg = wb['Log de Erros']
    ja = {(r[1].value, r[3].value, r[4].value, r[5].value) for r in lg.iter_rows(min_row=2)}
    row = next((r[0].row for r in lg.iter_rows(min_row=2) if not r[0].value), lg.max_row + 1)  # aba cheia: segue na linha seguinte
    grupos = collections.defaultdict(list)
    for l in linhas:
        if l[11] == '❌ Sem relação de vidas':
            grupos[(l[0], l[3], l[13])].append(l[2])
    for (comp, op, dono), nomes in sorted(grupos.items()):
        msg = 'Sem relação de vidas em %d fatura(s): %s' % (len(nomes), ', '.join(sorted(map(str, nomes)))[:800])
        if (comp, 'Várias', 'Vidas', msg) in ja:
            continue
        for col, v in zip('ABCDEFGHI', [HOJE.date(), comp, op, 'Várias', 'Vidas', msg,
                                        'Baixar a relação de vidas dessas faturas e rodar o agente de faturas', 'Não', dono]):
            lg[col + str(row)] = v
        row += 1
    for l in linhas:
        if l[11].startswith('❌') and l[11] != '❌ Sem relação de vidas':
            msg = '%s — fatura %s vidas, detalhe %s ativos' % (l[11][2:], l[4], l[6])
            key = (l[0], l[1], 'Vidas', msg)
            if key in ja:
                continue
            for col, v in zip('ABCDEFGHI', [HOJE.date(), l[0], l[3], l[1], 'Vidas', msg, l[12], 'Não', l[13]]):
                lg[col + str(row)] = v
            row += 1
    wb.save(BASE)
    print('Gravado. Backup:', bk)


if __name__ == '__main__':
    main()
