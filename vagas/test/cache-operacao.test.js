import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = resolve(fileURLToPath(new URL('../data/testes-cache/', import.meta.url)));
mkdirSync(raiz, { recursive: true });
const dados = mkdtempSync(join(raiz, 'cache-'));
process.env.VAGAS_DIR_DADOS = dados;
const cache = await import('../src/cache.js');
after(() => rmSync(dados, { recursive: true, force: true }));

test('rodada repetida com --forcar substitui somente a versão que leu', () => {
  const nome = 'rodada-2026-11-05.json';
  cache.salvarRodada(nome, { n: 1 });
  cache.salvarRodada(nome, { n: 2 });
  assert.equal(JSON.parse(readFileSync(join(dados, nome), 'utf8')).n, 2);
});
