import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { validarBanco, validarCandidatura, modeloCandidatura } from '../src/respostas.js';

const raiz = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
const ler = (caminho) => JSON.parse(readFileSync(caminho, 'utf8'));
try {
  let resultado;
  if (args.length === 1 && args[0] === '--modelo') {
    console.log(JSON.stringify(modeloCandidatura(), null, 2));
  } else if (args.length === 2 && args[0] === '--candidatura') {
    resultado = validarCandidatura(ler(resolve(args[1])));
  } else if (args.length === 0) {
    resultado = validarBanco(ler(resolve(raiz, 'data/perguntas.json')), ler(resolve(raiz, 'config/perfil-candidatura.json')));
  } else {
    console.error('Uso: node scripts/validar-respostas.mjs [--modelo | --candidatura caminho.json]');
    process.exitCode = 2;
  }
  if (resultado) {
    console.log(JSON.stringify(resultado, null, 2));
    process.exitCode = resultado.ok ? 0 : 1;
  }
} catch {
  // Não imprimir trecho do JSON: o arquivo inválido pode conter dado privado.
  console.error('Não foi possível ler ou interpretar o JSON solicitado. Confira o caminho e a sintaxe.');
  process.exitCode = 2;
}
