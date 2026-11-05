# Respostas de candidatura

Este arquivo decide como
transformar fatos em respostas. O perfil guarda fatos e autorizações; o banco
guarda perguntas, textos e o alcance de cada aprovação.

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

## Toda resposta e pergunta pendente deixa registro

O maestro/aplicador é responsável por salvar o que recebe e o que preenche. O preparador pode sugerir texto com fontes; não marca campo como preenchido nem resposta como aprovada. O revisor independente compara o pacote e seus registros e informa lacunas ao principal. Não existe um agente de memória autônomo nem captura automática do navegador. Os comandos validam os arquivos fornecidos; não descobrem sozinhos um campo omitido do registro.

- `data/perguntas.json` é o banco de perguntas e textos reutilizáveis, com fonte, idioma, escopo e aprovação. Fatos e autorizações continuam no perfil. Resposta interativa nova guarda também a pergunta e a fala original, fonte e data; uma instrução para rascunhar não vira aprovação.
- `data/respostas-enviadas/<id-seguro>-<data>.json` registra o valor efetivamente preenchido em cada campo, inclusive em rascunho: texto aberto integral, alternativas, números, moeda/período, links e referência do anexo. Opcional vazio fica identificado como não preenchido. Documento e autodeclaração sensível ficam apenas na fonte privada, sem valor no histórico.
- `data/pendencias-perguntas-AAAA-MM-DD.json` registra pergunta literal/opções, ID da vaga, empresa, URL/etapa, fonte consultada, o que falta e eventual rascunho não aprovado. Use ID estável por pendência e estados `pendente`, `respondida` e `aplicada`. Omitir uma pergunta numa lista nova não a resolve. Resposta recebida só passa a aplicada após conferência do campo.
- `../revisoes/respostas.md` é a visualização humana: uma seção por empresa/vaga/data/estado, pergunta literal e resposta integral, ou `(falta você)`. Não é outro banco de fatos. Nunca criar `vagas/respostas.md`: em sistemas sem distinção de maiúsculas, esse nome pode sobrescrever este `RESPOSTAS.md`.

Salvar a resposta e sua aprovação antes de usar; salvar o valor efetivo antes de retomar ou transmitir; comparar com o campo real. Se o registro falhar, bloquear essa candidatura, preservar o formulário e continuar trabalho independente. Não registrar como enviada sem confirmação da plataforma. O validador público ainda não reconcilia automaticamente todas as filas datadas nem o Markdown; cabe ao principal conferi-los, e ausência de erro estrutural não comprova cobertura completa.

Os históricos por vaga, pendências e espelho ficam locais e devem entrar na cópia de segurança da instalação. O repositório distribuído contém exemplos versionados de banco/perfil/quadro; depois de personalizá-los, revise o que será publicado. A exclusão do Git não protege um arquivo que já é rastreado.

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
2. Para cada resposta efetivamente usada, salvar em
   `data/respostas-enviadas/<id-seguro>-<data>.json` o texto exato da pergunta e da
   resposta, fonte, escopo, idioma, data e situação da aprovação. Excluir documentos
   e autodeclarações sensíveis do registro; guardar somente a indicação de que
   foram tratados no perfil privado.
3. Executar `node scripts/validar-respostas.mjs --candidatura <arquivo.json>`.
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
