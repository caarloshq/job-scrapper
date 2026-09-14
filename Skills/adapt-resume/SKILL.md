---
name: adapt-resume
description: Skill única de currículo. Use SEMPRE que a pessoa pedir qualquer coisa sobre currículo/CV/resume neste projeto — criar, editar, adaptar a uma vaga, aplicar correções de ATS, ajustar texto, trocar idioma, revisar ou gerar PDF. É o ponto de entrada padrão; nunca refazer currículo por fora dela.
---

# Adapt Resume — skill única de currículo

Ponto de entrada para tudo relacionado ao currículo de quem está usando este pacote: montar a base a partir do currículo e do LinkedIn, adaptar a vaga, editar a base, aplicar correções de ATS, gerar PDF EN/PT. Sempre parte da base verificada e realça só o que já é verdade. Nunca inventar.

## Quando usar

SEMPRE que a pessoa pedir algo sobre currículo neste projeto: montar a base pela primeira vez, adaptar a uma vaga, editar/atualizar a base, corrigir apontamentos de ATS, encurtar bullets, trocar idioma, revisar ou regerar o PDF. Qualquer pedido de currículo passa por aqui.

## Arquivos desta skill

- `base_content_en.json` / `base_content_pt.json` — **currículo base editável** (fonte única de verdade). Chegam **vazios/placeholder** — a primeira coisa a fazer é montar a base de verdade, ver "Montando a base pela primeira vez" abaixo. É a partir daqui que se adapta depois. Não sobrescrever.
- `generate_resume.py` — gerador. Lê um JSON e produz o PDF ou o DOCX, pela extensão da saída. O PDF sai pelo `render_pdf.py`, o modelo aprovado em 14 de Setembro de 2026: cabeçalho centralizado, coluna única, Helvetica, marcadores em hífen, contatos clicáveis, duas experiências mais recentes na página 1 e o resto na página 2. **Não editar o estilo nem recriar o modelo:** adapte o JSON. O DOCX tem layout próprio e não é visualmente equivalente ao PDF. ⚠️ O modelo **não imprime** `core_skills`, `certifications` nem `award`: o resumo sai só em prosa, e certificação entra no texto do resumo ou de um bullet se for provada. Os campos continuam no JSON porque o radar e o DOCX os leem.
- `verificar_resume.py` — confere o arquivo gerado contra as regras. É a prova, não a opinião.

## Montando a base pela primeira vez

Antes de adaptar qualquer vaga, a base precisa existir de verdade. A pessoa coloca em `materiais-fonte/` (ver `materiais-fonte/README.md`):

1. O currículo atual dela, em PDF, `.md` ou `.txt`.
2. O LinkedIn: perfil salvo como PDF, ou o export oficial em ZIP.
3. Fatos verificados da empresa/cargo atual — métricas, datas, nome do cargo. É o que dá densidade ao bullet mais importante do currículo.

PDF e ZIP viram texto com `npm run onboarding -- --extrair` (dentro de `vagas/`): leia os `*.extraido.*`, não o binário. **O idioma da primeira base vem do mercado escolhido no bloco 2 do onboarding** (`vagas/config/perfil.json` → `mercado`): nacional é `pt`, internacional é `en`, ambos monta os dois, começando pelo prioritário.

**Isto não é um passo de "ler e transcrever".** Material bruto de currículo raramente já vem no formato de bullet com número verificável — vem em prosa, em lista solta, às vezes contraditório entre o currículo e o LinkedIn. **Antes de escrever uma linha do `base_content`, entreviste a pessoa:**

- O que ela quer destacar primeiro — qual experiência, qual competência?
- Que área/senioridade/domínio ela está mirando agora? (isso decide o que vira `headline` e o que lidera `core_skills`)
- Os números que aparecem no material — ela confia neles pra travar (`numeros_travados`)? Se um resultado não tem número claro, não invente um: pergunte se ela tem o dado ou se o bullet fica sem número.
- Há alguma regra fixa de carreira (cargo atual, algo que sempre tem que aparecer por último)? Isso vira `regras_extra`.
- Duas experiências disputam o mesmo espaço/tema — qual prioriza?

Só depois dessas respostas, monte `base_content_pt.json` (e `_en.json`, tradução fiel) seguindo **exatamente** o schema do arquivo que já está aí — mesmas chaves, mesma forma. **Regra 1 vale aqui igual em todo o resto: nada que não esteja em algum dos materiais colados ou nas respostas da pessoa.** Cada frase do resumo e cada bullet tem que ser rastreável a um trecho do que ela mandou ou confirmou.

Dois campos merecem atenção:

- **`numeros_travados`** — lista de números/resultados que nunca podem ser alterados nem arredondados em nenhuma adaptação futura (ex.: `"680% de crescimento"`, `"3x mais rápido"`). São os números que mais pesam no currículo dela.
- **`nunca_citar`** — lista de expressões regulares de trechos que não podem aparecer em nenhum currículo gerado (uma métrica antiga, um cargo que você não usa mais). O verificador e o gerador de instrução do radar leem esta lista. Vazia é um estado válido.
- **`regras_extra`** — frases curtas de regra fixa, tipo "Cargo atual = Engenheira de Dados Sênior" ou "o bullet de liderança de equipe é sempre o último da empresa X". Fica livre porque cada carreira tem uma regra própria.
- **`experience[].bullets_temas`** — array paralelo a `bullets`, um array de temas por bullet (ex.: `["design-system", "zero-a-um"]`). É o que liga um bullet ao balde de ênfase certo quando uma vaga aciona aquele tema — ver `config/mapa-enfase.json` no radar de vagas para a lista de temas existentes. Bullet sem tema simplesmente não aparece destacado em nenhuma instrução — não é erro, só não tem gancho ainda.

Gere o PDF base e rode o verificador para confirmar que a base está válida:

```bash
python3 generate_resume.py base_content_pt.json base_resume_pt.pdf
python3 verificar_resume.py base_resume_pt.pdf base_content_pt.json
```

⚠️ **"número travado ausente" nem sempre é o número errado.** O verificador procura o texto exato de `numeros_travados` no PDF extraído, e o PDF quebra linha no meio de uma frase às vezes — se a quebra cair bem no meio do seu número, a checagem falha mesmo com o número lá. Antes de desconfiar do bullet, abra o PDF (ou extraia o texto) e veja se é isso. Se for, encurte a frase ao redor do número, ou encurte o próprio item de `numeros_travados` pra menos palavras — não invente um número diferente pra passar.

## Regras invioláveis

1. **Nunca inventar** fato, número, ferramenta, cargo, empresa ou resultado. Só usar conteúdo que já existe na base. Se a vaga pede algo que a pessoa não tem, não adicionar.
2. **Números travados**: os que estiverem em `numeros_travados` no `base_content`. Nunca alterar.
3. **ATS-safe**: coluna única, texto selecionável, fonte padrão, sem ícone, sem gráfico. O gerador já garante isso.
4. **Sem travessão** (—). Usar "·", "|", vírgula ou "de/a" em datas.
5. As regras de `regras_extra` no `base_content` valem como regra fixa (cargo, ordem de bullet, etc.).
6. Inglês no nível declarado no `base_content` (`languages`). Não elevar.
7. Máximo **2 páginas**.
8. Nunca sobrescrever os `base_content_*.json`. Sempre trabalhar em cópia.
9. A largura da coluna de datas é **medida do conteúdo**, nunca fixa. Data que não cabe quebra em duas linhas e empurra a descrição pra baixo. Se mexer em `largura_datas()`, rode o verificador nos dois idiomas.
10. Máximo 2 páginas é **teto duro**. Toda adição pede uma subtração — verifique o número de páginas antes de entregar, não depois.

## Processo (depois que a base já existe)

1. **Olhar o currículo atual primeiro.** Carregar a base no idioma alvo e, se útil, abrir o PDF atual. Esse é o ponto de partida: adapta-se a partir dele, não se recria do zero.
2. **Copiar** a base para `builds/<empresa>/content.json` e editar só essa cópia. Nunca mexer na base.
3. **Só então olhar o contexto adicional** (descrição da vaga). Extrair: cargo e senioridade, domínio, skills obrigatórias, ferramentas citadas, palavras-chave repetidas, idioma.
4. **Adaptar sem inventar** (só reordenar, realçar e reescrever com sinônimos verdadeiros, sempre em cima do conteúdo atual):
   - `core_skills` e `skills_line`: mover para frente as skills que a vaga mais pede.
   - `summary`: espelhar o vocabulário da vaga usando só fatos reais.
   - `experience[].bullets`: reordenar para liderar com o bullet mais relevante à vaga, usando `bullets_temas` como guia. A experiência atual continua primeiro na lista.
   - `headline`: pode reordenar a ênfase desde que todo termo seja verdadeiro e já presente no perfil.
   - `tools_line`: subir as ferramentas que a vaga cita, se a pessoa as tem.
   - Não mexer em datas, empresas, cargos, números, formação, certificações.
5. **Gerar** o PDF (tudo dentro do projeto):
   ```
   python3 generate_resume.py builds/<empresa>/content.json "../../Curriculo/<Seu Nome> - <Seu Cargo> - <Empresa>.pdf"
   ```
6. **Verificar** antes de entregar:
   ```
   python3 verificar_resume.py "<saída.pdf>" builds/<empresa>/content.json
   ```
   Ele checa páginas ≤ 2, texto extraível por ATS, zero travessão, os números de `numeros_travados`, e se alguma data é mais larga que a coluna. Exit 1 se falhar. **Cole a saída** ao entregar.
7. **Nomear e salvar**: `<Seu Nome> - <Seu Cargo> - <Empresa>.pdf` dentro de `Curriculo/`. Apresentar antes de considerar pronto.

## Mapa de tema → o que costuma acionar

Os temas abaixo espelham `config/mapa-enfase.json` do radar de vagas. Qual bullet aparece sob cada tema vem do `bullets_temas` de quem está usando, não daqui — esta lista é só pra ajudar a marcar os bullets certos ao montar a base.

- `design-system` — vagas que citam design system, component library, tokens.
- `research` — research, discovery, usabilidade, testes com usuário.
- `design-ops` — processo, documentação, handoff.
- `fintech` — fintech, crédito, regulado, compliance, banking.
- `zero-a-um` — 0 to 1, from scratch, early stage, scale-up.
- `ia` — AI, AI-native, LLM, prompt, copiloto.
- `b2b` — B2B, SaaS, dashboard, backoffice.
- `metricas` — conversão, growth, resultado, impacto.
- `onboarding` — onboarding, cadastro, ativação.
- `lideranca` — liderança, PO, stakeholder, mentoria.
- `mobile` — mobile, app, iOS, Android.

## Notas

- Se a vaga pedir uma seção que não existe (ex.: publicações), não criar. Informar a pessoa.
- Se faltar contexto para decidir ênfase, perguntar antes de gerar.
- Endossos de colegas não entram no PDF ATS. Se quiser, gerar documento separado.
