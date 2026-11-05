# Coordenação local de uma rodada

O módulo `vagas/src/operacao.js` oferece uma base para coordenar trabalho de mais de um agente no **mesmo checkout e host**. Ele registra um dono, uma geração de posse, reservas por identidade de vaga, entregas versionadas e intenções de envio. O estado fica em `vagas/data/operacao/`; a geração fica em `vagas/data/controle-operacao.json` e as intenções duráveis em `vagas/data/tentativas-envio.json`. Faça cópia desses dois últimos arquivos junto com o quadro antes de migrar a instalação. Não apague uma intenção incerta para tentar enviar de novo.

Para inspecionar o estado sem iniciar uma rodada, dentro de `vagas/`:

```bash
npm run operacao -- status --dados ./data
```

A CLI também aceita `--json` para ações estruturadas; `--dados` pode apontar para uma pasta isolada de teste. O contrato de código está em `src/operacao.js` e os cenários offline em `test/operacao.test.js`. Rode `node --test test/operacao.test.js` para verificar posse concorrente, geração revogada, revisão por hash e bloqueio de envio incerto.

Antes de uma entrega, o controlador principal reserva a tarefa e chama `fixar_fontes` com um mapa de caminhos locais nos papéis `anuncio`, `base` e `regras`. Cada papel aceita um caminho ou uma lista de caminhos. A entrega deve conter exatamente o manifesto tipado retornado, com `papel`, `caminho` e `hash` para cada arquivo. A revisão confere novamente o mapa e o conteúdo dos arquivos; uma fonte alterada exige nova fixação e revisão. Esses caminhos ficam no diretório de dados da instalação e não devem entrar no repositório.

`npm run rodada`, `npm run apify` e `npm run enriquecer` agora adquirem posse antes de acessar fontes externas; cache, semântico, quadro e contador usam escrita central e rejeitam JSON inválido. A coleta preserva duas vagas parecidas como candidatas distintas quando não há identidade forte. Uma semelhança com vaga concluída no quadro vira conflito para conferência, sem concluir a vaga nova automaticamente.

Antes de considerar uma candidatura, rode `npm run verificar:envio -- <idExterno>`. O comando consulta o opt-in, a leitura atual, o status `Aplicar` no quadro, conflitos de identidade e o registro de tentativas. Ele mostra `precondicoesAtendidas` e sempre retorna `liberadoClique: false`: ainda não há arbitragem de abas nem permissão técnica para preencher ou enviar. A ação `intencao` também registra bloqueio durável e retorna `liberadoClique: false`. A confirmação de envio continua dependendo de prova externa visível.

Uma retomada pede confirmação de que o controlador anterior parou. Um PID ausente ou um prazo vencido, isoladamente, não dão essa confirmação. Um guard órfão de recuperação bloqueia novas escritas: `npm run operacao -- diagnostico --dados ./data` mostra sua condição e fingerprint. A manutenção é offline, após confirmar a parada de todos os processos que acessam o mesmo diretório de dados e registrar uma referência dessa confirmação. Só então `manutencao_guard` pode receber `paradaGlobalConfirmada`, `confirmacaoRef` e o fingerprint do diagnóstico. A ação preserva cópia do guard e revoga a geração antiga; não há takeover automático. O bloqueio local também não coordena outra máquina ou outro checkout.
