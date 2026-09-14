"""Modelo de PDF do currículo, aprovado em 14 de Setembro de 2026. Todo conteúdo vem do JSON.

Cabeçalho centralizado, coluna única, Helvetica, títulos discretos com divisória logo
abaixo, marcadores em hífen, contatos clicáveis, sem rodapé. As duas experiências
mais recentes ficam na página 1; as anteriores, competências, formação e idiomas na
página 2. Teto: duas páginas. Não recrie o modelo: adapte o JSON.
"""
from pathlib import Path
import json
import re
from xml.sax.saxutils import escape
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_RIGHT
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable, PageBreak, KeepTogether
from reportlab.pdfbase.pdfmetrics import stringWidth
DARK=colors.HexColor('#242424'); GRAY=colors.HexColor('#666666'); LIGHT=colors.HexColor('#d5d5d5')
def style(name,size=10,leading=14,**kwargs):
 return ParagraphStyle(name,fontName='Helvetica',fontSize=size,leading=leading,textColor=DARK,**kwargs)
S={'name':ParagraphStyle('name',fontName='Helvetica-Bold',fontSize=23,leading=27,textColor=DARK,alignment=TA_CENTER),
'headline':style('headline',10.5,15,alignment=TA_CENTER),'contact':style('contact',8.5,12,alignment=TA_CENTER),
'section':style('section',8.5,11,spaceBefore=20,spaceAfter=6),
'role':ParagraphStyle('role',fontName='Helvetica-Bold',fontSize=10.5,leading=14,textColor=DARK),
'company':style('company',10,14),'date':style('date',8.5,14,alignment=TA_RIGHT),
'body':style('body',10,14),'bullet':style('bullet',10,14,leftIndent=11,firstLineIndent=-9,spaceAfter=4),
'context':style('context',9.2,13,spaceAfter=6)}
for k in ['contact','date','context']: S[k].textColor=GRAY

def P(t,k='body'):return Paragraph(escape(t),S[k])
def contact(text):
 parts=[]
 for value in text.split(' · '):
  # Link vira link: e-mail, ou qualquer coisa com cara de dominio (linkedin.com/x, github.com/x, meusite.com).
  ehDominio=re.match(r'^(?:https?://)?[\w.-]+\.[a-z]{2,}(?:/\S*)?$', value.strip(), re.I) is not None
  target=('mailto:'+value if '@' in value else (value if value.startswith('http') else 'https://'+value) if ehDominio else None)
  parts.append('<link href="'+escape(target, {'"':'&quot;'})+'">'+escape(value)+'</link>' if target else escape(value))
 return Paragraph(' · '.join(parts),S['contact'])
def section(t):return [P(t.upper(),'section'),HRFlowable(width='100%',thickness=.45,color=LIGHT),Spacer(1,9)]
def divider():return []
def job(j, gap=6):
 dw=stringWidth(j['dates'],'Helvetica',8.5)+10
 table=Table([[P(j['company'],'company'),P(j['dates'],'date')]],colWidths=[471-dw,dw])
 table.setStyle(TableStyle([('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),0),('RIGHTPADDING',(0,0),(-1,-1),0),('TOPPADDING',(0,0),(-1,-1),0),('BOTTOMPADDING',(0,0),(-1,-1),0)]))
 opening=[P(j['role'],'role'),table,Spacer(1,4)]
 if j.get('desc'):opening.append(P(j['desc'],'context'))
 bullets=[P('- '+b,'bullet') for b in j['bullets']]
 return [KeepTogether(opening+bullets[:1])]+bullets[1:]+[Spacer(1,gap)]

def build(data, out):
 d=data
 lang="pt" if d["labels"]["summary"]=="Resumo" else "en"
 story=[P(d['name'],'name'),Spacer(1,5),P(d['headline'],'headline'),Spacer(1,8),contact(d['contact1']),contact(d['contact2']),Spacer(1,8)]
 story+=section(d['labels']['summary'])+[P(d['summary'])]+divider()+section(d['labels']['experience'])
 for j in d['experience'][:2]:story+=job(j)
 # A quebra de pagina so existe quando ha experiencia anterior para a pagina 2.
 # Com uma ou duas experiencias, o curriculo e de uma pagina.
 if len(d['experience'])>2:
  story+=divider()+[PageBreak()]+section('Experiência anterior' if lang=='pt' else 'Earlier experience')
  for j in d['experience'][2:]:story+=job(j, gap=2)
 if d.get('incluir_voluntariado') and d.get('volunteer'):
  story+=section(d['labels'].get('volunteer','Voluntariado' if lang=='pt' else 'Volunteering'))
  for item in d['volunteer']:story+=job(item, gap=2)
 story+=divider()+section(d['labels']['skills'])+[P(d['skills_line']),Spacer(1,6),P(d['tools_line'])]
 story+=divider()+section(d['labels']['education'])
 for school,course,date in d['education']:
  row=Table([[P(school+' · '+course),P(date,'date')]],colWidths=[348,123]);row.setStyle(TableStyle([('LEFTPADDING',(0,0),(-1,-1),0),('RIGHTPADDING',(0,0),(-1,-1),0),('VALIGN',(0,0),(-1,-1),'TOP'),('TOPPADDING',(0,0),(-1,-1),0),('BOTTOMPADDING',(0,0),(-1,-1),1)]));story.append(row)
 story+=divider()+section(d['labels']['languages'])+[P(d['languages'])]+divider()
 path=Path(out)
 lang='pt' if d['labels']['summary']=='Resumo' else 'en'
 cargo=(d.get('experience') or [{}])[0].get('role','')
 doc=SimpleDocTemplate(str(path),pagesize=(612,792),leftMargin=64.5,rightMargin=64.5,topMargin=42,bottomMargin=40,title=f"{d['name']} | {cargo} | {lang.upper()}",author=d['name'])
 doc.build(story)
 print(path)
