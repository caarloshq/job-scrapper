# Respostas de candidatura

Este arquivo decide como
transformar fatos em respostas. O perfil guarda fatos e autorizações; o banco
guarda perguntas, textos e o alcance de cada aprovação.

## O registro obrigatório é o Markdown do que foi preenchido

Depois de preencher e conferir um campo, o maestro/aplicador salva a pergunta e o texto literal em `../revisoes/respostas.md`, inclusive quando a candidatura continua em rascunho. Use `npm run registrar:respostas` com o pacote por stdin ou `--arquivo`, conforme o protocolo operacional. `preenchida:true` significa que o aplicador conferiu o valor no formulário; o comando não captura o Chrome. Se a gravação falhar, não avançar para transmissão da candidatura até resolver.

Esse é o único novo registro obrigatório do preenchimento. Não criar outro banco ou JSON por causa desse passo. Bancos, perfis, filas e históricos já existentes continuam preservados para fatos, autorizações, retomada e validações das candidaturas que já os usam. O Markdown guarda texto exato e não substitui autorização, prova de envio nem a fonte dos fatos. Não criar `vagas/respostas.md`, que pode colidir com este arquivo em sistemas sem distinção de caixa.

Entrada do comando: `contexto` com empresa, vaga, id e data YYYY-MM-DD; `campos` com pergunta, texto e `preenchida:true`. Campos não preenchidos ficam fora do texto dado. Respostas multilinha são preservadas integralmente; repetição idêntica não duplica; correção posterior acrescenta histórico. Documento e autodeclaração sensível usam somente `referenciaPrivada`, sem copiar valor. As pendências existentes continuam em seus controles, sem inventar resposta no Markdown.

## Fontes e limites

- Trajetória: `../Skills/adapt-resume/base_content_*.json` e materiais-fonte.
- Preferências, remuneração, autorizações: `config/perfil-candidatura.json`.
- Dados pessoais: `data/dados-pessoais.json`, fora do git. Não copiar esse
  conteúdo para relatórios, exemplos nem para o banco de perguntas.
- Texto aprovado: `data/perguntas.json`, somente dentro de seu `escopo`.
- Empresa e desafio: anúncio completo e página oficial, com URL e data de consulta.

Ausência no currículo significa **não confirmado**. Não demonstra ausência de
parentesco, participação societária, experiência anterior, idioma ou contribuição
open source. Um vínculo confirmado para uma empresa não responde sobre outra.
Cargo anterior não é empresa atual; último salário não é remuneração atual.

## Dados já existentes e perguntas pendentes

O perfil continua sendo a fonte dos fatos e autorizações. O banco e os históricos estruturados já usados pela instalação podem ser preservados e consultados; eles não são um novo requisito para salvar o que foi preenchido. O maestro mantém os bloqueios de perguntas sem resposta e distingue pendente, respondida e aplicada. Omissão numa lista nova não resolve uma pendência. A confirmação de envio exige prova externa; não é inferida de um Markdown ou JSON.

O registrador Markdown não captura o navegador nem descobre campo omitido pelo aplicador. Cabe ao revisor comparar as perguntas e textos com os campos visíveis. Bancos/perfis/quadro de exemplo são versionados na distribuição; revise arquivos personalizados antes de publicar sua cópia. O histórico local e `revisoes/` ficam ignorados no público.

## O que se reutiliza

| `uso` no banco | Procedimento |
|---|---|
| `direta` | Usar o texto final somente com `aprovada: true`, fonte e escopo compatíveis. |
| `contextual` | Ler anúncio, pergunta e opções. Compor resposta para essa candidatura; conferir antes de enviar. |
| `pessoal` | Usar apenas declaração ou autorização explícita sua, nunca dedução de outro atributo. |
| `documento` | Deixar para você, conforme os limites do perfil. |

`resposta` contém apenas o que alguém poderia ler no formulário. Orientações
ficam em `instrucao`; relatos antigos, em `registro_anterior`. Texto alterado que
mude conteúdo ou sentido volta para conferência. Aprovação de uma estrutura não
aprova automaticamente a resposta nova. `aprovada: false` nunca autoriza envio.

Pergunta nova factual: procurar primeiro nas fontes. Se o fato estiver confirmado,
preparar a resposta e registrar a origem; se depender de opinião, decisão ou dado
ausente, perguntar. Não interromper por informação já confirmada no mesmo contexto.

## Como escrever sem um roteiro fixo

1. Identificar o que a pergunta quer avaliar e o que a vaga pede. Distinguir
   requisito obrigatório, desejável e contexto da empresa.
2. Selecionar uma ou duas experiências que respondem a isso. Cada afirmação deve
   apontar para uma fonte do perfil; fatos da empresa apontam para a fonte oficial.
3. Responder a pergunta na primeira frase. Descrever ação, contexto e efeito
   comprovado. Número só entra com origem e crédito correto, nunca por obrigação.
4. Ajustar tamanho ao campo. Resposta binária pode ser só “Sim” ou “Não”; campo
   condicionado pode ser “Não se aplica”. Não acrescentar uma defesa desnecessária.
5. Conferir idioma, limite de caracteres e alternativas reais. Não traduzir nem
   reescrever rótulos de alternativas. Campo livre usa português com acentos ou o
   idioma solicitado pela vaga.

Apresentação livre não tem parágrafo obrigatório sobre a sua empresa atual. A
experiência vem da pergunta, e não de uma sequência universal. Se trocar o nome
da empresa não muda nada no argumento, conferir se faltou uma conexão real.

Não esconder lacuna perguntada nem iniciar toda apresentação por uma lista de
deficiências. Experiência transferível não vira experiência direta. Um resultado
da plataforma ou da equipe não vira resultado individual seu.

### Por que esta empresa?

Com `rascunho.pode_rascunhar` incluindo "por que esta empresa" no perfil, o agente
pode pesquisar e preparar um rascunho para conferência. Ler a vaga e ao menos uma página oficial pertinente. Registrar a URL,
o fato observado e sua ligação com uma experiência confirmada. Não inventar
admiração, uso do produto, afinidade cultural nem motivação pessoal. Se não houver
evidência suficiente, fazer uma pergunta específica. O texto fica pendente até
você conferir aquela candidatura. Teste pessoal, vídeo e proibição expressa de
IA no processo continuam fora dessa autorização.

## Antes de preencher e enviar

1. Executar `node scripts/validar-respostas.mjs` para conferir a integridade do banco.
2. Para cada resposta efetivamente preenchida, salvar o texto exato no Markdown pelo comando acima. Se a candidatura já usa registro em `data/respostas-enviadas/`, mantê-lo coerente sem alterar o que foi enviado; não criar novo JSON apenas para cumprir o salvamento em MD. Excluir documentos
   e autodeclarações sensíveis do registro; guardar somente a indicação de que
   foram tratados no perfil privado.
3. Quando houver registro estruturado da candidatura, executar `node scripts/validar-respostas.mjs --candidatura <arquivo.json>`.
   Esse comando verifica estrutura e bloqueios conhecidos, não comprova os fatos
   nem substitui a leitura editorial e a conferência no formulário.
4. Comparar o texto registrado com o campo preenchido; conferir currículo, opções,
   moeda, regime, nome e seções obrigatórias. Verificar autorização de envio e
   resolver qualquer resposta que ainda aguarde você.
5. Só registrar `enviada` depois da confirmação da plataforma. Guardar data e
   evidência da confirmação. Formulário preenchido é rascunho, não candidatura enviada.

O comando com `--modelo` imprime o formato do registro sem criar candidatura.
Relatos históricos resumidos permanecem históricos; não reconstruir uma frase e
afirmar que foi exatamente a enviada. Antes de reutilizar PDF do acervo, executar
o verificador atual e conferir a adaptação à vaga.
