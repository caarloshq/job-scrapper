# Caça-Vagas — instruções do subsistema

> O radar do Caça-vagas. As regras do projeto valem aqui, em especial a **Regra 1** (nunca inventar). O roteiro de primeiro uso está em [`../ONBOARDING.md`](../ONBOARDING.md).
>
> **A rodada é a tarefa agendada `caca-vagas-diario`, 09:05, DIA SIM DIA NÃO** (mudou em 2026-08-25, era todo dia). Ela agora tem duas metades: coletar e publicar, e **conduzir as candidaturas da meta registrada em `data/candidaturas.json`** ([`RODADA-DIARIA.md`](RODADA-DIARIA.md) §8). Ela não contém lógica: aponta para [`RODADA-DIARIA.md`](RODADA-DIARIA.md), que é onde o processo é mantido. Divergiu? O runbook vence.

## Estado real, em 2026-07-30

Leia isto antes de confiar em qualquer promessa deste arquivo. O `critic` pegou três documentos afirmando funcionalidade que não existe, então aqui vale a régua: **o que está escrito é o que roda.**

| | Estado |
|---|---|
| Coleta das 6 fontes por API | ✅ funciona, com testes |
| **Camada 4: LinkedIn via Task do Apify** | ✅ `src/fontes/apify.js`. Precisa de `APIFY_TOKEN` no `.env` |
| **Arc** (`arc.dev`) | ✅ `src/fontes/arc.js`. Pequena e boa: ~5 vagas por rodada, com descrição, faixa salarial e portão de vida nativo |
| **UX Remote Talent** | ✅ `src/fontes/uxremotetalent.js`. Board só de UX/UI remoto. Lê a restrição de país, que barra a maioria |
| **Índice final = determinístico + semântico** | ✅ o número que aparece já é o completo |
| **Julgamento semântico durável** | ✅ `data/semantico.json`, versionado no git |
| Filtro, score, dedupe, piso de salário | ✅ funciona |
| Portão de vida | ✅ funciona, com teste de integração contra HTML real |
| Camada 2 (`site:`) | ⚠️ **só com `WebSearch`**, ver abaixo |
| Filtro de disciplina e de marketing | ✅ título, empresa e abertura da descrição |
| **Quadro local** | ✅ `data/quadro.json`, escrito por `src/quadro.js`. A rodada registra as aprovadas; `npm run quadro` abre no navegador. Notion virou caso particular: `espelhar()` no mesmo arquivo |
| Rodada diária agendada | ✅ `caca-vagas-diario`, 09:05, executa [`RODADA-DIARIA.md`](RODADA-DIARIA.md) |
| Gerar currículo PDF **e DOCX** | ✅ `generate_resume.py`, formato pela extensão. `reportlab` e `python-docx` instalados |
| Modelo de e-mail para enviar o currículo | ✅ `../Skills/adapt-resume/modelos-email.md`, seis modelos. **Texto pronto, envio na mão** |
| Currículo automático acima de 75% | ✅ corte em `config/perfil.json`, executado na rodada |
| Currículo no card | ⚠️ o card do quadro mostra resumo, gaps e link; o PDF fica em `../Skills/adapt-resume/builds/<empresa>/` |
| **Candidatar-se pelo navegador** | ⚠️ **manual, conduzido pelo Claude no Chrome dele.** Não há código: é o `RODADA-DIARIA.md` §8 mais o Chrome logado. Gupy, InHire e LinkedIn são permitidos; conferir comportamento atual no navegador |
| Perfil de respostas de formulário | ✅ `config/perfil-candidatura.json`. Fatos e autorizações; composição e conferência em `RESPOSTAS.md` |
| Banco de perguntas de formulário | ✅ `data/perguntas.json`, versionado. Aprovação tem escopo; reutilização conforme `RESPOSTAS.md` |

## O que o Node faz sozinho

```bash
npm run rodada        # camadas 1 + 3, e camada 2 oportunista
npm test              # unitários, sem rede
npm run test:rede     # integração: bate na rede de verdade
npm run doctor        # dependências e fontes
npm run instrucoes    # rascunho .md de adaptação de currículo
npm run enriquecer    # camada 2 com URLs que EU passo
npm run pendentes     # fila de leitura do dia, ordenada por teto
npm run descobrir     # empresa de ATS que o dork achou e ainda nao esta na lista
```

## O índice é um número só, e ele é a soma

`Confiança` no quadro é o **índice final**: `60 determinísticos + 40 semânticos`. Você vê o número pronto; a composição é problema meu.

Os 60 o Node recalcula toda rodada. Os 40 custam **ler a vaga inteira** contra o currículo, e por isso moram em **`data/semantico.json`**, indexado por `ID externo` — o único arquivo de `data/` que **vai pro git** e que a reconstrução do cache **nunca apaga**.

Guardamos a **parcela** semântica, não o total. Assim o frescor continua decaindo sozinho e a nota não envelhece mentindo.

**Vaga sem julgamento sai marcada com `~` no relatório e não passa de 60%.** Isso é informação, não erro: quer dizer *ninguém leu esta vaga ainda*. Antes de dizer que uma vaga é fraca, confira se ela foi lida.

Para registrar um julgamento:

```js
import { registrar } from './src/semantico.js';
registrar('inhire:0d1db9fd-...', { nota: 30, resumo: '...', gaps: '...' });
```

| Camada | O quê |
|---|---|
| 1 | API de 8 fontes: Gupy, Remotar, InHire, Vagas Remotas, Coluna Tech, Vagas UX, Arc, UX Remote Talent |
| 2 | Busca `site:` em 6 domínios de ATS — ver a seção própria abaixo, tem armadilha |
| 3 | Portão de vida: campo `"status"` no HTML. `published` = viva; `frozen` e `closed` = morta |
| 4 | LinkedIn pela Task do Apify. Sem scraping próprio: dispara, espera, baixa o dataset, normaliza |
| 5 | **Arc** e **UX Remote Talent**, as duas em dois passos: listagem e depois a página de detalhe, porque a descrição só existe lá |

Saída: `data/vagas.json` (cache) e `data/rodada-YYYY-MM-DD.json`.

## A camada 2 na prática

**O DuckDuckGo rate-limita.** Não está morto: entrega nas 2–3 primeiras consultas e depois devolve página de anomalia. Com 16 consultas configuradas ele bloqueava na terceira e a camada 2 devolvia `0`, **parecendo "não achou nada"**. Ficou três rodadas assim sem ninguém notar. Hoje são 3 consultas com pausa de 2,5s, e `estaBloqueado()` distingue bloqueio de vazio.

**O caminho confiável é o `WebSearch`, que é meu, não do Node:**

```bash
# 1. rodar os dorks de config/dorks.json com WebSearch
# 2. jogar as URLs num arquivo, uma por linha
npm run enriquecer -- --arquivo data/urls-camada2.txt
```

**O mesmo arquivo de URLs serve para descobrir empresa nova.** `config/empresas-ats.json`
é lista escrita à mão, e empresa que não está lá nunca é consultada, por mais vaga aberta
que tenha. O dork devolve o slug dentro da própria URL (`jobs.ashbyhq.com/<slug>/...`):

```bash
npm run descobrir -- --arquivo data/urls-camada2.txt
```

Ele **bate na API do provedor antes de sugerir** e descarta quadro vazio, porque slug
errado e quadro vazio são indistinguíveis (está escrito no próprio `empresas-ats.json`).
A saída vai para `data/empresas-descobertas.json`, ordenada por vaga de design. **Não
grava em `config/`:** quem copia a linha para `empresas-ats.json` é você. Primeira
execução, em 2026-08-28, achou `ashby/openai` com 18 vagas de design em 755, e
`greenhouse/stone` com 3 em 415.

⚠️ **Ele só descobre Ashby e Greenhouse**, e isso não é preguiça: `extrair-id.js` não
tem handler para `apply.workable.com` nem `jobs.smartrecruiters.com`, então `extrair()`
nunca devolve essas fontes, por mais que o `ats.js` tenha a API dos dois pronta.

## Domínio no dork exige extrator, e essa é a armadilha

**Todo domínio em `dorks.sites` precisa de um handler em `src/busca/extrair-id.js`.**
Sem ele, `enriquecer.mjs` imprime `[sem id]` e descarta cem por cento do que o dork
achou, gastando uma das três consultas da rodada para nada.

Em 2026-08-28 entraram cinco domínios novos sem esse handler (Workday, BambooHR, iCIMS,
Jobvite, JazzHR) e saíram no mesmo dia, na revisão. Estão parqueados em
`dorks._sites_sem_extrator`, junto com Workable e SmartRecruiters, que já estavam lá
antes com o mesmo defeito. **Escrever o extrator dos dois primeiros vale mais**, porque
o `ats.js` já tem a API deles: destrava a camada 2 e a descoberta de empresa de uma vez.

`test/dork.test.js` guarda isso com uma amostra de URL real por domínio ativo. Domínio
que entrar em `sites` sem amostra e sem extrator reprova o `npm test`.

O script extrai o id da URL, dedupa contra o cache, aplica o portão de vida e grava. **Ele não usa LLM.**

**Por que o portão de vida é obrigatório aqui:** na medição de 2026-07-30, de 7 URLs que o Google devolveu para `site:gupy.io "product designer" senior`, **6 estavam mortas** (`frozen`, `closed`). O índice do Google para Gupy é majoritariamente lixo. Sem o portão, essas 6 iriam para o Notion como vagas abertas.

## O que precisa de mim (Claude)

O Node deixa tudo pronto e para. O que resta:

1. **Camada 2 com `WebSearch`** — os dorks de `config/dorks.json`, resultado para o `enriquecer`.
2. **Score semântico (0–40)** — ler a descrição contra `../Skills/adapt-resume/base_content_pt.json`.
3. **Salário do texto** quando a fonte não traz campo. O Gupy nunca traz.
4. **Nada de publicar.** A rodada registra as aprovadas no quadro sozinha. Se a pessoa usa Notion, espelhar a database com `espelhar()` de `src/arquivo.js` no começo da rodada; o histórico é preservado.
5. **Currículo** — vaga aprovada passa pela skill `../Skills/adapt-resume/SKILL.md`, nunca por fora.
6. **E-mail que leva o currículo** — os seis modelos estão em `../Skills/adapt-resume/modelos-email.md`, com o mapa de qual usar em cada `Status` do board. A rodada agendada **não envia e-mail** e nunca vai enviar: quem manda é você. O que a skill faz é deixar o texto pronto junto do PDF.

## O quadro, e o que cada fase significa

`data/quadro.json`, versão 2: uma entrada por `idExterno`, com `status`, o retrato da vaga (título, empresa, link, fonte, nota, salário, data) e `historico`, uma linha por mudança de fase com data e quem moveu (`rodada`, `pessoa` ou `agente`).

**Fases:** `Avaliar` · `Aplicar` · `Já apliquei` · `Entrevista` · `Cancelada`. As três últimas são concluídas (`CONCLUIDOS` em `src/arquivo.js`): a vaga sai do radar e da fila de leitura, e continua no quadro. `Aplicado por IA` existe pra candidatura automática e aparece junto de `Já apliquei`. `Revisar` é aceito por compatibilidade e é ativo.

**Regras:** nunca editar o arquivo à mão; nunca apagar entrada; mover por código só com `quadro.mover(id, status, { por: 'agente' })`, que grava o histórico. Toda gravação relê o disco na hora: card movido no navegador durante uma rodada não volta pra trás. A primeira gravação de cada dia deixa cópia em `data/backups/`.

## Regra de nível e salário

**Vaga júnior descarta. Salário baixo descarta.** Piso em `config/perfil.json`: R$ 8.000/mês, com câmbio grosseiro para USD e EUR só para comparar ordem de grandeza.

O piso **só se aplica quando valor e período são conhecidos.** Período desconhecido passa — descartar por período adivinhado custaria vaga boa, e esse erro já apareceu três vezes neste projeto.

Senioridade é lida no título **e** na abertura da descrição, porque board como a Vagas UX expõe só uma pill neutra.

## Regra de local — vale só esta

**A vaga tem que ser remota.** Qualquer país serve, cidade não importa. Híbrido e presencial saem, em qualquer cidade. Decidido em 2026-07-30 e substitui a regra anterior, que era por região.

**Inglês nunca bloqueia.** B2 (intermediário alto) basta. Vaga que exige fluência entra com desconto de 4 pontos e nota obrigatória em `Gaps`.

Modelo de trabalho desconhecido **passa** e fica marcado `modeloDesconhecido`. Descartar por falta de dado jogou fora 57 vagas na primeira rodada real — por ausência de informação, não por critério.

## Regras invioláveis

1. **Nunca inventar** fato, número, salário ou empresa. Sem menção clara de salário, o campo é `—`.
2. O `Resumo` descreve a vaga e fecha com o encaixe. Todo fato de encaixe citado **existe** no `base_content`. Nada além disso.
3. **Nunca sobrescrever** os `base_content_*.json`. Trabalhar em cópia, como manda a skill.
4. Números travados: os que estiverem em `numeros_travados` no seu `base_content` (`Skills/adapt-resume/`).
5. Sem travessão (—) em nada que vá pro currículo.
6. Vaga de `Fonte: Solta`, ou sem descrição confirmada, **nunca** gera currículo automático.
7. **Inscrição encerrada descarta em qualquer idade.** Vaga de ontem já fechada não serve.
8. **O piloto aplica em vaga do LinkedIn por qualquer caminho, inclusive a Candidatura Simplificada.**
   Regra registrada em **2026-09-08**, revogando a trava de 25/08. Antes, o modal que se resolve dentro do LinkedIn
   ficava de fora e nao contava na meta; hoje entra igual ao botao que leva para a ATS da empresa. O que motivou a
   mudanca foi medida: em 08/09, das treze vagas abertas, duas morreram por esse bloqueio e mais sete por local.
   ⚠️ **Na Simplificada, o LinkedIn oferece os curriculos ja enviados numa lista. Escolher pelo IDIOMA DA VAGA:**
   anuncio em portugues leva o curriculo em portugues, anuncio em ingles leva o em ingles.
9. **Respostas seguem `RESPOSTAS.md`.** O perfil guarda autorizações e fatos;
   o banco separa texto, instrução e escopo. Não inferir negativa de ausência no
   currículo. Pesquisa de empresa gera rascunho para conferência. Dados sensíveis
   permanecem no perfil privado, consultados só no atributo perguntado.
10. **O índice é prioridade, não probabilidade.** Palavra detectada não comprova
    experiência. Conflito remoto/híbrido não é resolvido pela porcentagem.


## Armadilhas já pagas

- **O portão de vida usa o campo `status`, não a string "Inscrições encerradas".** Essa string aparece no HTML de vaga viva **e** de vaga morta, porque é label do bundle. Confiar nela descarta tudo.
- **Antes de reprovar uma fonte, abrir no navegador e ler o bundle JS.** `curl` em caminho adivinhado não prova ausência de nada. Foi assim que a Remotar quase ficou de fora, e ela tem 5.268 vagas.
- **A Remotar é ela mesma agregadora** (`integrationSource` = `inhire`, `recrutei`, greenhouse). Dedupe por `externalLink` normalizado é obrigatório, não enfeite.
- **A URL pública da InHire exige o slug.** `https://<tenant>.inhire.app/vagas/<jobId>/<slug>`. Sem o segmento de slug a rota não casa e a página renderiza **vazia, sem dar erro** — 8 links foram para o Notion assim em 2026-07-30. E `<tenant>.inhire.app` sozinho redireciona para `/login`, que é o app do recrutador. Use sempre `urlPublica()`.
  Verificado no navegador: **qualquer slug funciona**, só precisa existir. O `slugVaga()` replica o charmap do npm `slugify` (que a InHire usa) só para a URL ficar igual à que o Google indexa — `|` vira `or`, `&` vira `and`, e os outros símbolos são **removidos**, não substituídos, então `UX/UI` vira `uxui`.
- **A InHire é SPA pura, então o portão de vida por HTTP não funciona nela.** `curl` devolve 200 e ~12,9KB de casca para vaga viva, morta e inexistente. Para InHire, o sinal é o campo `status` da API; o texto `"isn't valid"` só aparece com JavaScript executado.
- **A Remotar devolve `city` nulo em quase tudo.** Nunca descarte por campo de local vazio.
- **Alternação de regex é ordenada.** No extrator de salário a ramificação do `k` tem que vir antes da de dígitos, senão `18k` casa como `18` e o valor é descartado por implausível.
- **`limparHtml` decodifica entidade numérica e nomeada.** A InHire serve a descrição inteira em `&ccedil;&atilde;o`; a Coluna Tech usa `&#8211;` no título.
- **A Remotar anexa o slug no link da ATS de origem.** `mjv.inhire.app/vagas/<uuid>` versus `mjv.inhire.app/vagas/<uuid>/product-designer-senior-...`. Normalizar o link não casa caminhos diferentes — o dedupe precisa da **terceira chave**, `idCanonico()`, que extrai o id do próprio link. Sem ela, 11 vagas entraram duplicadas.
- **Exclusão por descrição só vale nos primeiros 400 caracteres** (`ABERTURA` em `filtro.js`). Boilerplate de LGPD cita "banco de talentos" em vaga legítima: uma das melhores vagas da rodada, o melhor encaixe de domínio da lista, foi descartada por isso. **Falso positivo custa vaga boa** — é o erro mais caro deste sistema, pior que deixar ruído passar.
- **Exclusão usa `casaTermo()`, nunca `includes` cru.** Termo curto destrói em silêncio: `"cad"` (software CAD) casou dentro de `"Risco Sa**cad**o"` e descartou a melhor vaga do board de UX. A fronteira é no início da palavra, com plural opcional — fronteira nas duas pontas quebraria `"sobrancelha"` × `"Sobrancelhas"`.
- **Na regex de salário, a moeda precisa da guarda `(?<![a-z0-9])`.** Sem ela o backtracking guloso parte `"R$"` e casa só o `"$"`, que mapeia para USD: a bolsa de `"R$ 2.000/mês"` do CEIA saiu como **"USD 2k"**. Salário errado é pior que salário ausente.
- **Senioridade tem que ler a descrição, não só o título.** A Vagas UX expõe o cargo numa pill neutra ("Product Designer") e o nível fica no texto: a vaga da Cashforce era `Product Designer Junior, R$ 3.000/mês, "não exigimos experiência prévia"` com domínio de risco sacado que parecia encaixe perfeito. **Domínio certo não salva cargo errado.**
- **A Vagas UX precisa da página de detalhe.** A listagem só traz empresa e cargo; descrição, salário e nível estão em `/oportunidades/em-aberto/<slug>`. Sem isso o score fica cego.
- **`robots.txt` da Vagas UX proíbe `/api` e `/_next`.** Só páginas públicas. Não contornar.

- **Cache guarda veredito, não regra.** Apertar `config/palavras-chave.json` não tira nada do cache até a próxima coleta. O `coletar` expurga; a **vista** (`pendentes`) reaplica `avaliar()`, `semantico.aplicar()` e `arquivo.aplicar()` a cada chamada. Sem isso, registrar um julgamento não esvaziava a fila e sete vagas já barradas continuavam aparecendo para leitura.
- **Design de marketing não é design de produto, e o título não denuncia.** A CRMBonus abre com "Nossa área de Marketing" sob o título limpo "Designer Pleno". A checagem é na abertura (600 chars, `ABERTURA_MARKETING`) porque vaga de produto legítima cita marketing lá embaixo, entre os stakeholders — checar o texto inteiro descartaria vaga boa.
- **`empresa_excluida` existe porque dedupe não resolve franquia.** Sete franqueadas da V4 Company ocuparam sete linhas do radar com a mesma vaga de designer gráfico: `empresa` é igual, mas o nome da franqueada entra no **título** e cada uma tem id próprio. A lista é curta e reversível de propósito — exclui **empresa**, não categoria.
- **A quarta chave do dedupe é `empresa + título`, e ela é fraca de propósito.** Vaga republicada ganha identidade nova na própria fonte e não sobra nada em comum: a Radix voltou na InHire com outro UUID, a SCALIS na Vagas Remotas com slug `-2` e `-3`. Como duas vagas reais podem dividir o título, o perdedor **nunca some** — vai para `idsAlternativos`.
- **Modelo de trabalho também vem só no corpo.** A EDGE abre com `Modalidade: Presencial (Maceió ou Arapiraca)` e o título é neutro: entrava como remoto por omissão. `pistasDaDescricao()` lê a abertura, depois do campo estruturado e do título.
- **Fonte que o quadro não conhece não vira outra fonte.** Duas vagas foram publicadas em 2026-07-30 com o campo vazio porque o board de então não tinha a opção. Preencher com "Vagas Remotas" seria inventar dado, e mexer nas opções do select já apagou 19 valores de `Status` hoje. Se for corrigir, adicionar a opção **fora** da rodada e conferir que nada zerou.
- **Nunca inventar id ao registrar uma vaga.** Copiar o `idExterno` do coletor, literal. Ids em estilo slug (`vagasremotas:codepath-senior-product-designer`) foram invenção minha na primeira leva e nunca casaram de volta: cinco vagas já publicadas apareceram como novas. O `arquivo.aplicar()` hoje cura isso casando pelo **link**, mas a cura não é desculpa para criar o problema.
- **`CONCLUIDOS` em `src/arquivo.js` compara pelo NOME da opção do Status, não pelo ID.** Quando você renomeou `Sem retorno`→`Cancelada` e `Descartada`→`Revisar` em 2026-08-05, a lista continuou com os nomes velhos — vaga marcada `Cancelada` ia voltar a ser oferecida como se ainda estivesse aberta, porque o código não reconhecia o novo rótulo. Renomear opção no Notion é seguro pros dados (mesmo ID, atribuição preservada); o que não é seguro é qualquer lugar do código que compara string literal contra o nome da opção. Se o Status ganhar outro rename, `CONCLUIDOS` e os testes de `arquivo.test.js` têm que mudar junto.
- **Dedupe por prioridade de fonte assume que a fonte mais forte continua viva.** Medido em 2026-08-05: 2 de 2 vagas checadas, a InHire (prioridade 10, vence o LinkedIn) tinha morrido enquanto o espelho da mesma vaga no LinkedIn (prioridade 7) continuava de pé. O vencedor do dedupe nunca é revalidado depois de escolhido — por isso a fila `Revisar` existe (`RODADA-DIARIA.md` §1.5): checa link morto e, se achar, deixa a gêmea viva assumir, mesmo que ela tivesse prioridade menor.

- **O arc.dev anuncia 9.193 vagas e só umas 5 servem.** A mesma página traz dois acervos no `__NEXT_DATA__`: `arcJobs`, que são as vagas do próprio Arc, com página de detalhe, descrição, faixa por hora e países aceitos; e `externalJobs`, o acervo agregado, que traz só título, empresa e data. **A vaga externa não tem link**: a rota `/remote-jobs/details/<slug>-<chave>` devolve 404 para ela. Vaga sem link é linha onde ninguém consegue se candidatar. Não "conserte" isso passando a ler `externalJobs`.
- **As rotas de categoria do Arc são por skill, não por profissão.** `/remote-jobs/product-design`, `/ux-design`, `/ui-design`, `/ux-ui-design`, `/design-systems` e `/figma` existem. `/remote-jobs/design` e `/designer` **não**: devolvem 308 para a lista geral, e seguir o redirect faz parecer que funcionaram.
- **O Arc informa faixa por HORA, e o período tem que viajar junto.** Sem `type: 'hour'`, "30 a 50 por hora" é lido como um salário de 30 e a vaga cai abaixo do piso de R$ 8.000 em silêncio. O `mensalBRL` já sabia converter hora (×160) desde sempre; o que faltava era o `daFonte` produzir esse período, corrigido em 2026-08-25.
- **Na UX Remote Talent, restrição de país e tipo de contrato moram na mesma lista de pills, e nem toda vaga declara os dois.** Ler por posição fazia `Part-time` virar restrição de país na vaga da OpenTrain AI. Isso não descartava nada, só gravava um dado que não existe no anúncio. A leitura é por **conteúdo**, com lista fechada de contratos.
- **`North America Only` NÃO inclui o Brasil**, e a leitura descuidada deixa passar porque a palavra "America" está no texto. A regra é por lista fechada dos dois lados: o que aceita e o que exclui. Rótulo que não está em nenhuma das duas cai no desconhecido e **passa marcado**, porque descartar por falta de dado já jogou fora 57 vagas boas aqui.
- **A maioria das vagas da UX Remote Talent é `USA Only`.** Medido em 2026-08-25: 5 de 25 aceitavam alguém no Brasil. Sem esse filtro o radar enche de vaga que parece encaixe até ele abrir o anúncio.

## A camada 4, e as armadilhas do dataset do Apify

**Como ela liga (2026-09-14):** só `APIFY_TOKEN` no `.env`. O código dispara o Actor `curious_coder/linkedin-jobs-scraper` com o input montado de `config/linkedin.json` (`montarInput()` em `src/fontes/apify.js`). `APIFY_TASK` é opcional e, quando existe, manda. A URL de busca **precisa** de `location` e `geoId`: sem eles o LinkedIn devolveu 100 de 100 vagas nos EUA, e o filtro aprovou 97 porque não enxerga restrição de país no texto. O `waitForFinish` da API devolve em 60 s com status READY e a rodada leva de 76 a 91 s, então é polling do run (`aguardar()`). O Actor não traz `validThrough` (prazo) nem `applicationType`.

Medido no dataset real de 2026-08-01, 50 vagas. Cada decisão em `src/fontes/apify.js` saiu de olhar o dado:

- **`postedDate` vem vazio em 41 das 50.** Só sobra `postedTime` relativo, então `dataRelativa()` converte "1 week ago" em data. Texto não reconhecido devolve `null`, **nunca "hoje"** — data inventada faz vaga velha parecer nova.
- **`location` é `"Brazil"` em 41 das 50.** É país, não cidade. Preencher `cidade` com isso seria inventar precisão que o dado não tem.
- **`salary` mistura convenções**: `"R$8,100.00/mo"` e `"$40,000.00/yr"`. O `R$` é testado **antes** do `$`, senão o cifrão casa sozinho. E o número inteiro é lido por `paraNumero()` de `salario.js`, não por regex própria: a primeira versão casava só os três primeiros dígitos e `R$ 12000` virava **120**, que cai abaixo do piso e **descarta a vaga em silêncio**.
- **`seniorityLevel` traz `"Entry level"`**, que é júnior e sai. `"Mid-Senior level"` junta pleno e sênior num rótulo só, então não decide nada.
- **O remoto vem do `f_WT=2`** na URL de busca, que é o filtro do LinkedIn. Sem a marca, devolve `null` e o filtro decide pelas outras pistas — nunca assume.
- **Prioridade 7 no dedupe**, abaixo da ATS de origem e acima dos agregadores BR: 37 das 50 são "External Apply", ou seja a página do LinkedIn só redireciona para a ATS.
