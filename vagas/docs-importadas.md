## Indeed e Glassdoor: importação opcional

`src/fontes/importadas.js` importa registros que você já possui. **Não é busca direta, não é um scraper de Indeed/Glassdoor e não inicia Actor ou Task da Apify.** Não existe coletor nativo verificado desses dois sites neste módulo.

As duas entradas em `config/fontes-importadas.json` começam com `habilitada: false`. Só a presença de `APIFY_TOKEN` não ativa a importação. Desativadas não leem arquivos nem chamam a rede. O perfil, currículo, automações de candidatura e configuração existente de LinkedIn não são alterados por este módulo.

### Opção 1: JSON local

1. Exporte dados obtidos por um meio que você esteja autorizado a usar e salve uma lista JSON em `vagas/data/importacoes/indeed.json` (ou `glassdoor.json`). Esses arquivos são dados locais, não exemplos para publicar.
2. Na entrada da fonte, mantenha `tipo: "local-json"` e configure `arquivo` relativo à pasta `data`, por exemplo `importacoes/indeed.json`.
3. Ajuste `campos` ao seu arquivo e só então marque `habilitada: true`.

Exemplo ilustrativo do formato de registro, sem vaga real:

```json
{
  "id": "id-da-vaga-na-origem",
  "title": "Título informado na origem",
  "url": "https://careers.example.com/jobs/exemplo",
  "company": "Empresa informada na origem",
  "location": "Local informado na origem",
  "description": "Descrição informada na origem",
  "publishedAt": null
}
```

O documento precisa ser uma lista (`[ {...}, {...} ]`), não um objeto contendo `jobs`. Os sete mapeamentos são obrigatórios: `title`, `url`, `company`, `location`, `description`, `publishedAt`, `id`. Todos podem ser `null` quando ausentes, exceto `title` e `url`. O valor do mapeamento é o nome real do campo de entrada; caminhos simples como `company.name` são aceitos. Não há tentativa de adivinhar o schema de Actors de terceiros.

### Opção 2: dataset existente da Apify

Use `tipo: "apify-dataset"`, preencha `datasetId` com o ID de um dataset já existente e deixe o token apenas no ambiente `APIFY_TOKEN` ou no `.env` local já usado pelo projeto. Nunca cole tokens no JSON, links, documentação ou chat. A entrada de Glassdoor mostra essa configuração desativada; qualquer uma das duas fontes pode usar qualquer modalidade.

A leitura usa apenas `GET https://api.apify.com/v2/datasets/{id}/items`, com autenticação Bearer no cabeçalho. Não aceita URL arbitrária, não segue redirecionamentos, não inicia execução de coleta e não cria recursos. Acesso ao dataset continua sujeito às permissões e condições da sua conta Apify. A implementação não promete gratuidade de serviços de terceiros. Documentação: [itens do dataset](https://docs.apify.com/api/v2/dataset-items-get) e [autenticação da API](https://docs.apify.com/api/v2).

### Limites, segurança e transparência

- `limitePorPagina`: padrão 100, máximo 1.000. `maxPaginas`: padrão 10, máximo 100. `maxItens`: padrão 1.000, máximo 10.000.
- `timeoutMs`: padrão 20.000, máximo 60.000. O prazo cobre também a leitura do corpo da resposta, não só os cabeçalhos.
- `maxBytes`: padrão 5 MiB, máximo 10 MiB, por arquivo ou página. Arquivos locais precisam estar dentro de `data`; caminhos absolutos, `..` e links simbólicos são recusados.
- Links de vagas aceitam apenas HTTP/HTTPS e domínios web. Credenciais embutidas, IPs literais, nomes locais e parâmetros conhecidos de segredo são rejeitados. O importador não resolve DNS e não visita os anúncios. Seus links não comprovam que a vaga está aberta.
- Sem data ISO válida, `publicadaEm` é `null`, nunca a data de hoje. Modelo remoto e salário ficam desconhecidos (`null`), e `validada` é `false`. `location` é preservado em `localizacao`, sem inventar cidade ou país. O filtro geral do projeto continua podendo reconhecer pistas explícitas no título/descrição.
- IDs da origem são preservados quando seguros. Sem ID, usa-se um hash estável do link normalizado, separado por fonte. Itens repetidos são contados e deduplicados.
- O contador diferencia `desativada`, `erro`, `parcial`, `vazia` e `ok`, com detalhes por fonte. Arquivo ausente, schema incompatível, falta de token e erro da API são falhas, não “zero vagas encontradas”. Páginas já lidas são preservadas se uma posterior falhar.
- Um limite atingido com possível continuação marca `truncada: true`, inclusive quando não há cabeçalho de total para comprovar o fim. Itens inválidos também impedem indicar importação completa. Mensagens de erro não incluem token, corpo da API, caminho privado ou parâmetros de consulta.

Testes offline: `node --test test/importadas.test.js`. Eles usam respostas simuladas e arquivos temporários; não consultam Indeed, Glassdoor ou Apify e não executam serviços pagos.
