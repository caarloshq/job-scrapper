# Fontes de vagas: configuração e paridade

O catálogo em `config/catalogo-fontes.json` registra **42 capacidades**: 10 coletores, 5 APIs por empresa, 20 providers internacionais, 4 descobertas por HTML, 1 busca assistida e 2 importações opcionais. Esse número não representa 42 fontes ativas, acessíveis ou validadas ao vivo. Uma fonte pode exigir configuração, estar desativada, não servir ao perfil ou recusar a requisição.

`src/fontes-registro.js` reúne os módulos usados pela rodada. Os critérios continuam em `config/perfil.json` e `config/palavras-chave.json`; ter o mesmo código de fontes em duas instalações não exige ter o mesmo currículo, profissão, salário ou lista de empresas.

## Ver o que existe sem coletar vagas

Execute na pasta `vagas`:

```bash
npm run fontes
npm run verificar:fontes
```

- `fontes` mostra cargo, consultas configuradas e o modo de cada entrada do catálogo. Sinaliza fontes de design fora de um perfil de outra profissão. Não consulta os portais e não confirma a disponibilidade de cada serviço.
- `verificar:fontes` confere a estrutura do catálogo, arquivos de coletores/configuração e correspondência dos providers cadastrados. Não testa login, rede ou qualidade dos resultados.
- Para comparar duas instalações, informe a pasta **vagas** da outra cópia:

```bash
npm run verificar:fontes -- --comparar /caminho/da/outra/copia/vagas
```

A comparação verifica as capacidades do catálogo e hashes dos módulos compartilhados definidos no script. Não compara todo o repositório, todo o perfil ou todos os arquivos de configuração. Habilitação e consultas podem ser diferentes por escolha de cada perfil; paridade de capacidade não exige copiar essas preferências.

## Modos de coleta e seus limites

| Grupo | Fontes | Comportamento |
|---|---|---|
| Coletores locais | Gupy, Remotar, InHire, Vagas Remotas, Coluna Tech | Módulos próprios, sujeitos aos dados publicados e aos filtros do projeto. |
| Nichos de design | Vagas UX, Arc, UX Remote Talent, UX Jobs | O registro inclui esses módulos quando `cargo_alvo` indica design/UX/UI. Com cargo vazio, usa os títulos aceitos para essa decisão. |
| LinkedIn | LinkedIn via Apify | Fluxo existente e separado das novas importações. Pode iniciar Actor/Task e consumir créditos quando configurado; não execute uma rodada só para testar o catálogo. |
| APIs por empresa | Greenhouse, Lever, Ashby, Workable, SmartRecruiters | Exigem empresas e seus identificadores em `config/empresas-ats.json`. Não pesquisam todas as empresas do serviço. |
| Providers internacionais | 20 entradas em `config/fontes-gringas.json` | Código do career-ops com adaptador local para títulos e elegibilidade regional. Cada provider tem seu formato e suas limitações. |
| HTML público | VanHack, Trampos, Dribbble Jobs, Wellfound | Leitura direta de uma listagem pública, procurando links e `JobPosting` disponíveis no HTML. Não é varredura completa nem navegador com JavaScript. |
| Assistida | Authentic Jobs | Só registra a necessidade de conferir no navegador. Não há coletor direto comprovado ou automação de busca para esta entrada. |
| Importação opcional | Indeed, Glassdoor | Desativadas por padrão. Leem JSON local autorizado ou dataset Apify já existente; não são scrapers nativos desses sites. |

### Portais públicos

As entradas ficam em `config/fontes-portais.json`, com `id` e `enabled`. Dribbble Jobs só participa quando o perfil é de design. VanHack, Trampos e Wellfound não têm essa restrição de nicho.

A descoberta considera apenas links do domínio e do formato de vaga previstos pelo respectivo portal. Usa descrições e outros atributos quando há dados estruturados; sem descrição, marca leitura pendente. Os anúncios encontrados permanecem sem validação de disponibilidade e exigem conferência de região e do anúncio original antes da candidatura.

HTTP 403, falhas, limites ou redirecionamentos recusados aparecem como indisponibilidade. HTML sem links verificáveis pode significar conteúdo dinâmico ou alteração da página, não ausência de vagas. Esses estados descrevem o tratamento do código, não uma medição atual de saúde de VanHack, Trampos, Dribbble ou Wellfound. Não há contorno de login, CAPTCHA ou bloqueio do site.

### Lever e outras ATS

Lever já tem implementação de API por empresa em `src/fontes/ats.js`, mas a configuração distribuída nesta integração não contém empresa Lever. Sem uma entrada, essa capacidade não faz consultas a organizações Lever.

Acrescente uma empresa real somente após confirmar o identificador do seu quadro. O formato abaixo é ilustrativo; `slug-confirmado-da-empresa` não é um quadro testado e não deve ser copiado literalmente:

```json
{ "provedor": "lever", "org": "slug-confirmado-da-empresa" }
```

Inclua a entrada em `empresas`, preservando as demais. Um identificador incorreto e um quadro sem vagas podem produzir resultados parecidos; confira a página pública da empresa.

### Providers internacionais

As 20 capacidades do catálogo são Built In, Remotli, We Work Remotely, Jobicy, Torre, RemoteOK, Crypto Jobs, Remotive, Working Nomads, NoDesk, Jobspresso, Himalayas, Get on Board, Landing.jobs, Hacker News Who is hiring, Welcome to the Jungle, a16z Speedrun, 4 Day Week, The Muse e Generalist World.

`enabled` decide quais entradas de `config/fontes-gringas.json` participam. O adaptador usa até cinco termos de `consultas_estreitas` de `palavras-chave.json` nos providers que aceitam consultas. Quando não há essa lista, usa as chaves de `titulo_aceito`. Providers de feed amplo podem buscar o feed e filtrar localmente; não se deve afirmar que todos executam pesquisa por palavra no site.

A elegibilidade regional segue o filtro local, atualmente orientado a Brasil/LATAM. Uma pessoa fora dessa região precisa rever os critérios de localização; selecionar mercado internacional não reescreve automaticamente essa regra.

### Indeed e Glassdoor

Consulte [docs-importadas.md](docs-importadas.md) para o contrato completo e os exemplos. O arquivo `config/fontes-importadas.json` começa com as duas fontes desativadas. Para ativar, é preciso escolher explicitamente:

- `local-json`: lista JSON sob `data`, com campos mapeados e limites de leitura;
- `apify-dataset`: ID de dataset já existente, com `APIFY_TOKEN` apenas no ambiente ou no `.env` local.

Esse módulo só permite GET do dataset existente e nunca inicia Actor/Task. O fluxo de LinkedIn é independente. Não há promessa de gratuidade da conta Apify ou de outros serviços de terceiros. Importações distinguem desativação, erro, importação parcial, vazio confirmado e sucesso; não transformam erro de configuração em “nenhuma vaga encontrada”.

## Exemplo fictício: configurar para Product Owner

Este é um roteiro de configuração, não um perfil real nem uma alteração automática dos dados existentes. Não copie remuneração, senioridade, experiência ou preferências de outra pessoa. Faça primeiro o onboarding previsto em `AGENTS.md` e confirme mercado e currículo com a pessoa.

1. Em `config/perfil.json`, use o cargo-alvo real, por exemplo `"cargo_alvo": "Product Owner"`. Defina mercado, local, modalidade, senioridade e remuneração conforme as respostas dela. Não marque `_configurado` ou confirmações como verdadeiros para pular o onboarding.
2. Ajuste `config/palavras-chave.json` para a profissão inteira. Este trecho mostra apenas algumas chaves; **não substitua o arquivo completo por ele**:

```json
{
  "consultas_amplas": ["Product Owner", "Produto"],
  "consultas_estreitas": ["product owner", "senior product owner", "dono de produto"],
  "titulo_aceito": {
    "product owner": 20,
    "dono de produto": 16
  },
  "cargos_da_area": ["product owner", "dono de produto"],
  "sinais": ["backlog", "priorizacao", "roadmap", "discovery"]
}
```

3. Revise também `cargo_excluido`, `titulo_excluido`, `sinais_equivalentes`, domínios, exclusões e regras de texto. A configuração de design contém termos que não devem decidir a busca de outra profissão. Se Product Manager também fizer parte da busca, inclua-o nos títulos aceitos e retire as exclusões correspondentes; não amplie o cargo sem a confirmação da pessoa. Palavras detectadas não comprovam experiência no currículo.
4. Ajuste separadamente a busca em `config/linkedin.json`, caso use LinkedIn. Confira a lista de empresas ATS e quais providers devem ficar habilitados. O catálogo compartilhado não escolhe essas preferências.
5. Rode `npm run fontes` e `npm run verificar:fontes` para revisar a configuração sem coletar. Com `cargo_alvo: "Product Owner"`, os módulos de nicho de design e Dribbble ficam fora da rodada por esse critério.
6. Só então execute a coleta desejada, sabendo que `npm run rodada` consulta serviços externos e pode acionar o fluxo pago de LinkedIn já configurado. Uma mudança de profissão também exige rever o currículo e o julgamento semântico, não apenas trocar uma palavra na busca.

## Aviso seguro de versão Git

O onboarding e o início da rodada mostram uma consulta de versão. Também é possível pedir apenas o aviso:

```bash
npm run verificar:versao
```

A checagem consulta o branch remoto acompanhado usando `git ls-remote`, com prazo limitado. Não executa `fetch`, `pull`, `stash`, `reset`, commit ou push e não atualiza o projeto automaticamente.

- `current`: o commit local coincide com o branch remoto consultado naquele momento. Alterações locais, quando presentes, são avisadas; seu conteúdo não foi comparado.
- `different`: os commits diferem. Sem baixar o histórico, não classifica a cópia como atrasada, adiantada ou divergente.
- `offline`, `unknown`, `no-git` ou `detached`: não foi possível confirmar a versão nas condições encontradas. Nenhum desses estados equivale a “atualizado”.

O aviso é consultivo e permite continuar. Revise as alterações locais e o histórico antes de escolher como atualizar. A consulta pode não conseguir autenticar em repositórios privados porque não abre login interativo nem executa helpers de credenciais.

## Manter duas instalações com as mesmas capacidades

O sincronizador trabalha com uma lista explícita de arquivos de fontes, registro, catálogo, scripts, testes, documentação e licença. Não copia o repositório inteiro. O destino já precisa conter a integração do registro compartilhado no coletor; o comando não transforma sozinho uma versão antiga do projeto em uma instalação compatível.

Comece sempre pelo plano, sem gravação:

```bash
npm run sincronizar:fontes -- --destino /caminho/da/outra/copia/vagas
```

Confira as mudanças e as configurações que devem permanecer diferentes. Para aplicar o plano:

```bash
npm run sincronizar:fontes -- --destino /caminho/da/outra/copia/vagas --aplicar
```

Arquivos substituídos têm cópia anterior sob `data/backups-fontes/<data-hora>-<sufixo>/` no destino. O script recusa caminhos que escapam do projeto e links simbólicos nos caminhos processados. A lista permitida não inclui `.env`, `perfil.json`, `palavras-chave.json`, `perfil-candidatura.json`, `linkedin.json`, `empresas-ats.json`, currículo, materiais pessoais, quadro ou histórico de candidaturas. A criação de backups não constitui sincronização desses dados.

O objetivo é compartilhar capacidades sem importar consultas privadas ou escolhas do outro perfil. `fontes-importadas.json` existente fica intacto; quando ausente, recebe os exemplos desativados. `fontes-gringas.json` e `fontes-portais.json` preservam os campos existentes e só recebem capacidades ausentes, com nomes/defaults neutros e `enabled: false`. Consultas, medições e URLs particulares da origem não são transferidas. O catálogo é reconstruído apenas com campos estruturais validados e nomes públicos, sem notas particulares. Consulte o plano e ative cada nova entrada no destino somente após configurá-la. `package.json`, o coletor e arquivos pessoais não são copiados por esse comando; a instalação compatível dos scripts e do registro deve existir antes.

Depois, execute os testes em **cada** instalação e repita a comparação:

```bash
npm test
npm run verificar:fontes
npm run verificar:fontes -- --comparar /caminho/da/outra/copia/vagas
```

Com `VAGAS_REDE` ausente do ambiente, `npm test` executa a suíte offline do projeto; não é um atestado de saúde dos sites. Não use `test:rede` ou uma rodada real como substituto silencioso dessa validação. Antes de publicar código, revise o diff e rode `npm run checar:publico`. Não envie `.env`, exportações locais, perfis privados ou currículos para um repositório público.

## Origem e licença

Os providers em `src/fontes/careerops/` vieram de [career-ops](https://github.com/career-ops-hq/career-ops), sob licença MIT. A proveniência local registra o commit `2f7a0d7`, de 23/09/2026; consulte [CREDITO.md](src/fontes/careerops/CREDITO.md) e [LICENSE](src/fontes/careerops/LICENSE). Preserve a licença e os créditos ao redistribuir.

O adaptador `src/fontes/gringas.js` converte os registros para o formato deste projeto. Não há atualização automática a partir do upstream. SmartRecruiters usa o módulo local de ATS; o provider upstream que exige `js-yaml` não faz parte desta cópia. Licença de código não concede permissão para contornar restrições dos sites nem substitui as condições de uso de cada serviço.
