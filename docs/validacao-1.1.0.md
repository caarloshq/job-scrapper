# A versão 1.1.0 foi validada com fixtures offline

Nesta versão, a rodada recorrente recolhe as fontes com `--forcar`, respeita uma intenção paga da Apify por dia e reutiliza o último run nas rodadas seguintes. O comando manual `npm run apify` continua pedindo disparo: após usar a cota, ele recusa e orienta `--ultimo`; não repete cobrança.

Foram aprovados 441 testes Node sem rede. Os casos incluem concorrência entre processos, preservação de respostas literais, cota por fuso, paginação e identidade Notion, modo de mapeamento e recuperação do atualizador. O checker público passou sem dados pessoais conhecidos e com 26 scripts válidos. A ProvenSec examinou código e histórico disponível: nenhum candidato nas etapas executadas. Revisão independente encontrou problemas de identidade, coleta recorrente e documentação que foram corrigidos antes desta versão.

O formulário recebeu verificação de sintaxe do JavaScript e de escolhas/prompt com fixtures. Não houve servidor ou navegador aberto, chamada paga, candidatura ou conexão Notion real nesse QA. Integrações e apresentação visual continuam sem prova de ponta a ponta. O detector estático apontou fonte comum e hierarquia tipográfica já presentes na versão anterior; não houve alteração da direção visual.

Essas provas verificam invariantes locais. Não medem aumento real de candidaturas por hora, nem certificam segurança integral. A autonomia depende do agendador, computador disponível, conexões e autorizações da própria pessoa. O núcleo não autoriza cliques nem dispensa decisões pessoais.
