# Configure sua busca de vagas

Você vai informar o que procura e adicionar seu currículo em um formulário no navegador. Depois, o Claude Code ou o Codex ajuda a preparar seu currículo base e concluir a configuração.

Tenha seu currículo em PDF e acesso a um desses assistentes. A conexão com o LinkedIn é opcional e pode ficar para depois. Se preferir que o assistente faça a instalação e acompanhe a configuração desde o começo, use o [guia de instalação com agente](docs/instalar-com-agente.md).

## Abra o formulário

Se ainda não instalou o projeto, siga o [README](README.md#para-instalar-pelo-terminal). Para retomar a configuração, abra o terminal na pasta `vagas` e execute:

```bash
npm start
```

Cada etapa salva suas respostas neste computador quando você continua. O formulário não envia suas respostas nem seus arquivos a um servidor externo. Você pode fechar a página e voltar depois.

## 1. Informe o cargo que procura

Preencha seu nome, o cargo desejado e o país onde mora. Use o nome de cargo que você costuma encontrar nos anúncios.

## 2. Escolha onde buscar

Selecione vagas no Brasil, no exterior ou nos dois mercados. Se escolher os dois, indique qual tem prioridade. Essa preferência orienta a busca e o idioma do currículo que o assistente preparará primeiro.

As fontes internacionais atuais procuram oportunidades que aceitam candidaturas da América Latina. Se você mora fora dessa região, informe isso ao assistente antes da primeira busca.

## 3. Adicione seu currículo

Envie a versão mais recente em PDF, com até 15 MB. Você também pode adicionar o PDF do LinkedIn para complementar o histórico; ele é opcional.

O assistente usará esses materiais como referência e perguntará o que precisar esclarecer. Você poderá conferir o currículo preparado antes de usá-lo.

## 4. Conte sua área de atuação

Descreva sua área em uma frase e selecione os níveis de vaga que aceita. O assistente usará isso para ajustar os termos de busca. Nesta versão, estágio e trainee ficam fora da seleção.

## 5. Defina salário e modelo de trabalho

Informe o menor valor mensal que você considera, em reais, e sua remuneração atual. O primeiro valor ajuda a filtrar anúncios com salário informado; o segundo participa da comparação de vagas de níveis diferentes.

Escolha se aceita trabalho remoto, híbrido ou presencial. Para as duas últimas opções, informe a cidade. Anúncios sem salário podem continuar na seleção para você avaliar.

## 6. Escolha quadro, candidaturas e autonomia

Escolha o **quadro local** ou uma **database do Notion** como fonte do estado das vagas. O quadro local é o padrão. Para Notion, informe somente o ID da database no formulário e configure a conexão Notion na ferramenta do assistente. Não envie credenciais no chat.

Em candidaturas, o padrão é **só mapear e avaliar**. Se escolher configurar candidatura assistida no Chrome, o assistente ainda precisará revisar seu perfil, suas respostas e as autorizações necessárias. Essa escolha não libera preenchimento ou envio. O campo `autorizado` do perfil de candidatura permanece `false` depois do formulário.

A rodada recorrente começa **desligada**. Se você a escolher, o resumo pedirá ao assistente que crie uma tarefa no agendador nativo a cada 4 horas. A Apify deve executar no máximo uma vez por dia, mesmo que haja mais rodadas. O formulário grava a política local em `vagas/data/politica-autonomia.json`, mas não cria a tarefa. Ela depende de o computador e as conexões estarem disponíveis.

## 7. Inclua o LinkedIn, se quiser

Essa conexão usa a Apify, um serviço externo de coleta de vagas. Confira os custos na sua conta antes de usá-la. Sem essa conexão, você continua recebendo vagas das outras fontes.

A tela mostra onde copiar a chave de acesso, chamada de token, e onde colá-la. Cole apenas no campo indicado, nunca na conversa com a IA. Você pode deixar o campo vazio e configurar depois.

## Termine a configuração com o assistente

Na tela de resumo, copie a instrução. Abra a pasta do projeto no Claude Code ou no Codex e cole o texto em uma conversa.

O assistente vai:

- Ler seu material e esclarecer informações que faltarem.
- Preparar o currículo no idioma escolhido para você conferir.
- Ajustar a busca à sua profissão e verificar se a configuração está completa.
- Configurar a fonte de estado e o modo de candidatura escolhidos, sem inferir consentimento.
- Se você ativou a autonomia, criar e confirmar no chat a tarefa recorrente de 4 horas no agendador nativo do assistente.

Ao terminar o formulário, tudo está salvo neste computador. A configuração fica concluída depois que o assistente prepara o currículo e ajusta a busca. Aguarde essa confirmação antes de iniciar a primeira busca.

## Faça a primeira busca

Depois da confirmação, execute na pasta `vagas`:

```bash
npm run rodada
npm run quadro
```

No assistente, peça:

> Leia as vagas pendentes contra meu currículo e me ajude a avaliar as oportunidades.

O quadro mostra as vagas por fase. Abra uma para consultar o anúncio e a avaliação; mova-a conforme avançar na candidatura.

## Se precisar retomar ou corrigir

- **O formulário não abriu:** execute `npm start` na pasta `vagas`. Mantenha o terminal aberto enquanto preenche.
- **Quer mudar uma resposta:** volte à etapa correspondente e continue para salvar.
- **Já preencheu, mas ainda não vê vagas:** conclua a parte do assistente e execute a primeira busca.
- **Apareceram vagas de outra profissão:** peça ao assistente para revisar os termos de busca.
- **Deu erro:** copie a mensagem e diga ao assistente em qual etapa aconteceu. Não inclua tokens na mensagem.

Comandos de diagnóstico, campos de configuração e verificações para o agente estão no [guia técnico](docs/configuracao-tecnica.md).
