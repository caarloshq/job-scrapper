import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const vagas = resolve(fileURLToPath(new URL('../', import.meta.url)));
const raiz = join(vagas, 'data', 'testes-entrada');

test('coleta recebe concessão exata para cache, quadro, backup e rodada', t => {
  mkdirSync(raiz, { recursive: true });
  const dados = mkdtempSync(join(raiz, 'coleta-'));
  t.after(() => rmSync(dados, { recursive: true, force: true }));
  const codigo = `
    import { entrarEscritor } from './src/entrada-operacao.js';
    import * as cache from './src/cache.js';
    import * as quadro from './src/quadro.js';
    entrarEscritor('coleta');
    const c = cache.carregar(); c.vagas.x = { idExterno: 'x' }; cache.salvar(c);
    quadro.registrar([{ idExterno: 'x', titulo: 'Vaga fictícia', empresa: 'Acme' }]);
    quadro.mover('x', 'Aplicar');
    cache.salvarRodada('rodada-' + new Date().toISOString().slice(0, 10) + '.json', { ok: true });
  `;
  const filho = spawnSync(process.execPath, ['--input-type=module', '-e', codigo], {
    cwd: vagas, env: { PATH: process.env.PATH || '', VAGAS_DIR_DADOS: dados }, encoding: 'utf8',
  });
  assert.equal(filho.status, 0, filho.stderr);
  assert.equal(JSON.parse(readFileSync(join(dados, 'quadro.json'), 'utf8')).vagas.x.status, 'Aplicar');
  assert.equal(existsSync(join(dados, 'backups', `quadro-${new Date().toISOString().slice(0, 10)}.json`)), true);
  assert.equal(JSON.parse(readFileSync(join(dados, 'operacao', 'estado.json'), 'utf8')).status, 'encerrada');
});
