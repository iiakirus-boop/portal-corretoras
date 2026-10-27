# -*- coding: utf-8 -*-
"""Vigia da fila: deixa o PC pegando sozinho os pedidos de execução feitos no portal (master > Agentes).

A cada volta (padrão: 2 minutos):
  1. avisa o master que o PC está ligado (a máquina aparece "no ar");
  2. lê a fila de pedidos pendentes da Shaddai;
  3. roda um pedido por vez com o rodar.py (a base não aceita dois agentes gravando juntos).

O que ele roda sozinho:
  - Vidas: sempre (só usa a base).
  - Ciclo automático (pedidos do Supervisor ou do master, sem arquivos no pedido): faturas e comissão da Porto, do Bradesco
    e da Hapvida. 1) confere o login (Chrome do "Entrar na Porto" na porta 9334, "Entrar na Bradesco" na 9333, "Entrar na
    Hapvida" nas 9335/9336/9337 para a comissão, os três logins; a Hapvida faturas entra sozinha); 2) baixa com
    baixar_<op>.js (faturas: competência do pedido ou a próxima; comissão: do último pagamento já importado até hoje;
    Hapvida: mês de referência do pedido ou o atual); 3) rodar.py --ordem <id>, que grava, publica na Central e sincroniza.
    Login caído: o vigia abre sozinho o "Entrar na <op>" (login_<op>.ps1, senha do cofre do Windows) e espera até 5 min o login terminar;
    sem senha no cofre, já tentou na última meia hora ou saída 3 do baixar = "esperando você". Saída 2 = erro, com o
    print em Scripts/_socorro. Nada novo no portal = concluída.
  - Faturas SulAmérica e Amil: lê os arquivos que já estão em "boletos a enviar".
  - Pedido com a pasta ou os arquivos (parametros.entrada / parametros.arquivos): roda direto com eles.
    A cada volta manda ao master o estado de cada login (Visão geral > Logins nas seguradoras).
  - Projeção: não é com ele. Roda na nuvem (depois de faturas e de comissão, pelo agente_fim).

Base aberta no Excel: o rodar.py marca "esperando você"; feche a planilha e use "repetir" no master.

Uso (dentro de FATURAS\\Scripts):
  python vigia.py              fica rodando (deixe a janela aberta, ou use "Iniciar vigia.bat")
  python vigia.py --uma-vez    faz uma volta só e sai
  python vigia.py --ver        só mostra o que faria, sem rodar nada
  python vigia.py --teste <faturas|comissao> <op> [AAAA-MM]
                               pedido simulado: confere o login e baixa de verdade, mas o rodar.py vai com --simular
"""
import sys, os, time, datetime, subprocess, json, urllib.request
import banco

AQUI = os.path.dirname(os.path.abspath(__file__))
VERSAO = 'vigia 2026-10-27c'
INTERVALO = int(os.environ.get('SHADDAI_VIGIA_MINUTOS', '2')) * 60
MAQUINA = os.environ.get('SHADDAI_MAQUINA', 'PC do Bruno')
LOG = os.path.join(AQUI, '_vigia.log')
OP = {v: k for k, v in banco.SEG.items()}  # porto_saude -> porto
SOZINHO = {'hapvida', 'sulamerica', 'amil'}  # faturas que vêm de arquivos já baixados


def log(msg):
    linha = f'{datetime.datetime.now():%d/%m %H:%M:%S}  {msg}'
    print(linha, flush=True)
    with open(LOG, 'a', encoding='utf-8') as f:
        f.write(linha + '\n')


def sinal():
    banco._rpc('agente_sinal', dict(p_maquina=MAQUINA, p_versao=VERSAO))
    try:
        banco.logins([dict(seguradora=banco.SEG[op], codigo=cod, ativa=logado(op, porta, dom)) for op, cod, porta, dom in LOGINS],
                     MAQUINA)
    except Exception as e:  # o estado dos logins nunca para o vigia
        log(f'estado dos logins: {e.__class__.__name__}: {e}')


def comando(o):
    """Monta o rodar.py do pedido, ou devolve (None, motivo) quando precisa de alguém."""
    ag, op, par = o['agente'], OP.get(o.get('seguradora_id') or '', o.get('seguradora_id')), o.get('parametros') or {}
    base = [sys.executable, 'rodar.py']
    fim = ['--ordem', o['id']]
    if ag == 'vidas':
        nome = par.get('operadora') or {'hapvida': 'Hapvida', 'sulamerica': 'SulAmérica', 'amil': 'Amil'}.get(op)
        return base + ['vidas'] + ([nome] if nome else []) + fim, None
    if ag == 'faturas':
        if not op:
            return None, 'Escolha a seguradora no pedido de Faturas.'
        if op == 'porto':
            return None, 'Faturas Porto são feitas pelo navegador: alguém entra no portal e pede ao Claude "rodar faturas Porto".'
        data = par.get('data') or datetime.date.today().isoformat()
        entrada = (par.get('entrada') or '').replace('"', '').strip() or None
        if op in SOZINHO or entrada:
            return base + ['faturas', op, data] + (['--entrada', entrada] if entrada else []) + fim, None
        return None, f'Faturas {op}: baixe os kits no portal e informe a pasta (ou peça ao Claude no PC).'
    if ag == 'comissao':
        if not op:
            return None, 'Escolha a seguradora no pedido de Comissão.'
        arqs = [x.replace('"', '').strip() for x in (par.get('arquivos') or []) if x.replace('"', '').strip()]
        if not arqs:
            return None, f'Comissão {op}: o extrato precisa ser baixado no portal. Alguém entra e pede ao Claude "rodar comissão {op}".'
        comp = ['--comp', o['competencia'].strip()] if o.get('competencia') else []
        return base + ['comissao', op] + list(arqs) + comp + fim, None
    return None, f'Agente {ag} não roda no PC.'


# Ciclo automático (pedidos do Supervisor ou do master): baixa do portal -> rodar.py, que grava, publica e sincroniza.
AUTO = {('faturas', 'porto'), ('faturas', 'bradesco'), ('faturas', 'hapvida'),
        ('comissao', 'porto'), ('comissao', 'bradesco'), ('comissao', 'hapvida')}
PORTA = {'porto': (9334, 'portoseguro.com.br'), 'bradesco': (9333, 'bradescoseguros.com.br')}  # Chrome dos atalhos "Entrar na ..."
WEBHAP = {9335: 'Hapvida', 9336: 'Hapvida_045L', 9337: 'Hapvida_02JZ'}  # comissão Hapvida: um Chrome por login (045K, 045L, 02JZ)
NOME = {'porto': 'Porto', 'bradesco': 'Bradesco', 'hapvida': 'Hapvida'}
# o que vai para o master: (op, código na corretora_codigos, porta, domínio)
LOGINS = [('porto', 'BA6QXJ', 9334, 'portoseguro.com.br'), ('bradesco', 'Portal', 9333, 'bradescoseguros.com.br'),
          ('hapvida', '045K', 9335, 'webhap.hapvida.com.br'), ('hapvida', '045L', 9336, 'webhap.hapvida.com.br'),
          ('hapvida', '02JZ', 9337, 'webhap.hapvida.com.br')]
# login automático: o mesmo atalho "Entrar na <op>", que só pede senha quando ela não está no cofre (aí fica com você)
COFRE = os.path.join(os.environ.get('LOCALAPPDATA', ''), 'Shaddai')
ENTRAR = {'porto': ('login_porto.ps1', ['porto.cred']), 'bradesco': ('login_bradesco.ps1', ['bradesco.cred']),
          'hapvida': ('login_hapvida.ps1', ['hapvida_045K.cred', 'hapvida_045L.cred', 'hapvida_02JZ.cred'])}
TENTOU = {}  # op -> quando o vigia abriu o login pela última vez
SEGURADORA = {'porto': ('PORTO SEGURO - SEGURO SAUDE', 'PORTOMED'), 'bradesco': ('BRADESCO',)}


def logado(op, porta=None, dominio='webhap.hapvida.com.br'):
    """Chrome do atalho aberto na porta CDP com uma aba do portal. Só uma olhada rápida: a tela de login de verdade o
    baixar_<op>.js confere (sai com código 3)."""
    if not porta:
        porta, dominio = PORTA[op]
    try:
        abas = json.loads(urllib.request.urlopen(f'http://localhost:{porta}/json/list', timeout=5).read())
    except Exception:
        return False
    return any(dominio in a.get('url', '') for a in abas if a.get('type') == 'page')


def todos_logados(op, ag):
    if op in PORTA:
        return logado(op)
    return ag != 'comissao' or all(logado(op, p) for p in WEBHAP)  # Hapvida faturas entra sozinha no baixar


def entrar(op, ag):
    """Abre o "Entrar na <op>" numa janela própria (como o atalho) e espera o portal ficar logado. Só com a senha no
    cofre e no máximo uma vez a cada 30 min, para não bloquear o login com tentativas repetidas."""
    ps1, creds = ENTRAR[op]
    if not all(os.path.exists(os.path.join(COFRE, c)) for c in creds):
        return 'sem a senha no cofre: clique uma vez em Entrar na ' + NOME[op] + ' para guardar'
    if time.time() - TENTOU.get(op, 0) < 30 * 60:
        return 'o login automático já tentou há menos de 30 min (captcha ou código?): termine na janela do Chrome'
    TENTOU[op] = time.time()
    log(f'{op}: login caído, abrindo {ps1}')
    subprocess.Popen(['powershell', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', os.path.join(AQUI, ps1)], cwd=AQUI,
                     creationflags=getattr(subprocess, 'CREATE_NEW_CONSOLE', 0))
    marca = os.path.join(COFRE, f'{op}.logado')  # Porto e Bradesco: o login_<op>.js grava quando entrou de verdade
    for _ in range(30):  # até 5 min
        time.sleep(10)
        if op in PORTA and not (os.path.exists(marca) and os.path.getmtime(marca) >= TENTOU[op]):
            continue
        if todos_logados(op, ag):
            if op not in PORTA:
                time.sleep(30)  # webhap: só o Chrome aberto; dá tempo de o login terminar
            log(f'{op}: login automático feito')
            return None
    return 'o login automático não terminou em 5 min (captcha ou código?): termine na janela do Chrome'


def ultimo_pagamento(op):
    """Data do último pagamento de comissão da seguradora já importado na base (o extrato é baixado a partir dele)."""
    import openpyxl
    wb = openpyxl.load_workbook(os.path.join(os.path.dirname(AQUI), 'Base_Faturas_Vidas.xlsx'), read_only=True)
    datas = [r[3] for r in wb['Pagamentos Comissão'].iter_rows(min_row=2, values_only=True)
             if r[2] and isinstance(r[3], datetime.datetime) and any(s in str(r[1] or '').upper() for s in SEGURADORA[op])]
    wb.close()
    return max(datas).date() if datas else datetime.date.today().replace(day=1)


def proxima_comp(hoje):
    return (hoje.replace(day=1) + datetime.timedelta(days=32)).strftime('%Y-%m')


def parar(o, status, motivo, simular):
    log(f"{o['agente']} {o.get('seguradora_id')}: {status}. {motivo}")
    if not simular:
        banco.fim(o['id'], status, motivo)
        sinal()


def automatico(o, simular=False):
    """1. login ativo? 2. baixar_<op>.js  3. rodar.py --ordem <id> com o que foi baixado."""
    ag, op = o['agente'], OP.get(o.get('seguradora_id') or '')
    hoje = datetime.date.today()
    if not simular:
        banco.inicio(ag, ordem=o['id'], maquina=MAQUINA, mensagem='Baixando do portal')
    caiu = f'login caiu: clique em Entrar na {NOME[op]}'
    # os três logins juntos na comissão Hapvida: o painel do mês sai das três pastas (comissao_hapvida.py)
    if not todos_logados(op, ag):
        motivo = entrar(op, ag)
        if motivo:
            return parar(o, 'aguardando_voce', f'login caiu, {motivo}', simular)
    comp = (o.get('competencia') or '').strip() or proxima_comp(hoje)
    if ag == 'faturas':
        args = ['faturas', f'{comp}-01' if op == 'hapvida' else comp]
    elif op == 'hapvida':
        comp = (o.get('competencia') or '').strip() or hoje.strftime('%Y-%m')  # mês de referência do webhap
        args = ['comissao', comp]
    else:
        args = ['comissao', ultimo_pagamento(op).isoformat(), hoje.isoformat()]  # o mesmo dia de novo: ordem já gravada é pulada
    log(f'{ag} {op}: node baixar_{op}.js ' + ' '.join(args))
    r = subprocess.run(['node', f'baixar_{op}.js', *args], cwd=AQUI, capture_output=True, text=True, encoding='utf-8')
    try:
        saida = json.loads((r.stdout or '').strip().splitlines()[-1])
    except (ValueError, IndexError):
        saida = {}
    if r.returncode == 3:
        return parar(o, 'aguardando_voce', caiu, simular)
    if r.returncode:
        return parar(o, 'erro', f"Download parou no passo \"{saida.get('passo', '?')}\": {saida.get('motivo', r.stderr[-200:])}."
                     f" Print em Scripts/_socorro ({os.path.basename(saida.get('print') or '')}).", simular)
    novos = saida.get('arquivos', [])
    log(f"{ag} {op}: {len(novos)} arquivo(s) novo(s), {len(saida.get('repetidos', []))} já baixado(s)")
    if not novos:
        return parar(o, 'concluida', 'Nada novo no portal.', simular)
    data, fim = hoje.isoformat(), ['--ordem', o['id']] + (['--simular'] if simular else [])
    if ag == 'faturas':
        extra = {'porto': ['--comp', comp, '--sem-baixar'], 'bradesco': ['--entrada', os.path.dirname(novos[0])],
                 'hapvida': ['--portal', novos[0]]}[op]
        cmds = [['faturas', op, data] + extra]
    elif op == 'porto':  # o analítico fica em Comissoes/<mês do pagamento>/: uma rodada por mês, com --comp
        meses = {}
        for f in novos:
            meses.setdefault(os.path.basename(os.path.dirname(os.path.dirname(f))), []).append(f)
        cmds = [['comissao', 'porto', *fs, '--comp', m] for m, fs in sorted(meses.items())]
    elif op == 'hapvida':  # as três pastas do mês (lote já gravado é pulado)
        pastas = [os.path.join(os.path.dirname(AQUI), 'Comissoes', comp, p) for p in WEBHAP.values()]
        cmds = [['comissao', 'hapvida', *[p for p in pastas if os.path.isdir(p)]]]
    else:
        cmds = [['comissao', op, *novos]]
    for c in cmds:
        log(f'{ag} {op}: rodar.py ' + ' '.join(c + fim))
        if subprocess.run([sys.executable, 'rodar.py', *c, *fim], cwd=AQUI).returncode:
            return log(f'{ag} {op}: rodar.py parou (o pedido já ficou com o motivo)')
    log(f'{ag} {op}: pronto')


def volta(ver=False):
    sinal()
    fila = banco.fila()
    ordens = [o for o in fila.get('ordens', []) if o['agente'] != 'projecao']
    if not ordens:
        return 0
    o = ordens[0]  # um por vez: a fila já vem por prioridade e ordem de chegada
    if (o['agente'], OP.get(o.get('seguradora_id') or '')) in AUTO and not (o.get('parametros') or {}).get('arquivos') \
            and not (o.get('parametros') or {}).get('entrada'):
        if ver:
            log(f"[ver] {o['agente']} {o.get('seguradora_id')}: ciclo automático (login, baixar, rodar.py)")
        else:
            automatico(o)
        return len(ordens)
    cmd, motivo = comando(o)
    desc = f"{o['agente']} {o.get('seguradora_id') or ''} {o.get('competencia') or ''}".strip()
    if ver:
        log(f'[ver] {desc}: ' + (' '.join(cmd[1:]) if cmd else 'esperando você: ' + motivo))
        return len(ordens)
    if not cmd:
        banco.inicio(o['agente'], ordem=o['id'], maquina=MAQUINA, mensagem='Pegou da fila')
        banco.fim(o['id'], 'aguardando_voce', motivo)
        log(f'{desc}: esperando você. {motivo}')
        return len(ordens)
    log(f'{desc}: rodando ' + ' '.join(cmd[1:]))
    r = subprocess.run(cmd, cwd=AQUI)
    log(f'{desc}: terminou ({"ok" if r.returncode == 0 else "erro " + str(r.returncode)})')
    return len(ordens)


def main():
    if '--teste' in sys.argv:  # pedido simulado: não lê a fila, não marca nada no master e o rodar.py vai com --simular
        ag, op, *comp = sys.argv[sys.argv.index('--teste') + 1:]
        return automatico(dict(id='teste', agente=ag, seguradora_id=banco.SEG[op], competencia=comp[0] if comp else None), simular=True)
    ver, uma = '--ver' in sys.argv, '--uma-vez' in sys.argv or '--ver' in sys.argv
    if not banco._token():
        print('Sem o token dos agentes (.token_agentes): o vigia não consegue falar com o portal.'); sys.exit(1)
    log(f'Vigia ligado ({MAQUINA}). Olha a fila a cada {INTERVALO // 60} min. Feche esta janela para parar.' if not uma else 'Vigia: uma volta.')
    while True:
        try:
            n = volta(ver)
        except Exception as e:  # nunca morre por um erro numa volta
            log(f'erro na volta: {e.__class__.__name__}: {e}'); n = 0
        if uma:
            break
        # se ainda há pedidos na fila, já pega o próximo; senão espera
        time.sleep(5 if n > 1 else INTERVALO)


if __name__ == '__main__':
    main()
