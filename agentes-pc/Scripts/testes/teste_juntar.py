# -*- coding: utf-8 -*-
"""painel_porto.juntar: o documento de comissão publicado não perde nada; só ganha as ordens novas.
Uso: python testes/teste_juntar.py"""
import json, os, sys, tempfile
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from painel_porto import juntar

p = os.path.join(tempfile.mkdtemp(), 'com.json')
novo = dict(atualizadoEm='hoje', ordens=[{'op': '1'}, {'op': '2'}], itens=[{'op': '1', 'x': 'base'}, {'op': '2', 'x': 'novo'}], extras=[])
assert juntar(novo, p) is novo                     # sem documento: grava o da base
json.dump(dict(atualizadoEm='antes', ordens=[{'op': '1'}], itens=[{'op': '1', 'x': 'manual'}], extras=[{'op': '1'}]), open(p, 'w'))
d = juntar(novo, p)
assert [o['op'] for o in d['ordens']] == ['1', '2'] and d['extras'] == [{'op': '1'}] and d['atualizadoEm'] == 'hoje'
assert d['itens'] == [{'op': '1', 'x': 'manual'}, {'op': '2', 'x': 'novo'}]
json.dump(d, open(p, 'w'))
assert juntar(novo, p) is None                     # nada novo: não regrava

# preservar: NF já publicada mantém os ajustes feitos à mão
from painel_porto import preservar
json.dump(dict(itens=[{'titulo': '9', 'empresa': 'NOME CERTO', 'obs': 'residual', 'confValor': 'OK', 'valor': 1, 'subsDet': [1]}]), open(p, 'w'))
i = preservar([{'titulo': '9', 'empresa': 'NOME CORTA', 'confValor': 'Sem vidas', 'valor': 2}, {'titulo': '8', 'empresa': 'X'}], p)
assert i[0] == {'titulo': '9', 'empresa': 'NOME CERTO', 'obs': 'residual', 'confValor': 'OK', 'valor': 2} and i[1] == {'titulo': '8', 'empresa': 'X'}
print('ok')
