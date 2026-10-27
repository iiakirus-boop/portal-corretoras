# -*- coding: utf-8 -*-
"""Testes de regressão dos agentes da Shaddai.

Roda cada gravador com arquivos reais numa cópia temporária (nunca na Base de verdade) e compara o resultado
com o que foi guardado em testes/esperado.json. Serve para mexer num script e ter certeza de que o resultado
continua igual.

Uso (dentro de FATURAS\\Scripts):
    python testes/regressao.py conferir            -> roda todos os casos e compara com o esperado
    python testes/regressao.py conferir fat_hapvida -> só um caso
    python testes/regressao.py gravar              -> grava o resultado atual como esperado (só depois de conferir à mão)
    opção --scripts <pasta>: roda os scripts de outra pasta (ex.: a cópia em Backups) contra o mesmo esperado

- Os arquivos de entrada são os da própria pasta FATURAS (Backups, Comissoes, _ultimo_*.json). Nada sai do PC.
- O esperado.json guarda só impressões digitais (hash) de cada aba, saída e painel, nenhum dado pessoal.
- Datas de "hoje" e a pasta temporária são trocadas por marcadores, então o teste pode rodar em qualquer dia.
- A cópia temporária é apagada no fim (é só a cópia do teste).
"""
import sys, os, re, json, glob, shutil, hashlib, tempfile, subprocess, datetime
import openpyxl

AQUI = os.path.dirname(os.path.abspath(__file__))
SCRIPTS = os.path.dirname(AQUI)
FATURAS = os.path.dirname(SCRIPTS)
ESPERADO = os.path.join(AQUI, 'esperado.json')

# nome: (script, base de entrada (relativa a FATURAS), argumentos). {base} = cópia da base; {tmp} = pasta do teste.
CASOS = {
    'fat_hapvida': ('gravar_hapvida.py', 'Backups/Base_Faturas_Vidas antes Faturas Hapvida 2026-10-19.xlsx',
                    ['Scripts/_ultimo_hapvida.json', '{base}', '{base}', '{tmp}', '2026-10-19', '--sem-copia']),
    'fat_sulamerica': ('gravar_sulamerica.py', 'Backups/Base_Faturas_Vidas antes Faturas SulAmerica 2026-10-19.xlsx',
                       ['Scripts/_ultimo_sulamerica.json', '{base}', '{base}', '{tmp}', '2026-10-19', '--sem-copia']),
    'fat_amil': ('gravar_amil.py', 'Backups/Base_Faturas_Vidas antes Faturas Amil 2026-10-17.xlsx',
                 ['Scripts/_ultimo_amil.json', '{base}', '{base}', '{tmp}', '2026-10-17', '--sem-copia']),
    'com_porto': ('comissao_porto.py', 'Backups/Base_Faturas_Vidas antes Comissao 2026-10-13.xlsx',
                  ['{base}', '2026-09', 'glob:Comissoes/2026-09/PortoSaude/*.html']),
    'com_bradesco': ('comissao_bradesco.py', 'Backups/Base_Faturas_Vidas antes Comissao Bradesco 04-10 a 19-10 2026-10-19.xlsx',
                     ['{base}', 'Comissoes/2026-10/BradescoSaude/SAUDESA 04-10 a 19-10-26 COMISSAO BRADESCO.xls']),
    'com_amil': ('comissao_amil.py', 'Backups/Base_Faturas_Vidas antes Comissao Amil 2026-10-16.xlsx',
                 ['{base}', 'glob:Comissoes/2026-0*/Amil/*.txt']),
    'com_hapvida': ('comissao_hapvida.py', 'Backups/Base_Faturas_Vidas antes Comissao Hapvida 2026-10-17.xlsx',
                    ['{base}', 'glob:Comissoes/2026-0*/Hapvida']),
    'com_sulamerica': ('comissao_sulamerica.py', 'Backups/Base_Faturas_Vidas antes Comissao SulAmerica 2026-10-17.xlsx',
                       ['{base}', 'glob:Comissoes/2026-0*/SulAmerica/extratos_9512.json']),
}


def _copiar(scripts, tmp):
    os.makedirs(os.path.join(tmp, 'Scripts'))
    for p in glob.glob(os.path.join(scripts, '*.py')) + glob.glob(os.path.join(SCRIPTS, '_ultimo_*.json')):
        shutil.copy2(p, os.path.join(tmp, 'Scripts'))
    shutil.copytree(os.path.join(SCRIPTS, '_painel'), os.path.join(tmp, 'Scripts', '_painel'))
    shutil.copytree(os.path.join(FATURAS, 'Comissoes'), os.path.join(tmp, 'Comissoes'))


def _limpo(s, tmp, hoje):
    s = s.replace(tmp, '<TMP>').replace(tmp.replace('\\', '/'), '<TMP>')
    for f in ('%Y-%m-%d', '%d/%m/%Y', '%Y%m%d'):
        s = s.replace(hoje.strftime(f), '<HOJE>')
    return re.sub(r'<HOJE>[ T]\d\d:\d\d(:\d\d)?(\.\d+)?', '<HOJE>', s)


def _valor(v, tmp, hoje):
    if isinstance(v, datetime.datetime) and v.date() == hoje:
        return '<HOJE>'
    if isinstance(v, str):
        return _limpo(v, tmp, hoje)
    return v


def _hash(x):
    return hashlib.sha1(repr(x).encode('utf-8')).hexdigest()


def rodar(nome, scripts):
    script, base_rel, args = CASOS[nome]
    hoje = datetime.date.today()
    tmp = tempfile.mkdtemp(prefix='regressao_')
    try:
        _copiar(scripts, tmp)
        base = os.path.join(tmp, 'Base_Faturas_Vidas.xlsx')
        shutil.copy2(os.path.join(FATURAS, base_rel), base)
        cmd = [sys.executable, os.path.join(tmp, 'Scripts', script)]
        for a in args:
            a = a.replace('{base}', base).replace('{tmp}', tmp)
            if a.startswith('glob:'):
                cmd += sorted(glob.glob(os.path.join(tmp, a[5:])))
            elif a.startswith(('Scripts/', 'Comissoes/')):
                cmd.append(os.path.join(tmp, a))
            else:
                cmd.append(a)
        r = subprocess.run(cmd, cwd=os.path.join(tmp, 'Scripts'), capture_output=True)
        out = r.stdout.decode('utf-8', 'replace') + r.stderr.decode('utf-8', 'replace')
        res = {'codigo_saida': r.returncode, 'saida': _hash(_limpo(out, tmp, hoje)), 'abas': {}, 'arquivos': {}}
        wb = openpyxl.load_workbook(base, read_only=True)
        for ws in wb.worksheets:
            h, n = hashlib.sha1(), 0
            for row in ws.iter_rows(values_only=True):
                h.update(repr(tuple(_valor(v, tmp, hoje) for v in row)).encode('utf-8')); n += 1
            res['abas'][ws.title] = f'{n} linhas {h.hexdigest()}'
        wb.close()
        for p in sorted(glob.glob(os.path.join(tmp, 'Scripts', '_painel', '*.json')) + glob.glob(os.path.join(tmp, 'Scripts', '*_resultado.json'))):
            res['arquivos'][os.path.relpath(p, tmp).replace('\\', '/')] = _hash(_limpo(open(p, encoding='utf-8', errors='replace').read(), tmp, hoje))
        return res, _limpo(out, tmp, hoje)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def comparar(a, b):
    dif = []
    for k in ('codigo_saida', 'saida'):
        if a.get(k) != b.get(k): dif.append(k)
    for grupo in ('abas', 'arquivos'):
        for k in sorted(set(a[grupo]) | set(b[grupo])):
            if a[grupo].get(k) != b[grupo].get(k): dif.append(f'{grupo}: {k}')
    return dif


def main():
    args = sys.argv[1:]
    scripts = SCRIPTS
    if '--scripts' in args:
        i = args.index('--scripts'); scripts = os.path.abspath(args[i + 1]); del args[i:i + 2]
    modo, nomes = args[0], args[1:] or list(CASOS)
    esperado = json.load(open(ESPERADO, encoding='utf-8')) if os.path.exists(ESPERADO) else {}
    falhas = 0
    for nome in nomes:
        res, out = rodar(nome, scripts)
        if modo == 'gravar':
            esperado[nome] = res
            print(f'{nome}: gravado (código {res["codigo_saida"]}, {len(res["abas"])} abas, {len(res["arquivos"])} arquivos)')
            if res['codigo_saida']: print(out[-1500:])
        else:
            if nome not in esperado:
                print(f'{nome}: SEM ESPERADO (rode "gravar" primeiro)'); falhas += 1; continue
            dif = comparar(esperado[nome], res)
            print(f'{nome}: ' + ('OK' if not dif else 'DIFERENTE -> ' + '; '.join(dif)))
            if dif: falhas += 1; print(out[-1500:])
    if modo == 'gravar':
        json.dump(esperado, open(ESPERADO, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    sys.exit(1 if falhas else 0)


if __name__ == '__main__':
    main()
