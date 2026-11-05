# Atualização automática antes da rodada

`atualizarAutomaticamente({ raiz })`, em `vagas/src/atualizacao.js`, consulta a última release **estável** de o repositório canônico do projeto. O chamador deve executá-la antes de importar o código da coleta e antes de adquirir posse com `entrarEscritor`. Quando a atualização termina, importe o ponto de entrada da rodada: assim a rodada usa os módulos da release recém-instalada.

```js
import { atualizarAutomaticamente } from './vagas/src/atualizacao.js';
const resultado = await atualizarAutomaticamente({ raiz: '/caminho/absoluto/da/instalacao' });
// status: atualizado | sem_atualizacao | bloqueado
// Em seguida, importar dinamicamente a entrada da rodada.
```

O módulo exige um checkout Git no branch. Aceita somente `origin` HTTPS igual a `https://github.com/caarloshq/jobrelay.git` ou a `https://github.com/caarloshq/job-scrapper.git`. A segunda URL preserva instalações anteriores à renomeação que ainda dependem do redirecionamento do GitHub. A API e as releases usam o repositório canônico do JobRelay; o módulo busca a tag na origem canônica, confere sua identidade, exige que o commit instalado seja ancestral do commit publicado e faz somente `git merge --ff-only`. Outro host, sufixo ou esquema de URL bloqueia a atualização, assim como RC, histórico divergente, código local modificado ou conflito. Não há `stash`, `reset`, `force` nem retomada por prazo.

Se quiser atualizar a URL da origem na sua instalação antiga, execute na raiz do checkout:

```bash
git remote set-url origin https://github.com/caarloshq/jobrelay.git
```

Essa troca é opcional e manual; o atualizador não altera o remote.

Uma trava exclusiva fica em `vagas/data/operacao/.atualizacao.lock` até o resultado ser registrado em `vagas/data/atualizacao.json`. A entrada que adquire posse da operação também precisa recusar essa trava; a atualização recusa uma operação ativa ou seus locks. O registro contém somente status, código do motivo, tag, commit e horário; não carrega `.env` nem grava credenciais. Se a aplicação do Git for tentada e falhar, ou se o `HEAD` final não for o commit da release, o resultado é `ATUALIZACAO_APLICACAO_INCERTA` e a trava permanece. A próxima rodada não deve começar. Confirme a parada dos processos, inspecione `HEAD`, índice, árvore e dados preservados, e só então faça manutenção explícita da trava; não há retomada automática ou expiração por prazo.

Uma release que altera `vagas/config/`, `vagas/data/`, `revisoes/`, `Curriculo/`, materiais e builds do currículo, bases de currículo, respostas ou qualquer `.env` é recusada. Alterações locais somente nesses caminhos são aceitas se a release não os toca. A atualização também recusa links simbólicos, hardlinks de destinos, submódulos e mudanças de atributos/filtros Git nos caminhos que seriam atualizados.

Instalações baixadas como ZIP não têm histórico Git e retornam `RAIZ_GIT_INVALIDA`. Para migrar, prepare um checkout Git separado, copie os dados e arquivos pessoais para ele com a instalação parada, confira cada caminho e depois passe a executar a rodada nesse checkout. Não substitua a pasta ZIP no lugar nem descarte `vagas/data/`.

Para diagnóstico manual, execute `node vagas/scripts/atualizar.mjs` na raiz. Ele retorna JSON e código 2 quando bloqueado. A execução real consulta GitHub e pode modificar o código instalado; os testes `node --test vagas/test/atualizacao.test.js` usam somente fixtures locais.

Instalações anteriores à renomeação precisam primeiro seguir a [migração para JobRelay](atualizacao.md#se-você-instalou-antes-da-mudança-para-jobrelay), porque o atualizador antigo recusa o redirecionamento da API. A compatibilidade das duas URLs Git descrita aqui passa a valer depois dessa atualização.
