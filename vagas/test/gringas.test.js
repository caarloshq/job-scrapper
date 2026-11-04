import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { partesDoLocal, paraVaga, coletarDe } from '../src/fontes/gringas.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

// Formatos reais de `location`, copiados da rodada comparada de 2026-09-23.
test('parte o campo de local nos quatro formatos que as fontes gringas usam', () => {
  assert.deepEqual(partesDoLocal('Remote · Chile · Brazil'), ['Remote', 'Chile', 'Brazil']);
  assert.deepEqual(partesDoLocal('United States, Remote'), ['United States', 'Remote']);
  assert.deepEqual(partesDoLocal('Remote — Cyprus, Czechia'), ['Remote', 'Cyprus', 'Czechia']);
  assert.deepEqual(partesDoLocal(''), []);
});

const item = (over = {}) => ({
  title: 'Senior Product Designer',
  url: 'https://builtin.com/job/senior-product-designer/8017494',
  company: 'Codelitt',
  location: 'Remote · Brazil',
  ...over,
});
const entrada = { name: 'Built In', provider: 'builtin' };

test('vaga aberta ao Brasil entra, com fonte, id e modelo remoto', () => {
  const v = paraVaga(item(), entrada, 'builtin');
  assert.equal(v.fonte, 'Built In');
  assert.match(v.idExterno, /^builtin:[0-9a-f]{12}$/);
  assert.equal(v.remoto, true);
  assert.equal(v.elegibilidadeLatam, true);
});

// Achado do code review de 2026-09-23: o id era o ultimo pedaco da URL. No Hacker
// News o link costuma ser a home da empresa, e 67 de 257 vagas sumiam como repetidas.
test('duas vagas com o mesmo link de empresa ganham ids diferentes', () => {
  const hn = { name: 'Hacker News', provider: 'hackernews' };
  const a = paraVaga(item({ url: 'https://modash.io', title: 'Senior Product Designer', location: 'Remote' }), hn, 'hackernews');
  const b = paraVaga(item({ url: 'https://modash.io', title: 'Product Designer', location: 'Remote' }), hn, 'hackernews');
  assert.notEqual(a.idExterno, b.idExterno);
});

test('links diferentes que terminam igual ganham ids diferentes', () => {
  const r = { name: 'Remotli', provider: 'remotli' };
  const a = paraVaga(item({ url: 'https://a.jobs.personio.com/job/apply' }), r, 'remotli');
  const b = paraVaga(item({ url: 'https://b.jobs.personio.com/job/apply' }), r, 'remotli');
  assert.notEqual(a.idExterno, b.idExterno);
});

test('o id e estavel entre rodadas', () => {
  assert.equal(paraVaga(item(), entrada, 'builtin').idExterno, paraVaga(item(), entrada, 'builtin').idExterno);
});

test('vaga so EUA sai, mesmo dizendo Remote', () => {
  assert.equal(paraVaga(item({ location: 'United States, Remote' }), entrada, 'builtin'), null);
});

test('vaga so no fuso europeu sai', () => {
  assert.equal(paraVaga(item({ location: 'Remote, EU timezone only' }), entrada, 'builtin'), null);
});

test('vaga sem pais declarado entra marcada como nao sei', () => {
  const v = paraVaga(item({ location: 'Remote' }), entrada, 'builtin');
  assert.equal(v.elegibilidadeLatam, null);
});

test('titulo fora da area sai antes de qualquer coisa', () => {
  assert.equal(paraVaga(item({ title: 'Senior Software Engineer' }), entrada, 'builtin'), null);
  assert.equal(paraVaga(item({ title: 'Graphic Designer' }), entrada, 'builtin'), null);
});

test('data de publicacao em milissegundos vira ISO', () => {
  const v = paraVaga(item({ postedAt: Date.UTC(2026, 8, 20) }), entrada, 'builtin');
  assert.equal(v.publicadaEm, '2026-09-20T00:00:00.000Z');
});

test('fonte que quebra nao derruba as outras e conta como falha', async () => {
  const provedores = {
    quebra: { fetch: async () => { throw new Error('HTTP 500'); } },
    boa: { fetch: async () => [item()] },
  };
  const { vagas, contador } = await coletarDe(
    [{ name: 'Quebra', provider: 'quebra', enabled: true }, { name: 'Boa', provider: 'boa', enabled: true }, { name: 'Desligada', provider: 'boa', enabled: false }],
    async (id) => provedores[id],
  );
  assert.equal(vagas.length, 1);
  assert.equal(contador.falhas, 1);
  assert.equal(contador.consultadas, 2);
});

test('toda fonte ligada na config tem o arquivo da fonte copiado', () => {
  const cfg = JSON.parse(readFileSync(join(RAIZ, 'config/fontes-gringas.json'), 'utf8'));
  for (const f of cfg.fontes.filter((x) => x.enabled)) {
    const arq = join(RAIZ, 'src/fontes/careerops/providers', `${f.provider}.mjs`);
    assert.ok(existsSync(arq), `${f.name}: falta ${f.provider}.mjs`);
  }
});

