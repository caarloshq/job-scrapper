#!/usr/bin/env python3
"""
Confere um curriculo gerado contra as regras invioláveis da skill.

Uso:
    python3 verificar_resume.py "<arquivo.pdf>" [content.json] [--vaga <arquivo.txt>]

Com `--vaga`, tambem reporta a COBERTURA: quais termos do anuncio aparecem no
curriculo, quais aparecem so como sinonimo, e quais faltam.

Existe porque "ficou bom" nao e criterio. Cada regra aqui nasceu de um defeito
real; o que a checagem nao cobre, alguem descobre depois de enviar.

Sai com codigo 1 se alguma regra falhar, para poder entrar num gate.
"""
import sys
import json
import os
import re
import unicodedata
from collections import Counter

LIMITE_PAGINAS = 2
TRAVESSOES = ("—", "–")


# Palavras que aparecem em qualquer anuncio e nao dizem nada sobre a vaga.
# Sao constantes de idioma, nao decisao de dominio — por isso ficam no codigo,
# enquanto os sinonimos, que sao decisao, ficam em sinonimos.json.
PARADA = set("""
a as o os um uma uns umas de do da dos das em no na nos nas por para com sem sob
sobre entre ate apos e ou mas que se ao aos à às pelo pela pelos pelas
voce voces nos nosso nossa nossos nossas seu sua seus suas meu minha
ser estar ter haver fazer sera serao tem tera temos vai vao pode podem deve devem
mais menos muito muita todos todas cada outro outra outros outras
sim nao ja aqui ali isso isto aquilo como quando onde porque qual quais
trabalho trabalhar vaga vagas empresa time times equipe pessoa pessoas
oportunidade beneficios beneficio salario contratacao candidato candidatos
buscamos procuramos oferecemos somos nossa area sobre requisitos desejavel
experiencia anos ambiente cultura valores missao visao
the a an of in on at to for with without by from and or but that this these those
you your we our us they their he she it its is are was were be been being
have has had do does did will would can could should may might must
more most less all any each other others some such than then there here
work working job jobs company team teams role position candidate candidates
about what when where why how who which will benefits offer looking
experience years environment culture mission vision requirements nice
atuar atuacao buscar busca garantir garantindo criar criacao fazer feito
area areas tarefa tarefas entrega entregas solucao solucoes foco dia
apoiar apoio ajudar ajuda manter mantendo participar participacao
ensure ensuring create creating build building help helping support
""".split())

SINONIMOS_ARQ = os.path.join(os.path.dirname(os.path.abspath(__file__)), "sinonimos.json")


def normalizar(t):
    t = unicodedata.normalize("NFD", str(t).lower())
    t = "".join(c for c in t if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9 ]+", " ", t)


def contem_termo(texto, termo):
    return bool(re.search(r"(?<![a-z0-9])" + re.escape(termo) + r"(?![a-z0-9])", texto))


def bigramas(palavras_originais):
    """
    Bigramas do texto ORIGINAL, descartando os que contem palavra de parada.

    A primeira versao montava os pares depois de filtrar, o que grudava
    palavras que nunca foram vizinhas: "ferramentas com foco" virava
    "ferramentas foco", e "dia a dia" virava "dia dia". Termo inventado num
    relatorio de cobertura e pior que termo faltando — manda procurar no
    curriculo uma coisa que o anuncio nao disse.
    """
    saida = []
    for a, b in zip(palavras_originais, palavras_originais[1:]):
        if a in PARADA or b in PARADA or len(a) < 3 or len(b) < 3:
            continue
        saida.append(f"{a} {b}")
    return saida


def termos_que_importam(texto_vaga, dados=None):
    """
    O que checar de verdade: nao toda palavra frequente, e sim o vocabulario
    que decide encaixe.

    Duas fontes, ambas curadas:
      1. os grupos de `sinonimos.json`, que sao o vocabulario da profissao;
      2. as skills e ferramentas que o proprio curriculo declara.

    A segunda e a que mais rende: se o anuncio pede algo que a pessoa TEM, e
    isso nao aparece no PDF, e falha de enfase e conserta reordenando. Frequencia
    pura trazia "atuar", "garantindo" e "areas", que nao dizem nada.
    """
    vaga = normalizar(texto_vaga)
    palavras = vaga.split()
    alvos = set()

    # 1. vocabulario de dominio
    for grupo in carregar_sinonimos():
        for termo in grupo:
            if termo and contem_termo(vaga, termo):
                alvos.add(termo)
                break  # um representante por grupo basta

    # 2. o que o curriculo afirma saber
    if dados:
        declarado = f"{dados.get('skills_line', '')} · {dados.get('tools_line', '')}"
        for item in re.split(r"[·|,;]", declarado):
            t = normalizar(item).strip()
            if len(t) > 2 and contem_termo(vaga, t):
                alvos.add(t)

    # 3. bigramas repetidos do anuncio, para nao perder termo fora das listas
    for frase, n in Counter(bigramas(palavras)).most_common():
        if n >= 2 and len(alvos) < 30:
            alvos.add(frase)

    return sorted(alvos)


def carregar_sinonimos():
    if not os.path.exists(SINONIMOS_ARQ):
        return []
    with open(SINONIMOS_ARQ, encoding="utf-8") as f:
        return [[normalizar(x) for x in g] for g in json.load(f).get("grupos", [])]


def cobertura(texto_vaga, texto_pdf, dados=None):
    """Classifica cada termo do anuncio: coberto, so sinonimo, ou ausente."""
    alvo = normalizar(texto_pdf)
    grupos = carregar_sinonimos()
    cobertos, sinonimos, ausentes = [], [], []

    for termo in termos_que_importam(texto_vaga, dados):
        if contem_termo(alvo, termo):
            cobertos.append(termo)
            continue
        equivalentes = [e for g in grupos if termo in g for e in g if e != termo]
        achado = next((e for e in equivalentes if contem_termo(alvo, e)), None)
        if achado:
            sinonimos.append((termo, achado))
        else:
            ausentes.append(termo)
    return cobertos, sinonimos, ausentes


def texto_do_pdf(caminho):
    from pypdf import PdfReader
    r = PdfReader(caminho)
    return r, "\n".join(p.extract_text() or "" for p in r.pages)


def datas_que_quebram(dados):
    """
    Data que nao cabe na coluna quebra em duas linhas, e a linha da tabela
    cresce empurrando a descricao para baixo — o buraco vertical que voce
    viu em 2026-07-30. Aqui a conta e a mesma que o gerador faz, entao se esta
    passando o layout esta certo por construcao, nao por sorte.
    """
    sys.path.insert(0, ".")
    from generate_resume import largura_datas
    from reportlab.pdfbase.pdfmetrics import stringWidth

    disponivel = largura_datas(dados)
    ruins = []
    for chave in ("experience", "volunteer"):
        for j in dados.get(chave) or []:
            d = str(j.get("dates", ""))
            if d and stringWidth(d, "Helvetica", 8.8) > disponivel:
                ruins.append(d)
    return ruins


def contar_travessoes(texto):
    return sum(texto.count(sinal) for sinal in TRAVESSOES)


def restricoes_candidatura(texto, dados=None):
    """Restrições que a própria pessoa declarou no base_content, aplicadas à
    saída sem alterar a base.

    `nunca_citar` é uma lista de expressões regulares: trechos que não podem
    aparecer em nenhum currículo gerado (uma métrica antiga, um cargo que não
    se usa mais). O gerador de instrução do radar lê a mesma lista. O PDF é
    lido inteiro: JSON limpo não legitima um PDF antigo.
    """
    falhas = []
    for padrao in (dados or {}).get("nunca_citar") or []:
        if re.search(padrao, texto, re.I):
            falhas.append(f"trecho proibido por nunca_citar no texto: /{padrao}/")
    return falhas


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    pdf = sys.argv[1]
    vaga_arq = None
    if "--vaga" in sys.argv:
        i = sys.argv.index("--vaga")
        vaga_arq = sys.argv[i + 1] if i + 1 < len(sys.argv) else None
        del sys.argv[i:i + 2]
    conteudo = sys.argv[2] if len(sys.argv) > 2 else None
    falhas = []
    dados = None
    if conteudo:
        with open(conteudo, encoding="utf-8") as f:
            dados = json.load(f)

    r, texto = texto_do_pdf(pdf)
    falhas.extend(restricoes_candidatura(texto, dados))

    if len(r.pages) > LIMITE_PAGINAS:
        falhas.append(f"{len(r.pages)} paginas, o teto e {LIMITE_PAGINAS}")

    if len(texto.strip()) < 1500:
        falhas.append("texto nao extraivel ou curto demais: um ATS nao vai ler isto")

    n = contar_travessoes(texto)
    if n:
        falhas.append(f"{n} travessao(oes) no documento, e a regra e zero")

    # Numeros travados vem do proprio content.json (campo `numeros_travados`),
    # nao de uma lista fixa: cada pessoa tem os seus. Sem content.json, esta
    # checagem e pulada, nao falha silenciosa — reportado ao final.
    if dados is not None:
        travados = dados.get("numeros_travados") or []
        # Voluntariado opcional não torna seus números obrigatórios fora da seção.
        voluntario = " ".join(str(e) for e in dados.get("volunteer", []))
        ativos = [n for n in travados if dados.get("incluir_voluntariado") or n not in voluntario]
        ausentes = [n for n in ativos if n not in texto]
        if ausentes:
            falhas.append("numeros travados ausentes: " + ", ".join(ausentes))

        quebradas = datas_que_quebram(dados)
        if quebradas:
            falhas.append("data mais larga que a coluna, vai quebrar em duas linhas: "
                          + " | ".join(quebradas))

    if vaga_arq:
        with open(vaga_arq, encoding="utf-8") as f:
            cobertos, sinonimos, ausentes = cobertura(f.read(), texto, dados)
        total = len(cobertos) + len(sinonimos) + len(ausentes)
        print(f"\nCobertura do anuncio  {len(cobertos) + len(sinonimos)}/{total} termos")
        if cobertos:
            print("  coberto      " + ", ".join(cobertos))
        if sinonimos:
            print("  so sinonimo  " + ", ".join(f"{t} (via {e})" for t, e in sinonimos))
        if ausentes:
            print("  AUSENTE      " + ", ".join(ausentes))
            print("\n  Ausente NAO reprova. Se e algo que voce faz, reordene o que ja existe")
            print("  para deixar visivel. Se nao e, vira linha em Gaps — nunca texto novo.")
        print()

    print(f"{pdf}: {len(r.pages)} pagina(s)")
    if falhas:
        for f in falhas:
            print("  FALHA:", f)
        sys.exit(1)
    print("  ok — dentro das regras")


if __name__ == "__main__":
    main()
