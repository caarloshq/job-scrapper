# Caça-vagas: instruções para o agente

Você está na raiz de um projeto que procura vaga remota, pontua contra o currículo de quem usa, e adapta o currículo. Claude Code e Codex leem este arquivo. Não existe outro roteiro.

## Primeiro uso: onboarding antes de qualquer coisa

```bash
cd vagas && npm run onboarding
```

Se a saída disser **"Perfil ainda NÃO configurado"**, o projeto está com valores de exemplo (profissão de design, currículo fictício da "Ana Beatriz Souza", salário de exemplo). **Nada do que você fizer vale até isso mudar.**

Olhe os blocos marcados `ok`: eles vieram do **formulário** (`npm start`, que o `npm run setup` já abre no primeiro uso), que a pessoa preenche no navegador e que grava perfil, mercado, salário, busca do LinkedIn, token e os arquivos de currículo. **Não repergunte o que está `ok`.** Se os blocos 1, 2 e 5 estiverem em `falta`, peça pra pessoa rodar `npm start` e preencher o formulário primeiro: é mais rápido que entrevistar. **Nunca rode `npm start` você mesmo:** ele sobe um servidor e fica esperando.

O que sobra pra você, sempre: o bloco 3 (montar o currículo base a partir dos arquivos em `materiais-fonte/`, entrevistando antes) e o bloco 4 (reescrever `palavras-chave.json` pra profissão dela e confirmar a busca do LinkedIn). Siga o [roteiro técnico](docs/configuracao-tecnica.md) e feche cada bloco com a prova. O `ONBOARDING.md` é o guia para quem usa.

A sua parte é **entrevista**, não formulário: o formulário já pegou os fatos; você pergunta de volta antes de escrever qualquer frase de currículo. Regras que valem nela:

1. **Um bloco de cada vez**, na ordem do `ONBOARDING.md`: quem é → mercado → currículo e LinkedIn → profissão e termos → salário → candidatura automática → Apify. A Apify é a última de propósito: ela só faz sentido com perfil e currículo prontos.
2. **Mercado antes do currículo.** A resposta de nacional, internacional ou ambos (e qual prioriza) decide o idioma do currículo base, as fontes e a moeda. Sem ela, não monte o `base_content`.
3. **Currículo vem do material, nunca da sua cabeça.** A pessoa coloca PDF ou ZIP em `Skills/adapt-resume/materiais-fonte/`; rode `npm run onboarding -- --extrair` e leia os `*.extraido.*`. Cada frase do `base_content` tem que ser rastreável a um trecho ou a uma resposta dela. Se não tem material, entreviste até ter. A skill dona disso é [`Skills/adapt-resume/SKILL.md`](Skills/adapt-resume/SKILL.md), seção "Montando a base pela primeira vez".
4. **Nunca peça o token da Apify.** Diga onde pegar e onde colar (`vagas/.env.example`). Token não passa pelo chat.
5. **Candidatura automática fica desligada** até a pessoa preencher `vagas/config/perfil-candidatura.json` e marcar `autorizado: true`. Enquanto for `false`, você não abre navegador pra preencher nem enviar formulário. Sem exceção.
6. **Feche com `npm run onboarding -- --concluir`.** Ele recusa se faltar bloco.

## Depois do onboarding

| Preciso de | Está em |
|---|---|
| Como a rodada funciona, o que o código faz sozinho e o que é seu | [`vagas/AGENTS.md`](vagas/AGENTS.md) |
| O passo a passo da rodada | [`vagas/RODADA-DIARIA.md`](vagas/RODADA-DIARIA.md) |
| O quadro: estado e histórico de cada vaga | `vagas/data/quadro.json`, escrito só por `vagas/src/quadro.js`. **Nunca apague nem edite à mão.** Pra mover uma vaga por código: `quadro.mover(id, status, { por: 'agente' })` |
| Currículo: base, adaptação por vaga, PDF | [`Skills/adapt-resume/SKILL.md`](Skills/adapt-resume/SKILL.md) |
| Respostas de formulário, quando a candidatura automática estiver ligada | [`vagas/RESPOSTAS.md`](vagas/RESPOSTAS.md) |

## Duas regras que valem sempre

1. **Nunca inventar.** Salário, empresa, número, fato de encaixe, frase de currículo. Sem fonte, não entra.
2. **Falso positivo custa vaga boa.** Descartar é o erro caro. Na dúvida, a vaga passa e vai pra leitura.

## O que nunca vai pro git

`vagas/.env`, `vagas/data/dados-pessoais.json`, os materiais em `materiais-fonte/`, os currículos gerados em `Curriculo/` e os rascunhos em `builds/`. Já estão no `.gitignore`. Se for publicar um fork, rode `npm run checar:publico` antes: ele acusa dado pessoal em arquivo versionável.
