# Instale e configure o JobRelay com um assistente

Abra o Claude Code ou o Codex, conecte as contas que você pretende usar na própria ferramenta e envie uma única instrução:

> Instale o repositório público `https://github.com/caarloshq/jobrelay` em uma pasta minha, leia `AGENTS.md` e `ONBOARDING.md`, conduza o formulário de onboarding comigo e termine os blocos que exigem entrevista. Use somente os fatos dos meus materiais para preparar o currículo e deixe-o para minha conferência. Configure comigo as conexões necessárias na sua própria ferramenta; nunca peça tokens no chat. No resumo do formulário estarão minhas escolhas de quadro, candidaturas e autonomia: siga essa instrução, sem inferir autorizações. Faça a primeira rodada só depois de conferir a configuração e mostre o resultado.

O formulário local abre com `cd vagas && npm start`. Ele grava respostas e arquivos nesta instalação. Na tela final, copie a instrução específica das escolhas feitas e envie ao assistente. Se escolher Notion, informe o ID da database no formulário e conecte o Notion na ferramenta do assistente. A escolha do Chrome apenas pede a configuração posterior de candidaturas assistidas; ela não autoriza o envio de formulários.

Se ativar a autonomia, a instrução final pede ao **agendador nativo do assistente** uma tarefa a cada 4 horas, usando `vagas/RODADA-DIARIA.md` como fonte do processo e limitando a Apify a uma execução por dia. O Node não cria agendamento. A tarefa depende da disponibilidade do computador, do assistente e das conexões. Confirme que ela foi criada e confira o próximo horário mostrado pelo assistente.

Sem autonomia, execute `cd vagas && npm run rodada` quando quiser. Sem token da Apify, a busca continua nas outras fontes.
