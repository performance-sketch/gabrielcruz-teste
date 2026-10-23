"""Busca voos/bookings na Rezdy e gera assets/rezdy_dados.js para o hub.

Uso: REZDY_API_KEY=... python scripts/sync_rezdy.py
Somente biblioteca padrão. Não grava nome, e-mail ou telefone de clientes.
Valores financeiros só com INCLUIR_VALORES=1 (usado apenas no repositório privado gabrielcruz-teste).
"""
import json
import os
import sys
import time
import urllib.parse
import urllib.request
from collections import defaultdict
from datetime import datetime, timedelta, timezone

API = "https://api.rezdy.com/v1/"
TZ = timezone(timedelta(hours=-3))  # America/Sao_Paulo (sem horário de verão)
ATIVOS = {"CONFIRMED", "PENDING_SUPPLIER", "PENDING_CUSTOMER", "ON_HOLD", "PROCESSING"}
NAO_VOO = ("gift card", "no-show", "shuttle", "teste")
SAIDA = os.path.join(os.path.dirname(__file__), "..", "assets", "rezdy_dados.js")

VALORES = os.environ.get("INCLUIR_VALORES") == "1"
SENHA = os.environ.get("SENHA_FINANCEIRO") or ""
if VALORES and os.environ.get("CRIPTO_OBRIGATORIA") == "1" and not SENHA:
    sys.exit("SENHA_FINANCEIRO não definido: valores não serão gravados em texto aberto")
KEY = os.environ.get("REZDY_API_KEY") or os.environ.get("REZDY_KEY")
if not KEY:
    sys.exit("REZDY_API_KEY não definido")


def get(endpoint, params):
    q = urllib.parse.urlencode(dict(params, apiKey=KEY), doseq=True)
    for tentativa in range(4):
        try:
            with urllib.request.urlopen(API + endpoint + "?" + q, timeout=40) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code != 429 or tentativa == 3:
                raise
            time.sleep(5 * (tentativa + 1))


def meio(p):
    """Forma de pagamento de um registro de pagamento da Rezdy."""
    t, lab = p.get("type"), (p.get("label") or "").lower()
    if t == "REFUND":
        return "estorno"
    if t in ("FREE", "PROMO_CODE", "VOUCHER"):
        return "desconto"
    if t == "PAYPAL" or "paypal" in lab:
        return "paypal"
    if "stripe" in lab:
        return "stripe"
    if t == "CREDITCARD":
        return "rede"  # maquininha Rede / cartao no terminal
    if t == "BANKTRANSFER":
        return "pix"
    if t == "CASH":
        return "dinheiro"
    if p.get("recipient") == "RESELLER":
        return "ota"  # GetYourGuide etc.: a OTA recebe e repassa menos a comissao
    return "outros"


def eh_voo(nome):
    return not any(x in (nome or "").lower() for x in NAO_VOO)


agora = datetime.now(TZ)
hoje = agora.date()
seg = hoje - timedelta(days=hoje.weekday())
dom = seg + timedelta(days=6)
ate = max(dom, hoje + timedelta(days=7))  # proximos 7 dias
inicio = min((hoje - timedelta(days=90)).replace(day=1), seg)  # ~3 meses de historico para o filtro de periodo do financeiro

# produtos: duração por código
produtos = get("products", {"limit": 100}).get("products", [])
duracao = {p["productCode"]: p.get("durationMinutes") or 30 for p in produtos}
codigos_voo = [p["productCode"] for p in produtos if eh_voo(p.get("name"))]

# bookings do período (paginado)
bookings, off = [], 0
while True:
    pg = get("bookings", {
        "minTourStartTime": f"{inicio}T00:00:00-03:00",
        "maxTourStartTime": f"{ate}T23:59:59-03:00",
        "limit": 100, "offset": off,
    }).get("bookings") or []
    bookings += pg
    if len(pg) < 100:
        break
    off += 100

# agrupa por horário de saída (produtos no mesmo horário = mesmo voo)
# reservas canceladas ficam em "cancelados" (so o financeiro usa); as telas continuam so com as ativas
slots = defaultdict(lambda: {"produtos": set(), "min": 0, "bookings": [], "cancelados": [], "prod_c": set(), "min_c": 0})
for b in bookings:
    cancelada = b.get("status") == "CANCELLED"
    if b.get("status") not in ATIVOS and not cancelada:
        continue
    pags = b.get("payments") or []
    cortesia = bool(pags) and all(p.get("type") == "FREE" for p in pags)
    # pagamentos por forma; divididos entre os itens na proporcao do subtotal
    por_meio = defaultdict(float)
    for p in pags:
        m, x = meio(p), float(p.get("amount") or 0)
        por_meio[m] += abs(x) if m == "estorno" else x  # a Rezdy manda estorno negativo
    tot_itens = sum(float(i.get("subtotal") or i.get("amount") or 0) for i in b.get("items", [])) or 1.0
    for it in b.get("items", []):
        if not eh_voo(it.get("productName")):
            continue
        ini = it.get("startTimeLocal")
        if not ini:
            continue
        s = slots[ini[:16]]
        dur = duracao.get(it.get("productCode"), 30)
        if cancelada:
            s["prod_c"].add(it.get("productName"))
            s["min_c"] = max(s["min_c"], dur)
        else:
            s["produtos"].add(it.get("productName"))
            s["min"] = max(s["min"], dur)
        reg = {
            "order": b["orderNumber"],
            "pax": it.get("totalQuantity") or sum(q.get("value", 0) for q in it.get("quantities", [])),
            "status": b["status"],
            "canal": b.get("resellerName") or b.get("source") or "",
        }
        if VALORES:
            sub = float(it.get("subtotal") or it.get("amount") or 0)
            k = sub / tot_itens
            pg = {m: round(x * k, 2) for m, x in por_meio.items() if x}
            recebido = sum(x for m, x in pg.items() if m not in ("desconto", "estorno")) - pg.get("estorno", 0)
            reg["subtotal"] = sub
            reg["pg"] = pg
            reg["valor"] = round(recebido, 2)  # receita bruta = dinheiro recebido (sem descontos/cortesias, menos estornos)
            reg["comissao"] = round(float(b.get("commission") or 0) * k, 2) if pg.get("ota") else 0.0
            reg["a_receber"] = round(max(0.0, float(b.get("totalDue") or 0) * k), 2)
            reg["cortesia"] = cortesia
            if cancelada:
                # cancelada: fica so o que foi retido (pago menos estorno); OTA reembolsa por fora da Rezdy
                if pg.get("ota"):
                    reg["valor"] = round(reg["valor"] - pg["ota"], 2)
                    pg["ota_cancelada"] = pg.pop("ota")
                reg["comissao"] = 0.0
                reg["a_receber"] = 0.0
        s["cancelados" if cancelada else "bookings"].append(reg)


def monta(chave, s, com_cancelados=False):
    v = {
        "data": chave[:10], "hora": chave[11:16], "produtos": sorted(s["produtos"] or s["prod_c"]),
        "min": s["min"] or s["min_c"], "pax": sum(x["pax"] for x in s["bookings"]),
        "bookings": s["bookings"],
    }
    if com_cancelados:
        v["cancelados"] = s["cancelados"]
    if VALORES:
        v["receita"] = round(sum(x["valor"] for x in s["bookings"]), 2)
    return v


todos = [monta(k, slots[k]) for k in sorted(slots) if slots[k]["bookings"]]  # voos com reservas ativas
periodo = [monta(k, slots[k], True) for k in sorted(slots)]  # inclui horarios so com canceladas

# capacidade dos horários de hoje
cap = {}
if codigos_voo:
    ses = get("availability", {
        "productCode": codigos_voo, "startTimeLocal": f"{hoje} 00:00:00",
        "endTimeLocal": f"{hoje} 23:59:59", "limit": 500,
    }).get("sessions") or []
    for x in ses:
        h = x["startTimeLocal"][11:16]
        c = cap.setdefault(h, {"capacidade": 0, "livres": None})
        c["capacidade"] = max(c["capacidade"], x.get("seats") or 0)
        lv = x.get("seatsAvailable")
        if lv is not None:
            c["livres"] = lv if c["livres"] is None else min(c["livres"], lv)

voos_hoje = []
for v in todos:
    if v["data"] == str(hoje):
        v.update(cap.get(v["hora"], {"capacidade": None, "livres": None}))
        voos_hoje.append(v)

agora_s = agora.strftime("%Y-%m-%d %H:%M")
mes = [v for v in todos if v["data"][:7] == str(hoje)[:7] and f"{v['data']} {v['hora']}" <= agora_s]
semana = [v for v in todos if str(seg) <= v["data"] <= str(dom)]
proximos = [v for v in todos if str(hoje) < v["data"] <= str(ate)]

dados = {
    "gerado_em": agora.isoformat(timespec="minutes"),
    "hoje": str(hoje),
    "voos_hoje": voos_hoje,
    "semana": semana,
    "proximos": proximos,
    "periodo": periodo,  # historico com ativas e canceladas (filtro do financeiro)
    "mes": {
        "voos": len(mes),
        "horas": round(sum(v["min"] for v in mes) / 60, 1),
        "pax": sum(v["pax"] for v in mes),
    },
}
# com senha: valores saem do arquivo aberto e vao criptografados (AES-256-GCM, chave PBKDF2-SHA256)
cofre_js = ""
if VALORES and SENHA:
    import base64
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
    CAMPOS = ("valor", "subtotal", "pg", "comissao", "a_receber", "cortesia")
    cofre = {"v": {}, "b": {}}
    for v in todos + periodo:
        k = f"{v['data']} {v['hora']}"
        if "receita" in v:
            cofre["v"][k] = v.pop("receita")
        for b in v["bookings"] + v.get("cancelados", []):
            vals = {c: b.pop(c) for c in CAMPOS if c in b}
            if vals:
                cofre["b"][f"{k}|{b['order']}"] = vals
    sal, iv, it = os.urandom(16), os.urandom(12), 310000
    chave = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=sal, iterations=it).derive(SENHA.encode())
    ct = AESGCM(chave).encrypt(iv, json.dumps(cofre, separators=(",", ":")).encode(), None)
    b64 = lambda x: base64.b64encode(x).decode()
    cofre_js = "const REZDY_COFRE=" + json.dumps({"salt": b64(sal), "iv": b64(iv), "it": it, "ct": b64(ct)}) + ";\n"
texto = json.dumps(dados, ensure_ascii=False, separators=(",", ":"))
if VALORES and SENHA:
    assert '"receita"' not in texto and '"valor"' not in texto, "valor em texto aberto"
with open(SAIDA, "w", encoding="utf-8") as f:
    f.write("// GERADO POR scripts/sync_rezdy.py: não editar à mão\n")
    f.write("const REZDY=" + texto + ";\n" + cofre_js)
print(f"{len(voos_hoje)} voos hoje, {len(semana)} na semana, mês: {dados['mes']}")
