#!/usr/bin/env python3
"""
Gerador de currículo ATS-safe a partir de um JSON de conteúdo.

Uso:
    python3 generate_resume.py <content.json> "<Output Name.pdf>"
    python3 generate_resume.py <content.json> "<Output Name.docx>"

O formato sai da extensao do arquivo de saida. PDF e o padrao; DOCX existe
porque alguns ATS so aceitam upload de .docx e recusam PDF.

O JSON define todo o conteúdo (ver base_content_en.json / base_content_pt.json).
O estilo (coluna única, fontes padrão, sem travessão) é fixo aqui.
Nunca invente conteúdo: edite apenas o JSON a partir da base verificada.
"""
import sys, json
from xml.sax.saxutils import escape as _esc
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.colors import HexColor
from reportlab.platypus import (
    BaseDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable,
    Frame, PageTemplate
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.pdfbase.pdfmetrics import stringWidth


def esc(s):
    return _esc(str(s))


NAVY = HexColor("#12303f")
ACCENT = HexColor("#1f5f8b")
GREY = HexColor("#3d3d3d")
LIGHT = HexColor("#6b6b6b")

styles = getSampleStyleSheet()
name_style = ParagraphStyle("name", parent=styles["Normal"], fontName="Helvetica-Bold",
    fontSize=22, leading=25, textColor=NAVY, spaceAfter=2)
title_style = ParagraphStyle("title", parent=styles["Normal"], fontName="Helvetica",
    fontSize=10.5, leading=13, textColor=ACCENT, spaceAfter=3)
contact_style = ParagraphStyle("contact", parent=styles["Normal"], fontName="Helvetica",
    fontSize=8.8, leading=12, textColor=GREY, spaceAfter=1)
section_style = ParagraphStyle("section", parent=styles["Normal"], fontName="Helvetica-Bold",
    fontSize=11, leading=13, textColor=ACCENT, spaceBefore=16, spaceAfter=2)
body_style = ParagraphStyle("body", parent=styles["Normal"], fontName="Helvetica",
    fontSize=9.3, leading=12.5, textColor=GREY, spaceAfter=3, alignment=TA_LEFT)
role_style = ParagraphStyle("role", parent=styles["Normal"], fontName="Helvetica-Bold",
    fontSize=9.8, leading=12, textColor=NAVY)
date_style = ParagraphStyle("date", parent=styles["Normal"], fontName="Helvetica",
    fontSize=8.8, leading=12, textColor=LIGHT, alignment=2)
company_style = ParagraphStyle("company", parent=styles["Normal"], fontName="Helvetica-Oblique",
    fontSize=9.3, leading=12, textColor=GREY, spaceAfter=2)
bullet_style = ParagraphStyle("bullet", parent=styles["Normal"], fontName="Helvetica",
    fontSize=9.2, leading=12.3, textColor=GREY, leftIndent=11, bulletIndent=1, spaceAfter=2.0)


# Largura util da pagina: letter menos as duas margens de 0.7".
LARGURA_UTIL = 7.1 * inch


def largura_datas(data, fonte="Helvetica", tam=8.8, folga=7):
    """
    Quanto a coluna da direita precisa para a data MAIS LONGA deste curriculo.

    Era fixa em 2.1", chutada olhando um exemplo. A data mais longa em
    portugues nao cabe: "Novembro de 2022 - Dezembro de 2023" mede mais que
    isso e quebrava em duas linhas, com o ano sozinho embaixo. E quebrar a
    data cresce a linha da tabela, o que empurra a descricao para baixo e abre
    um buraco — foi o "desalinhado" que voce viu em 2026-07-30.

    Medir em vez de chutar resolve nos dois idiomas e em qualquer data futura.
    O teto de 2.6" existe para uma data absurda nao espremer o cargo.
    """
    textos = []
    for chave in ("experience", "volunteer"):
        for j in data.get(chave) or []:
            if j.get("dates"):
                textos.append(str(j["dates"]))
    for linha in data.get("education") or []:
        if len(linha) > 2 and linha[2]:
            textos.append(str(linha[2]))
    if not textos:
        return 1.9 * inch
    return min(max(stringWidth(t, fonte, tam) for t in textos) + folga, 2.6 * inch)



def build(data, out):
    from render_pdf import build as render
    return render(data, out)


def build_docx(data, out):
    """
    Mesma estrutura do PDF, em .docx. Existe porque ATS de formulario proprio
    as vezes recusa PDF e so aceita Word.

    Mantem as mesmas garantias de ATS do PDF: coluna unica, sem tabela, sem
    caixa de texto, sem cabecalho/rodape. Tudo e paragrafo corrido, que e o
    unico formato que todo parser le sem errar a ordem.
    """
    from docx import Document
    from docx.shared import Pt, Inches, RGBColor
    from docx.enum.text import WD_ALIGN_PARAGRAPH

    NAVY_RGB = RGBColor(0x12, 0x30, 0x3f)
    GREY_RGB = RGBColor(0x3d, 0x3d, 0x3d)
    LIGHT_RGB = RGBColor(0x6b, 0x6b, 0x6b)

    doc = Document()
    for sec in doc.sections:
        sec.left_margin = sec.right_margin = Inches(0.7)
        sec.top_margin = Inches(0.55)
        sec.bottom_margin = Inches(0.5)

    normal = doc.styles["Normal"]
    normal.font.name = "Calibri"
    normal.font.size = Pt(9.5)
    normal.font.color.rgb = GREY_RGB
    normal.paragraph_format.space_after = Pt(2)
    normal.paragraph_format.line_spacing = 1.08

    def para(text, size=9.5, bold=False, color=GREY_RGB, after=2, align=None):
        p = doc.add_paragraph()
        r = p.add_run(text)
        r.bold = bold
        r.font.size = Pt(size)
        r.font.color.rgb = color
        p.paragraph_format.space_after = Pt(after)
        if align is not None:
            p.alignment = align
        return p

    def section(title):
        p = para(title.upper(), size=9.5, bold=True, color=NAVY_RGB, after=1)
        p.paragraph_format.space_before = Pt(10)
        # Regua horizontal via borda inferior de paragrafo vazio: e a forma que
        # nao introduz tabela nem shape, que quebrariam o parser do ATS.
        p = doc.add_paragraph()
        p.paragraph_format.space_after = Pt(4)
        pPr = p._p.get_or_add_pPr()
        from docx.oxml.ns import qn
        from docx.oxml import OxmlElement
        borders = OxmlElement("w:pBdr")
        bottom = OxmlElement("w:bottom")
        bottom.set(qn("w:val"), "single")
        bottom.set(qn("w:sz"), "6")
        bottom.set(qn("w:color"), "1f5f8b")
        borders.append(bottom)
        pPr.append(borders)

    def bullet(text):
        p = doc.add_paragraph(style="List Bullet")
        r = p.add_run(text)
        r.font.size = Pt(9.5)
        r.font.color.rgb = GREY_RGB
        p.paragraph_format.space_after = Pt(1)
        p.paragraph_format.left_indent = Inches(0.18)

    lbl = data["labels"]

    para(data["name"], size=19, bold=True, color=NAVY_RGB, after=1)
    para(data["headline"], size=10.5, color=RGBColor(0x1f, 0x5f, 0x8b), after=2)
    para(data["contact1"], size=8.5, color=LIGHT_RGB, after=0)
    para(data["contact2"], size=8.5, color=LIGHT_RGB, after=6)

    section(lbl["summary"])
    para(data["summary"])
    for b in data.get("core_skills", []):
        bullet(b)

    section(lbl["skills"])
    for prefix, line in ((lbl["skills_prefix"], data["skills_line"]),
                         (lbl["tools_prefix"], data["tools_line"])):
        p = doc.add_paragraph()
        r = p.add_run(prefix + " ")
        r.bold = True
        r.font.size = Pt(9.5)
        r.font.color.rgb = GREY_RGB
        r2 = p.add_run(line)
        r2.font.size = Pt(9.5)
        r2.font.color.rgb = GREY_RGB
        p.paragraph_format.space_after = Pt(2)

    section(lbl["experience"])
    for job in data["experience"]:
        p = doc.add_paragraph()
        r = p.add_run(f"{job['role']} | {job['company']}")
        r.bold = True
        r.font.size = Pt(10)
        r.font.color.rgb = NAVY_RGB
        r2 = p.add_run(f"   {job['dates']}")
        r2.font.size = Pt(8.5)
        r2.font.color.rgb = LIGHT_RGB
        p.paragraph_format.space_after = Pt(1)
        if job.get("desc"):
            para(job["desc"], size=8.8, color=LIGHT_RGB, after=1)
        for b in job.get("bullets", []):
            bullet(b)

    # Voluntariado e OPT-IN: os dados moram na base, mas so entram no arquivo
    # quando `incluir_voluntariado` for true. Motivo medido em 2026-07-30: o
    # curriculo PT ja ocupava as duas paginas inteiras, e so o cabecalho da
    # secao custa mais que o espaco livre — tirar a descricao e um bullet nao
    # resolvia. A adaptacao por vaga liga a flag quando o anuncio valoriza
    # mentoria, ensino ou impacto social, e ai corta outra coisa para caber.
    if data.get("volunteer") and data.get("incluir_voluntariado"):
        section(lbl.get("volunteer", "Volunteering"))
        for job in data["volunteer"]:
            p = doc.add_paragraph()
            r = p.add_run(f"{job['role']} | {job['company']}")
            r.bold = True
            r.font.size = Pt(10)
            r.font.color.rgb = NAVY_RGB
            r2 = p.add_run(f"   {job['dates']}")
            r2.font.size = Pt(8.5)
            r2.font.color.rgb = LIGHT_RGB
            p.paragraph_format.space_after = Pt(1)
            if job.get("desc"):
                para(job["desc"], size=8.8, color=LIGHT_RGB, after=1)
            for b in job.get("bullets", []):
                bullet(b)

    section(lbl["education"])
    for inst, field, yr in data["education"]:
        p = doc.add_paragraph()
        r = p.add_run(inst)
        r.bold = True
        r.font.size = Pt(9.5)
        r.font.color.rgb = GREY_RGB
        r2 = p.add_run(f" · {field}   {yr}")
        r2.font.size = Pt(9.5)
        r2.font.color.rgb = GREY_RGB
        p.paragraph_format.space_after = Pt(1)

    if data.get("certifications"):
        section(lbl["certifications"])
        para(data["certifications"])

    section(lbl["languages"])
    para(data["languages"])

    doc.core_properties.title = f"{data['name']} - Resume"
    doc.core_properties.author = data["name"]
    doc.save(out)
    print("built:", out)


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)
    with open(sys.argv[1], encoding="utf-8") as f:
        data = json.load(f)
    out = sys.argv[2]
    (build_docx if out.lower().endswith(".docx") else build)(data, out)


if __name__ == "__main__":
    main()
