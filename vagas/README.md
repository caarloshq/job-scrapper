# Caça-Vagas

Todo dia de manhã, isto procura vaga de Product Designer remota, lê cada anúncio novo contra o seu currículo, dá uma nota de 0 a 100 e publica no Notion. Nas que passam de 75%, já deixa o currículo adaptado pronto.

Você acompanha o board, confere os rascunhos e resolve o que é pessoal. O agente prepara materiais e conduz apenas candidaturas autorizadas.
Respostas e seus limites estão em [`RESPOSTAS.md`](RESPOSTAS.md).

---

## O ciclo, em uma frase

> A primeira rodada pega as vagas e põe no quadro. Na próxima, ela vê as que já foram concluídas e esquece elas.

Card movido para `Já apliquei`, `Entrevista` ou `Cancelada` sai do radar. Continua existindo no banco — só para não ser recoletado amanhã como novidade — mas para de aparecer. `Revisar` não sai: é fila de triagem (link morto ou duplicata) até alguém resolver.

**O quadro é o estado** (`data/quadro.json`, `npm run quadro` pra abrir). Não existe segundo lugar onde a decisão mora. Mover o card *é* a interface. Quem usa Notion pode espelhar a database no mesmo arquivo; o formato é igual.

## Quem faz o quê

| | Faz |
|---|---|
| **Node** | busca nas fontes, dedupe, filtro duro, 60 pontos determinísticos, portão de vida |
| **Claude** | lê a descrição contra o currículo (40 pontos), adapta o currículo |
| **Você** | move o card. E decide o que vira regra |

A rodada registra cada vaga aprovada no quadro sozinha (`src/quadro.js`), com status Avaliar. Não existe passo de publicar.

## A nota de confiança

`Confiança` no board é **um índice de prioridade**, de 0 a 100, já somado. Não é probabilidade de contratação:

| Parcela | Vale | De onde vem |
|---|---|---|
| Título | 20 | quão perto de "Product Designer" |
| Sinais | 15 | design system, discovery, IA, B2B, research |
| Senioridade | 10 | sênior conta mais; júnior nem entra |
| Domínio | 10 | fintech e crédito no topo |
| Frescor | 5 | vaga de ontem vale mais que de mês passado |
| **Semântico** | **40** | Claude lendo o anúncio inteiro contra o currículo |

Os 60 primeiros o Node recalcula toda rodada. Os 40 custam leitura de verdade, então ficam guardados em `data/semantico.json` — versionado no git, e a reconstrução do cache nunca apaga.

**Vaga marcada com `~` não foi lida ainda** e por isso não passa de 60%. Isso é informação, não erro: antes de dizer que uma vaga é fraca, veja se ela foi lida.

Se o anúncio for reeditado depois da leitura, a vaga volta para a fila marcada — a nota antiga falava de outro texto.

## Os filtros que descartam

Não é ranking, é porta fechada:

- **Não é remota.** Qualquer país serve; cidade não importa. Híbrido e presencial saem, em qualquer cidade.
- **É júnior, estágio ou trainee**
- **Salário abaixo de R$ 8.000/mês**, quando valor e período são conhecidos
- **Não é design de produto** — motion, gráfico, moda, cílios, web design, design de marketing
- **Não é vaga** — banco de talentos, cadastro reserva
- **Está morta** — inscrição encerrada, prazo vencido, ou mais de 30 dias sem sinal de vida

Inglês **nunca** bloqueia. B2 basta. Vaga que exige fluência entra com desconto e nota obrigatória em `Gaps`.

Regra do pleno: nacional acima da remuneração de referência em `config/perfil.json` vale sênior; internacional sem salário declarado também; nacional sem salário declarado perde prioridade.

## As quatro camadas de busca

1. **API** de 6 portais — Gupy, Remotar, InHire, Vagas Remotas, Coluna Tech, Vagas UX — mais a camada de **ATS direto**: Greenhouse, Ashby, Workable e SmartRecruiters, consultados por empresa
2. **Busca `site:`** — só quando a camada 1 vem fraca. Pega vaga que a API do portal não devolve
3. **Portão de vida** — abre a vaga e lê o campo `status` no HTML servido. `published` está viva; `frozen` e `closed` estão mortas
4. **LinkedIn**, por uma Task do Apify. Não há scraping próprio aqui: a Task já faz isso, e o código só dispara, espera, baixa o dataset e normaliza. Dispara Task nova a cada `npm run rodada` — dataset sempre fresco, custa crédito Apify e até 8min a mais na rodada

A camada 4 é a que mais rende. Medido em 2026-08-01, das 37 vagas que passaram no filtro, **35 eram exclusivas** dela, e **37 de 37 vinham com a descrição completa** — contra 62 de 64 das outras fontes juntas. Ela precisa de `APIFY_TOKEN` em `vagas/.env`; sem o token, simplesmente não entra e as outras seguem.

A camada 3 não é zelo: numa medição real, de 7 URLs que o Google devolveu, **6 estavam mortas**. Sem o portão, as 6 iriam para o board como vagas abertas.

## O currículo

**Acima de 75%**, a rodada adapta e gera o arquivo. Abaixo, não gera nada.

A adaptação parte do `base_content` verificado e só **reordena e realça** — sobe as skills que a vaga mais pede, abre o resumo pelo que ela valoriza. Nada é inventado. Se a vaga pede algo que você não tem, isso não entra no currículo: vira linha em `Gaps`.

PDF por padrão; DOCX quando o formulário recusa PDF. Sai em `Curriculo/`, e o caminho vai para o campo `Currículo (caminho)` no board.

## Comandos

```bash
npm run rodada        # a coleta: camadas 1, 3 e 4 (Apify dispara Task nova)
npm run pendentes     # o que ainda não foi lido, por potencial
npm run instrucoes    # plano de ênfase das vagas acima do corte
npm run apify         # dispara a Task do LinkedIn isolada, fora da rodada
npm run apify -- --ultimo   # reimporta o último dataset, sem gastar crédito
npm run doctor        # as fontes estão de pé?
npm test              # todos os testes, sem rede
npm run test:rede     # integração, bate na rede de verdade
```

## Configuração

Tudo que é decisão sua mora em `config/`, não no código:

| Arquivo | O que controla |
|---|---|
| `perfil.json` | piso salarial, referência, corte de currículo, pesos |
| `palavras-chave.json` | o que é vaga da área, o que é outra disciplina, o que descarta |
| `dorks.json` | as consultas da camada 2 |
| `mapa-enfase.json` | palavra da vaga → o que realçar no currículo |

Apertar uma regra aqui vale na próxima vez que você olhar — as vistas reaplicam as regras de hoje, não o veredito congelado na rodada em que a vaga entrou.

## Rodada diária

A rodada segue [`RODADA-DIARIA.md`](RODADA-DIARIA.md). Conferir no agendador a
cadência e o horário efetivos; este README não mantém outra configuração.

Aprovações e disponibilidade do runtime são verificadas ao operar a tarefa.

## Onde está o quê

| | |
|---|---|
| [`RODADA-DIARIA.md`](RODADA-DIARIA.md) | o passo a passo que a tarefa executa |
| [`AGENTS.md`](AGENTS.md) | estado real do subsistema, regras invioláveis, **armadilhas já pagas** |
| `data/semantico.json` | as leituras. **É o que dói perder** — vai pro git |
| `data/vagas.json` | cache, reconstruído a cada rodada |
| `data/quadro.json` | o quadro: estado e histórico de cada vaga. Vai pro git; nunca se apaga |

O `AGENTS.md` fecha com uma lista de armadilhas que custaram erro real — link quebrado publicado, salário inventado por um regex guloso, vaga boa descartada por uma palavra de três letras. Antes de mexer em filtro ou em fonte, vale a leitura.

## O que ainda não existe

- **Anexar o arquivo no Notion.** Hoje só grava o caminho em texto. O anexo precisa de um token de File Upload que só você cria, em `vagas/.env`
- **`Vagas UX` no campo `Fonte`.** A opção não existe no board; essas vagas vão com o campo vazio e a fonte escrita no `Resumo`
