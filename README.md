# Caça-vagas

Procura vaga remota todo dia em portais, ATS e LinkedIn, dá uma nota de 0 a 100 pra cada uma contra o **seu** currículo, e deixa o currículo adaptado pronto pras que passam do corte. Roda na sua máquina, com o Claude Code ou o Codex fazendo a parte que código não faz: ler o anúncio inteiro contra a sua trajetória.

Não é agregador de vagas. É um filtro com viés declarado: o seu.

## O que ele faz

- **Coleta** em portais brasileiros (Gupy, Remotar, InHire, Vagas Remotas, Coluna Tech, Vagas UX), em ATS direto (Greenhouse, Ashby, Workable, SmartRecruiters), em boards internacionais (Arc, UX Remote Talent) e no **LinkedIn**, pela Apify.
- **Descarta** o que não é remoto (ou híbrido e presencial fora da sua cidade), o que é júnior quando você não quer, o que paga abaixo do seu piso, o que não é da sua área, e o que já morreu.
- **Pontua** de 0 a 100: 60 pontos por regra, 40 pelo agente lendo o anúncio contra o seu currículo.
- **Mostra num quadro** no navegador, por fase: Avaliar, Aplicar, Já apliquei, Entrevista, Cancelada. Arrastar o card muda a fase, e nada se perde: o histórico de cada vaga fica no arquivo.
- **Adapta o currículo** pras vagas acima do corte, a partir da sua base, só reordenando e realçando. Nunca inventa.

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

## Licença

MIT. Veja [`LICENSE`](LICENSE).
