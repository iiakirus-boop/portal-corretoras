"""Agente Comissão Amil — importa os extratos de comissão da Amil (TXT com delimitador #, SisAmil)
para a Base_Faturas_Vidas.xlsx, nas mesmas abas da Porto/Bradesco ("Pagamentos Comissão" e "Comissões").

Caminho no portal: Portal do Corretor Amil → Gestão comercial (abre o SisAmil) → MENU → Relatórios
Comissionamento → Extrato → período → "Arquivo Texto com Delimitador (#)" → clicar no Valor líquido de cada
linha (baixa EXTRATO_COMISSAO_214809_<nº>_....txt) → seta verde para voltar.

Uso:  python comissao_amil.py <Base_Faturas_Vidas.xlsx> <extrato1.txt> [extrato2.txt ...]

- Um extrato (nº do extrato) = uma ordem de pagamento, gravada como "AMIL-<nº>". Operadoras: AMIL, SHAM, NEXT.
- Uma linha em "Comissões" por linha do detalhe do extrato.
- Data de pagamento = Dt. Pagto Efetivo (ou Previsto, se ainda não pago). Competência = mês dessa data.
- Tipo segue a regra da Shaddai pela taxa: acima de 50% = Agenciamento; até 10% = Vitalício. A "Função Venda"
  da Amil (que chama de Agenciamento até taxa de 2%) fica nas Observações.
- Estornos de comissão vêm sem base/percentual: Tipo "Estorno".
- Conferência: comissão = base de cálculo × percentual; soma do detalhe = valor líquido do extrato.
  A base ainda não tem faturas Amil, então não há conferência com fatura.
- Extrato já gravado não é gravado de novo: o script compara o total e relata.
"""
import sys, os, re, datetime
import openpyxl
from shaddai_comum import classe_por_taxa, preparar, _prox, _w, MOEDA, DATA, CINZA, PAG, COM

OPERADORAS = {"AMIL": "AMIL", "SHAM": "AMIL / SHAM", "NEXT": "AMIL / NEXT"}


def _n(s):
    s = (s or "").strip()
    if not s:
        return None
    return float(s.replace(".", "").replace(",", ".")) if "," in s or "." not in s else float(s)


def _num_cab(t, rotulo):
    m = re.search(re.escape(rotulo) + r":#(-?[\d.]+)", t)
    return round(float(m.group(1)), 2) if m else 0.0


def _data(s):
    return datetime.datetime.strptime(s, "%d/%m/%Y") if s else None


def ler_txt(path):
    raw = open(path, "rb").read()
    t = raw.decode("cp1252").replace("\r", "")
    if "###Extrato" not in t or "Porte Contrato#" not in t:
        raise ValueError(f"{os.path.basename(path)} não é um extrato de comissão Amil (.txt com #)")
    g = lambda pat: (re.search(pat, t) or [None, None])[1]
    ext = dict(
        op=g(r"Operadora:#([^#]+)#"), extrato=g(r"N.mero Extrato:#(\d+)"), nf=g(r"Nota Fiscal:#(\d*)"),
        ini=_data(g(r"Apura..o:#(\d\d/\d\d/\d{4})")), fim=_data(g(r"at. (\d\d/\d\d/\d{4})#N.mero")),
        previsto=_data(g(r"Dt\. Pagto Previsto:#(\d\d/\d\d/\d{4})")), efetivo=_data(g(r"Dt\. Pagto Efetivo:#(\d\d/\d\d/\d{4})")),
        apurado=_num_cab(t, "Valor Apurado"), implantacao=_num_cab(t, "Valor Taxa Implantação"),
        estorno=_num_cab(t, "Valor Estorno"), ajustes=_num_cab(t, "Valor Ajustes"),
        nf_valor=_num_cab(t, "Valor para Emissão de NF"), irrf=_num_cab(t, "Valor IRRF"),
        iss=_num_cab(t, "Valor ISS"), liquido=_num_cab(t, "Valor Líquido a Receber"))
    linhas = []
    L = t.split("\n")
    i = next(k for k, l in enumerate(L) if l.startswith("Porte Contrato#"))
    for l in L[i + 1:]:
        if not l.strip():
            break
        c = l.split("#")
        contrato = c[1].strip()
        cod = contrato.split(" ", 1)[0]
        linhas.append(dict(
            porte=c[0], contrato=contrato, cod=cod, proposta=c[2].strip(), vigencia=_data(c[3].strip()),
            vendedor=c[4].strip(), parcela=c[5].strip(), perc=_n(c[6]), mes_ref=c[7].strip(), valor_fatura=_n(c[8]),
            benef=c[9].strip(), produto=c[11].strip(), vidas=c[12].strip(), funcao=c[13].strip(),
            rubrica=c[14].strip(), base=_n(c[15]), valor=_n(c[16]) or 0.0,
            cliente=(c[17].strip() or contrato.split(" ", 1)[-1]).replace("&AMP;", "&")))
    return ext, linhas


def tipo_shaddai(l):
    if l["rubrica"].startswith("Estorno") or l["perc"] is None:
        return "Estorno"
    return classe_por_taxa(l["perc"])  # regra da Shaddai, no shaddai_comum


def _formulas_amil(wc, k):
    wc[f"Q{k}"] = f"=IF(B{k}=\"\",\"\",IFERROR(INDEX(Empresas!$A:$A,MATCH(I{k},Empresas!$E:$E,0)),\"\"))"
    for col in "RSTUV":
        wc[f"{col}{k}"] = None
    wc[f"W{k}"] = f"=IF(OR(B{k}=\"\",M{k}=\"\"),\"\",ROUND(M{k}*N{k}/100,2))"
    wc[f"X{k}"] = (f"=IF(B{k}=\"\",\"\",IF(P{k}=\"Estorno\",\"Estorno\",IF(ABS(W{k}-O{k})<=0.02,"
                   f"\"OK (sem fatura na base)\",\"Divergência\")))")
    for col in "QRSTUVWX":
        wc[f"{col}{k}"].fill = CINZA
    wc[f"W{k}"].number_format = MOEDA


def importar(wb, arquivos, pasta_rel_de):
    preparar(wb)
    wp, wc = wb[PAG], wb[COM]
    ja = {}
    r = 2
    while wp[f"C{r}"].value not in (None, ""):
        ja[str(wp[f"C{r}"].value)] = r
        r += 1
    hoje = datetime.datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    rel = []
    lidos = []
    for p in arquivos:
        ext, ls = ler_txt(p)
        lidos.append((p, ext, ls))
    lidos.sort(key=lambda x: int(x[1]["extrato"]))
    for path, ext, ls in lidos:
        arq = pasta_rel_de(path)
        op = f"AMIL-{ext['extrato']}"
        soma = round(sum(l["valor"] for l in ls), 2)
        if op in ja:
            ant = wp[f"E{ja[op]}"].value or 0
            rel.append((op, "já gravado", "sem diferenças" if abs(ant - ext["nf_valor"]) <= 0.01
                        else f"valor no arquivo {ext['nf_valor']:.2f} ≠ gravado {ant:.2f}"))
            continue
        data = ext["efetivo"] or ext["previsto"]
        comp = data.strftime("%Y-%m")
        seg = OPERADORAS.get(ext["op"], f"AMIL / {ext['op']}")
        r = _prox(wp, "C")
        _w(wp, f"A{r}", comp); _w(wp, f"B{r}", seg); _w(wp, f"C{r}", op); _w(wp, f"D{r}", data, DATA)
        _w(wp, f"E{r}", ext["nf_valor"], MOEDA); _w(wp, f"F{r}", 0, MOEDA); _w(wp, f"G{r}", ext["irrf"], MOEDA)
        _w(wp, f"H{r}", ext["iss"], MOEDA); _w(wp, f"I{r}", ext["liquido"], MOEDA); _w(wp, f"J{r}", 0, MOEDA)
        _w(wp, f"K{r}", ext["liquido"], MOEDA)
        desc = []
        if ext["ajustes"]:
            desc.append(f"Ajustes {ext['ajustes']:.2f} (estornos, já no detalhe); valor apurado {ext['apurado']:.2f}".replace(".", ","))
        if ext["estorno"]:
            desc.append(f"Estorno {ext['estorno']:.2f}".replace(".", ","))
        if ext["implantacao"]:
            desc.append(f"Taxa implantação {ext['implantacao']:.2f}".replace(".", ","))
        if desc:
            _w(wp, f"O{r}", "; ".join(desc))
        _w(wp, f"P{r}", arq); _w(wp, f"Q{r}", hoje, DATA)
        obs = [f"Extrato Amil nº {ext['extrato']}, operadora {ext['op']}, NF {ext['nf'] or '-'}",
               f"período {ext['ini']:%d/%m/%Y} a {ext['fim']:%d/%m/%Y}",
               f"pagto previsto {ext['previsto']:%d/%m/%Y}" if ext["previsto"] else "",
               "pagto efetivo " + (f"{ext['efetivo']:%d/%m/%Y}" if ext["efetivo"] else "ainda não informado")]
        _w(wp, f"R{r}", "; ".join(o for o in obs if o))
        wp[f"L{r}"] = f"=IF(C{r}=\"\",\"\",COUNTIFS('{COM}'!$B:$B,C{r}))"
        wp[f"M{r}"] = f"=IF(C{r}=\"\",\"\",SUMIFS('{COM}'!$O:$O,'{COM}'!$B:$B,C{r}))"
        wp[f"N{r}"] = (f"=IF(C{r}=\"\",\"\",IF(AND(ABS(M{r}-E{r})<=0.01,"
                       f"ABS(I{r}+J{r}-K{r})<=0.01,ABS(E{r}-F{r}-G{r}-H{r}-I{r})<=0.01),\"OK\",\"Divergência\"))")
        for col in "LMN":
            wp[f"{col}{r}"].fill = CINZA
        wp[f"M{r}"].number_format = MOEDA
        ja[op] = r
        for l in ls:
            k = _prox(wc, "B")
            tipo = tipo_shaddai(l)
            _w(wc, f"A{k}", comp); _w(wc, f"B{k}", op); _w(wc, f"C{k}", data, DATA); _w(wc, f"D{k}", seg)
            _w(wc, f"E{k}", l["cliente"]); _w(wc, f"F{k}", None); _w(wc, f"G{k}", l["produto"])
            _w(wc, f"H{k}", l["proposta"] or None); _w(wc, f"I{k}", l["cod"]); _w(wc, f"J{k}", None)
            _w(wc, f"K{k}", int(l["parcela"]) if l["parcela"].isdigit() else l["parcela"])
            _w(wc, f"L{k}", ext["fim"], DATA)
            _w(wc, f"M{k}", l["base"], MOEDA)
            _w(wc, f"N{k}", l["perc"], "0.00"); _w(wc, f"O{k}", round(l["valor"], 2), MOEDA)
            _w(wc, f"P{k}", tipo); _w(wc, f"Y{k}", arq); _w(wc, f"Z{k}", hoje, DATA)
            o = [f"Amil: {l['funcao']} / {l['rubrica']}", f"mês ref. {l['mes_ref']}", f"contrato {l['contrato']}",
                 f"{l['porte']}"]
            if l["valor_fatura"]:
                o.append(f"valor fatura {l['valor_fatura']:.2f}".replace(".", ","))
            if l["vidas"] and l["vidas"] != "0":
                o.append(f"{l['vidas']} vida(s)")
            if l["vigencia"]:
                o.append(f"início vigência {l['vigencia']:%d/%m/%Y}")
            if l["vendedor"] and not l["vendedor"].startswith("Não Informado"):
                o.append(f"vendedor {l['vendedor'].split(' - ', 1)[-1]}")
            if l["rubrica"] == "Sem Repique":
                o.append("Sem Repique (sem repasse a vendedor)")
            if l["funcao"] == "Agenciamento" and tipo == "Vitalício":
                o.append("Amil chama de Agenciamento, mas pela taxa é vitalício")
            _w(wc, f"AA{k}", "; ".join(o))
            _formulas_amil(wc, k)
        rel.append((op, "gravado", f"{ext['op']} {data:%d/%m/%Y}, {len(ls)} lançamentos, líquido {ext['liquido']:.2f}"
                    + ("" if abs(soma - ext["liquido"]) <= 0.01 else f" — ATENÇÃO soma do detalhe {soma:.2f}")))
    ult = _prox(wc, "B") - 1
    if wc.auto_filter.ref:
        wc.auto_filter.ref = f"A1:AD{max(ult, 1001)}"
    return rel


if __name__ == "__main__":
    base, *arqs = sys.argv[1:]
    wb = openpyxl.load_workbook(base)
    raiz = os.path.dirname(os.path.abspath(base))
    rel_de = lambda p: os.path.relpath(os.path.abspath(p), raiz).replace("\\", "/")
    for linha in importar(wb, arqs, rel_de):
        print(*linha, sep=" | ")
    wb.save(base)
