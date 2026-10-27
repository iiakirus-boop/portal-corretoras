# -*- coding: utf-8 -*-
"""Grava na Base_Faturas_Vidas.xlsx as faturas Bradesco lidas por faturas_bradesco.py.
Uso: python3 gravar_bradesco.py <json do parser> <planilha entrada> <planilha saida> <AAAA-MM-DD processamento>
Nomes curtos por apolice em NOMES (acrescentar quando entrar empresa nova).
"""
import json, sys, copy, re
from datetime import datetime
from collections import OrderedDict, defaultdict
import openpyxl
from shaddai_comum import d, br, cs, last_row  # módulo comum
from openpyxl.utils import get_column_letter as L
from openpyxl.worksheet.cell_range import MultiCellRange

NOMES = {'955411': 'AMANDA SANTOS', '407066': 'ANNA BRANZANI', '412008': 'BILSING', '1081597': 'CAXUANA',
         '982693': 'CAXUANA', '457811': 'AFFONSO DOCERIA', '457988': 'ELIDE MIYASIRO', '1208623': 'ELUMA',
         '1221645': 'IMF', '407067': 'JOSE ROBERTO LOURENCINI', '517208': 'JPA', '1208772': 'MICHELS',
         '455621': 'MK ASSESSORIA', '460602': 'NOVA TRANS', '444357': 'OVERCASTING', '517273': 'PB PERFUMARIA',
         '1061757': 'ROBERTO HEIDRICH', '610919': 'TFR', '1171927': 'TRANSCIARDI', '1189111': 'TRANSCIARDI',
         '542827': 'QUATRO IRMAS', '151768': 'TRIMAQ', '525299': 'VC3', '1242221': 'WALTERMIC'}
SUBNOMES = {'SANCO EMPREENDIMENTOS LTDA': 'SANCO', 'CASAS FRATERNAIS O NAZARENO': 'CASAS FRATERNAIS',
            'RCM ADMINISTRACAO E GESTAO LTDA': 'RCM'}
PAREN = {'': 'Titular', 'FILH': 'Filho(a)', 'CONJ': 'Cônjuge', 'OUTR': 'Outros', 'PAI': 'Pai', 'MAE': 'Mãe', 'AGRE': 'Agregado'}
SUBFORM = ('=IF(C{r}="","",IF(ISNUMBER(SEARCH("Bradesco",IFERROR(INDEX(Empresas!$D:$D,MATCH(A{r},Empresas!$A:$A,0)),""))),'
           'B{r}&" - "&G{r},C{r}&" - "&G{r}))')


def operadora(f):
    return 'Bradesco Dental' if f['cab']['produto'] == 'DENTAL' else 'Bradesco Saúde'


STOP = {'LTDA', 'ME', 'EIRELI', 'EPP', 'SA', 'S/A', 'CIA', 'DE', 'DA', 'DO', 'DOS', 'DAS', 'E', '&', '-'}


def nome_curto(est):
    w = [x for x in re.split(r'\s+', est.strip()) if x and x.upper() not in STOP and not re.fullmatch(r'\d{6,}', x)]
    return ' '.join(w[:2]) or est.strip()


def nc_de(f):
    ap = f['cab']['apolice']
    if ap not in NOMES:
        NOMES[ap] = nome_curto(f['cab']['estipulante'])
    return NOMES[ap]


def excluido(ls):
    return (not ls) or (any(x['mov'] and x['valor'] < 0 for x in ls) and sum(x['valor'] for x in ls) <= 0.005)


def nome_arquivo(f, multi):
    c = f['cab']; ap = c['apolice']; nc = nc_de(f)
    comp = c['competencia']; mmaa = comp[5:] + '-' + comp[2:4]
    pasta = 'BradescoDental' if c['produto'] == 'DENTAL' else 'BradescoSaude'
    prod = 'BRADESCO DENTAL' if c['produto'] == 'DENTAL' else 'BRADESCO SAUDE'
    suf = f" SUB{sorted(f['subfaturas'])[0]}" if multi else ''
    return f'Faturas/{comp}/{pasta}/{ap} - {nc}/{ap} - {nc} FATURADOS{suf} {prod} {mmaa}.pdf'


def vida_formulas(V, r):
    V.cell(r, 26).value = f'=IF(A{r}="","",N(U{r})+N(V{r})+N(W{r})+N(X{r})+N(AF{r}))'
    V.cell(r, 27).value = f'=IF(A{r}="","",N(S{r})+N(T{r})+N(Z{r})+N(Y{r}))'
    V.cell(r, 28).value = f'=IF(A{r}="","",IF(P{r}="Excluído","Exclusão",IF(N(T{r})>0,"Inclusão (pró-rata)","-")))'


def main(js, xin, xout, proc):
    proc = datetime.fromisoformat(proc)
    data = json.load(open(js, encoding='utf-8'))
    wb = openpyxl.load_workbook(xin)
    E, S, F, V, LS, FT = (wb[n] for n in ['Empresas', 'Subestipulantes', 'Faturas', 'Vidas', 'Listas', 'Faturamento'])

    # ---------- Listas: Bradesco Dental logo depois de Bradesco Saúde
    ops = [x for x in (LS.cell(r, 1).value for r in range(2, 31)) if x]
    if 'Bradesco Dental' not in ops:
        ops.insert(ops.index('Bradesco Saúde') + 1, 'Bradesco Dental')
        for i, v in enumerate(ops):
            cs(LS.cell(3, 1), LS.cell(2 + i, 1))
            LS.cell(2 + i, 1).value = v

    # ---------- Faturas: coluna IOF e conferência do boleto = fatura + IOF
    if F.cell(1, 31).value != 'IOF (R$)':
        F.cell(1, 31).value = 'IOF (R$)'; cs(F.cell(1, 17), F.cell(1, 31))
        F.column_dimensions['AE'].width = F.column_dimensions['Q'].width or 14
    for r in range(2, F.max_row + 1):
        F.cell(r, 18).value = f'=IF(OR(A{r}="",Q{r}=""),"",IF(ABS(Q{r}-J{r}-N(AE{r}))<=0.01,"OK","Divergência"))'
        cs(F.cell(r, 17), F.cell(r, 31))

    # ---------- Vidas: coluna Copart sem tipo, entra no Copart total; área formatada até 10001
    VMAX = max(V.max_row, last_row(V) + sum(len(f['vidas']) + len(f['copart']) for f in data) + 1000)
    tplV = V.max_row
    if V.cell(1, 32).value != 'Copart sem tipo (R$)':
        V.cell(1, 32).value = 'Copart sem tipo (R$)'; cs(V.cell(1, 21), V.cell(1, 32))
        V.column_dimensions['AF'].width = V.column_dimensions['U'].width or 14
    for r in range(2, VMAX + 1):
        if r > tplV:
            for c in range(1, 32):
                cs(V.cell(tplV, c), V.cell(r, c))
        vida_formulas(V, r)
        cs(V.cell(min(r, tplV), 21), V.cell(r, 32))
    for dv in V.data_validations.dataValidation:
        dv.sqref = MultiCellRange(str(dv.sqref).replace(str(tplV), str(VMAX)))

    # ---------- Subestipulantes: pasta = apólice - nome curto quando a empresa é Bradesco
    for r in range(2, S.max_row + 1):
        S.cell(r, 9).value = SUBFORM.format(r=r)

    # ---------- Empresas (uma linha por apólice)
    rE = last_row(E); tplE = rE
    nid = max(int(E.cell(r, 1).value[1:]) for r in range(2, rE + 1) if E.cell(r, 1).value)
    ids = {str(E.cell(r, 5).value): E.cell(r, 1).value for r in range(2, rE + 1)
           if str(E.cell(r, 4).value or '').startswith('Bradesco')}
    for r in range(2, rE + 1):
        if str(E.cell(r, 4).value or '').startswith('Bradesco') and E.cell(r, 11).value:
            NOMES[str(E.cell(r, 5).value)] = E.cell(r, 11).value
    # kit sem ficha de boleto (ex.: fatura de crédito, valor negativo): grava sem os dados do boleto
    pend = []
    for f in data:
        if not f.get('boleto', {}).get('end_fatura'):
            c = f['cab']
            f['boleto'] = dict(f.get('boleto') or {}, end_fatura=f"SEM BOLETO {c['apolice']} {c['competencia']} {c['nr']}")
            f['sem_boleto'] = True
            pend.append(f"{c['estipulante']} (apólice {c['apolice']}, {c['competencia']}): boleto não veio no PDF do portal")
    # tirar PDFs repetidos (mesma fatura e competência)
    vistos = set(); uniq = []
    for f in data:
        k = (f['boleto']['end_fatura'], f['cab']['competencia'])
        if k not in vistos:
            vistos.add(k); uniq.append(f)
    resumo_dup = len(data) - len(uniq)
    data = uniq
    por_ap = OrderedDict()
    for f in sorted(data, key=lambda x: (nc_de(x), x['cab']['produto'], x['cab']['competencia'], sorted(x['subfaturas'])[0])):
        por_ap.setdefault(f['cab']['apolice'], []).append(f)
    novas = []
    for ap, fs in por_ap.items():
        if ap in ids:
            continue
        f0 = fs[-1]; b = f0['boleto']
        nid += 1; eid = f'E{nid:03d}'; ids[ap] = eid; rE += 1
        pess = defaultdict(int)
        for v in f0['vidas']:
            if not v['mov']:
                pess[(v['sub'], v['cert'], v['dep'])] += 1
        obs = (f'Cadastrada pelo Agente Faturas a partir do Portal de Negócios Bradesco ({proc:%d/%m/%Y}). '
               f'Código estipulante = nº da apólice; contrato {b.get("contrato")}.')
        if f0['cab']['produto'] == 'SAUDE' and pess and max(pess.values()) > 1:
            obs += ' Conjugado: saúde e dental na mesma fatura.'
        if b.get('debito_automatico'):
            obs += ' Pagamento em débito automático (sem boleto/linha digitável).'
        row = [eid, f0['cab']['estipulante'], b.get('cnpj_pagador'), operadora(f0), ap, b.get('contrato'), ap,
               int(b['vencimento'][8:10]) if b.get('vencimento') else None, 'Sim', obs, nc_de(f0),
               f'=IF(A{rE}="","",COUNTIFS(Subestipulantes!$A:$A,A{rE}))']
        for c, v in enumerate(row, 1):
            cs(E.cell(tplE, c), E.cell(rE, c)); E.cell(rE, c).value = v
        novas.append(eid)

    # ---------- Subestipulantes (uma linha por subfatura)
    rS = last_row(S); tplS = rS
    exist = {(S.cell(r, 1).value, str(S.cell(r, 3).value)) for r in range(2, rS + 1)}
    for ap, fs in por_ap.items():
        for f in fs:
            for sub, sd in sorted(f['subfaturas'].items()):
                if (ids[ap], sub) in exist:
                    continue
                exist.add((ids[ap], sub)); rS += 1
                proprio = len(f['subfaturas']) == 1 and len(fs) > 1
                row = [ids[ap], ap, sub, None, sd['nome'], f['boleto'].get('cnpj_pagador') if proprio else None,
                       SUBNOMES.get(sd['nome'], nome_curto(sd['nome']) if sd['nome'] != f['cab']['estipulante'] else nc_de(f)), 'Sim', SUBFORM.format(r=rS),
                       'Subfatura Bradesco com boleto próprio.' if proprio else 'Subfatura Bradesco.']
                for c, v in enumerate(row, 1):
                    cs(S.cell(tplS, c), S.cell(rS, c)); S.cell(rS, c).value = v

    # ---------- Faturas + Vidas
    rF = last_row(F); tplF = rF
    rV = last_row(V); tplV2 = rV
    ja = {}
    for r in range(2, rF + 1):
        if F.cell(r, 1).value:
            ja[str(F.cell(r, 5).value)] = r
    arquivos = []; resumo = defaultdict(int)
    for ap, fs in por_ap.items():
        porcomp = defaultdict(int)
        for x in fs:
            porcomp[x['cab']['competencia']] += 1
        for f in fs:
            multi = porcomp[f['cab']['competencia']] > 1
            c = f['cab']; b = f['boleto']; eid = ids[ap]; nf = b['end_fatura']
            alvo = None; pago = None
            if nf in ja:
                obs_old = str(F.cell(ja[nf], 25).value or '')
                if 'Origem: lista' in obs_old:
                    alvo = ja[nf]; pago = F.cell(alvo, 32).value
                else:
                    resumo['ja_na_planilha'] += 1
                    continue
            arq = nome_arquivo(f, multi)
            arquivos.append((f['arquivo'], arq))
            subs = sorted(f['subfaturas'])
            pp = defaultdict(list)
            for v in f['vidas']:
                pp[(v['sub'], v['cert'], v['dep'])].append(v)
            canc = {k for k, ls in pp.items() if excluido(ls)}
            obs = []
            if len(subs) > 1:
                obs.append(f'{len(subs)} subfaturas no mesmo boleto ({", ".join(subs)}).')
            if b.get('iof'):
                obs.append('Boleto = fatura + IOF' + (' (IOF não impresso no PDF; calculado pela diferença).' if b.get('iof_calculado') else '.'))
            if f['soma_avulsos_rs']:
                obs.append(f'Inclui coparticipação/franquia (RS) de R$ {br(f["soma_avulsos_rs"])}, rateada por beneficiário na aba Vidas.')
            if canc:
                obs.append(f'{len(canc)} cancelamento(s)/transferência(s) de saída no mês (valores negativos na aba Vidas).')
            if pago:
                obs.append(f'Paga em {pago:%d/%m/%Y}.')
            if b.get('debito_automatico'):
                obs.append(b['debito_automatico'] + '.')
            if f.get('sem_boleto'):
                obs.append('Boleto não veio no PDF do portal.')
            obs.append('Origem: PDF (fatura técnica + boleto no mesmo arquivo).')
            if alvo:
                x_row = alvo; resumo['substituiu_lista'] += 1
            else:
                rF += 1; x_row = rF
            row = {1: c['competencia'], 2: eid, 4: operadora(f), 5: nf, 6: d(c['emissao']), 7: d(b.get('vencimento')),
                   8: d(b.get('vig_ini')), 9: d(b.get('vig_fim')), 10: f['total_fatura'], 11: f['vidas_informadas'],
                   17: b.get('valor'), 19: b.get('nosso_numero') or None, 20: b.get('linha_digitavel') or None,
                   21: arq, 22: arq, 23: arq, 24: proc, 25: ' '.join(obs), 26: ap, 27: ', '.join(subs), 31: b.get('iof', 0),
                   32: pago}
            for col in range(1, 33):
                cs(F.cell(tplF, col if col < 32 else 7), F.cell(x_row, col))
                F.cell(x_row, col).value = row.get(col)
            r = x_row
            F.cell(r, 3).value = f'=IF(B{r}="","",IFERROR(INDEX(Empresas!$B:$B,MATCH(B{r},Empresas!$A:$A,0)),"ID não cadastrado"))'
            F.cell(r, 12).value = f'=IF(A{r}="","",COUNTIFS(Vidas!$A:$A,A{r},Vidas!$B:$B,B{r},Vidas!$D:$D,E{r},Vidas!$P:$P,"Ativo"))'
            F.cell(r, 13).value = f'=IF(A{r}="","",SUMIFS(Vidas!$AA:$AA,Vidas!$A:$A,A{r},Vidas!$B:$B,B{r},Vidas!$D:$D,E{r}))'
            F.cell(r, 14).value = f'=IF(A{r}="","",J{r}-M{r})'
            F.cell(r, 15).value = f'=IF(A{r}="","",IF(L{r}=0,"Sem vidas",IF(ABS(N{r})<=0.01,"OK","Divergência")))'
            F.cell(r, 16).value = f'=IF(OR(A{r}="",K{r}=""),"",IF(L{r}=K{r},"OK","Divergência"))'
            F.cell(r, 18).value = f'=IF(OR(A{r}="",Q{r}=""),"",IF(ABS(Q{r}-J{r}-N(AE{r}))<=0.01,"OK","Divergência"))'
            F.cell(r, 29).value = f'=IF(A{r}="","",SUMIFS(Comissões!$O:$O,Comissões!$J:$J,E{r}))'
            F.cell(r, 30).value = (f'=IF(A{r}="","",IF(AC{r}=0,"Pendente",IF(COUNTIFS(Comissões!$J:$J,E{r},'
                                   f'Comissões!$X:$X,"Divergência")>0,"Divergência","Recebida")))')
            resumo['faturas'] += 1

            ini = d(b.get('vig_ini')) or d(c['competencia'] + '-01')
            pessoas = OrderedDict()
            for v in f['vidas']:
                pessoas.setdefault((v['sub'], v['cert'], v['dep']), []).append(v)
            cop = defaultdict(float); copnome = {}
            for x in f['copart']:
                k = (x['sub'], x['cert'], x['dep']); cop[k] += x['part']; copnome[k] = x['nome']
            for k in cop:
                pessoas.setdefault(k, [])
            for k, ls in pessoas.items():
                rV += 1
                v0 = ls[0] if ls else {'cert': k[1], 'dep': k[2], 'nome': copnome[k], 'paren': None}
                base = round(sum(x['valor'] for x in ls if not x['mov']), 2)
                prorata = round(sum(x['valor'] for x in ls if x['mov']), 2)
                excl = excluido(ls)
                nasc = d(v0.get('nasc'))
                idade = (ini.year - nasc.year - ((ini.month, ini.day) < (nasc.month, nasc.day))) if nasc else None
                planos = list(OrderedDict((x['plano'], 1) for x in ls))
                ob = []
                normais = [x for x in ls if not x['mov']]
                if len(normais) > 1:
                    ob.append('Linhas: ' + ' + '.join(f"{x['plano']} {br(x['valor'])}" for x in normais)
                              + (' (saúde + dental)' if c['produto'] == 'SAUDE' else ''))
                if any(x['mov'] for x in ls):
                    ob.append('Movimento: ' + ', '.join(f"{x['mov']} {x['mesano']} {br(x['valor'])}" for x in ls if x['mov']))
                if cop.get(k):
                    ob.append(f'Coparticipação/franquia nesta fatura: {br(cop[k])}')
                if not ls:
                    ob.append('Só coparticipação (não está na relação de vidas desta fatura).')
                if v0['dep'] == '00':
                    paren = 'Titular'
                else:
                    paren = PAREN.get(v0.get('paren') or '', v0.get('paren')) if v0.get('paren') else 'Dependente'
                vals = {1: c['competencia'], 2: eid, 3: operadora(f), 4: nf, 5: v0['cert'], 6: int(v0['dep']) + 1, 7: v0['nome'],
                        9: nasc, 10: idade, 11: paren, 12: 'Titular' if v0['dep'] == '00' else 'Dependente',
                        13: ' / '.join(planos) or None,
                        14: (operadora(f) + ' ' + ' / '.join(planos)) if planos else None,
                        16: 'Excluído' if excl else 'Ativo', 17: min((d(x['inicio']) for x in ls), default=None),
                        19: base, 20: prorata, 21: 0, 22: 0, 23: 0, 24: 0, 25: 0, 29: '; '.join(ob) or None, 30: k[0],
                        32: round(cop.get(k, 0), 2)}
                for col in range(1, 33):
                    cs(V.cell(tplV2, col if col < 32 else 21), V.cell(rV, col))
                    V.cell(rV, col).value = vals.get(col)
                vida_formulas(V, rV)
                resumo['vidas'] += 1
            res = round(f['soma_avulsos_rs'] - f['soma_copart'], 2)
            if abs(res) > 0.009:
                rV += 1
                vals = {1: c['competencia'], 2: eid, 3: operadora(f), 4: nf, 7: 'COPARTICIPAÇÃO/FRANQUIA SEM DETALHE',
                        19: 0, 20: 0, 32: res, 29: 'Diferença entre as linhas RS do resumo e o detalhe por beneficiário.'}
                for col in range(1, 33):
                    cs(V.cell(tplV2, col if col < 32 else 21), V.cell(rV, col))
                    V.cell(rV, col).value = vals.get(col)
                vida_formulas(V, rV)

                resumo['vidas'] += 0
            for a in [a for a in f['avulsos'] if a['cod'] != 'RS']:
                rV += 1
                vals = {1: c['competencia'], 2: eid, 3: operadora(f), 4: nf, 7: f"ACERTO DA FATURA ({a['cod']}): {a['desc']}",
                        19: 0, 20: a['valor'], 28: 'Acerto da fatura', 29: 'Acerto lançado no resumo da fatura, sem beneficiário.', 30: a['sub'], 32: 0}
                for col in range(1, 33):
                    cs(V.cell(tplV2, col if col < 32 else 21), V.cell(rV, col))
                    V.cell(rV, col).value = vals.get(col)
                V.cell(rV, 26).value = f'=IF(A{rV}="","",N(U{rV})+N(V{rV})+N(W{rV})+N(X{rV})+N(AF{rV}))'
                V.cell(rV, 27).value = f'=IF(A{rV}="","",N(S{rV})+N(T{rV})+N(Z{rV})+N(Y{rV}))'
                resumo['acertos'] += 1

    # ---------- Faturamento: 100 empresas por bloco
    N = 100
    if not any(FT.cell(r, 2).value == 'Total da carteira' for r in range(6 + N, 6 + 400)):
        def snap(r):
            return [copy.copy(FT.cell(r, c)._style) for c in range(1, 18)], FT.row_dimensions[r].height
        sd1, st1, sgap, sti2, sh2, sd2, st2 = (snap(r) for r in (6, 56, 57, 59, 60, 61, 111))
        head2 = [FT.cell(60, c).value for c in range(1, 18)]
        title2 = FT.cell(59, 1).value
        for r in range(6, 6 + 2 * N + 20):
            for c in range(1, 18):
                FT.cell(r, c).value = None

        def apply(r, st):
            for c in range(1, 18):
                FT.cell(r, c)._style = copy.copy(st[0][c - 1])
            FT.row_dimensions[r].height = st[1]
        mcols = [L(c) for c in range(4, 16)]
        t1 = 6 + N
        for i in range(N):
            r = 6 + i; apply(r, sd1)
            FT.cell(r, 1).value = f'=IF(INDEX(Empresas!$A$2:$A$201,{i+1})="","",INDEX(Empresas!$A$2:$A$201,{i+1}))'
            FT.cell(r, 2).value = f'=IF($A{r}="","",INDEX(Empresas!$B$2:$B$201,{i+1}))'
            FT.cell(r, 3).value = f'=IF($A{r}="","",INDEX(Empresas!$D$2:$D$201,{i+1}))'
            for col in mcols:
                FT[f'{col}{r}'] = f'=IF($A{r}="","",SUMIFS(Faturas!$J:$J,Faturas!$A:$A,{col}$5,Faturas!$B:$B,$A{r}))'
            FT[f'P{r}'] = f'=IF($A{r}="","",SUM(D{r}:O{r}))'
            FT[f'Q{r}'] = f'=IF(OR($A{r}="",$P${t1}=0),"",P{r}/$P${t1})'
        apply(t1, st1); FT.cell(t1, 2).value = 'Total da carteira'
        for col in mcols + ['P']:
            FT[f'{col}{t1}'] = f'=SUM({col}6:{col}{t1-1})'
        apply(t1 + 1, sgap); apply(t1 + 2, sgap)
        tt = t1 + 3; hh = tt + 1; d0 = hh + 1; t2 = d0 + N
        apply(tt, sti2); FT.cell(tt, 1).value = title2
        apply(hh, sh2)
        for c, v in enumerate(head2, 1):
            FT.cell(hh, c).value = v
        for i in range(N):
            r = d0 + i; apply(r, sd2)
            FT.cell(r, 1).value = f'=IF(INDEX(Empresas!$A$2:$A$201,{i+1})="","",INDEX(Empresas!$A$2:$A$201,{i+1}))'
            FT.cell(r, 2).value = f'=IF($A{r}="","",INDEX(Empresas!$B$2:$B$201,{i+1}))'
            FT.cell(r, 3).value = f'=IF($A{r}="","",INDEX(Empresas!$D$2:$D$201,{i+1}))'
            for col in mcols:
                FT[f'{col}{r}'] = f'=IF($A{r}="","",SUMIFS(Faturas!$L:$L,Faturas!$A:$A,{col}${hh},Faturas!$B:$B,$A{r}))'
            FT[f'P{r}'] = f'=IF($A{r}="","",SUM(D{r}:O{r}))'
        apply(t2, st2); FT.cell(t2, 2).value = 'Total da carteira'
        for col in mcols + ['P']:
            FT[f'{col}{t2}'] = f'=SUM({col}{d0}:{col}{t2-1})'

    wb.save(xout)
    print(json.dumps(dict(resumo, pdfs_repetidos=resumo_dup, novas_empresas=novas, pendencias=pend, ultima_fatura=rF, ultima_vida=rV, arquivos=arquivos), ensure_ascii=False))


if __name__ == '__main__':
    main(*sys.argv[1:5])
