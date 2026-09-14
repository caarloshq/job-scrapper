# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Repositório público, Node 20+ sem dependência de biblioteca, Python 3 só pra gerar o PDF do currículo. As superfícies visuais são páginas HTML autocontidas (CSS e JS inline, sem build), servidas por um servidor local mínimo em Node (`vagas/scripts/onboarding.mjs`, e depois o quadro). Rodam em `localhost`, no navegador de quem usa, com internet disponível (fonte pode vir do Google Fonts, com fallback de sistema).

## Users

Uma pessoa procurando emprego remoto, que sabe usar um terminal o bastante pra rodar `npm run`, e que tem o Claude Code ou o Codex instalado. Designer, engenheira de software, produto: a profissão varia, o fluxo não. Ela chega pelo README do GitHub, sozinha, sem ninguém pra perguntar, e quer sair da primeira sessão com o sistema configurado pra ela e o primeiro radar rodando.

Situação de uso: sentada no computador, uma tarde, com o currículo em PDF e o LinkedIn à mão. Não é uma decisão de compra: é uma configuração que ela quer fazer uma vez e esquecer.

**Suposição (brief curto, 2026-09-14):** o leitor padrão é brasileiro e lê português; o mercado alvo pode ser nacional, internacional ou ambos.

## Product Purpose

Procurar vaga remota todo dia em portais, ATS e LinkedIn, pontuar cada uma de 0 a 100 contra o currículo real da pessoa, e deixar o currículo adaptado pronto pras que passam do corte. O onboarding existe pra trocar a configuração de exemplo pela dela sem ela editar um JSON.

Sucesso do onboarding: ela termina o formulário, abre o agente, e a primeira rodada traz vaga da profissão dela, no mercado que ela escolheu, com o currículo dela na base. Nenhum dado pessoal sai da máquina.

## Positioning

Não é agregador de vagas. É um filtro com viés declarado: o dela. O que ele faz que um site de vagas não faz: lê o anúncio inteiro contra o currículo, descarta o que não é remoto ou paga abaixo do piso, e adapta o currículo sem inventar uma linha.

## Operating Context

O fluxo do primeiro uso, e a ordem é fixa:

```
Formulário (7 passos, salva local) → Agente monta o currículo base e os termos de busca → Primeira rodada → Quadro
```

O formulário grava em arquivos do próprio repositório: `vagas/config/perfil.json`, `vagas/config/linkedin.json`, `vagas/.env`, `Skills/adapt-resume/materiais-fonte/`. O agente lê esses arquivos; nunca repergunta o que o formulário já gravou.

## Capabilities and Constraints

- **Tudo local.** Nenhum dado do formulário vai pra servidor externo. O único serviço de fora é a Apify, e só com o token que a pessoa cola.
- **Token nunca aparece de volta na tela** depois de salvo: o formulário mostra "presente" e oferece trocar.
- **Sem conta, sem login, sem cadastro.** A página abre em `localhost` e pronto.
- **Candidatura automática chega desligada** e só liga por decisão explícita da pessoa.
- **Não há imagem de produto nem marca própria.** O que assina é o nome do projeto. Os únicos assets são três prints da Apify, em `docs/img/apify/`.

## Brand Commitments

- **Light mode.** Direção do Carlos, 2026-09-14.
- **Botões azuis.** O acento do sistema é azul, e é a única cor além dos neutros. Direção do Carlos, 2026-09-14.
- Texto sem travessão. Mês, dia e período com inicial maiúscula.
- Tom: direto, em português, sem jargão de recrutamento e sem promessa de emprego.
