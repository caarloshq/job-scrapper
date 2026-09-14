# Caça-vagas

Encontre vagas compatíveis com seu perfil e prepare um currículo para cada candidatura. O Caça-vagas reúne oportunidades de diferentes sites, organiza as que combinam com sua busca e ajuda você a decidir quais avaliar primeiro.

Você acompanha as oportunidades em um quadro no navegador, da avaliação à entrevista. O Claude Code ou o Codex ajuda a ler os anúncios e adaptar seu currículo com base na sua experiência.

## Para quem é

Para quem quer organizar a busca de emprego e já usa, ou quer aprender a usar, Claude Code ou Codex. A busca inclui vagas remotas e permite considerar vagas híbridas ou presenciais na sua cidade.

O projeto roda no seu computador. A instalação usa alguns comandos no terminal; depois, você preenche um formulário no navegador. O primeiro uso termina no assistente de IA, que prepara seu currículo e ajusta a busca para sua profissão.

Criado por [Carlos Henrique](https://www.linkedin.com/in/caarloshq), Product Designer, a partir da própria busca de trabalho. Esta versão inclui dados fictícios de exemplo para você substituir pelos seus.

## O que você precisa

- **Node.js 20 ou mais recente, Python 3 e Git** instalados no computador.
- **Claude Code ou Codex** com acesso funcionando. O uso depende da sua conta e do plano da ferramenta.
- **Seu currículo em PDF.** O PDF do perfil do LinkedIn é opcional.
- **Uma conta na Apify, se quiser incluir vagas do LinkedIn.** É uma conexão opcional e pode ter custo conforme o uso. Confira os valores no serviço antes de ativá-la.

## Comece aqui

Abra o terminal e execute:

```bash
git clone https://github.com/caarloshq/job-scrapper.git caca-vagas
cd caca-vagas/vagas
npm run setup
```

A instalação verifica o ambiente e abre o formulário no navegador no primeiro uso. Se ela mostrar um erro, copie a mensagem para o Claude Code ou o Codex e peça ajuda para resolver antes de continuar.

1. **Informe o que procura.** Escolha cargo, localização, mercado, salário e modelo de trabalho.
2. **Adicione seu currículo.** Ele será a referência para preparar as próximas versões.
3. **Conclua com a IA.** Abra a pasta `caca-vagas` no Claude Code ou no Codex e cole a instrução exibida no fim do formulário. O assistente prepara o currículo base e confirma os termos de busca com você.

O [guia de primeiro uso](ONBOARDING.md) explica cada etapa e como retomar de onde parou.

## Veja suas primeiras vagas

Depois de concluir a configuração, execute na pasta `vagas`:

```bash
npm run rodada
npm run quadro
```

A primeira instrução busca oportunidades; a segunda abre o quadro no navegador. Peça ao assistente:

> Leia as vagas pendentes, compare com meu currículo e me ajude a escolher quais avaliar primeiro.

Cada vaga recebe uma nota para organizar a leitura. Essa nota não representa sua chance de contratação. O assistente pode preparar um currículo adaptado para as vagas selecionadas; confira o conteúdo antes de usá-lo.

No quadro, você pode mover as vagas entre Avaliar, Aplicar, Já apliquei, Entrevista e Cancelada. Para atualizar a busca, execute outra rodada. A execução diária depende de configurar um agendamento com o assistente.

## Seus dados e as conexões externas

O formulário salva suas respostas e arquivos neste computador, na pasta do projeto, sem enviá-los a um servidor externo. A coleta de vagas consulta serviços externos; a integração com o LinkedIn usa a Apify. Ao trabalhar com seu currículo no Claude Code ou no Codex, o conteúdo usado na conversa depende das configurações e políticas dessa ferramenta.

O projeto configura exclusões do Git para tokens, materiais de currículo e arquivos gerados. Isso não torna todos os arquivos privados automaticamente. Se quiser publicar sua cópia, confira o que será incluído e use a verificação descrita no [guia técnico](docs/configuracao-tecnica.md).

A candidatura automática começa desligada. Você pode preparar currículo e acompanhar vagas sem ativá-la. O [guia de primeiro uso](ONBOARDING.md) explica como configurar essa opção com o assistente.

## Consulte quando precisar

- [Primeiro uso e retomada](ONBOARDING.md)
- [Sites consultados e cálculo da nota](docs/fontes-e-criterios.md)
- [Configuração técnica e roteiro do agente](docs/configuracao-tecnica.md)
- [Instruções para Claude Code e Codex](AGENTS.md)
- [Geração e revisão de currículos](Skills/adapt-resume/SKILL.md)

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
