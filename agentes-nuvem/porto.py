# -*- coding: utf-8 -*-
"""Agente Porto na nuvem (GitHub Actions): entra sozinho no Corretor Online, baixa faturas e comissão, lê e registra no master.

Roda sem o PC: Chromium sem janela, senha nos segredos do GitHub (PORTO_USER, PORTO_PASS, PORTO_COD) e o token dos agentes
(SHADDAI_AGENTES_TOKEN). Usa os mesmos scripts do PC (agentes-pc/Scripts): baixar_porto.js, faturas_porto.py e comissao_porto.py.

Dois modos (variável SHADDAI_PORTO_MODO):
  medicao (padrão): baixa e lê, e só conta. Registra a rodada no master como máquina "Nuvem (GitHub)" com o tempo e as
                    contagens, como agente "Teste na nuvem" (não conta como Porto atualizada para o Supervisor e não
                    dispara Projeção nem Conferência).
                    Não grava faturas nem comissões: o PC continua sendo quem grava. Serve para medir se a Porto deixa
                    entrar pela nuvem (captcha, código, bloqueio) e quanto tempo leva.
  gravar          : depois de ler, grava direto no banco com o gravar_banco.py (quando ele existir) e a rodada vale de verdade.

O repositório é público: o log do GitHub só mostra contagens e o passo em que parou, nunca nome de empresa, valor, CPF ou
vida. Os arquivos baixados ficam numa pasta temporária do servidor e somem no fim (não são guardados como artefato).

Uso: python agentes-nuvem/porto.py [--faturas AAAA-MM] [--comissao-dias N]
"""
import os, sys, json, glob, time, shutil, datetime, subprocess, tempfile

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRIPTS = os.path.join(RAIZ, 'agentes-pc', 'Scripts')
sys.path.insert(0, SCRIPTS)
os.environ.setdefault('SHADDAI_MAQUINA', 'Nuvem (GitHub)')
import banco  # noqa: E402

MODO = os.environ.get('SHADDAI_PORTO_MODO', 'medicao')
RESUMO = os.environ.get('GITHUB_STEP_SUMMARY')


def log(msg):
    print(msg, flush=True)
    if RESUMO:
        with open(RESUMO, 'a', encoding='utf-8') as f:
            f.write(msg + '\n\n')


def competencia(hoje):
    """Mesma regra do Supervisor: até o dia 19 o mês atual; a partir do dia 20 o seguinte."""
    if hoje.day >= 20:
        hoje = (hoje.replace(day=1) + datetime.timedelta(days=32))
    return hoje.strftime('%Y-%m')


def rs(v):
    return f'R$ {v:,.2f}'.replace(',', 'X').replace('.', ',').replace('X', '.')


def opcao(nome, padrao=None):
    a = sys.argv
    return a[a.index(nome) + 1] if nome in a else padrao


def baixar(trab, comp, ini, fim):
    env = {**os.environ, 'PORTO_NUVEM': '1', 'SHADDAI_FAT': trab}
    r = subprocess.run(['node', os.path.join(SCRIPTS, 'baixar_porto.js'), 'faturas', comp, 'comissao', ini, fim],
                       cwd=SCRIPTS, env=env, capture_output=True, text=True, encoding='utf-8')
    try:
        saida = json.loads((r.stdout or '').strip().splitlines()[-1])
    except (ValueError, IndexError):
        saida = {'ok': False, 'motivo': 'o download não respondeu', 'passo': '?'}
    return r.returncode, saida


def ler_faturas(trab, comp):
    pasta = os.path.join(trab, 'Faturas', comp, 'PortoSaude')
    if not os.path.isdir(pasta):
        return []
    out = os.path.join(trab, 'faturas_porto.json')
    r = subprocess.run([sys.executable, 'faturas_porto.py', pasta, out, '--base', os.path.join(trab, 'sem_base.xlsx')],
                       cwd=SCRIPTS, capture_output=True, text=True, encoding='utf-8',
                       env={**os.environ, 'PYTHONIOENCODING': 'utf-8', 'PYTHONUTF8': '1'})
    if r.returncode:
        raise RuntimeError(f'leitura das faturas parou (código {r.returncode})')
    d = json.load(open(out, encoding='utf-8'))
    docs = d if isinstance(d, list) else d.get('faturas', d.get('docs', []))
    return out, [x for x in docs if isinstance(x, dict) and x.get('tipo') == 'fatura'], [x for x in docs if isinstance(x, dict) and x.get('tipo') == 'erro']


def ler_comissao(trab):
    import comissao_porto
    ordens, lancs, bruto, erros = 0, 0, 0.0, 0
    arqs = sorted(glob.glob(os.path.join(trab, 'Comissoes', '*', 'PortoSaude', '*.html')))
    for a in arqs:
        try:
            cab, lanc, deb, tot = comissao_porto.ler_analitico(a)
            ordens += 1; lancs += len(lanc); bruto += tot.get('bruta') or 0
        except Exception:
            erros += 1
    return arqs, ordens, lancs, round(bruto, 2), erros


def main():
    hoje = datetime.date.today()
    comp = opcao('--faturas') or competencia(hoje)
    dias = int(opcao('--comissao-dias', '15'))
    ini, fim = (hoje - datetime.timedelta(days=dias)).isoformat(), hoje.isoformat()
    t0 = time.time()
    medir = MODO != 'gravar'
    # medição usa o agente "teste_nuvem": uma rodada "concluída" de faturas Porto faria o Supervisor achar que a Porto já
    # foi atualizada e deixar de pedir ao PC (ele olha a última ordem concluída de faturas/comissão)
    ordem = banco.inicio('teste_nuvem' if medir else 'faturas', seguradora='porto', competencia=comp, origem='manual',
                         sessao=os.environ.get('SHADDAI_EXECUCAO_URL'),
                         mensagem=('Medição na nuvem: ' if medir else 'Nuvem: ') + f'Porto faturas {comp} e comissão {ini} a {fim}')
    banco.cadastro()  # nomes curtos das subestipulantes (_cadastro.json) para as pastas dos arquivos
    trab = tempfile.mkdtemp(prefix='porto_')
    status, msg = 'erro', 'parou sem motivo'
    try:
        cod, saida = baixar(trab, comp, ini, fim)
        seg = round(time.time() - t0)
        if cod == 3:
            det = saida.get('detalhe') or 'login'
            status, msg = 'erro', f'A Porto não deixou entrar pela nuvem ({det}) em {seg}s. O PC continua fazendo a Porto.'
            log(f'Login: não entrou ({det}).')
            return 1
        if cod:
            status, msg = 'erro', f"Download parou no passo \"{saida.get('passo', '?')}\" em {seg}s: {saida.get('motivo', '?')[:200]}"
            log(f"Download parou no passo: {saida.get('passo', '?')}")
            return 1
        log(f'Login e download: ok em {seg}s ({len(saida.get("arquivos", []))} arquivos).')
        js, fats, errs = ler_faturas(trab, comp) or (None, [], [])
        vidas = sum(f.get('vidas_ativas') or 0 for f in fats)
        total = round(sum(f.get('total') or 0 for f in fats), 2)
        arqs, n_ord, n_lanc, bruto, err_c = ler_comissao(trab)
        log(f'Leitura: {len(fats)} faturas ({len(errs)} com erro), {n_ord} ordens de comissão ({err_c} com erro).')
        resumo = (f'{len(fats)} faturas {comp} ({vidas} vidas, {rs(total)}), {len(saida.get("pagos", []))} boletos já pagos, '
                  f'{len(saida.get("sem_dados", []))} sem fatura ainda; comissão {ini} a {fim}: {n_ord} ordens, {n_lanc} lançamentos, '
                  f'bruto {rs(bruto)}. Tempo {round(time.time() - t0)}s.')
        falhas = len(errs) + err_c
        if medir:
            status = 'erro' if falhas else 'concluida'
            msg = (f'Medição na nuvem, nada gravado (o PC continua gravando a Porto): {resumo}'
                   + (f' {falhas} arquivo(s) não foram lidos.' if falhas else ''))
            return 1 if falhas else 0
        gravar = os.path.join(SCRIPTS, 'gravar_banco.py')
        if not os.path.exists(gravar):
            status, msg = 'erro', 'Modo gravar pedido, mas o gravar_banco.py ainda não existe. Nada gravado. ' + resumo
            return 1
        env = {**os.environ, 'PYTHONIOENCODING': 'utf-8', 'PYTHONUTF8': '1'}
        for cmd in ([[sys.executable, 'gravar_banco.py', 'faturas', 'porto', js]] if js else []) + \
                   [[sys.executable, 'gravar_banco.py', 'comissao', 'porto', *[a for a in arqs if os.path.basename(os.path.dirname(os.path.dirname(a))) == m], '--comp', m]
                    for m in sorted({os.path.basename(os.path.dirname(os.path.dirname(a))) for a in arqs})]:
            r = subprocess.run(cmd, cwd=SCRIPTS, env=env, capture_output=True, text=True, encoding='utf-8')
            if r.returncode:
                status, msg = 'erro', f'Gravação no banco parou ({cmd[2]}, código {r.returncode}). ' + resumo
                return 1
        status, msg = 'concluida', 'Concluída na nuvem. ' + resumo
        return 0
    except Exception as e:
        status, msg = 'erro', f'Nuvem: {e.__class__.__name__}: {str(e)[:200]}'
        log(f'Parou: {e.__class__.__name__}')
        return 1
    finally:
        shutil.rmtree(trab, ignore_errors=True)
        banco.fim(ordem, status, msg)
        log(f'Rodada registrada no master: {"concluída" if status == "concluida" else "erro"}.')


if __name__ == '__main__':
    sys.exit(main())
