// Configuração local (data/fonte-estado.json) e importação de snapshot do
// Notion consultado pelo agente via MCP. Não recebe token e não acessa a rede.
import { readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { RAIZ } from '../src/config.js';
import { configuracao, selecionar, importar } from '../src/fonte-estado.js';

function argumento(nome) {
  const i = process.argv.indexOf(nome);
  return i < 0 ? null : process.argv[i + 1];
}

try {
  const fonte = argumento('--fonte');
  const arquivo = argumento('--importar');
  if (fonte && arquivo) throw new Error('Use --fonte ou --importar em comandos separados.');
  if (fonte) {
    const config = selecionar(fonte, argumento('--database-id'));
    console.log(`Fonte de estado: ${config.fonte}${config.databaseId ? ` (${config.databaseId})` : ''}`);
  } else if (arquivo) {
    const caminho = isAbsolute(arquivo) ? arquivo : resolve(RAIZ, arquivo);
    const snapshot = JSON.parse(readFileSync(caminho, 'utf8'));
    const resultado = importar(snapshot);
    console.log(`Notion importado: ${Object.keys(resultado.vagas).length} vagas, ${resultado.paginacao.paginas} página(s), ${resultado.sincronizadoEm}.`);
  } else if (process.argv.length === 2) {
    const config = configuracao();
    console.log(`Fonte de estado: ${config.fonte}${config.databaseId ? ` (${config.databaseId})` : ''}`);
  } else {
    throw new Error('Uso: node scripts/estado.mjs [--fonte local | --fonte notion --database-id ID | --importar data/snapshot.json]');
  }
} catch (erro) {
  console.error(erro.message);
  process.exitCode = 1;
}
