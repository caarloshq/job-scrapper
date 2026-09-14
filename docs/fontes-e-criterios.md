# Fontes de vagas e critérios de seleção

Detalhes para consultar depois da configuração.

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

