# Rodada diária — runbook

Este arquivo é o que a **tarefa agendada** executa. A tarefa não contém lógica: ela só aponta para cá. Mudar o processo é editar este arquivo, nunca a tarefa.

> A configuração e a disponibilidade do agendador precisam ser conferidas no runtime que executa a rodada. Não presumir aprovação persistente de ferramenta nem recuperação automática de execução perdida.

Antes de começar, ler [`AGENTS.md`](AGENTS.md) e [`RESPOSTAS.md`](RESPOSTAS.md). As regras invioláveis valem aqui inteiras, em especial: **nunca inventar salário, empresa ou fato de encaixe.**

O ciclo é o que você descreveu: *a primeira rodada pega as vagas e põe no quadro; na próxima, ele vê as que já foram concluídas e esquece elas.*

> A rodada coleta, prepara materiais e conduz candidaturas autorizadas. A meta está em `data/candidaturas.json`; ela orienta volume, nunca autoriza usar resposta pendente nem reduzir os critérios de qualidade. A cadência registrada é dia sim, dia não; conferir a configuração efetiva do agendador ao operá-lo.


---

## 1. O quadro é o estado

Desde 2026-09-14 o estado das vagas mora em `data/quadro.json`, o quadro local (`npm run quadro` abre no navegador). A rodada lê esse arquivo sozinha: não existe passo de espelhar. Vaga com status `Já apliquei`, `Entrevista` ou `Cancelada` está **concluída**: sai do radar e da fila de leitura, e continua no quadro com o histórico. `Avaliar` e `Aplicar` seguem ativas.

Quem usa Notion pode espelhar a database no mesmo arquivo com `espelhar()` de `src/arquivo.js`, no começo da rodada; o formato é o mesmo, e o histórico é preservado.

**Nunca edite o `quadro.json` à mão nem apague uma vaga dele.** Pra mover por código, `quadro.mover(id, status, { por: 'agente' })`: fica no histórico.

## 2. Coletar

```bash
npm run rodada
```

Roda camadas 1, 3 e 4. Expurga do cache o que não passa mais no filtro atual — apertar uma regra em `config/` tem efeito aqui, sem precisar refetch.

Se já rodou hoje e for preciso repetir, `npm run rodada -- --forcar`.

## 2.5. Camada 4 — LinkedIn

Decisão de 2026-08-10: a rodada dispara Task **nova** no Apify a cada execução — dataset sempre fresco, nunca reimporta o de ontem. Custa crédito e pode somar até 8 minutos à rodada (teto de espera do run).

Sem `APIFY_TOKEN` em `vagas/.env`, a camada 4 não entra e as outras seguem normalmente. Com o token, a rodada dispara o Actor de `config/linkedin.json` com a busca de lá; com `APIFY_TASK` também no `.env`, a Task manda e o arquivo é ignorado.

Para reimportar o último dataset sem gastar crédito (fora da rodada agendada, ex.: debug):

```bash
npm run apify -- --ultimo
```

## 3. Camada 2 — só se a 1 vier fraca

Não é todo dia. Se a camada 1 trouxe pouca vaga nova, rodar os dorks de `config/dorks.json` com `WebSearch` (o do Node rate-limita, ver `AGENTS.md`), jogar as URLs num arquivo e:

```bash
npm run enriquecer -- --arquivo data/urls-camada2.txt
```

## 4. Ler a fila

```bash
npm run pendentes
```

A fila já reflete o filtro de hoje, os julgamentos de hoje e o quadro de hoje — ela não confia no veredito congelado no cache.

Ordenada por **teto**: quanto a vaga chegaria se a leitura fosse ótima. **Ler vaga com teto abaixo de 65% não muda decisão nenhuma** — deixar para depois é escolha legítima quando a fila está grande.

```bash
npm run pendentes -- --ler 12
```

Para cada vaga lida, registrar o julgamento contra `../Skills/adapt-resume/base_content_pt.json`:

```js
import { registrar } from './src/semantico.js';
registrar('<id externo>', { nota: 0..40, resumo: '...', gaps: '...', descricao: '<texto lido>' });
```

Passar `descricao` grava a impressão digital do texto. Se o anúncio for reeditado depois, a vaga volta para a fila marcada — a nota antiga falava de outro texto.

O `resumo` **descreve a vaga primeiro e fecha com o encaixe**. Todo fato de encaixe citado tem que existir no `base_content`.

### Julgamento semântico com evidência

Distribuir os 40 pontos em quatro eixos de 0 a 10: trabalho exigido, experiência
no domínio, métodos/ferramentas e escopo/senioridade. Em cada eixo, usar 0 quando
não há evidência ou há incompatibilidade; 5 quando há experiência transferível ou
cobertura parcial; 10 quando os requisitos centrais têm prova direta. Valores
intermediários precisam justificativa. Registrar a decomposição e a evidência em
`data/leituras/<id-seguro>.json` e manter em `semantico.json` a parcela total no
formato que o código já consome. Não reescrever julgamentos antigos sem reler.

O idioma já recebe desconto na parcela determinística, então não descontar duas
vezes. Remoto, país elegível e inscrição aberta são conferências de elegibilidade,
não pontos que uma competência compensa. Falta de dado não equivale a requisito
atendido; deve aparecer no resumo/gaps e ser resolvida antes de candidatura.

## 5. O quadro já recebeu as novas

A coleta registra toda vaga aprovada no quadro, em `Avaliar`, com o retrato dela (título, empresa, link, nota). Não há o que publicar. O que a leitura semântica muda (nota, resumo, gaps) aparece no card na hora, porque o quadro lê o cache hidratado com as regras de hoje.

Vaga sem julgamento aparece no card com `~` e não passa de 60%: isso é informação, não erro.

## 6. Currículo das vagas acima do corte

**Corte: 75%** (`config/perfil.json` → `curriculo.gerar_instrucao_acima_de`). Abaixo disso não se gera nada — nem `.md`, nem arquivo.

```bash
npm run instrucoes          # usa o corte do perfil
```

Isso escreve `Skills/adapt-resume/builds/<empresa>/instrucao.md`, que diz quais baldes de ênfase a vaga acionou. **O `.md` é insumo, não entrega.**

O script imprime "Confira os .md e me diga quais aprovar" — isso é resíduo de modo interativo. **Na rodada agendada não existe aprovação a esperar: gerar o currículo de toda vaga do corte, sempre, sem pausar.** Decidido em 2026-08-03, depois que uma rodada parou nesse passo esperando um "sim" que nunca vem porque você não está olhando às 09:05.

Em seguida, para cada vaga do corte, rodar a skill `../Skills/adapt-resume/SKILL.md`:

1. Copiar `base_content_pt.json` (ou `_en` se a vaga for em inglês) para `builds/<empresa>/content.json`
2. Adaptar **só a cópia**, seguindo as regras invioláveis da skill: reordenar e realçar, nunca inventar
3. Gerar o arquivo:

```bash
python3 generate_resume.py builds/<empresa>/content.json "../../Curriculo/<Seu Nome> - <cargo atual em experience[0].role> - <Empresa>.pdf"
```

**PDF ou DOCX sai da extensão.** PDF é o padrão; usar `.docx` quando o formulário da vaga recusa PDF e só aceita Word — informação que só aparece na página de candidatura, então na dúvida gerar PDF.

4. Conferir antes de dar como pronto: ≤ 2 páginas, texto selecionável, **zero travessão**, números travados conferidos.
5. O caminho do arquivo fica em `Skills/adapt-resume/builds/<empresa>/`; o card do quadro mostra o resumo e os gaps.

⚠️ **Anexar o arquivo no campo `Currículo` exige o token de File Upload**, que só você cria e põe em `vagas/.env`. Enquanto ele não existir, preencher só `Currículo (caminho)` e dizer que o anexo ficou pendente. Não fingir que anexou.

## 8. Candidatar

**Meta e saldo:** consultar `data/candidaturas.json`. Priorizar vagas elegíveis e
compatíveis; volume não libera resposta sem fonte ou aprovação. O que depender do
Você vira pendência específica, sem bloquear o trabalho independente nas demais.

### Antes de abrir o navegador

1. Ler o perfil e o banco segundo `RESPOSTAS.md`. Campo conhecido é reutilizado
   apenas dentro de seu contexto; `aprovada: true` não basta sem texto final,
   fonte e escopo compatíveis. Rodar `node scripts/validar-respostas.mjs`.
2. Conferir a vaga viva no anúncio de origem: modalidade, país, idioma,
   obrigatórios e remuneração quando declarada. Conflito de modalidade pede
   resolução na fonte; não aplicar apenas porque o índice é alto.
3. Gerar ou revalidar o currículo pela skill `adapt-resume`, com a descrição da
   vaga e as regras atuais. Nome e idioma de um PDF antigo não comprovam sua
   adequação. Não usar versão que falhe na revisão atual.
4. Preparar as respostas com fontes e registrar o texto exato localmente conforme
   `RESPOSTAS.md`. Pergunta sobre a empresa pode ser pesquisada e rascunhada para
   você conferir; não inventar opinião pessoal. Reunir dúvidas necessárias.

### 🔴 O que a rodada de 2026-08-26 pagou caro para descobrir

**Tecla de verdade chega no Chrome. Setar `.value` por código, não.**
A sequência que funciona é `triple_click` → `Backspace` repetido → `type`. Foi ela
que destravou máscara de moeda, telefone e combobox do React, que estavam paradas
desde a rodada anterior. Setar `.value` com o setter nativo pinta o valor na tela e
o site continua achando que o campo está **vazio**: o envio volta com "campo
obrigatório" embaixo de um campo visivelmente preenchido.

**A máscara de moeda lê os dígitos como reais inteiros, não como centavos.**
Digitar `12000` dá **R$ 12.000,00**. Digitar `1200000` dá R$ 1.200.000,00 e a
o formulário devolve "The value must be less than R$ 300,000.00". Nunca digite ponto,
vírgula ou `R$`: só os dígitos da parte inteira.

**O primeiro clique numa aba recém-navegada é comido pelo foco.**
Depois de `navigate`, o primeiro `left_click` só ativa a aba e não aciona nada.
Dê um clique de aquecimento no mesmo ponto, espere, e clique de novo. Sem isso a
sequência inteira desanda e você acha que a vaga está quebrada.

**Combobox do React não aceita texto colado: aceita filtro e Enter.**
Escrever o valor inteiro no campo faz a lista responder "No options", porque o
texto vira filtro. Limpe, digite um pedaço que só case com uma opção, e pressione
Enter. Clicar na opção por coordenada é o que trocou a faixa salarial de
R$ 10.000 a R$ 15.000 para R$ 8.000 a R$ 9.000: a página rolou entre a leitura e o
clique.

**O Greenhouse pede código de 8 caracteres por e-mail antes de enviar.**
O formulário parece completo, o botão responde, e nada acontece até o código ser
digitado. Ele chega de `no-reply@us.greenhouse-mail.io` com o assunto "Security
code for your application to <empresa>".

**A InHire apaga a página quando a vaga fecha, e o portão de vida não vê isso.**
Oito das oito vagas da InHire vindas do estoque anterior responderam *"Oops, looks
like the link you accessed isn't valid"*. Não existe rótulo de encerrada para o
coletor ler: a URL simplesmente morre. Enquanto o portão não tratar 404 de SPA como
morte, **abra a vaga da InHire antes de contar com ela.**

**O índice não lê presencial nem faixa salarial que está no corpo do anúncio.**
Uma vaga saiu com 79% e era híbrida presencial em São Paulo. Outra
saiu com 44% e paga por demanda UST, R$ 30 a unidade, média de 200 por
mês: bem abaixo da pretensão declarada no perfil. As duas passaram pelo filtro de
remoto. **Confira modelo de trabalho e remuneração na página antes de preencher.**

**Vaga de consultoria costuma ter eliminatória de diploma.**
Uma consultoria reprovou na hora, com `/reproved` na URL, na pergunta de formação
superior. A escolaridade é a declarada no perfil, e isso não muda. Vale conferir a
primeira pergunta antes de investir o preenchimento inteiro.

**Botão que abre a candidatura precisa de dois cliques na Gupy.**
O primeiro `left_click` depois de `navigate` é consumido pelo foco da aba. O segundo
é o que abre `/candidates/applications/...`. Vale para o `Candidatar-se` do topo e
para qualquer botão logo depois de trocar de página.

**O link `Candidatar-se à vaga` do rodapé só rola a página.**
Ele não abre o fluxo: leva até o botão do topo. Clique sempre no do cabeçalho.

**Perfil da Gupy já carrega currículo, nome e telefone.**
Vaga sem pergunta da empresa fecha em seis cliques, sem preencher nada:
Candidatar-se, Continuar, Salvar e continuar, Responder agora, Salvar e continuar,
Finalizar candidatura.

**A tela `Apresente-se!` é opcional e vale a pena.**
Até 1.500 caracteres mais três habilidades escolhidas da lista do currículo. A lista
reflui a cada escolha, então releia as posições entre um clique e outro. O texto
segue `RESPOSTAS.md`: responder ao desafio com experiências pertinentes e prova
concreta. Número não é obrigatório. Responder lacunas quando perguntadas, sem
abrir toda apresentação com uma lista de deficiências.

**A BairesDev não é candidatura, é cadastro de talento.**
Depois do `Apply` ela abre um onboarding de seis passos: experiência com data por
calendário (digitar no campo não funciona), último salário, pretensão, inglês, um
áudio de apresentação em inglês e um teste de raciocínio. Enquanto o áudio e o teste
não forem feitos, o perfil fica `Incomplete profile` e não entra no matching. O áudio
depende de microfone e o teste é avaliativo: **os dois são seu, não do piloto.**

**Chrome bloqueia microfone e câmera por padrão nessa origem.**
A BairesDev responde "Microphone/Camera access denied" e oferece `I'll do it later`,
que preserva o resto do cadastro. Use esse caminho em vez de tentar liberar
permissão de dispositivo.

**A digitação só entra com o Chrome em primeiro plano no sistema.**
Não basta a aba estar selecionada: se outra janela do macOS estiver na frente,
`computer:type` roda, reporta sucesso, e o campo continua vazio. Isso queimou
dois preenchimentos inteiros em 2026-08-31. Antes de cada lote de digitação:

```bash
osascript -e 'tell application "Google Chrome" to activate'
```

**O formulário da Revolut trava no seletor de país, e isso já é padrão.**
Aconteceu em 2026-08-27 e de novo em 2026-08-31, com recarga limpa no meio. O
dropdown de `Current country` monta um `[role=dialog]` que renderiza vazio e
engole todo clique da página; depois de mexer nele, nem mouse nem teclado
passam, e o `Runtime.evaluate` chega a estourar o timeout. Desligar o
`pointer-events` do overlay não resolve. **Não insista: preencha o que dá,
deixe a aba aberta e mande para você.**

**Agregador que exige conta não é caminho de candidatura.** WeWorkRemotely,
Arc e Jobicy escondem o link real atrás de cadastro ou de uma aba que abre
fora do grupo controlado. Quando o anúncio vier de um deles, **procure o board
oficial da empresa** (`jobs.ashbyhq.com/<slug>`, `job-boards.greenhouse.io/<slug>`,
`jobs.lever.co/<slug>`) antes de desistir: foi assim que a Rho foi enviada em
2026-08-31, e foi assim que se descobriu que a vaga da Ingenious.build já
tinha saído do ar.

### Limites e autorizações

- Nunca inventar fato, resposta negativa, experiência ou motivo pessoal. Não
  citar o conteúdo proibido em `config/perfil-candidatura.json#rascunho.nunca_citar`.
- Documentos ficam com você, conforme o perfil. Não os guardar em logs.
- LinkedIn e Candidatura Simplificada estão liberados desde 08/09/2026. Selecionar
  currículo pelo idioma e adequação atual à vaga, não apenas pelo nome do arquivo.
- Autodeclaração e consentimento seguem os respectivos blocos do perfil, que
  guardam o alcance autorizado. Consultar somente o atributo perguntado; não
  inferir pronomes ou necessidade de acessibilidade de outro atributo.
- Pesquisa para “por que esta empresa?” está autorizada desde 14/09/2026 como
  rascunho para conferência seu. Aprovação é por candidatura.

### Mecânica que já custou erro, e não é opcional

| Regra | Por quê |
|---|---|
| **Uma aba por vez, e ela em primeiro plano** | A digitação vai para a aba **selecionada** no Chrome, não para a do `tabId`. Focar o campo por JS devolve `true` e mesmo assim o texto não entra. Custou dois preenchimentos perdidos |
| **`navigate` sempre com `tabId` explícito** | Sem ele, pega a primeira aba do grupo e destrói o formulário que estava lá |
| **Radio e checkbox por referência, nunca por coordenada** | Coordenada de screenshot envelhece quando a página rola. Foi assim que uma candidatura foi enviada como CLT quando você tinha escolhido PJ |
| **Campo de moeda recebe só os dígitos** | Digitar `12.000,00` na máscara da InHire produz **R$ 1.200.000,00**. Digitar `12000` produz o valor certo |
| **Máscara que embaralha o que foi digitado: pressione `End` entre um dígito e outro** | Descoberto em 2026-09-08 no recrut.ai (Insi). Digitar `48936186883` de uma vez produziu **(89) 18688-3634**, e o CEP `88058291` virou `88058-912`: a máscara devolve o cursor para o começo a cada tecla, então os dígitos entram fora de ordem. Um dígito, `End`, próximo dígito. Sai certo |
| **Campo com máscara não limpa com Ctrl+A** | O valor antigo fica e o novo concatena. Limpar com `focus()` mais `setSelectionRange` e um Backspace |
| **Recusar o banner de cookies antes de clicar em Continuar** | Cada domínio da Gupy tem o seu, e ele intercepta o clique **sem dar erro**: a página só não avança |
| **Trocar o país do telefone ANTES de digitar o número** | O padrão é `Estados Unidos +1`, e digitar `+55` junto duplica o prefixo |
| **Upload por `file_upload` apontando o input** | Clicar no botão de anexo abre o diálogo nativo do sistema, que não se dirige |

### 🔴 Conte os campos de nome antes de preencher

**Regra registrada em 2026-09-07, na segunda vez que o erro aconteceu** (a primeira
foi em 25/08). Um formulário tinha Primeiro Nome, Nome do Meio e Último Sobrenome,
e o perfil antigo do ATS trazia só o primeiro nome e um sobrenome. O agente aceitou
o que estava lá, e isso manda um nome que não é o da pessoa.

| A tela tem | O que entra |
|---|---|
| Um campo de nome completo | `identidade.nome_completo` do perfil de candidatura |
| Três campos separados | `nome_primeiro` · `nome_do_meio` · `nome_ultimo_sobrenome` |
| Assinatura do currículo | `identidade.nome_profissional` |

**Perfil de ATS que já vem preenchido se corrige, não se aceita.** Campo preenchido
não é campo conferido: o valor pode ter vindo errado de uma candidatura antiga.

### 🔴 Conferência obrigatória antes de clicar em enviar

**Regra registrada em 2026-08-25**, nascida de um erro real: eu declarei a
candidatura da alt.bank pronta com o **currículo não anexado** e a **formação em
branco**.

**A causa não foi desatenção, foi conferir a coisa errada.** Eu validei os campos
que *eu* tinha preenchido, em vez de perguntar ao formulário o que ainda faltava.
E campo atrás de botão `+ Add` **não existe no DOM até alguém clicar**, então
seções inteiras (Formação, Idiomas, Redes) eram invisíveis para a varredura.

Antes de qualquer envio, nesta ordem:

1. Listar os campos **obrigatórios ainda vazios**, nunca os preenchidos.
2. Listar as **seções** da página (`h2`, `h3`, `legend`) e conferir uma a uma.
3. Procurar botão **`+ Add`**: cada um esconde uma seção que pode ser obrigatória.
4. Conferir o currículo por `files.length > 0`, não pela existência do campo.
5. **Tirar screenshot e olhar a página inteira**, rolando se precisar.
6. Validar o registro de respostas pelo comando de `RESPOSTAS.md` e comparar
   com o formulário. Respostas pendentes e autorização de envio ausente bloqueiam.
7. Só então clicar em enviar; registrar sucesso apenas com confirmação da plataforma.

⚠️ **A leitura por código mente sobre upload.** Na alt.bank o input do currículo
reportava `files.length` igual a zero enquanto a tela mostrava o PDF anexado. Foi
o screenshot que desempatou.

### 🔴 Campo com máscara não se preenche por código

**O achado mais caro do dia.** Campo de data, moeda, telefone ou CEP guarda o
estado **dentro da biblioteca de máscara**, não no atributo `value` do HTML.

| Tentativa | O que acontece |
|---|---|
| Setar `.value` com o setter nativo mais eventos | A tela mostra o valor e **o site continua achando que está vazio**. O envio é rejeitado com *"Required field"* embaixo de um campo visivelmente preenchido |
| `KeyboardEvent` sintético, caractere a caractere | A máscara **rejeita e limpa** o campo |
| `computer:type`, teclado de verdade | Funciona, mas exige o **Chrome em primeiro plano no sistema**, e ele perde o foco a cada chamada de ferramenta |

**Como isso apareceu:** na alt.bank, seis campos de data (nascimento e o início
das cinco formações) passaram em toda a conferência por código e foram reprovados
pelo servidor no clique de enviar.

**O que fazer:** usar interação suportada para cada campo e conferir o valor
visível; quando a máscara não funcionar, deixar o campo para você e dizer qual
falhou. Não clicar em enviar só para testar um rascunho sem autorização. Após um
envio autorizado, a confirmação da plataforma decide se a candidatura foi enviada.

### 🔴 Leia o arquivo antes de dizer que falta dado

**Mesmo dia, mesmo tipo de erro:** eu disse a você que não sabia o nome da
escola dele com a formação inteira listada em `base_content_pt.json`, arquivo que
eu já tinha lido na mesma sessão.

Antes de afirmar que um dado falta, procurar nos três:

| O dado | Onde está |
|---|---|
| Formação, certificações, idiomas, experiência | `Skills/adapt-resume/base_content_pt.json` |
| Contato, cidade, LinkedIn, pretensão | `vagas/config/perfil-candidatura.json` |
| Nascimento, endereço, autodeclaração | `vagas/data/dados-pessoais.json` (fora do git) |

E um detalhe que muda o preenchimento: **curso e bootcamp não são "ensino
médio"**. No formulário eles entram como `Certification`; `High school` fica só
para o ensino médio de verdade.

### Depois que a candidatura é enviada

1. Status no quadro vira **`Aplicado por IA`** (`quadro.mover(id, 'Aplicado por IA', { por: 'agente' })`). Ele é terminal em
   `src/arquivo.js`, então a vaga não volta ao radar.
2. `Currículo (caminho)` recebe o PDF usado.
3. `Gaps` recebe o que foi respondido, **em especial o que não pode ser editado
   depois**, que é o caso das perguntas de empresa da Gupy.
4. O `ID externo` entra em `data/candidaturas.json`.
5. Guardar a resposta exata e a confirmação em `data/respostas-enviadas/`, como
   define `RESPOSTAS.md`. Pergunta nova entra no banco antes de ser usada; aprovação
   posterior não é autorização retroativa para enviar um rascunho.

### O relatório final

Além do de sempre, dizer: **quantas foram enviadas, quantas ficaram em aba, e o
que falta em cada uma para você fechar.**

## 7. Fechar

Guardar os materiais e registros da rodada. Não commitar nem publicar como efeito
automático da candidatura; seguir a autorização de versionamento do workspace.

O resto não vai pro git de propósito, e não é esquecimento:

| | Por que fica de fora |
|---|---|
| `data/vagas.json` | cache, reconstruído a cada rodada |
| `data/quadro.json` | **o quadro**: estado e histórico de cada vaga. Nunca se apaga; cópia diária em `data/backups/` |
| `Skills/adapt-resume/builds/` | rascunho de trabalho da skill; o entregável é o PDF |

Relatar a você, curto: quantas novas, quantas lidas, o topo da lista, e o que ficou pendente.

---

## Ordem, e por que ela é essa

Espelhar antes de coletar, porque coletar sem saber o que está concluído reofertá o que já foi resolvido. Ler antes de publicar, porque vaga sem nota entra no board com número incompleto. Publicar só as novas, porque o board é radar, não histórico. Currículo por último, porque ele depende da nota final estar fechada.

## O que a tarefa agendada NÃO faz

- **Não gera currículo abaixo de 75%.** Nem `.md`. Vaga de 74% que virar interessante se pede na mão, com `npm run instrucoes -- --id <id>`.
- **Não muda status sem evento comprovado.** Candidatura confirmada pode receber o
  status previsto acima; intenção de aplicar não equivale a envio.
- **Não inventa nada no currículo.** A skill parte do `base_content` verificado e só reordena e realça. Vaga pede skill que você não tem: a skill não entra, vira linha em `Gaps`.
- **Não edita `data/quadro.json` à mão.**
