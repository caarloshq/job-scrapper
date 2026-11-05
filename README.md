# Caça-vagas

Busque vagas para o seu perfil, organize as oportunidades e prepare currículos com a ajuda do Claude Code ou do Codex. Você escolhe entre só mapear vagas e configurar candidaturas assistidas pela sua conexão com o Chrome.

O projeto roda no seu computador e usa suas próprias contas. Você pode acompanhar as vagas no quadro local ou conectar uma database do Notion. A configuração começa desligada para candidaturas e agendamento.

Criado por [Carlos Henrique](https://www.linkedin.com/in/caarloshq), Product Designer, a partir da própria busca de trabalho. O repositório traz dados fictícios para você substituir pelos seus.

## Instale com uma instrução ao assistente

Você precisa de **Node.js 20 ou mais recente, Python 3, Git e Claude Code ou Codex** com acesso ao terminal. Tenha seu currículo em PDF; o PDF do LinkedIn é opcional. A conta Apify também é opcional: ela acrescenta vagas do LinkedIn e pode gerar custo.

Cole no assistente:

> Instale https://github.com/caarloshq/job-scrapper em uma pasta própria, sem sobrescrever projetos existentes. Leia AGENTS.md, ONBOARDING.md e docs/instalar-com-agente.md. Faça o onboarding comigo: profissão, currículo, filtros, quadro local ou minha conexão Notion, e escolha entre só mapear vagas ou configurar candidaturas com minha conexão Chrome. Não peça credenciais no chat. Se eu escolher autonomia, crie uma tarefa nativa a cada quatro horas apontando para vagas/RODADA-DIARIA.md, com Apify paga no máximo uma vez por dia. Mostre no chat o prompt, a tarefa criada e o próximo horário. Se não houver agendador, entregue o prompt e informe que a tarefa ainda não foi criada. Preserve meus dados nas atualizações e confirme antes de qualquer gasto ou ação sem autorização.

O assistente conduz a configuração; você fornece seus dados e confirma as escolhas. O [guia de instalação com agente](docs/instalar-com-agente.md) explica as conexões e a conclusão do onboarding.

## Para instalar pelo terminal

```bash
git clone https://github.com/caarloshq/job-scrapper.git caca-vagas
cd caca-vagas/vagas
npm run setup
```

A instalação verifica o ambiente e abre o formulário no navegador. Informe o que procura, adicione seu currículo e escolha o quadro, o modo de candidatura e a autonomia. Ao terminar, copie a instrução exibida para o seu assistente; ele prepara o currículo base e ajusta a busca com você.

Se a instalação mostrar um erro, copie a mensagem para o assistente e resolva antes de continuar. O [guia de primeiro uso](ONBOARDING.md) mostra como retomar uma configuração incompleta.

## Escolha como acompanhar e conduzir as vagas

| Opção | Como funciona |
|---|---|
| Só mapear | Busca, lê e organiza vagas, sem preencher ou enviar candidaturas. |
| Candidatura assistida no Chrome | O assistente prepara materiais e conduz candidaturas autorizadas pela sua conexão. Perguntas pessoais e consentimentos continuam dependendo de você. |
| Quadro local | Guarda as vagas nesta instalação e abre no navegador. |
| Notion opcional | Usa sua database pela conexão do assistente. Requer configuração e consulta do estado antes de candidatar. |
| Rodada a cada quatro horas | Retoma a busca e a fila com uma tarefa nativa do assistente. A Apify paga fica limitada a uma execução por dia; as demais rodadas reaproveitam as vagas coletadas. |

A tarefa depende do computador, do assistente e das conexões disponíveis. O formulário entrega o prompt de agendamento; ele não cria um serviço que roda com o computador desligado. Os papéis de busca, preparação, aplicação e revisão trabalham durante cada rodada, conforme a capacidade do assistente.

Para uma rodada manual, depois do onboarding:

```bash
cd caca-vagas/vagas
npm run rodada
npm run quadro
```

Se você já estiver na pasta `vagas`, execute apenas os dois comandos `npm`. Para recolher as fontes novamente no mesmo dia, use `npm run rodada -- --forcar`; essa opção preserva o limite diário da Apify. Quem escolhe Notion acompanha a database configurada.

A nota das vagas organiza a leitura; ela não representa sua chance de contratação. Confira o currículo e as respostas antes de usá-los. O assistente deve salvar as perguntas e os textos efetivamente preenchidos em `revisoes/respostas.md`, inclusive em rascunhos. O registro usa um comando local e depende de o aplicador conferir os campos; não captura o Chrome automaticamente.

## Receba e instale atualizações

As versões ficam em [Releases](https://github.com/caarloshq/job-scrapper/releases). Para receber avisos, use **Watch → Custom → Releases** no GitHub, conforme as opções da sua conta.

Instalações feitas com Git verificam releases estáveis antes da rodada e podem se atualizar quando a origem, o histórico e a operação permitem. O atualizador preserva dados e configurações pessoais; mudanças locais de código ou uma operação pendente podem bloquear a atualização. Quem baixou ZIP segue a migração assistida do [guia de atualização](docs/atualizacao.md). Esse guia também explica como atualizar manualmente.

## Use suas contas e confira o que publica

O formulário grava respostas e arquivos na pasta do projeto. A coleta consulta serviços externos, e o conteúdo usado no Claude Code ou no Codex segue as configurações e políticas da sua ferramenta. Notion e Chrome usam as conexões que você autorizar.

Tokens, currículos e arquivos gerados têm exclusões no Git. Antes de publicar sua própria cópia, confira o conteúdo e execute a verificação do [guia técnico](docs/configuracao-tecnica.md): as exclusões não tornam todos os arquivos privados. Documentos, credenciais e autodeclarações sensíveis ficam fora do registro de respostas, com referência ao campo tratado.

## Guias

- [Primeiro uso e retomada](ONBOARDING.md)
- [Instalação com assistente](docs/instalar-com-agente.md)
- [Sites consultados e cálculo da nota](docs/fontes-e-criterios.md)
- [Configuração técnica e roteiro do agente](docs/configuracao-tecnica.md)
- [Atualização e preservação de dados](docs/atualizacao.md)
- [Validação e limites da versão](docs/validacao-1.1.0.md)

## Créditos

Construído em cima de coisas que já existiam, e que merecem o nome:

- [Apify](https://apify.com) e o Actor [curious_coder/linkedin-jobs-scraper](https://apify.com/curious_coder/linkedin-jobs-scraper), que coleta o LinkedIn para o projeto. A primeira versão usava o [crawlworks/linkedin-jobs-scraper](https://apify.com/crawlworks/linkedin-jobs-scraper).
- As APIs públicas da Gupy, Remotar, InHire, Vagas Remotas, Coluna Tech, Vagas UX, Arc e UX Remote Talent, e as APIs de vagas do Greenhouse, Ashby, Workable e SmartRecruiters.
- [Claude Code](https://claude.com/claude-code) e [Codex](https://openai.com/codex), que fazem a leitura semântica, montam o currículo base e conduziram a construção deste projeto.
- [ReportLab](https://www.reportlab.com), [pypdf](https://pypdf.readthedocs.io) e [python-docx](https://python-docx.readthedocs.io) pro currículo em PDF e DOCX.
- [Lucide](https://lucide.dev) pelos ícones e [Montserrat](https://fonts.google.com/specimen/Montserrat) pela fonte, via Google Fonts.
- O modelo de currículo segue as boas práticas de ATS reunidas pelo autor; a estrutura em coluna única e texto extraível vem delas.

## Licença

MIT. Veja [`LICENSE`](LICENSE).
