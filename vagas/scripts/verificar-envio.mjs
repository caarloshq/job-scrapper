#!/usr/bin/env node
import { verificarEnvio } from '../src/verificar-envio.js';

try {
  const id = process.argv[2];
  if (!id || process.argv.length !== 3) throw new Error('USO: npm run verificar:envio -- <idExterno>');
  const resultado = verificarEnvio(id);
  process.stdout.write(`${JSON.stringify(resultado, null, 2)}\n`);
  if (!resultado.precondicoesAtendidas) process.exitCode = 1;
} catch (erro) {
  process.stderr.write(`${erro.message}\n`);
  process.exitCode = 1;
}
