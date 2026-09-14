> Referência para manutenção e para o assistente. Para começar, use o [guia de primeiro uso](../ONBOARDING.md).

# Configuração técnica e roteiro do agente

Este projeto procura vaga remota todo dia, dá uma nota de 0 a 100 pra cada uma contra o **seu** currículo, e deixa o currículo adaptado pronto pras melhores. Ele chega configurado pra Product Designer e com um currículo de exemplo. O onboarding troca tudo isso pelo seu.

**Você não edita JSON.** São duas partes:

**1. O formulário**, no navegador, que grava na sua máquina. Ele abre sozinho no fim do `npm run setup`, no primeiro uso. Pra abrir de novo:

```bash
cd vagas && npm start
```

Sete passos: quem é você, mercado, currículo e LinkedIn em PDF, profissão, salário, candidatura automática, e o token da Apify por último. Cada tela salva ao continuar; pode fechar e voltar depois. No fim, a instrução pronta pra colar no agente, com opção de baixar um resumo em arquivo.

**2. O agente**, pro que formulário não resolve. Abra o Claude Code ou o Codex nesta pasta e diga:

> Quero fazer o onboarding.

Ele lê o `AGENTS.md`, roda `npm run onboarding` pra ver o que o formulário já gravou, e entrevista você só pra montar o currículo base a partir dos arquivos e reescrever os termos de busca pra sua profissão. Cada bloco termina com uma prova, um comando que tem que passar.

Este documento descreve o que cada passo grava e qual é a prova. O formulário cobre os blocos 1, 2, 5, 6 e 7 e recebe os arquivos do 3; o agente fecha o 3 e o 4.

Quer saber onde está a qualquer momento:

```bash
cd vagas && npm run onboarding
```

---

## Antes de começar

| | |
|---|---|
| **Node 20+** | `node --version`. Zero dependência de biblioteca, então não tem `npm install` |
| **Python 3** | gera o PDF do currículo. `npm run setup` instala o que falta |
| **Claude Code ou Codex** | é ele que entrevista, lê os anúncios e dá os 40 pontos que o código não dá |
| **Conta na Apify** | só no último bloco. É o que traz as vagas do LinkedIn |

```bash
cd vagas
npm run setup
npm test
```

Os testes têm que passar **antes** de mexer em qualquer coisa. Se falharem, investigue a mensagem antes de continuar; a causa ainda precisa ser identificada.

---

## Bloco 1: quem é você e o que busca

O agente pergunta, e grava no `vagas/config/perfil.json`:

- Qual cargo você está buscando, como aparece em anúncio (`cargo_alvo`).
- Em que país você mora (`pais`). Importa no bloco 2: os portais "nacionais" são do Brasil.
- Senioridade que você quer, e a que você não quer nem ver.
- Remoto só, ou aceita híbrido. Aqui chega em "remoto só".

**Prova:** `npm run onboarding` mostra o bloco 1 como `ok`.

## Bloco 2: nacional, internacional ou os dois

Esta resposta muda quatro coisas de uma vez, por isso vem antes do currículo:

| Você responde | O que muda |
|---|---|
| **Nacional** | Só portais brasileiros. Currículo base em português. |
| **Internacional** | Só fontes internacionais e ATS direto. Currículo base em inglês. Nível de inglês vira pergunta obrigatória. |
| **Ambos** | Tudo ligado, e o agente pergunta **qual você prioriza**. A vaga do mercado prioritário sobe na nota; a do outro entra com desconto, nunca é descartada. Currículo base primeiro no idioma do prioritário, depois no outro. |

Duas coisas que o mercado **não** muda, pra não prometer o que o código não faz: o piso de salário continua em reais, e vaga em dólar ou euro é convertida por um câmbio grosseiro do `perfil.json` só pra comparar ordem de grandeza. E as fontes internacionais só deixam passar vaga que aceita candidato da América Latina; quem mora fora dela precisa pedir ao agente pra ajustar a lista `ACEITA` em `vagas/src/fontes/intl.js`.

Vai pra `perfil.json` → `mercado`. As fontes ligam e desligam sozinhas a partir daí.

**Prova:** `npm run onboarding` mostra o bloco 2 como `ok`, com o foco escolhido.

## Bloco 3: seu currículo e seu LinkedIn

Dois PDFs, no formulário (ou direto em `Skills/adapt-resume/materiais-fonte/`, como `curriculo.pdf` e `linkedin.pdf`):

1. **Seu currículo atual** em PDF. Obrigatório: é dele que o agente monta a sua base.
2. **Seu LinkedIn** em PDF, opcional. No seu perfil, "Mais" → "Salvar como PDF". Traz o histórico completo de experiências.

Fatos da sua empresa atual que não estão no currículo (métricas, datas, o que você construiu) entram na entrevista com o agente.

O formulário já extrai o texto ao salvar. Se colocou os arquivos à mão:

Depois:

```bash
npm run onboarding -- --extrair
```

Isso transforma PDF e ZIP em texto (`*.extraido.txt`, `*.extraido.md`) pro agente ler. O original fica lá só pra conferência. 

**Aí o agente te entrevista antes de escrever uma linha.** O que você quer destacar primeiro, quais números você confia pra travar, o que vale mais quando duas experiências disputam espaço, se algum fato do material está ambíguo. Só depois ele monta o `base_content_pt.json` (ou `_en.json`, conforme o bloco 2), seguindo o esquema que já está lá, **sem inventar nada**: cada frase rastreável a um trecho do material ou a uma resposta sua.

Três campos merecem sua atenção nessa hora:

- **`numeros_travados`**: resultados que nunca podem ser alterados nem arredondados em adaptação nenhuma.
- **`nunca_citar`**: trechos que você não quer ver em currículo nenhum (uma métrica antiga, um cargo que não usa mais). O verificador barra.
- **`regras_extra`**: regra fixa da sua carreira, tipo "cargo atual é X" ou "o bullet de liderança é sempre o último".

**Prova:**

```bash
cd ../Skills/adapt-resume
python3 generate_resume.py base_content_pt.json base_resume_pt.pdf
python3 verificar_resume.py base_resume_pt.pdf base_content_pt.json
```

Tem que sair `ok — dentro das regras` (é o texto que o verificador imprime). Troque `pt` por `en` se o seu base é em inglês. E abra o PDF: ele é o seu currículo daqui pra frente.

## Bloco 4: sua profissão e os termos de busca

O sistema chega procurando design. O agente lê `vagas/config/palavras-chave.json` e reescreve **inteiro** pra sua área, mantendo o formato. Os campos que mais importam:

| Campo | O que é | Exemplo, design → front-end |
|---|---|---|
| `titulo_aceito` | títulos que são da área, com peso 0 a 20 | `product designer: 20` → `desenvolvedor front end: 20` |
| `cargo_excluido` | **cargo vizinho que casa por acidente** | design excluía `software engineer`; front-end tem que excluir o contrário |
| `titulo_excluido` | mesma palavra, outra profissão | `sobrancelha`, `moda` → `caminhao`, `civil` |
| `sinais` | palavra no anúncio que indica encaixe com você | `design system`, `figma` → `react`, `typescript` |
| `dominio_alto` / `medio` | setores que você quer | mantenha os seus |
| `termo_busca_larga` | o termo mais amplo que ainda é da sua área | `designer` → `desenvolvedor` |

⚠️ **`cargo_excluido` é o campo que mais erra.** Excluir `marketing` barrava "Product Designer, Marketing Cloud", que era vaga boa. Exclua o cargo, não o assunto. Falso positivo custa vaga boa, e é o erro mais caro deste sistema.

Quem não é de design fica sem a fonte `Vagas UX`, um board só de UX: o formulário decide isso pelo que você escreveu na área, e o agente confere. E escreve a **busca do LinkedIn** em `vagas/config/linkedin.json` (`busca.keywords`, com o país do bloco 1): é ela que a Apify roda no bloco 7.

**Prova:** `npm test` continua verde, e `profissao_confirmada` vira `true` no `perfil.json` quando você aprovar a lista.

## Bloco 5: salário e limites

No `perfil.json`:

- **`minimo_mensal_brl`**: abaixo disso a vaga é descartada. Só vale quando o anúncio diz valor **e** período.
- **`referencia_atual_brl`**: o que você ganha hoje. Vaga de nível abaixo só conta como sênior se pagar acima disso.
- **`frescor`**: quantos dias sem sinal de vida até a vaga virar "parada". Padrão: 30.
- **Modelo de trabalho:** remoto vale em qualquer lugar. Marque híbrido ou presencial e diga a sua cidade: vaga híbrida ou presencial que não cita a cidade fica de fora, e a busca do LinkedIn deixa de filtrar só remoto.

Os valores que estão lá são exemplo. O agente pergunta os seus e marca `salario_confirmado: true`.

**Prova:** `npm run onboarding` mostra o bloco 5 como `ok`.

## Bloco 6: candidatura automática, desligada

O projeto sabe preencher formulário de vaga no navegador, com um banco de respostas que você aprova uma a uma. **Isso chega desligado**, e continua desligado até você preencher `vagas/config/perfil-candidatura.json` e marcar `autorizado: true`. Enquanto isso, o agente prepara currículo e rascunho, e a candidatura é sua.

O agente explica o que é, e pergunta se você quer ligar agora. "Não" é a resposta padrão, e não tem prova: o bloco fecha sozinho.

## Bloco 7: a Apify, por último

A integração com o LinkedIn usa um coletor na Apify. Consulte os valores e créditos atuais no serviço antes de executar.

1. Crie uma conta em [apify.com](https://apify.com). Confira os créditos e os valores disponíveis na conta.
2. Abra a página do Actor: [console.apify.com/actors/hKByXkMQaC5Qt9UMN/input](https://console.apify.com/actors/hKByXkMQaC5Qt9UMN/input).
3. No canto superior direito, clique em **API** e depois em **API clients**.
4. Abre uma janela com o campo **API token** no topo, já com "Default API token created on sign-up" selecionado. Clique no **ícone de copiar** ao lado do campo. Não precisa criar token novo, e não precisa do código que aparece embaixo.
5. Copie `vagas/.env.example` para `vagas/.env` e cole o token em `APIFY_TOKEN`.

Os três cliques, em imagem: [o botão API](img/apify/01-botao-api.webp), [o menu com API clients](img/apify/02-menu-api-clients.webp) e [a janela com o ícone de copiar](img/apify/03-api-clients-copiar-token.webp).

Só isso. O caminho alternativo, se a janela mudar de lugar: Settings → API & Integrations → Personal API tokens. A busca já está em `vagas/config/linkedin.json`, escrita no bloco 4, e a rodada dispara o Actor com ela. O `.env` está no `.gitignore`: o token nunca vai pro git. Sem token, tudo o resto funciona; só o LinkedIn fica de fora.

Prefere mexer na busca pelo site da Apify? Abra o [Actor](https://console.apify.com/actors/hKByXkMQaC5Qt9UMN/input), configure, clique em **Save as new task** e cole o id (`usuario~task`) em `APIFY_TASK`. Com a Task, o `linkedin.json` é ignorado.

**Prova:** `npm run doctor` mostra `APIFY_TOKEN no .env` como `ok` e diz qual busca vai rodar. Pra ver a fonte funcionando sem esperar a rodada: `npm run apify`.

---

## Fechar

```bash
npm run onboarding -- --concluir
npm run doctor
npm run rodada
npm run quadro
```

O `--concluir` só marca o perfil como configurado se os blocos 1 a 5 fecharam. A `rodada` busca, pontua e põe cada vaga aprovada no quadro, em Avaliar; `quadro` abre o quadro no navegador. `npm run pendentes` lista, no terminal, o que ainda não foi lido. Se aparecer vaga de outra profissão, volte ao bloco 4: `cargo_excluido` está faltando alguém.

Depois peça ao agente:

> Leia as vagas pendentes contra o meu currículo e registre o julgamento de cada uma.

Essa é a metade que o código não consegue fazer sozinho: os 40 pontos de leitura.

## Onde ver as vagas: o quadro

```bash
cd vagas && npm run quadro
```

Abre no navegador as vagas por fase: Avaliar, Aplicar, Já apliquei, Entrevista, Cancelada. Arrastar o card muda a fase; a vista de tabela faz o mesmo por um seletor, ordenada por nota. Cada card abre em detalhes com o resumo da leitura, os gaps, o link do anúncio e o histórico de fases.

O que muda no sistema quando você move um card: `Já apliquei`, `Entrevista` e `Cancelada` tiram a vaga do radar, e a rodada seguinte não a oferece de novo. `Avaliar` e `Aplicar` continuam ativas.

**Histórico local.** O quadro fica em `vagas/data/quadro.json`, que vai pro git, e guarda o histórico de cada vaga, inclusive das que já saíram da coleta. Antes da primeira gravação de cada dia, uma cópia vai pra `vagas/data/backups/`. Quem usa Notion pode continuar publicando lá pelo agente; o formato do arquivo é o mesmo.

## Rodar sozinho

No Claude Code desktop, peça ao agente uma tarefa agendada que execute o `vagas/RODADA-DIARIA.md`. Rode uma vez na mão antes: a aprovação de ferramenta só grava a partir da primeira execução. No Codex, rode `npm run rodada` quando quiser.

---

## Duas regras que não se negociam

Nasceram de erro real e estão em `vagas/AGENTS.md` com o caso que as originou.

1. **Nunca inventar.** Salário, empresa, número, fato de encaixe, frase de currículo. Sem fonte, não entra.
2. **Falso positivo custa vaga boa.** Deixar ruído passar é barato; descartar vaga boa por uma palavra de três letras não é. Aconteceu: `"cad"` casou dentro de `"Risco Sacado"` e matou a melhor vaga da lista.
