# Receba avisos de versões e preserve seus dados ao atualizar

As versões publicadas ficam em Releases, com acesso pelo [README](../README.md#versões-e-atualizações). Cada release identifica uma tag, mudanças, limites e o código disponível para download. A versão 1.1.0 inclui a padronização de fonte de estado, registro Markdown, autonomia e atualização. O QA é local; não houve piloto real de candidaturas nesta entrega.

## Como saber de uma versão nova

No GitHub, abra **Watch → Custom → Releases** para acompanhar publicações, conforme suas preferências de notificação da conta. Consulte a página de Releases para pré-releases; elas não devem ser tratadas como a versão estável mais recente. Uma release não instala atualizações no computador. As entradas `npm run rodada`, `apify` e `enriquecer` tentam aplicar a release estável antes de importar o código da operação. O atualizador usa origem e tag conferidas, avanço linear e exclusão com a operação. Código local alterado, operação ativa, origem divergente ou release que toca dados protegidos impedem a atualização sem apagar arquivos. Consulte [os detalhes e bloqueios](atualizacao-automatica.md). Não há atualização automática a partir de ZIP; o caminho recomendado é instalação por Git com o assistente.

`npm run verificar:versao`, dentro de `vagas/`, compara commits do branch acompanhado com o remoto. Esse comando não consulta releases, não atualiza arquivos e pode informar versão desconhecida numa pasta baixada por ZIP ou num checkout de tag.

## Se você clonou com Git

Peça ao assistente para conferir origem, branch, versão instalada e alterações locais antes de atualizar. Ele deve fazer cópia dos dados, perfis, credenciais e configurações personalizadas e comparar o código de destino. Use uma pasta de cópia dentro do seu projeto e mantenha-a fora de commits públicos. Não use reset, limpeza ou substituição de dados como atualização.

Para consultar tags sem trocar seus arquivos:

```bash
git fetch origin --tags
git tag --list 'v*'
```

Uma atualização estável pelo branch principal pode usar `git pull --ff-only` depois de resolver e preservar suas alterações; isso acompanha `main`, não instala automaticamente uma pré-release publicada em outra branch. Para avaliar um RC, o assistente deve preparar uma cópia isolada da tag escolhida, comparar as diferenças e portar o código compatível sem substituir os dados da instalação. Nunca iniciar duas operações apontando para os mesmos dados.

## Se você baixou um ZIP

O ZIP não acompanha atualizações do Git. Baixe a versão escolhida em outra pasta e compare antes de migrar. O assistente pode ajudar; você também pode fazer a atualização manualmente. Preserve `.env`, perfis, currículo-base e materiais, `vagas/data/` inteiro e `revisoes/`. Dentro de `data/`, perguntas, histórico por vaga, pendências, quadro, gerações e tentativas de envio não são cache descartável. Não os substitua pelos exemplos do download.

Depois da atualização, confira a configuração e os registros com os comandos de diagnóstico e validação antes de rodar busca ou retomar candidaturas. Um envio incerto permanece bloqueado mesmo depois de atualizar.

## Publicar uma versão deste projeto

O mantenedor escolhe um commit revisado, confere os checks, define a tag e escreve notas com mudanças, validação, instruções de atualização e limites. RCs são marcados como pré-release e não como `latest`. Uma release pode apontar para um commit de uma PR sem fundi-la em `main`; nesse caso, as notas precisam informar isso. O pacote é o código público daquela tag: dados de uma instalação nunca são anexados.

Referência: [GitHub Docs — releases](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases).
