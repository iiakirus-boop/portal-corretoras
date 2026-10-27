"""Agente Comissão SulAmérica — importa os extratos de pagamento de comissão da SulAmérica (Portal do Corretor)
para a Base_Faturas_Vidas.xlsx, nas mesmas abas da Porto/Bradesco/Amil/Hapvida ("Pagamentos Comissão" e "Comissões"),
e gera o JSON do painel (_painel/com_AAAA-MM_sulamerica.json).

Caminho no portal: corretor.sulamericaseguros.com.br → card "Comissões e Demonstrativos" → Extrato pagamento →
selecionar a companhia (CIA SAÚDE - 9512) → selecionar o pagamento (data / valor) → "Gerar extrato" →
ler os cards do "Demonstrativo de pagamentos" (um card por apólice/documento). Repetir para cada pagamento.
O agente lê os cards pela página e salva em Comissoes/AAAA-MM/SulAmerica/extratos_<cia>.json
({"cia":..., "extratos":[{id, emissao, credito, debito, remun, liquido}], "rows":[{extrato, <campos do card>}]}).

Uso:  python comissao_sulamerica.py <Base_Faturas_Vidas.xlsx> <extratos_9512.json> [outro.json ...]

- Um pagamento (Nº do Extrato) = uma ordem de pagamento, gravada como "SAS-<nº extrato>". Data = Data de Emissão.
  Competência = mês dessa data.
- Uma linha em "Comissões" por card (apólice/documento). Prêmio = Valor Prêmio Total; comissão = Valor Remuneração.
- Tipo pela regra da Shaddai: acima de 50% = Agenciamento; até 10% = Vitalício.
- Conferência: comissão = prêmio × taxa (tolerância R$ 0,05); soma dos cards = valor líquido do extrato.
  A base ainda não tem faturas SulAmérica, então não há conferência com fatura.
- Extrato já gravado não é gravado de novo: o script compara o total e relata.
"""
import sys, os, json, datetime, collections
import openpyxl
from shaddai_comum import classe_por_taxa, preparar, _prox, _w, MOEDA, DATA, CINZA, PAG, COM

CIAS = {"9512": "SULAMÉRICA CIA DE SEGURO SAÚDE (9512)", "6220": "SULAMÉRICA SEGUROS (6220)", "3000": "SULAMÉRICA SAÚDE S.A. (3000)"}


def _n(s):
    s = str(s or "").replace("R$", "").replace("%", "").strip()
    if not s or s == "-":
        return 0.0
    return float(s.replace(".", "").replace(",", "."))


def _d(s):
    try:
        return datetime.datetime.strptime(str(s).strip(), "%d/%m/%Y")
    except ValueError:
        return None


def _i(s):
    s = str(s or "").strip()
    return int(s) if s.isdigit() else (s if s and s != "-" else None)


def tipo_shaddai(perc):
    return classe_por_taxa(perc)  # regra da Shaddai, no shaddai_comum


def ler(path):
    d = json.load(open(path, encoding="utf-8"))
    cia = str(d.get("cia") or "9512")
    por = collections.defaultdict(list)
    for r in d["rows"]:
        por[str(r["extrato"])].append(r)
    out = []
    for e in d["extratos"]:
        rows = por.get(str(e["id"]), [])
        itens = []
        for r in rows:
            premio, perc, com = _n(r.get("Valor Prêmio Total")), _n(r.get("Remuneração")), _n(r.get("Valor Remuneração"))
            itens.append(dict(nome=r.get("Nome", ""), apolice=r.get("Apólice/Titulo", ""), tipodoc=r.get("Tipo de documento", ""),
                              produto=r.get("Produto", ""), proposta=r.get("Proposta", ""), suc=r.get("Sucursal", ""),
                              contrato=(r.get("Contrato/Empresa") or "").strip(), premio=premio, perc=perc, com=com,
                              tiporem=r.get("Tipo remuneração", ""), grupo=r.get("Grupo faturamento", ""),
                              dtpag=_d(r.get("Data pagamento")), parc=_i(r.get("Parcela atual")), tparc=_i(r.get("Total de parcelas")),
                              parcrem=_i(r.get("Parcela remuneração")), doc=r.get("Documento", ""), situacao=r.get("Situação", ""),
                              vig=_d(r.get("Início de Vigência")), cia=r.get("CIA", cia)))
        out.append(dict(id=str(e["id"]), data=_d(e["emissao"]), liquido=_n(e.get("liquido")), credito=_n(e.get("credito")),
                        debito=_n(e.get("debito")), remun=_n(e.get("remun")), itens=itens, cia=cia))
    return out


def _formulas(wc, k):
    wc[f"Q{k}"] = f"=IF(B{k}=\"\",\"\",IFERROR(INDEX(Empresas!$A:$A,MATCH(I{k},Empresas!$E:$E,0)),\"\"))"
    for col in "RSTUV":
        wc[f"{col}{k}"] = None
    wc[f"W{k}"] = f"=IF(OR(B{k}=\"\",M{k}=\"\"),\"\",ROUND(M{k}*N{k}/100,2))"
    wc[f"X{k}"] = f"=IF(B{k}=\"\",\"\",IF(ABS(W{k}-O{k})<=0.05,\"OK (sem fatura na base)\",\"Divergência\"))"
    for col in "QRSTUVWX":
        wc[f"{col}{k}"].fill = CINZA
    wc[f"W{k}"].number_format = MOEDA


def importar(wb, arquivos, rel_de):
    preparar(wb)
    wp, wc = wb[PAG], wb[COM]
    ja = {}
    r = 2
    while wp[f"C{r}"].value not in (None, ""):
        ja[str(wp[f"C{r}"].value)] = r
        r += 1
    hoje = datetime.datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    rel, painel = [], {}
    for path in arquivos:
        arq = rel_de(path)
        for E in ler(path):
            op = f"SAS-{E['id']}"
            data = E["data"]
            comp = f"{data:%Y-%m}"
            seg = CIAS.get(E["cia"], f"SULAMÉRICA ({E['cia']})")
            soma = round(sum(i["com"] for i in E["itens"]), 2)
            conf = "OK" if abs(soma - E["remun"]) <= 0.05 and abs(E["remun"] - E["debito"] - E["liquido"]) <= 0.05 else "Divergência"
            P = painel.setdefault(comp, dict(ordens=[], itens=[], obs=[]))
            P["ordens"].append(dict(op=op, data=f"{data:%d/%m/%Y}", dataISO=f"{data:%Y-%m-%d}", empresa=f"SulAmérica · CIA {E['cia']}",
                                    bruto=E["remun"], debcred=-E["debito"], apagar=E["liquido"], conf=conf, lanc=len(E["itens"]),
                                    debitos="" if conf == "OK" else f"cards somam {soma:.2f}".replace(".", ",")))
            for i in E["itens"]:
                tp = tipo_shaddai(i["perc"])
                P["itens"].append(dict(eid="", empresa=i["nome"], op=op, titulo=i["apolice"], compFat=f"{i['dtpag']:%Y-%m}" if i["dtpag"] else None,
                                       venc=None, valorFat=i["premio"], premio=i["premio"], premioEsp=None, taxa=i["perc"], comissao=i["com"],
                                       parcela=i["parc"], tipo="AN" if tp == "Agenciamento" else "CO", copart=0, taxaFixa=0,
                                       conf="OK" if abs(round(i["premio"] * i["perc"] / 100, 2) - i["com"]) <= 0.05 else "Divergência"))
            if conf != "OK":
                P["obs"].append(f"Extrato {E['id']} ({data:%d/%m/%Y}): extrato R$ {E['remun']:.2f} e os cards somam R$ {soma:.2f}.".replace(".", ","))
            if op in ja:
                ant = wp[f"E{ja[op]}"].value or 0
                rel.append((op, "já gravado", "sem diferenças" if abs(ant - E["remun"]) <= 0.01 else f"extrato {E['remun']:.2f} ≠ gravado {ant:.2f}"))
                continue
            r = _prox(wp, "C")
            _w(wp, f"A{r}", comp); _w(wp, f"B{r}", seg); _w(wp, f"C{r}", op); _w(wp, f"D{r}", data, DATA)
            _w(wp, f"E{r}", E["remun"], MOEDA); _w(wp, f"F{r}", 0, MOEDA); _w(wp, f"G{r}", 0, MOEDA); _w(wp, f"H{r}", 0, MOEDA)
            _w(wp, f"I{r}", E["remun"], MOEDA); _w(wp, f"J{r}", -E["debito"], MOEDA); _w(wp, f"K{r}", E["liquido"], MOEDA)
            _w(wp, f"P{r}", arq); _w(wp, f"Q{r}", hoje, DATA)
            _w(wp, f"R{r}", f"Extrato SulAmérica nº {E['id']} (CIA {E['cia']}), emissão {data:%d/%m/%Y}; total de crédito {E['credito']:.2f}, "
                            f"débito {E['debito']:.2f}; impostos zerados no extrato")
            wp[f"L{r}"] = f"=IF(C{r}=\"\",\"\",COUNTIFS('{COM}'!$B:$B,C{r}))"
            wp[f"M{r}"] = f"=IF(C{r}=\"\",\"\",SUMIFS('{COM}'!$O:$O,'{COM}'!$B:$B,C{r}))"
            wp[f"N{r}"] = (f"=IF(C{r}=\"\",\"\",IF(AND(ABS(M{r}-E{r})<=0.05,"
                           f"ABS(I{r}+J{r}-K{r})<=0.01,ABS(E{r}-F{r}-G{r}-H{r}-I{r})<=0.01),\"OK\",\"Divergência\"))")
            for col in "LMN":
                wp[f"{col}{r}"].fill = CINZA
            wp[f"M{r}"].number_format = MOEDA
            ja[op] = r
            for i in E["itens"]:
                k = _prox(wc, "B")
                tp = tipo_shaddai(i["perc"])
                _w(wc, f"A{k}", comp); _w(wc, f"B{k}", op); _w(wc, f"C{k}", data, DATA); _w(wc, f"D{k}", seg)
                _w(wc, f"E{k}", i["nome"]); _w(wc, f"F{k}", i["suc"]); _w(wc, f"G{k}", i["produto"])
                _w(wc, f"H{k}", i["apolice"]); _w(wc, f"I{k}", i["contrato"]); _w(wc, f"J{k}", i["doc"])
                _w(wc, f"K{k}", i["parc"]); _w(wc, f"L{k}", i["dtpag"], DATA)
                _w(wc, f"M{k}", i["premio"], MOEDA); _w(wc, f"N{k}", i["perc"], "0.00"); _w(wc, f"O{k}", i["com"], MOEDA)
                _w(wc, f"P{k}", tp); _w(wc, f"Y{k}", arq); _w(wc, f"Z{k}", hoje, DATA)
                o = [f"{i['tipodoc']}", f"proposta {i['proposta']}", f"parcela {i['parc']}/{i['tparc']}",
                     f"tipo remuneração {i['tiporem']}", f"grupo faturamento {i['grupo']}" if i["grupo"] not in ("", "-") else "",
                     f"início vigência {i['vig']:%d/%m/%Y}" if i["vig"] else "", f"situação {i['situacao']}"]
                _w(wc, f"AA{k}", "; ".join(x for x in o if x))
                _formulas(wc, k)
            rel.append((op, "gravado", f"{comp} {data:%d/%m/%Y}, {len(E['itens'])} lançamentos, {E['remun']:.2f}"
                        + ("" if conf == "OK" else f" — ATENÇÃO cards somam {soma:.2f}")))
    ult = _prox(wc, "B") - 1
    if wc.auto_filter.ref:
        wc.auto_filter.ref = f"A1:AD{max(ult, 1001)}"
    return rel, painel


def gravar_painel(painel, dir_painel):
    os.makedirs(dir_painel, exist_ok=True)
    agora = datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
    saida = []
    for comp, P in sorted(painel.items()):
        obs = ("SulAmérica: a base ainda não tem faturas da SulAmérica; cada linha foi conferida pelo próprio extrato "
               "(prêmio × taxa = remuneração) e cada pagamento contra o valor do extrato. "
               "Agenciamento = taxa acima de 50%; vitalício = até 10%.")
        if P["obs"]:
            obs += " " + " ".join(P["obs"])
        doc = dict(comp=comp, operadora="SulAmérica", atualizadoEm=agora, ordens=P["ordens"], itens=P["itens"],
                   extras=[], pendentes=[], faturasMes=0, obs=obs)
        p = os.path.join(dir_painel, f"com_{comp}_sulamerica.json")
        json.dump(doc, open(p, "w", encoding="utf-8"), ensure_ascii=False)
        saida.append(p)
    return saida


if __name__ == "__main__":
    base, *arqs = sys.argv[1:]
    wb = openpyxl.load_workbook(base)
    raiz = os.path.dirname(os.path.abspath(base))
    rel_de = lambda p: os.path.relpath(os.path.abspath(p), raiz).replace("\\", "/")
    rel, painel = importar(wb, arqs, rel_de)
    for linha in rel:
        print(*linha, sep=" | ")
    wb.save(base)
    for p in gravar_painel(painel, os.path.join(os.path.dirname(os.path.abspath(__file__)), "_painel")):
        print("painel:", os.path.basename(p))
