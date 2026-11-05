import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { atualizarAutomaticamente } from '../src/atualizacao.js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const resultado = await atualizarAutomaticamente({ raiz });
console.log(JSON.stringify(resultado));
if (resultado.status === 'bloqueado') process.exitCode = 2;
