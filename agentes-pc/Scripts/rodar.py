# -*- coding: utf-8 -*-
"""Comando único dos agentes da Shaddai: roda a sequência inteira, na ordem, e para no primeiro erro.

Uso (dentro de FATURAS\\Scripts):
  python rodar.py faturas <hapvida|sulamerica|amil|bradesco> <AAAA-MM-DD> [--entrada <pasta>] [--portal <json>] [--simular]
  python rodar.py faturas porto <AAAA-MM-DD> --comp AAAA-MM [--sem-baixar] [--entrada <pasta>] [--simular]
             (Porto: baixa do portal com baixar_porto.js -- Chrome do "Entrar na Porto" logado --, lê e grava;
              --simular e --sem-baixar usam só o que já está em Faturas/AAAA-MM/PortoSaude)
  python rodar.py comissao <porto|bradesco|amil|hapvida|sulamerica> <arquivos ou pastas...> [--comp AAAA-MM] [--simular]
  python rodar.py vidas [<Operadora>]

O que cada um faz:
  faturas  : confere que a base está fechada -> backup -> lê os arquivos (faturas_<op>.py) -> grava (gravar_<op>.py)
             -> Porto/Bradesco: painel_<op>.py (faturas e comissões da Central; Porto + painel_subs.py)
             -> Agente Vidas (vidas.py gravar, vidas_central.py, vidas_lista_central.py <Op>) -> lista o que subir na Central.
  comissao : confere que a base está fechada -> backup -> comissao_<op>.py -> Porto/Bradesco: painel_<op>.py
             -> lembra de rodar o Agente Projeção.
  vidas    : só a sequência do Agente Vidas (as três etapas).
  --simular: roda numa cópia temporária (base e scripts) e mostra o resultado, sem tocar na base nem no painel.
  --ordem <id> / --sessao <link>: quando a rodada veio de uma ordem do portal (rodar agora) ou de um agente na nuvem.

Toda rodada de verdade (sem --simular) aparece no master do portal: começa como "rodando", termina como concluída
ou com erro, os arquivos novos do _painel sobem sozinhos para a Central (banco.py; também quando a rodada para no
meio, com o que já foi gravado) e as tabelas do portal
(faturas, vidas, comissões) são sincronizadas com a base (sincronizar.py). Sem rede, só avisa e segue.

É o mesmo comando que o despachante da plataforma vai chamar. Os scripts de cada etapa continuam iguais e podem ser
rodados à mão como antes.
"""
import sys, os, glob, shutil, subprocess, tempfile, datetime
import banco

AQUI = os.path.dirname(os.path.abspath(__file__))
FAT = os.path.dirname(AQUI)
BASE = os.path.join(FAT, 'Base_Faturas_Vidas.xlsx')
ENTRADA = os.path.join(os.path.dirname(os.path.dirname(FAT)), 'boletos a enviar')  # Área de Trabalho\boletos a enviar
PY = sys.executable

# operadora: (nome na base, pasta em "boletos a enviar", rótulo do backup)
FATURAS = {
    'hapvida': ('Hapvida', 'HAPVIDA', 'Faturas Hapvida'),
    'sulamerica': ('SulAmérica', 'SUL AMERICA', 'Faturas SulAmerica'),
    'amil': ('Amil', 'AMIL', 'Faturas Amil'),
    'bradesco': ('Bradesco Saúde', None, 'Faturas Bradesco'),
    'porto': ('Porto Saúde', None, 'Faturas Porto'),
}
COMISSAO = {'porto': 'Comissao Porto', 'bradesco': 'Comissao Bradesco', 'amil': 'Comissao Amil',
            'hapvida': 'Comissao Hapvida', 'sulamerica': 'Comissao SulAmerica'}


class Parou(Exception):
    pass


def etapa(titulo, cmd, saida=None, cwd=AQUI):
    print(f'\n== {titulo}', flush=True)
    r = subprocess.run(cmd, cwd=cwd, stdout=open(saida, 'w', encoding='utf-8') if saida else None)
    if r.returncode:
        raise Parou(f'{titulo} terminou com erro (código {r.returncode}). Nada depois dela foi rodado.')


def base_fechada():
    if os.path.exists(os.path.join(FAT, '~$Base_Faturas_Vidas.xlsx')):
        raise Parou('A Base_Faturas_Vidas.xlsx está aberta no Excel. Feche e rode de novo.')


def backup(rotulo, data):
    bk = os.path.join(FAT, 'Backups', f'Base_Faturas_Vidas antes {rotulo} {data}.xlsx')
    if os.path.exists(bk):
        print(f'Backup do dia já existe: {os.path.relpath(bk, FAT)}')
    else:
        shutil.copy2(BASE, bk)
        print(f'Backup: {os.path.relpath(bk, FAT)}')


def opcao(args, nome, padrao=None):
    if nome in args:
        i = args.index(nome); v = args[i + 1]; del args[i:i + 2]; return v
    return padrao


def caixa_de_areia():
    """Cópia temporária dos scripts e da base, para simular sem tocar em nada."""
    tmp = tempfile.mkdtemp(prefix='simular_')
    os.makedirs(os.path.join(tmp, 'Scripts', '_painel'))
    for p in glob.glob(os.path.join(AQUI, '*.py')):
        shutil.copy2(p, os.path.join(tmp, 'Scripts'))
    shutil.copy2(BASE, os.path.join(tmp, 'Base_Faturas_Vidas.xlsx'))
    return tmp


def vidas(op):
    etapa('Agente Vidas: conferência gravada na base', [PY, 'vidas.py', 'gravar'])
    etapa('Agente Vidas: distribuição para a Central', [PY, 'vidas_central.py'])
    if op:
        etapa(f'Agente Vidas: lista de vidas {op} para a Central', [PY, 'vidas_lista_central.py', op])


def novos_no_painel(desde):
    pasta = os.path.join(AQUI, '_painel')
    return sorted(f for f in os.listdir(pasta) if os.path.getmtime(os.path.join(pasta, f)) >= desde) if os.path.isdir(pasta) else []


def painel_central(op, comp=None):
    """Porto e Bradesco: gravar_<op> e comissao_<op> não geram o _painel, então faturas e comissões saem da base aqui
    (Porto com o detalhe das subestipulantes, como já está na Central). As outras operadoras geram o seu ao gravar."""
    antes = datetime.datetime.now().timestamp()
    if op == 'porto':
        etapa('Painel Porto para a Central (faturas e comissões)',
              [PY, 'painel_porto.py', '--comissao'] + (['--comp', comp] if comp else []))
        tmp = tempfile.mkdtemp(prefix='subs_')
        try:
            for f in novos_no_painel(antes):
                if f.startswith('fat_') and f.endswith('_porto.json'):
                    shutil.copy2(os.path.join(AQUI, '_painel', f), tmp)
            etapa('Painel Porto: subestipulantes', [PY, 'painel_subs.py', tmp, os.path.join(AQUI, '_painel')])
        finally:
            shutil.rmtree(tmp, ignore_errors=True)
    elif op == 'bradesco':
        etapa('Painel Bradesco para a Central (faturas e comissões)', [PY, 'painel_bradesco.py'])


def publicar_painel(desde):
    """Sobe para a Central tudo o que mudou no _painel desde o início da rodada (também quando ela parou no meio)."""
    pain = novos_no_painel(desde)
    n = banco.publicar(pain) if pain else 0
    if n:
        print(f'Central atualizada: {n} documento(s) publicados.')
    return pain


def faturas(args):
    if len(args) < 2 or args[0].lower() not in FATURAS:
        raise Parou(f'Use: rodar.py faturas <{"|".join(FATURAS)}> <AAAA-MM-DD> (Porto: --comp AAAA-MM).')
    simular = '--simular' in args
    entrada = opcao(args, '--entrada')
    portal = opcao(args, '--portal')
    comp = opcao(args, '--comp')
    op, data = args[0].lower(), args[1]
    datetime.date.fromisoformat(data)
    nome, pasta, rotulo = FATURAS[op]
    if op == 'porto':
        if not comp:
            raise Parou('Porto: passe a competência com --comp AAAA-MM.')
        entrada = entrada or os.path.join(FAT, 'Faturas', comp, 'PortoSaude')
    entrada = entrada or (os.path.join(ENTRADA, pasta) if pasta else None)
    if not entrada:
        raise Parou('Bradesco: passe a pasta dos kits em PDF com --entrada <pasta>.')
    base_fechada()
    js = os.path.join(AQUI, f'_ultimo_{op}.json')
    inicio = datetime.datetime.now().timestamp()
    if op == 'porto' and not simular and '--sem-baixar' not in args:
        print('\n== Download Porto (baixar_porto.js)', flush=True)
        r = subprocess.run(['node', 'baixar_porto.js', 'faturas', comp], cwd=AQUI)
        if r.returncode == 3:
            raise Parou('Porto: o portal não está logado. Dê dois cliques em "Entrar na Porto" e rode de novo.')
        if r.returncode:
            raise Parou(f'Download Porto terminou com erro (código {r.returncode}); veja Scripts/_socorro. Nada depois dele foi rodado.')
    if op == 'porto' and not os.path.isdir(entrada):
        raise Parou(f'Porto: a pasta {entrada} não existe (nada baixado para {comp}).')
    if op == 'bradesco':
        pdfs = sorted(glob.glob(os.path.join(entrada, '*.pdf')))
        if not pdfs:
            raise Parou(f'Nenhum PDF em {entrada}.')
        etapa('Leitura dos kits Bradesco', [PY, 'faturas_bradesco.py', *pdfs], saida=js)
    else:
        etapa(f'Leitura {nome}', [PY, f'faturas_{op}.py', entrada, js] + ([portal] if portal else []))
    pasta_fat = [] if op == 'bradesco' else [FAT]
    if simular:
        tmp = caixa_de_areia()
        try:
            base = os.path.join(tmp, 'Base_Faturas_Vidas.xlsx')
            cmd = [PY, f'gravar_{op}.py', js, base, base] + ([] if op == 'bradesco' else [tmp]) + [data]
            cmd += [] if op == 'bradesco' else ['--sem-copia']
            etapa(f'Gravação {nome} (SIMULAÇÃO numa cópia, a base não muda)', cmd, cwd=os.path.join(tmp, 'Scripts'))
        finally:
            shutil.rmtree(tmp, ignore_errors=True)
        print('\nSimulação concluída. Nada foi gravado. Para gravar, rode de novo sem --simular.')
        return
    backup(rotulo, data)
    etapa(f'Gravação {nome}', [PY, f'gravar_{op}.py', js, BASE, BASE] + pasta_fat + [data])
    painel_central(op, comp)
    vidas(nome if op != 'bradesco' else None)
    pain = novos_no_painel(inicio)
    print('\nPronto. Arquivos do painel para subir na Central:' if pain else '\nPronto. Nenhum arquivo novo no painel.')
    for f in pain:
        print('  _painel/' + f)


def comissao(args):
    simular = '--simular' in args
    comp = opcao(args, '--comp')
    args = [a for a in args if a != '--simular']
    if not args or args[0].lower() not in COMISSAO:
        raise Parou(f'Use: rodar.py comissao <{"|".join(COMISSAO)}> <arquivos...>.')
    op, arqs = args[0].lower(), [os.path.abspath(a) for a in args[1:]]
    if not arqs:
        raise Parou('Passe os arquivos (ou as pastas, na Hapvida) do extrato.')
    if op == 'porto' and not comp:
        raise Parou('Porto: passe a competência do extrato com --comp AAAA-MM.')
    base_fechada()
    porto = [comp] if op == 'porto' else []
    if simular:
        tmp = caixa_de_areia()
        try:
            etapa(f'Comissão {op} (SIMULAÇÃO numa cópia, a base não muda)',
                  [PY, f'comissao_{op}.py', os.path.join(tmp, 'Base_Faturas_Vidas.xlsx')] + porto + arqs,
                  cwd=os.path.join(tmp, 'Scripts'))
        finally:
            shutil.rmtree(tmp, ignore_errors=True)
        print('\nSimulação concluída. Nada foi gravado. Para gravar, rode de novo sem --simular.')
        return
    backup(COMISSAO[op], datetime.date.today().isoformat())
    etapa(f'Comissão {op}', [PY, f'comissao_{op}.py', BASE] + porto + arqs)
    painel_central(op)
    print('\nPronto. Próximo passo obrigatório: Agente Projeção (comissão e projeção conferem uma à outra).')


def main():
    args = sys.argv[1:]
    if not args or args[0] not in ('faturas', 'comissao', 'vidas'):
        print(__doc__); sys.exit(2)
    ordem = opcao(args, '--ordem')
    sessao = opcao(args, '--sessao')
    simular = '--simular' in args
    agente = {'faturas': 'faturas', 'comissao': 'comissao', 'vidas': 'vidas'}[args[0]]
    op = args[1].lower() if len(args) > 1 and not args[1].startswith('--') else None
    inicio = datetime.datetime.now().timestamp()
    if not simular:
        ordem = banco.inicio(agente, seguradora=op if agente != 'vidas' else None,
                             competencia=opcao(list(args), '--comp'), origem='ordem' if ordem else 'manual',
                             ordem=ordem, sessao=sessao, mensagem='Rodando: ' + ' '.join(args)) or ordem
    try:
        if args[0] == 'faturas':
            faturas(args[1:])
        elif args[0] == 'comissao':
            comissao(args[1:])
        else:
            base_fechada(); vidas(args[1] if len(args) > 1 else None)
    except Parou as e:
        print(f'\nPARADO: {e}')
        if not simular:
            publicar_painel(inicio)  # o que já foi gravado na base antes de parar também vai para a Central
            banco.fim(ordem, 'aguardando_voce' if 'aberta no Excel' in str(e) else 'erro', str(e))
        sys.exit(1)
    if not simular:
        pain = publicar_painel(inicio)
        # portal (empresa e master): faturas, vidas e comissões iguais à base. Se falhar, só avisa.
        sinc = subprocess.run([PY, 'sincronizar.py'], cwd=AQUI).returncode
        banco.fim(ordem, 'concluida', f'Concluída. {len(pain)} arquivo(s) do painel atualizados.'
                  + ('' if sinc == 0 else ' Portal não sincronizado: rode sincronizar.py.'))


if __name__ == '__main__':
    main()
