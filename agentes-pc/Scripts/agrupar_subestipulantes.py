# -*- coding: utf-8 -*-
"""Agente Faturas - vincula empresas (contratos) da mesma pasta como subestipulantes da empresa principal, no modelo da Quanta/Porto.
Uso: python agrupar_subestipulantes.py <planilha entrada> <planilha saida> <AAAA-MM-DD> <backup (caminho relativo, para Execuções)>
O que faz (sem apagar nada):
- Subestipulantes: as linhas das empresas que viram sub passam a apontar para a principal (ID + código estipulante).
- Faturas e Vidas: ID Empresa da sub -> principal; Faturas: Código estipulante = o da principal, Subestipulante = contrato da NF.
- Empresas: a sub fica com Ativa? = "Não" e Observação "Vinculada como subestipulante de Exxx".
- Empresas em PENDENTES: Observação "Agrupamento a confirmar com o Bruno" (nada mais muda).
- Comissões (Amil, Amil Dental, Santa Helena, SulAmérica): ID Empresa procura primeiro pelo nº da fatura (Faturas), depois pelo contrato
  em Subestipulantes e por fim pelo código estipulante em Empresas (mesma ideia da fórmula da Porto).
- Registra em Execuções e Log de Erros. Rodar de novo não muda o que já está agrupado.
Grupos confirmados ficam em GRUPOS. O gravar_amil.py e o gravar_sulamerica.py importam DE/aplicar para já gravar as subs na principal.
"""
import sys, copy, re
from datetime import datetime
import openpyxl
from shaddai_comum import cs, last_row  # módulo comum

# principal -> subs (IDs da aba Empresas). Uma principal por operadora.
GRUPOS = {
    'E169': ['E170', 'E172', 'E174', 'E175', 'E176', 'E178', 'E179', 'E182', 'E184', 'E185'],  # QUANTA - Amil
    'E171': ['E173', 'E177', 'E180', 'E181', 'E183'],                                          # QUANTA - Amil Dental
    'E157': ['E158', 'E159', 'E160', 'E161', 'E162', 'E163', 'E164', 'E165', 'E166', 'E167'],  # NETZA - Amil
    'E192': ['E193', 'E194'],                                                                  # SYNATY - Amil
    'E187': ['E189', 'E190', 'E191'],                                                          # SWB - Santa Helena
    'E139': ['E140', 'E141', 'E142', 'E143'],                                                  # COPAFER - Santa Helena
    'E136': ['E137'],                                                                          # AMANDA - Amil (confirmado pelo Bruno)
    'E138': ['E144'],                                                                          # COPAFER - Amil (confirmado pelo Bruno)
    'E152': ['E153', 'E154', 'E155', 'E156'],                                                  # METROPOLE - Amil (confirmado pelo Bruno)
}
PENDENTES = []  # empresas de pasta com vários contratos cuja principal ainda não foi confirmada
DE = {s: p for p, ss in GRUPOS.items() for s in ss}  # sub -> principal
OPS_COM = ('AMIL', 'SANTA HELENA', 'SULAM')
FORM_COM = ('=IF(B{r}="","",IFERROR(INDEX(Faturas!$B:$B,MATCH(J{r},Faturas!$E:$E,0)),IFERROR(INDEX(Subestipulantes!$A:$A,'
            'MATCH(I{r}&"",Subestipulantes!$C:$C,0)),IFERROR(INDEX(Empresas!$A:$A,MATCH(I{r},Empresas!$E:$E,0)),""))))')


def aplicar(wb, proc, backup=None, registrar=True):
    """Aplica GRUPOS/PENDENTES no workbook aberto (idempotente). registrar=False: não escreve Execuções/Log (uso pelo gravar_amil)."""
    inicio = datetime.now().replace(microsecond=0)
    dproc = f'{proc:%d/%m/%Y}'
    E, S, F, V, C = wb['Empresas'], wb['Subestipulantes'], wb['Faturas'], wb['Vidas'], wb['Comissões']
    erow = {E.cell(r, 1).value: r for r in range(2, last_row(E) + 1) if E.cell(r, 1).value}
    de = {s: p for p, ss in GRUPOS.items() for s in ss}
    for p, ss in GRUPOS.items():  # mesma operadora
        for s in ss:
            assert E.cell(erow[s], 4).value == E.cell(erow[p], 4).value, (p, s)
    cod = {e: str(E.cell(r, 5).value) for e, r in erow.items()}
    cont = {e: str(E.cell(r, 6).value or E.cell(r, 5).value) for e, r in erow.items()}
    n = dict(emp=0, sub=0, fat=0, vid=0, com=0, pend=0)
    marca = f'Vinculada como subestipulante de '
    for s, p in de.items():
        r = erow[s]; obs = E.cell(r, 10).value or ''
        if marca in obs: continue
        E.cell(r, 9).value = 'Não'
        E.cell(r, 10).value = (obs + ' ' if obs else '') + f'{marca}{p} ({E.cell(erow[p], 11).value}) em {dproc}; faturas e vidas agora estão na {p}.'
        n['emp'] += 1
    for p, ss in GRUPOS.items():
        r = erow[p]; obs = E.cell(r, 10).value or ''
        if 'Empresa principal do grupo' not in obs:
            E.cell(r, 10).value = obs + f' Empresa principal do grupo: subestipulantes {", ".join(ss)} vinculadas em {dproc}.'
    for e in PENDENTES:
        r = erow[e]; obs = E.cell(r, 10).value or ''
        if 'Agrupamento a confirmar' not in obs:
            E.cell(r, 10).value = obs + ' Agrupamento a confirmar com o Bruno (qual é a empresa principal da pasta).'; n['pend'] += 1
    for r in range(2, last_row(S) + 1):
        a = S.cell(r, 1).value
        if a in de:
            p = de[a]
            S.cell(r, 1).value = p; S.cell(r, 2).value = cod[p]
            o = S.cell(r, 10).value or ''
            S.cell(r, 10).value = (o + ' ' if o else '') + f'Subestipulante de {p} (antes empresa {a}); NF própria.'
            n['sub'] += 1
    for r in range(2, last_row(F) + 1):
        b = F.cell(r, 2).value
        if b in de or b in GRUPOS:
            p = de.get(b, b)
            nf_cont = str(F.cell(r, 26).value or cont[b])  # contrato que recebe a NF (gravado pelo gravar_amil)
            outros = F.cell(r, 27).value
            if b in de:
                F.cell(r, 2).value = p; n['fat'] += 1
                o = F.cell(r, 25).value or ''
                F.cell(r, 25).value = o + f' Subestipulante da {p} desde {dproc} (antes empresa {b}).'
            if not str(outros or '').startswith(nf_cont):
                F.cell(r, 27).value = nf_cont + (', ' + str(outros) if outros else '')
            F.cell(r, 26).value = cod[p]
    for r in range(2, last_row(V) + 1):
        b = V.cell(r, 2).value
        if b in de:
            V.cell(r, 2).value = de[b]; n['vid'] += 1
            if not V.cell(r, 30).value: V.cell(r, 30).value = cont[b]
    for r in range(2, last_row(C) + 1):
        seg = str(C.cell(r, 4).value or '').upper()
        if C.cell(r, 2).value and any(o in seg for o in OPS_COM):
            f = FORM_COM.format(r=r)
            if C.cell(r, 17).value != f:
                C.cell(r, 17).value = f; n['com'] += 1
    if not registrar:
        return n
    # registro
    EX, LG = wb['Execuções'], wb['Log de Erros']
    re_ = last_row(EX) + 1
    for c in range(1, 14): cs(EX.cell(re_ - 1, c), EX.cell(re_, c))
    for c, v in enumerate(['Faturas Amil', 'Cadastro', inicio, datetime.now().replace(microsecond=0), '⚠️ OK com pendência' if PENDENTES else '✅ OK',
                           n['emp'], n['emp'], len(PENDENTES), 0,
                           ('Agrupamento a confirmar: ' + ', '.join(PENDENTES)) if PENDENTES else '', backup,
                           f'Subestipulantes Amil/Amil Dental/Santa Helena vinculadas à principal (modelo Quanta/Porto): {n["emp"]} empresas viraram sub, '
                           f'{n["sub"]} linhas de Subestipulantes, {n["fat"]} faturas e {n["vid"]} vidas passaram para a principal; '
                           f'fórmula de ID Empresa trocada em {n["com"]} linhas de Comissões (Amil/Santa Helena/SulAmérica). '
                           'SulAmérica: só a GABB tem subs (já agrupada).', 'Bruno'], 1):
        EX.cell(re_, c).value = v
    rl = last_row(LG); tpl = rl
    for e in PENDENTES:
        rl += 1
        for c in range(1, 10): cs(LG.cell(tpl, c), LG.cell(rl, c))
        for c, v in enumerate([proc, None, E.cell(erow[e], 4).value, e, 'Cadastro',
                               f'Empresa {e} ({E.cell(erow[e], 11).value}) está numa pasta com outros contratos, mas a empresa principal não está clara.',
                               'Não agrupada. Perguntar ao Bruno qual é a principal.', 'Não', 'Agente Faturas'], 1):
            LG.cell(rl, c).value = v
    return n


def main(xin, xout, proc, backup):
    wb = openpyxl.load_workbook(xin)
    n = aplicar(wb, datetime.fromisoformat(proc), backup)
    wb.save(xout)
    print(n)


if __name__ == '__main__':
    main(*sys.argv[1:])
