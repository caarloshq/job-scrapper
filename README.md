# Caça-vagas

Procura vaga remota todo dia em portais, ATS e LinkedIn, dá uma nota de 0 a 100 pra cada uma contra o **seu** currículo, e deixa o currículo adaptado pronto pras que passam do corte. Roda na sua máquina, com o Claude Code ou o Codex fazendo a parte que código não faz: ler o anúncio inteiro contra a sua trajetória.

Não é agregador de vagas. É um filtro com viés declarado: o seu.

Criado por [Carlos Henrique](https://www.linkedin.com/in/caarloshq), Senior Product Designer, pra própria busca de vaga, e aberto pra quem quiser usar na sua. A versão pública nasceu de uma cópia limpa do sistema pessoal: nada do currículo, dos dados ou do histórico de candidaturas dele viaja aqui.

## O que ele faz

- **Coleta** em portais brasileiros (Gupy, Remotar, InHire, Vagas Remotas, Coluna Tech, Vagas UX), em ATS direto (Greenhouse, Ashby, Workable, SmartRecruiters), em boards internacionais (Arc, UX Remote Talent) e no **LinkedIn**, pela Apify.
- **Descarta** o que não é remoto (ou híbrido e presencial fora da sua cidade), o que é júnior quando você não quer, o que paga abaixo do seu piso, o que não é da sua área, e o que já morreu.
- **Pontua** de 0 a 100: 60 pontos por regra, 40 pelo agente lendo o anúncio contra o seu currículo.
- **Mostra num quadro** no navegador, por fase: Avaliar, Aplicar, Já apliquei, Entrevista, Cancelada. Arrastar o card muda a fase, e nada se perde: o histórico de cada vaga fica no arquivo.
- **Adapta o currículo** pras vagas acima do corte, a partir da sua base, só reordenando e realçando. Nunca inventa.

## Onde ele busca, e o que cada fonte rende

| Fonte | O que é | O que traz |
|---|---|---|
| **LinkedIn**, pela Apify | O Actor `curious_coder/linkedin-jobs-scraper` faz a busca que você configura (cargo, país, remoto, últimos 7 dias) e devolve as vagas com descrição completa | A fonte que mais rende. Numa medição real, 35 de 37 vagas aprovadas numa rodada vieram só dela |
| **Gupy, Remotar, InHire, Vagas Remotas, Coluna Tech** | Portais brasileiros com API pública | Volume nacional, com descrição na maioria |
| **Vagas UX** | Board só de UX e design, remoto | Só entra pra quem é de design |
| **Greenhouse, Ashby, Workable, SmartRecruiters** | ATS consultados empresa a empresa, pela lista em `vagas/config/empresas-ats.json` | Vaga direto na fonte, antes de aparecer em agregador |
| **Arc, UX Remote Talent** | Boards internacionais de remoto | Vaga de fora que aceita candidato da América Latina |
| **Busca `site:`** | Consulta ao Google ou DuckDuckGo pelos termos de `vagas/config/dorks.json`, só quando as outras vêm fracas | O que a API do portal não devolve |

Toda vaga achada por busca passa por um **portão de vida**: o sistema abre a página e confere se a inscrição ainda está aberta. Numa medição, 6 de 7 links que o Google devolveu já estavam mortos.

## Os critérios

Primeiro, o que **descarta** (não é ranking, é porta fechada):

- Não é remota, a não ser que você aceite híbrido ou presencial na sua cidade.
- É júnior, estágio ou trainee, quando você marcou que não quer.
- Paga abaixo do seu piso, quando o anúncio diz valor e período. Sem os dois, passa: descartar por falta de dado custa vaga boa.
- Não é da sua área. Os termos vêm de `vagas/config/palavras-chave.json`, que o onboarding reescreve pra sua profissão.
- Não é vaga de verdade: banco de talentos, cadastro reserva.
- Já morreu: inscrição encerrada, ou 30 dias sem sinal de vida.

Depois, a **nota de 0 a 100**, que é prioridade de leitura, não chance de contratação:

| Parcela | Vale | De onde vem |
|---|---|---|
| Título | 20 | Quão perto do cargo que você busca |
| Sinais | 15 | Palavras do anúncio que indicam encaixe: design system, React, discovery, o que for da sua área |
| Senioridade | 10 | Sênior conta mais; pleno nacional só vale sênior se pagar acima do que você ganha hoje |
| Domínio | 10 | Setores que você quer, como fintech ou SaaS |
| Frescor | 5 | Vaga de ontem vale mais que de mês passado |
| **Leitura** | **40** | O agente lendo o anúncio inteiro contra o seu currículo |

Os 60 primeiros o código recalcula toda rodada. Os 40 custam leitura de verdade e ficam guardados em `vagas/data/semantico.json`. Vaga marcada com `~` ainda não foi lida: não é fraca, é não lida. Com mercado "nacional e internacional", a vaga do mercado que você prioriza sobe e a do outro entra com 6 pontos a menos.

Tudo isso mora em `vagas/config/`, fora do código. Apertar uma regra vale na próxima rodada.

## Comece por aqui

Precisa de Node 20+, Python 3 e o Claude Code ou o Codex.

```bash
git clone <este repositório> caca-vagas
cd caca-vagas/vagas
npm run setup
```

O `setup` confere o ambiente e, no primeiro uso, **abre o formulário de onboarding no navegador**. Sete passos, tudo gravado na sua máquina: quem é você, mercado, currículo e LinkedIn em PDF, profissão, salário, candidatura automática e o token da Apify. Nada sai do seu computador.

Depois, abra o agente na pasta e cole a instrução que o formulário mostra no fim. Ele monta o seu currículo base a partir do PDF, entrevistando antes de escrever, e reescreve os termos de busca pra sua profissão. O roteiro inteiro está em [`ONBOARDING.md`](ONBOARDING.md).

## Todo dia

```bash
cd vagas
npm run rodada     # coleta, filtra, pontua e põe no quadro
npm run quadro     # abre o quadro no navegador
npm run pendentes  # o que ainda não foi lido, no terminal
```

Peça ao agente pra ler as pendentes contra o seu currículo: é a metade da nota que o código não dá. No Claude Code desktop, dá pra agendar a rodada; o passo a passo está em [`vagas/RODADA-DIARIA.md`](vagas/RODADA-DIARIA.md).

## Onde está o quê

| | |
|---|---|
| [`ONBOARDING.md`](ONBOARDING.md) | o primeiro uso, bloco a bloco |
| [`AGENTS.md`](AGENTS.md) | o roteiro que o Claude Code e o Codex seguem |
| [`vagas/`](vagas/) | o radar: coleta, filtro, nota, quadro |
| [`Skills/adapt-resume/`](Skills/adapt-resume/) | o currículo: base, adaptação por vaga, PDF |
| `vagas/config/` | tudo que é decisão sua, fora do código |
| `vagas/data/quadro.json` | o quadro, com o histórico de cada vaga |

## O que nunca vai pro git

Seu token, seus PDFs, seus currículos gerados e seus dados pessoais. Estão no `.gitignore`. Antes de publicar um fork, `npm run checar:publico` acusa dado pessoal em arquivo versionável.

## Duas regras

1. **Nunca inventar.** Salário, empresa, número, fato de encaixe, frase de currículo. Sem fonte, não entra.
2. **Falso positivo custa vaga boa.** Descartar é o erro caro. Na dúvida, a vaga passa e vai pra leitura.

## Créditos

Construído em cima de coisas que já existiam, e que merecem o nome:

- [Apify](https://apify.com) e o Actor [curious_coder/linkedin-jobs-scraper](https://apify.com/curious_coder/linkedin-jobs-scraper), que coleta o LinkedIn por nós. A primeira versão usava o [crawlworks/linkedin-jobs-scraper](https://apify.com/crawlworks/linkedin-jobs-scraper).
- As APIs públicas da Gupy, Remotar, InHire, Vagas Remotas, Coluna Tech, Vagas UX, Arc e UX Remote Talent, e as APIs de vagas do Greenhouse, Ashby, Workable e SmartRecruiters.
- [Claude Code](https://claude.com/claude-code) e [Codex](https://openai.com/codex), que fazem a leitura semântica, montam o currículo base e conduziram a construção deste projeto.
- [ReportLab](https://www.reportlab.com), [pypdf](https://pypdf.readthedocs.io) e [python-docx](https://python-docx.readthedocs.io) pro currículo em PDF e DOCX.
- [Lucide](https://lucide.dev) pelos ícones e [Montserrat](https://fonts.google.com/specimen/Montserrat) pela fonte, via Google Fonts.
- O modelo de currículo segue as boas práticas de ATS reunidas pelo autor; a estrutura em coluna única e texto extraível vem delas.

## Licença

MIT. Veja [`LICENSE`](LICENSE).
