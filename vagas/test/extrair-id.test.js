import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extrair, deBase64 } from '../src/busca/extrair-id.js';

test('Gupy com id direto', () => {
  // URL real achada por site:gupy.io em 2026-07-29
  const r = extrair('https://localiza.gupy.io/jobs/11130005');
  assert.deepEqual(r, { fonte: 'Gupy', idExterno: 'gupy:11130005', empresa: 'localiza' });
});

test('Gupy com payload base64', () => {
  // URL real da FCamara. Decodifica para {"jobId":9556901,"source":"gupy_portal"}
  const url = 'https://fcamara.gupy.io/job/eyJqb2JJZCI6OTU1NjkwMSwic291cmNlIjoiZ3VweV9wb3J0YWwifQ==?jobBoardSource=gupy_portal';
  const r = extrair(url);
  assert.equal(r.idExterno, 'gupy:9556901');
  assert.equal(r.empresa, 'fcamara');
});

test('deBase64 devolve null em lixo em vez de estourar', () => {
  assert.equal(deBase64('naoEhBase64Valido!!!'), null);
  assert.equal(deBase64(''), null);
});

test('a mesma vaga pelas duas formas de URL do Gupy cai no mesmo id', () => {
  const a = extrair('https://gruposysmap.gupy.io/job/eyJqb2JJZCI6MTE4MzExMjUsInNvdXJjZSI6Imd1cHlfcG9ydGFsIn0=');
  const b = extrair('https://gruposysmap.gupy.io/jobs/11831125');
  assert.equal(a.idExterno, b.idExterno);
});

test('InHire por uuid', () => {
  const r = extrair('https://mjv.inhire.app/vagas/e2e3ecd3-beb1-4c18-b862-f4f06cc3c726/product-designer-senior');
  assert.equal(r.fonte, 'InHire');
  assert.equal(r.idExterno, 'inhire:e2e3ecd3-beb1-4c18-b862-f4f06cc3c726');
  assert.equal(r.empresa, 'mjv');
});

test('Greenhouse', () => {
  const r = extrair('https://job-boards.greenhouse.io/quintoandar/jobs/4023517009?utm_source=remotar');
  assert.equal(r.idExterno, 'greenhouse:4023517009');
  assert.equal(r.empresa, 'quintoandar');
});

test('Ashby e Lever', () => {
  assert.equal(
    extrair('https://jobs.ashbyhq.com/notion/d177d052-ef57-4900-acf2-d58e9eded620').idExterno,
    'ashby:d177d052-ef57-4900-acf2-d58e9eded620'
  );
  assert.equal(
    extrair('https://jobs.lever.co/ramp/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee').idExterno,
    'lever:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
  );
});

test('host desconhecido e lixo devolvem null', () => {
  assert.equal(extrair('https://exemplo.com/vaga/1'), null);
  assert.equal(extrair('nao e url'), null);
  assert.equal(extrair(null), null);
  assert.equal(extrair('https://portal.gupy.io/job-search/term=Product%20designer'), null);
});
