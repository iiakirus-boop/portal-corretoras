"""Agente Comissão Hapvida — importa o "Relatório de Comissão Analítico por Data Pagamento" (Excel/CSV) do portal
Hapvida para a Base_Faturas_Vidas.xlsx, nas mesmas abas da Porto/Bradesco/Amil ("Pagamentos Comissão" e "Comissões"),
e gera o JSON do painel (_painel/com_AAAA-MM_hapvida.json).

Caminho no portal: webhap.hapvida.com.br/pls/webhap/pk_controle_comissao.Login → login → ESCOLHER UM MÊS DE
REFERÊNCIA → RELATORIOS → em cada card (lote), EXCEL do "Relatório de Comissão Analítico por Data Pagamento"
(baixa R61692a_dyn_<data>.csv). Organizar com organizar_hapvida.py, que grava lotes.tsv com os dados dos cards.

Uso:  python comissao_hapvida.py <Base_Faturas_Vidas.xlsx> <pasta Comissoes/AAAA-MM/Hapvida> [outra pasta ...]

A Shaddai tem três logins na Hapvida: 045K (Shaddai Proventus, CNPJ 0001-23, pasta Hapvida), 045L (Shaddai Proventus,
CNPJ 0002-04, pasta Hapvida_045L) e 02JZ (Shaddai Corretora de Seguros, CNPJ 02.195.141/0001-32, pasta Hapvida_02JZ).
O nº do lote se repete entre logins, por isso a ordem do 02JZ é HAP-02JZ-<lote>. Passe as duas pastas do mês juntas para o painel do mês sair completo.

- Um card (lote) = uma ordem de pagamento, gravada como "HAP-<lote>". Competência = mês de referência do portal.
  Data de pagamento = Data Integração do card. Valor do card = comissão bruta (o portal não mostra impostos).
- Em "Comissões", uma linha por fatura do cliente (obrigação) × parcela × taxa — o CSV vem por beneficiário e
  os beneficiários são somados (nº de vidas nas Observações).
- Comissão = Σ VL RECEBER; base = Σ VL.LIQUIDO (saúde + odonto). Conferência: base × taxa − desconto + adicional
  = comissão; Σ do lote = valor do card.
- Tipo pela regra da Shaddai: acima de 50% = Agenciamento; até 10% = Vitalício. 50% em lote de regra
  AGENCIAMENTO também é Agenciamento (Hapvida paga 100% + 50% em algumas vendas).
- Lote já gravado não é gravado de novo: compara o valor e relata.
"""
import sys, os, csv, glob, json, datetime, collections
import openpyxl
from shaddai_comum import classe_por_taxa, VERIFICAR, preparar, _prox, _w, MOEDA, DATA, CINZA, PAG, COM


def _n(s):
    s = (s or "").strip().replace("=", "").strip('"')
    if not s:
        return 0.0
    if s.startswith(","):
        s = "0" + s
    return float(s.replace(".", "").replace(",", "."))


def _t(s):
    return (s or "").strip().replace("=", "").strip('"').strip()


def _d(s):
    s = _t(s)
    for f in ("%d/%m/%Y", "%d/%m/%y"):
        try:
            return datetime.datetime.strptime(s, f)
        except ValueError:
            pass
    return None


def ler_lotes(pasta):
    lotes = []
    for l in open(os.path.join(pasta, "lotes.tsv"), encoding="utf-8"):
        c = l.rstrip("\n").split("\t")
        if c[0] == "lote" or len(c) < 8:
            continue
        lotes.append(dict(lote=c[0], tipo=c[1], regra=c[2], integracao=_d(c[3]), ini=_d(c[4]), fim=_d(c[5]),
                          obrigacao=c[6], valor=_n(c[7])))
    return lotes


def ler_csv(path):
    rows = list(csv.reader(open(path, encoding="cp1252"), delimiter=";"))
    if not rows or not rows[0][0].startswith("CD FILIAL") or len(rows[0]) < 27:
        raise ValueError(f"{os.path.basename(path)} não é o analítico por data de pagamento da Hapvida")
    grupos = collections.OrderedDict()
    for r in rows[1:]:
        if len(r) < 27:
            continue
        k = (_t(r[4]), _t(r[8]), _t(r[16]), _n(r[21]))
        g = grupos.get(k)
        if g is None:
            g = grupos[k] = dict(obrigacao=_t(r[4]), venc=_d(r[5]), dtpag=_d(r[6]), origem=_t(r[7]), cod=_t(r[8]),
                                 empresa=_t(r[9]), filial=_t(r[1]), corretora=_t(r[2]), parcela=_t(r[16]), perc=_n(r[21]),
                                 cad_emp=_d(r[15]), vendedor=_t(r[27]), base=0.0, bruto=0.0, desc=0.0, adic=0.0,
                                 fixo=0.0, receber=0.0, vidas=0)
        g["base"] += _n(r[18]) + _n(r[20])
        g["bruto"] += _n(r[22]); g["desc"] += _n(r[24]); g["adic"] += _n(r[25]); g["fixo"] += _n(r[23])
        g["receber"] += _n(r[26]); g["vidas"] += 1
    for g in grupos.values():
        for k in ("base", "bruto", "desc", "adic", "fixo", "receber"):
            g[k] = round(g[k], 2)
    return list(grupos.values())


def tipo_shaddai(perc, regra):
    c = classe_por_taxa(perc)  # regra da Shaddai, no shaddai_comum
    if c == VERIFICAR and regra == "AGENCIAMENTO":
        return "Agenciamento"
    return c


def _formulas(wc, k, desc, adic):
    wc[f"Q{k}"] = f"=IF(B{k}=\"\",\"\",IFERROR(INDEX(Empresas!$A:$A,MATCH(I{k},Empresas!$E:$E,0)),\"\"))"
    for col in "RSTUV":
        wc[f"{col}{k}"] = None
    ajuste = (f"-{desc}" if desc else "") + (f"+{adic}" if adic else "")
    wc[f"W{k}"] = f"=IF(OR(B{k}=\"\",M{k}=\"\"),\"\",ROUND(M{k}*N{k}/100{ajuste},2))"
    wc[f"X{k}"] = f"=IF(B{k}=\"\",\"\",IF(ABS(W{k}-O{k})<=0.05,\"OK (sem fatura na base)\",\"Divergência\"))"
    for col in "QRSTUVWX":
        wc[f"{col}{k}"].fill = CINZA
    wc[f"W{k}"].number_format = MOEDA


def importar(wb, pastas, rel_de):
    preparar(wb)
    wp, wc = wb[PAG], wb[COM]
    ja = {}
    r = 2
    while wp[f"C{r}"].value not in (None, ""):
        ja[str(wp[f"C{r}"].value)] = r
        r += 1
    hoje = datetime.datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    rel, painel = [], {}
    for pasta in pastas:
        comp = os.path.basename(os.path.dirname(os.path.abspath(pasta)))  # .../Comissoes/AAAA-MM/Hapvida
        lotes = ler_lotes(pasta)
        arqs = {}
        for p in sorted(glob.glob(os.path.join(pasta, "*.csv"))):
            arqs.setdefault(os.path.basename(p).split(" ", 1)[0], p)
        P = painel.setdefault(comp, dict(ordens=[], itens=[], obs=[]))
        for L in lotes:
            path = arqs.get(L["lote"])
            # o nº do lote se repete entre logins: 045K/045L ficam "HAP-<lote>" (já gravados assim); os demais levam o código
            cod_pasta = os.path.basename(os.path.abspath(pasta)).split("_", 1)[1] if "_" in os.path.basename(os.path.abspath(pasta)) else "045K"
            op = f"HAP-{L['lote']}" if cod_pasta in ("045K", "045L") else f"HAP-{cod_pasta}-{L['lote']}"
            if not path:
                rel.append((op, "SEM ARQUIVO", f"{L['tipo']} {L['valor']:.2f} — baixar o Excel do card"))
                continue
            gs = ler_csv(path)
            soma = round(sum(g["receber"] for g in gs), 2)
            conf = "OK" if abs(soma - L["valor"]) <= 0.05 else "Divergência"
            cod = gs[0]["corretora"] if gs else ""
            seg = f"HAPVIDA {cod} / {L['tipo'].replace(' HAPVIDA', '')}"
            data = L["integracao"]
            P["ordens"].append(dict(op=op, data=f"{data:%d/%m/%Y}", dataISO=f"{data:%Y-%m-%d}",
                                    empresa=f"Hapvida {cod} · {L['tipo'].replace(' HAPVIDA', '')} ({L['regra'].lower()})",
                                    bruto=L["valor"], debcred=0, apagar=L["valor"], conf=conf, lanc=len(gs),
                                    debitos="" if conf == "OK" else f"detalhe soma {soma:.2f}".replace(".", ",")))
            for g in gs:
                tp = tipo_shaddai(g["perc"], L["regra"])
                P["itens"].append(dict(eid="", empresa=g["empresa"], op=op, titulo=g["obrigacao"],
                                       compFat=f"{g['venc']:%Y-%m}" if g["venc"] else None,
                                       venc=f"{g['venc']:%d/%m/%Y}" if g["venc"] else None,
                                       valorFat=g["base"], premio=g["base"], premioEsp=None, taxa=g["perc"],
                                       comissao=g["receber"], parcela=int(g["parcela"]) if g["parcela"].isdigit() else g["parcela"],
                                       tipo="AN" if tp == "Agenciamento" else "CO", copart=0, taxaFixa=round(g["desc"] - g["adic"], 2),
                                       conf="OK" if abs(round(g["base"] * g["perc"] / 100 - g["desc"] + g["adic"], 2) - g["receber"]) <= 0.05 else "Divergência"))
            if conf != "OK":
                P["obs"].append(f"Lote {L['lote']} ({L['tipo']}): card R$ {L['valor']:.2f} e o analítico soma R$ {soma:.2f}.".replace(".", ","))
            if op in ja:
                ant = wp[f"E{ja[op]}"].value or 0
                rel.append((op, "já gravado", "sem diferenças" if abs(ant - L["valor"]) <= 0.01
                            else f"valor no card {L['valor']:.2f} ≠ gravado {ant:.2f}"))
                continue
            arq = rel_de(path)
            r = _prox(wp, "C")
            _w(wp, f"A{r}", comp); _w(wp, f"B{r}", seg); _w(wp, f"C{r}", op); _w(wp, f"D{r}", data, DATA)
            _w(wp, f"E{r}", L["valor"], MOEDA); _w(wp, f"F{r}", 0, MOEDA); _w(wp, f"G{r}", 0, MOEDA)
            _w(wp, f"H{r}", 0, MOEDA); _w(wp, f"I{r}", L["valor"], MOEDA); _w(wp, f"J{r}", 0, MOEDA)
            _w(wp, f"K{r}", L["valor"], MOEDA)
            _w(wp, f"P{r}", arq); _w(wp, f"Q{r}", hoje, DATA)
            _w(wp, f"R{r}", f"Lote Hapvida {L['lote']} (código corretora {cod}), {L['tipo']}, regra {L['regra']}; obrigação {L['obrigacao']}; "
                            f"período {L['ini']:%d/%m/%Y} a {L['fim']:%d/%m/%Y}; data integração {data:%d/%m/%Y}; "
                            "portal não informa impostos (bruto = líquido)")
            wp[f"L{r}"] = f"=IF(C{r}=\"\",\"\",COUNTIFS('{COM}'!$B:$B,C{r}))"
            wp[f"M{r}"] = f"=IF(C{r}=\"\",\"\",SUMIFS('{COM}'!$O:$O,'{COM}'!$B:$B,C{r}))"
            wp[f"N{r}"] = (f"=IF(C{r}=\"\",\"\",IF(AND(ABS(M{r}-E{r})<=0.05,"
                           f"ABS(I{r}+J{r}-K{r})<=0.01,ABS(E{r}-F{r}-G{r}-H{r}-I{r})<=0.01),\"OK\",\"Divergência\"))")
            for col in "LMN":
                wp[f"{col}{r}"].fill = CINZA
            wp[f"M{r}"].number_format = MOEDA
            ja[op] = r
            for g in gs:
                k = _prox(wc, "B")
                tp = tipo_shaddai(g["perc"], L["regra"])
                _w(wc, f"A{k}", comp); _w(wc, f"B{k}", op); _w(wc, f"C{k}", data, DATA); _w(wc, f"D{k}", seg)
                _w(wc, f"E{k}", g["empresa"]); _w(wc, f"F{k}", g["filial"]); _w(wc, f"G{k}", L["regra"])
                _w(wc, f"H{k}", g["origem"] or None); _w(wc, f"I{k}", g["cod"]); _w(wc, f"J{k}", g["obrigacao"])
                _w(wc, f"K{k}", int(g["parcela"]) if g["parcela"].isdigit() else g["parcela"])
                _w(wc, f"L{k}", g["dtpag"], DATA)
                _w(wc, f"M{k}", g["base"], MOEDA); _w(wc, f"N{k}", g["perc"], "0.00")
                _w(wc, f"O{k}", g["receber"], MOEDA); _w(wc, f"P{k}", tp)
                _w(wc, f"Y{k}", arq); _w(wc, f"Z{k}", hoje, DATA)
                o = [f"Hapvida {L['tipo']} / {L['regra']}", f"{g['vidas']} vida(s)",
                     f"vencimento fatura {g['venc']:%d/%m/%Y}" if g["venc"] else "",
                     f"pago pelo cliente {g['dtpag']:%d/%m/%Y}" if g["dtpag"] else ""]
                if g["desc"]:
                    o.append(f"desconto {g['desc']:.2f}".replace(".", ","))
                if g["adic"]:
                    o.append(f"adicional {g['adic']:.2f}".replace(".", ","))
                if g["cad_emp"] and g["cad_emp"].year > 1990:
                    o.append(f"empresa cadastrada {g['cad_emp']:%d/%m/%Y}")
                if g["vendedor"]:
                    o.append(f"vendedor {g['vendedor']}")
                if 10 < g["perc"] <= 50:
                    o.append(f"taxa {g['perc']:g}% em lote de {L['regra'].lower()}")
                _w(wc, f"AA{k}", "; ".join(x for x in o if x))
                _formulas(wc, k, round(g["desc"], 2), round(g["adic"], 2))
            rel.append((op, "gravado", f"{comp} {L['tipo']} {L['regra']} {data:%d/%m/%Y}, {len(gs)} lançamentos, "
                        f"{L['valor']:.2f}" + ("" if conf == "OK" else f" — ATENÇÃO analítico soma {soma:.2f}")))
    ult = _prox(wc, "B") - 1
    if wc.auto_filter.ref:
        wc.auto_filter.ref = f"A1:AD{max(ult, 1001)}"
    return rel, painel


def gravar_painel(painel, dir_painel):
    os.makedirs(dir_painel, exist_ok=True)
    agora = datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
    saida = []
    for comp, P in sorted(painel.items()):
        obs = ("Hapvida: a base ainda não tem faturas da Hapvida; cada linha foi conferida pelo próprio analítico "
               "(base × taxa − desconto + adicional = comissão) e cada lote contra o valor do card. "
               "Agenciamento = taxa acima de 50% (ou 50% em lote de agenciamento); vitalício = até 10%.")
        if P["obs"]:
            obs += " " + " ".join(P["obs"])
        doc = dict(comp=comp, operadora="Hapvida", atualizadoEm=agora, ordens=P["ordens"], itens=P["itens"],
                   extras=[], pendentes=[], faturasMes=0, obs=obs)
        p = os.path.join(dir_painel, f"com_{comp}_hapvida.json")
        json.dump(doc, open(p, "w", encoding="utf-8"), ensure_ascii=False)
        saida.append(p)
    return saida


if __name__ == "__main__":
    base, *pastas = sys.argv[1:]
    wb = openpyxl.load_workbook(base)
    raiz = os.path.dirname(os.path.abspath(base))
    rel_de = lambda p: os.path.relpath(os.path.abspath(p), raiz).replace("\\", "/")
    rel, painel = importar(wb, pastas, rel_de)
    for linha in rel:
        print(*linha, sep=" | ")
    wb.save(base)
    for p in gravar_painel(painel, os.path.join(os.path.dirname(os.path.abspath(__file__)), "_painel")):
        print("painel:", os.path.basename(p))
