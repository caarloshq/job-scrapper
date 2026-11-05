# Coordenação local de uma rodada

O módulo `vagas/src/operacao.js` oferece uma base para coordenar trabalho de mais de um agente no **mesmo checkout e host**. Ele registra um dono, uma geração de posse, reservas por identidade de vaga, entregas versionadas e intenções de envio. O estado fica em `vagas/data/operacao/`; a geração fica em `vagas/data/controle-operacao.json` e as intenções duráveis em `vagas/data/tentativas-envio.json`. Faça cópia desses dois últimos arquivos junto com o quadro antes de migrar a instalação. Não apague uma intenção incerta para tentar enviar de novo.

Para inspecionar o estado sem iniciar uma rodada, dentro de `vagas/`:

```bash
npm run operacao -- status --dados ./data
```

A CLI também aceita `--json` para ações estruturadas; `--dados` pode apontar para uma pasta isolada de teste. O contrato de código está em `src/operacao.js` e os cenários offline em `test/operacao.test.js`. Rode `node --test test/operacao.test.js` para verificar posse concorrente, geração revogada, revisão por hash e bloqueio de envio incerto.

Antes de uma entrega, o controlador principal reserva a tarefa e chama `fixar_fontes` com um mapa de caminhos locais nos papéis `anuncio`, `base` e `regras`. Cada papel aceita um caminho ou uma lista de caminhos. A entrega deve conter exatamente o manifesto tipado retornado, com `papel`, `caminho` e `hash` para cada arquivo. A revisão confere novamente o mapa e o conteúdo dos arquivos; uma fonte alterada exige nova fixação e revisão. Esses caminhos ficam no diretório de dados da instalação e não devem entrar no repositório.

`npm run rodada`, `npm run apify` e `npm run enriquecer` agora adquirem posse antes de acessar fontes externas; cache, semântico, quadro e contador usam escrita central e rejeitam JSON inválido. A coleta preserva duas vagas parecidas como candidatas distintas quando não há identidade forte. Uma semelhança com vaga concluída no quadro vira conflito para conferência, sem concluir a vaga nova automaticamente.

Enquanto uma operação mantém a posse, o quadro no navegador recusa mudanças de status feitas fora dela. A interface mostra que a vaga não foi movida e restaura o status exibido. Aguarde a operação encerrar e repita a mudança manualmente; o quadro não guarda uma fila de tentativas.

Antes de considerar uma candidatura, rode `npm run verificar:envio -- <idExterno>`. O comando consulta o opt-in, a leitura atual, o status `Aplicar` no quadro, conflitos de identidade e o registro de tentativas. Ele mostra `precondicoesAtendidas` e sempre retorna `liberadoClique: false`: ainda não há arbitragem de abas nem permissão técnica para preencher ou enviar. A ação `intencao` também registra bloqueio durável e retorna `liberadoClique: false`. A confirmação de envio continua dependendo de prova externa visível.

Uma retomada pede confirmação de que o controlador anterior parou. Um PID ausente ou um prazo vencido, isoladamente, não dão essa confirmação. Um guard órfão de recuperação bloqueia novas escritas: `npm run operacao -- diagnostico --dados ./data` mostra sua condição e fingerprint. A manutenção é offline, após confirmar a parada de todos os processos que acessam o mesmo diretório de dados e registrar uma referência dessa confirmação. Só então `manutencao_guard` pode receber `paradaGlobalConfirmada`, `confirmacaoRef` e o fingerprint do diagnóstico. A ação preserva cópia do guard e revoga a geração antiga; não há takeover automático. O bloqueio local também não coordena outra máquina ou outro checkout.

Uma queda que deixa somente `.escrita.lock` vazio pode ser recuperada por `retomar` com o run correto e parada confirmada, sob guard exclusivo. O lock vazio fica em quarentena. Um dono corrompido ou lock não vazio sem dono continua bloqueado para investigação. Uma revisão tardia de entrega superada é recusada, e a identidade do revisor é normalizada antes de conferir independência.

## Quem registra respostas e perguntas abertas

O maestro/aplicador é o dono do registro antes de retomar ou enviar: banco de perguntas, histórico por vaga, fila de pendências e espelho de revisão seguem `RESPOSTAS.md` (em `vagas/` no público). O preparador devolve rascunho com fonte e lacunas; não atesta preenchimento. O revisor confere consistência entre pacote, registros e fontes e devolve falhas ao principal. Se faltar registro, o principal bloqueia a candidatura e continua trabalho independente. Não há agente de registro autônomo nem captura automática do formulário; revisão por hash não comprova que todos os campos visíveis foram registrados.

## Autonomia e atualização

O onboarding entrega no resumo um prompt pronto para criar a tarefa nativa opcional de quatro em quatro horas. Os papéis permanecem fixos e os auxiliares são despachados em cada execução, com retomada e limite do runtime. Não é um daemon de modelos 24h. A escolha mapear não usa o Chrome para candidaturas; Chrome assistido depende do perfil, conexões e autorizações. A Apify paga compartilha uma intenção diária entre Task e Actor e não repete POST incerto no dia.

As entradas npm tentam a atualização estável antes de carregar os módulos da rodada. A operação recusa a trava de atualização e o atualizador recusa operação ativa. Alteração de código local ou mudança da release sobre dados protegidos bloqueia o avanço. O guia `atualizacao-automatica.md` descreve os limites, incluindo instalações por ZIP. Fonte Notion usa o comando estado e snapshot paginado distinto do quadro.
