# -*- coding: utf-8 -*-
"""Mantém as tabelas do portal (faturas, vidas e comissões) iguais à Base_Faturas_Vidas.xlsx.

O rodar.py chama sozinho no fim de toda rodada que deu certo. Também dá para rodar à mão:
  python sincronizar.py            últimos 4 meses (o que os agentes costumam mexer)
  python sincronizar.py --meses 12 últimos 12 meses
  python sincronizar.py --tudo     a base inteira (mais demorado)

Como funciona: gera os CSV de carga com o Carga_Supabase/carga.py (mesmos IDs de sempre, nada duplica)
e manda para o banco pela função sincronizar_lote, com o token dos agentes:
  - faturas e ordens de comissão: atualiza a linha existente ou insere a nova;
  - vidas (por empresa + seguradora + mês) e lançamentos (por ordem): troca o grupo inteiro pela cópia da planilha.
Só lê a planilha; nunca grava nela. Sem rede ou sem token, avisa e segue.
"""
import csv, json, os, subprocess, sys, datetime
import banco

AQUI = os.path.dirname(os.path.abspath(__file__))
CARGA = os.path.join(os.path.dirname(AQUI), 'Carga_Supabase')
LOTE = 500_000  # bytes por chamada
SECO = False  # --seco: gera os CSV e só mostra as contagens, sem enviar


def ler(tab):
    p = os.path.join(CARGA, 'csv', tab + '.csv')
    if not os.path.exists(p):
        return []
    return [{k: (None if v == '' else v) for k, v in r.items()} for r in csv.DictReader(open(p, encoding='utf-8'))]


def enviar(tab, linhas, chave=None):
    """Manda em lotes; com chave, um grupo nunca fica dividido entre dois lotes (o banco troca o grupo inteiro)."""
    if SECO:
        print(f'[sincronizar] (seco) {tab}: {len(linhas)} linha(s) seriam enviadas.'); return 0
    grupos = {}
    for r in linhas:
        grupos.setdefault(chave(r) if chave else r['id'], []).append(r)
    lote, tam, total = [], 0, 0
    for g in grupos.values():
        n = len(json.dumps(g, ensure_ascii=False).encode())
        if lote and tam + n > LOTE:
            total += banco._rpc('sincronizar_lote', dict(p_tabela=tab, p_linhas=lote)) or 0
            lote, tam = [], 0
        lote += g; tam += n
    if lote:
        total += banco._rpc('sincronizar_lote', dict(p_tabela=tab, p_linhas=lote)) or 0
    print(f'[sincronizar] {tab}: {len(linhas)} linha(s) enviadas, {total} gravadas.')
    return total


def main():
    a = sys.argv[1:]
    meses = None if '--tudo' in a else int(a[a.index('--meses') + 1]) if '--meses' in a else 4
    global SECO
    SECO = '--seco' in a
    if not SECO and not banco._token():
        print('[sincronizar] sem o token dos agentes: nada enviado.'); return 0
    for scr in ('cadastro.py', 'carga.py'):  # cadastro.py: empresas, apólices e subestipulantes (mesmos uuid5)
        r = subprocess.run([sys.executable, scr], cwd=CARGA, capture_output=True, text=True, encoding='utf-8', errors='replace')
        if r.returncode:
            print(f'[sincronizar] {scr} deu erro, nada enviado:\n' + (r.stderr or r.stdout)[-800:]); return 1
    desde = None
    if meses:
        h = datetime.date.today().replace(day=1)
        y, m = h.year, h.month - (meses - 1)
        while m < 1:
            m += 12; y -= 1
        desde = f'{y}-{m:02d}'
    rec = (lambda rows: [x for x in rows if (x.get('competencia') or '') >= desde]) if desde else (lambda rows: rows)
    fat, vid, pag = rec(ler('faturas')), rec(ler('vidas')), rec(ler('comissao_pagamentos'))
    ids_pag = {p['id'] for p in pag}
    lan = [x for x in ler('comissao_lancamentos') if x['pagamento_id'] in ids_pag]
    print(f'[sincronizar] desde {desde or "o começo"}: {len(fat)} faturas, {len(vid)} vidas, {len(pag)} ordens, {len(lan)} lançamentos.')
    # ordem importa: faturas apontam para o cadastro; vidas e lançamentos para faturas e ordens
    for tab in ('empresas', 'apolices', 'subestipulantes'):
        enviar(tab, ler(tab))
    enviar('faturas', fat)
    enviar('comissao_pagamentos', pag)
    enviar('vidas', vid, lambda r: (r['empresa_id'], r['seguradora_id'], r['competencia']))
    enviar('comissao_lancamentos', lan, lambda r: r['pagamento_id'])
    return 0


if __name__ == '__main__':
    sys.exit(main())
