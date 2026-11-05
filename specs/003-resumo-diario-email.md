# A instalação pode enviar um resumo diário de vagas pelo e-mail da própria pessoa

**Data:** 2026-11-05 · **Estado:** ideia futura solicitada; implementação e envio não autorizados nesta etapa.

## Objetivo

Enviar um resumo visual simples, uma vez por dia, com tabelas de vagas e andamento. Cada instalação usa a conexão e o endereço configurados pela própria pessoa. Não depende de conta, token ou automação do mantenedor.

## Resultado proposto

E-mail HTML simples com data/fuso, vagas novas ou relevantes (cargo, empresa, modalidade, nota e link), candidaturas confirmadas e pendências que exigem decisão. Texto alternativo acessível e versão em texto puro. Distinguir enviado, rascunho e incerto; não apresentar tentativa como sucesso. O resumo aponta para os registros; não copia respostas pessoais, salários privados, documentos ou credenciais para o e-mail.

## Configuração futura

Opt-in desligado por padrão. A pessoa escolhe conta/conexão de e-mail, remetente autorizado, destinatário, horário/fuso, se inclui dados de candidaturas e se aceita resumo sem novidade. Usar o conector autorizado existente quando houver; não pressupor Resend, SMTP, Gmail para outras instalações. Nenhuma credencial solicitada no chat. A autorização cobre destinatário e escopo exatos e pode ser revogada.

## Critérios de aceite para uma implementação posterior

1. Prévia HTML/texto com dados fictícios aprovada antes de habilitar envio.
2. Destinatário e remetente conferidos com a conexão configurada; alteração exige nova confirmação.
3. Uma chave idempotente por instalação/dia/fuso, persistida antes do envio. Queda ou resposta incerta não repete automaticamente.
4. Só usar registros com origem e data conferidas, respeitando modo mapear versus candidatar e fonte local/Notion.
5. Testar tabela estreita, links, versão textual, contraste, caracteres PT/EN e ausência de dados sensíveis com fixtures.
6. Registrar recibo ou falha sem conteúdo/credenciais sensíveis; nenhuma falha de e-mail provoca nova candidatura ou nova coleta paga.
7. Agendamento diário separado da rodada de quatro horas; desativação simples e respeitada na execução.

## Decisões em aberto

Provedor/conexão suportada na primeira versão, horário padrão, destinatários permitidos, conteúdo em dia sem novidades e retenção dos comprovantes. Resolver no início da implementação; não inferir valores a partir desta spec.

## Escopo desta entrega

Somente esta especificação. Nenhum template final, serviço de e-mail, automação de envio ou mensagem foi criado.
