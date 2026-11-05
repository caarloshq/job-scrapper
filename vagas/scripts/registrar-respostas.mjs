import fs from 'node:fs';
import path from 'node:path';
import { registrarRespostas, raizDoProjeto } from '../src/registro-md.js';

function arquivoEntrada(nome) {
  if (typeof nome !== 'string' || !nome) throw new Error('USO: --arquivo <JSON dentro do projeto>');
  const absoluto = path.resolve(nome);
  const relativo = path.relative(raizDoProjeto, absoluto);
  if (relativo === '..' || relativo.startsWith(`..${path.sep}`) || path.isAbsolute(relativo)) throw new Error('CAMINHO_INVALIDO: JSON fora do projeto');
  const info = fs.lstatSync(absoluto);
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || fs.realpathSync(absoluto) !== absoluto) throw new Error('CAMINHO_INSEGURO: JSON de entrada não é arquivo regular exclusivo');
  return fs.readFileSync(absoluto, 'utf8');
}

async function stdin() {
  let bruto = '';
  for await (const parte of process.stdin) {
    bruto += parte.toString('utf8');
    if (Buffer.byteLength(bruto) > 1024 * 1024) throw new Error('ENTRADA_GRANDE: máximo de 1 MB');
  }
  return bruto;
}

try {
  const bruto = process.argv.length === 2
    ? await stdin()
    : process.argv.length === 4 && process.argv[2] === '--arquivo'
      ? arquivoEntrada(process.argv[3])
      : (() => { throw new Error('USO: node scripts/registrar-respostas.mjs [--arquivo arquivo.json]'); })();
  const resultado = registrarRespostas(JSON.parse(bruto));
  process.stdout.write(`${resultado.registrado ? 'registrado' : resultado.motivo}: ${resultado.campos || 0} campo(s)\n`);
} catch (erro) {
  process.stderr.write(`${erro.message}\n`);
  process.exitCode = 1;
}
