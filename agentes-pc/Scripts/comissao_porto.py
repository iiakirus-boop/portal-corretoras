"""Agente Comissão Porto — importa o analítico de comissões da Porto para a Base_Faturas_Vidas.xlsx.

Uso:  python comissao_porto.py <Base_Faturas_Vidas.xlsx> <competência AAAA-MM> <arquivo1.html> [arquivo2.html ...]

- Cria (se não existirem) as abas "Pagamentos Comissão" e "Comissões" e as colunas AC–AD da aba Faturas.
- Uma linha por ordem de pagamento em "Pagamentos Comissão"; uma linha por lançamento em "Comissões".
- Ordem de pagamento já gravada não é gravada de novo: o script compara e relata.
- Só grava valores lidos do arquivo (texto azul). Conferências são fórmulas (fundo cinza).
"""
import re, html, sys, os, datetime
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment
from openpyxl.comments import Comment
from shaddai_comum import AZUL, PRETO, CINZA, CAB_FILL, CAB_FONT, MOEDA, DATA, N, PAG, COM, _cab, preparar, _prox, _w  # módulo comum


# ---------------------------------------------------------------- leitura do arquivo da Porto
def _num(s):
    s = (s or "").strip().replace(".", "").replace(",", ".")
    return float(s) if s else None


def _cells(tr):
    return [re.sub(r"\s+", " ", html.unescape(re.sub("<[^>]+>", "", c))).strip()
            for c in re.findall(r"<td[^>]*>(.*?)</td>", tr, re.S)]


def ler_analitico(path):
    """Lê o 'gerarplanilhaanalitico.do' (HTML com uma tabela) e devolve cabeçalho, lançamentos, débitos e totais."""
    t = open(path, encoding="latin-1").read()
    if "Pagamentos de Comiss" not in t:
        raise ValueError(f"{os.path.basename(path)} não é um analítico de comissões da Porto")
    trs = re.findall(r"<tr>(.*?)</tr>", t, re.S)
    cab, lanc, deb, tot = {}, [], [], None
    for i, tr in enumerate(trs):
        c = _cells(tr)
        if not c:
            continue
        if c[0].startswith("Ordem de Pagamento"):
            cab["op"], cab["data_pg"] = c[1], c[3]
        elif c[0].startswith("Empresa"):
            cab["empresa"] = c[1]
        elif c[0].startswith("Susep Favorecida"):
            cab["susep"] = c[1].split(" ")[0]
        elif c[0] == "Histórico" and len(c) > 1 and c[1] == "Marca":
            cab["marca"] = True  # Seguros Gerais (auto/RE) tem a coluna Marca a mais
        elif cab.get("marca") and len(c) == 13 and re.match(r"\d{4}-\d\d-\d\d$", c[8]):
            c = c[:1] + c[2:]
            lanc.append(dict(hist=c[0], suc=c[1], ramo=c[2], apl=c[3], fat=c[4], parc=c[5], data=c[7],
                             premio=_num(c[8]), taxa=_num(c[9]), comissao=_num(c[10]), tipo=c[11]))
        elif len(c) == 12 and re.match(r"\d{4}-\d\d-\d\d$", c[7]):
            lanc.append(dict(hist=c[0], suc=c[1], ramo=c[2], apl=c[3], fat=c[4], parc=c[5], data=c[7],
                             premio=_num(c[8]), taxa=_num(c[9]), comissao=_num(c[10]), tipo=c[11]))
        elif len(c) == 5 and re.match(r"(DEV )?(DEBITO|CREDITO)", c[0]):
            deb.append(dict(desc=c[0], valor=_num(c[3]), tipo=c[4]))
        elif c[0].startswith("Comiss") and "Bruta" in c[0]:
            v = [_num(x) for x in _cells(trs[i + 1])]
            tot = dict(zip(["bruta", "inss", "irrf", "iss", "liquido", "debcred", "apagar"], v))
    if not cab.get("op") or tot is None:
        raise ValueError(f"{os.path.basename(path)}: cabeçalho ou totais não encontrados")
    return cab, lanc, deb, tot


def codigo_estipulante(l):
    """Apl/Prop da saúde = código estipulante + 1 dígito (589370875 -> 58937087). Bônus: '50817038 - NOME / título'."""
    m = re.match(r"(\d{8}) - ", l["hist"])
    if m:
        return m.group(1)
    if re.fullmatch(r"\d{9}", l["apl"]) and l["ramo"] in ("87", "887"):
        return l["apl"][:-1]
    return ""


def _d(s, fmt):
    return datetime.datetime.strptime(s, fmt)


# ---------------------------------------------------------------- estrutura das abas


def _formulas_linha(ws, r):
    """Fórmulas da conferência Porto numa linha (a aba é compartilhada com outras operadoras, cada uma com as suas)."""
    ws[f"Q{r}"] = (f"=IF(B{r}=\"\",\"\",IFERROR(INDEX(Faturas!$B:$B,MATCH(J{r},Faturas!$E:$E,0)),"
                   f"IFERROR(INDEX(Empresas!$A:$A,MATCH(I{r},Empresas!$E:$E,0)),\"\")))")
    ws[f"R{r}"] = f"=IF(B{r}=\"\",\"\",IFERROR(INDEX(Faturas!$A:$A,MATCH(J{r},Faturas!$E:$E,0)),\"\"))"
    ws[f"S{r}"] = f"=IF(B{r}=\"\",\"\",IFERROR(INDEX(Faturas!$J:$J,MATCH(J{r},Faturas!$E:$E,0)),\"\"))"
    ws[f"T{r}"] = (f"=IF(OR(B{r}=\"\",S{r}=\"\"),\"\",SUMIFS(Vidas!$Z:$Z,Vidas!$D:$D,J{r})"
                   f"+SUMIFS(Vidas!$Y:$Y,Vidas!$D:$D,J{r}))")
    ws[f"U{r}"] = (f"=IF(OR(B{r}=\"\",S{r}=\"\"),\"\",ROUND((S{r}-T{r}-N(AB{r}))/"
                   f"IF(ISNUMBER(SEARCH(\"SEGURO SAUDE\",D{r})),1.0238,1),2))")
    ws[f"V{r}"] = f"=IF(OR(B{r}=\"\",U{r}=\"\"),\"\",M{r}-U{r})"
    ws[f"W{r}"] = f"=IF(B{r}=\"\",\"\",ROUND(M{r}*N{r}/100,2))"
    ws[f"X{r}"] = (f"=IF(B{r}=\"\",\"\",IF(LEFT(P{r},3)=\"226\",\"Bônus\",IF(S{r}=\"\",\"Sem fatura na base\","
                   f"IF(AND(ABS(V{r})<=MAX(1,0.0005*U{r}),ABS(W{r}-O{r})<=0.01),\"OK\",\"Divergência\"))))")
    ws[f"AC{r}"] = f"=IF(OR(B{r}=\"\",S{r}=\"\"),\"\",ROUND(S{r}*N{r}/100,2))"
    ws[f"AD{r}"] = f"=IF(OR(B{r}=\"\",AC{r}=\"\"),\"\",O{r}-AC{r})"
    for col in ("Q","R","S","T","U","V","W","X","AC","AD"):
        ws[f"{col}{r}"].fill = CINZA
    for col in ("M","O","S","T","U","V","W","AB","AC","AD"):
        ws[f"{col}{r}"].number_format = MOEDA


def _formulas_pag(ws, r):
    ws[f"L{r}"] = f"=IF(C{r}=\"\",\"\",COUNTIFS('{COM}'!$B:$B,C{r}))"
    ws[f"M{r}"] = f"=IF(C{r}=\"\",\"\",SUMIFS('{COM}'!$O:$O,'{COM}'!$B:$B,C{r}))"
    ws[f"N{r}"] = (f"=IF(C{r}=\"\",\"\",IF(AND(ABS(M{r}-E{r})<=0.01,"
                   f"ABS(I{r}+J{r}-K{r})<=0.01,ABS(E{r}-F{r}-G{r}-H{r}-I{r})<=0.01),\"OK\",\"Divergência\"))")
    for col in "LMN":
        ws[f"{col}{r}"].fill = CINZA


TAXA_POR_VIDA = 5.00  # taxa não comissionada da 1ª fatura: R$ 5,00 por vida (Carlos 3 vidas = R$ 15,00, confirmado pela equipe)


VIDAS = {}


def _faturas(wb):
    """título -> valor da fatura − copart − despesas (lido das colunas de entrada, sem depender de fórmula)."""
    val = {}
    for r in wb["Faturas"].iter_rows(min_row=2, values_only=True):
        if r[0] and r[4] and isinstance(r[9], (int, float)):
            val[str(r[4])] = r[9]
            VIDAS[str(r[4])] = r[10] if isinstance(r[10], (int, float)) else 0
    for r in wb["Vidas"].iter_rows(min_row=2, values_only=True):
        if r[0] and str(r[3]) in val:
            val[str(r[3])] -= sum(x for x in r[20:25] if isinstance(x, (int, float)))
    return val


def importar(wb, comp, arquivos, pasta_rel):
    preparar(wb)
    wp, wc = wb[PAG], wb[COM]
    base_fat = _faturas(wb)
    ja = {str(wp[f"C{r}"].value): r for r in range(2, N + 2) if wp[f"C{r}"].value}
    hoje = datetime.datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    rel = []
    for path in arquivos:
        cab, lanc, deb, tot = ler_analitico(path)
        soma = round(sum(l["comissao"] for l in lanc), 2)
        sdeb = round(sum(d["valor"] for d in deb), 2)
        arq = f"{pasta_rel}/{os.path.basename(path)}"
        if cab["op"] in ja:
            r = ja[cab["op"]]
            dif = [k for k, col in (("bruta", "E"), ("debcred", "J"), ("apagar", "K"))
                   if abs((wp[f"{col}{r}"].value or 0) - tot[k]) > 0.01]
            rel.append((cab["op"], "já gravada", "diferenças: " + ", ".join(dif) if dif else "sem diferenças"))
            continue
        r = _prox(wp, "C")
        _formulas_pag(wp, r)
        _w(wp, f"A{r}", comp); _w(wp, f"B{r}", cab["empresa"]); _w(wp, f"C{r}", cab["op"])
        _w(wp, f"D{r}", _d(cab["data_pg"], "%d/%m/%Y"), DATA)
        for k, col in (("bruta", "E"), ("inss", "F"), ("irrf", "G"), ("iss", "H"), ("liquido", "I"),
                       ("debcred", "J"), ("apagar", "K")):
            _w(wp, f"{col}{r}", tot[k], MOEDA)
        _w(wp, f"O{r}", "; ".join(f"{d['desc']} ({d['valor']:.2f})".replace(".", ",") for d in deb) or None)
        _w(wp, f"P{r}", arq); _w(wp, f"Q{r}", hoje, DATA)
        obs = []
        if abs(soma - tot["bruta"]) > 0.01: obs.append(f"Soma dos lançamentos {soma} ≠ bruta {tot['bruta']}")
        if abs(sdeb - tot["debcred"]) > 0.01: obs.append(f"Soma débitos {sdeb} ≠ total {tot['debcred']}")
        _w(wp, f"R{r}", "; ".join(obs) or None)
        for l in lanc:
            k = _prox(wc, "B")
            _formulas_linha(wc, k)
            _w(wc, f"A{k}", comp); _w(wc, f"B{k}", cab["op"]); _w(wc, f"C{k}", _d(cab["data_pg"], "%d/%m/%Y"), DATA)
            _w(wc, f"D{k}", cab["empresa"]); _w(wc, f"E{k}", l["hist"]); _w(wc, f"F{k}", l["suc"])
            _w(wc, f"G{k}", l["ramo"]); _w(wc, f"H{k}", l["apl"]); _w(wc, f"I{k}", codigo_estipulante(l) or None)
            _w(wc, f"J{k}", l["fat"] or None); _w(wc, f"K{k}", int(l["parc"]) if l["parc"].isdigit() else l["parc"])
            _w(wc, f"L{k}", _d(l["data"], "%Y-%m-%d"), DATA)
            _w(wc, f"M{k}", l["premio"], MOEDA); _w(wc, f"N{k}", l["taxa"], "0.00"); _w(wc, f"O{k}", l["comissao"], MOEDA)
            _w(wc, f"P{k}", l["tipo"]); _w(wc, f"Y{k}", arq); _w(wc, f"Z{k}", hoje, DATA)
            o = []
            m = re.search(r"/ (\d{8})$", l["hist"])
            if l["tipo"].startswith("226"): o.append(f"Bônus Muito + Porto Saúde" + (f" ref. fatura {m.group(1)}" if m else ""))
            if "GERAIS" in cab["empresa"]: o.append("Porto Seguros Gerais (auto/residencial), fora da base de saúde")
            if l["ramo"] == "96": o.append("Porto Odonto (faturas odonto ainda não estão na base)")
            if l["taxa"] == 100: o.append("Parcela com 100% (agenciamento)")
            if l["fat"] in base_fat and l["premio"] is not None:
                fator = 1.0238 if "SEGURO SAUDE" in cab["empresa"] else 1
                falta = round(base_fat[l["fat"]] - l["premio"] * fator, 2)
                taxa_ad = round(TAXA_POR_VIDA * VIDAS.get(l["fat"], 0), 2)
                if taxa_ad and abs(falta - taxa_ad) <= max(0.5, 0.0002 * base_fat[l["fat"]]):
                    _w(wc, f"AB{k}", taxa_ad, MOEDA)
                    o.append(f"Taxa de R$ 5,00 por vida na 1ª fatura ({int(VIDAS[l['fat']])} vidas = R$ {taxa_ad:.2f})".replace(".", ","))
            _w(wc, f"AA{k}", "; ".join(o) or None)
        rel.append((cab["op"], "gravada", f"{len(lanc)} lançamentos, bruta {tot['bruta']:.2f}, a pagar {tot['apagar']:.2f}"
                    + (" | " + "; ".join(obs) if obs else "")))
    return rel


if __name__ == "__main__":
    base, comp, *arqs = sys.argv[1:]
    wb = openpyxl.load_workbook(base)
    pasta = os.path.relpath(os.path.dirname(os.path.abspath(arqs[0])), os.path.dirname(os.path.abspath(base))).replace("\\", "/")
    for linha in importar(wb, comp, arqs, pasta):
        print(*linha, sep=" | ")
    wb.save(base)
