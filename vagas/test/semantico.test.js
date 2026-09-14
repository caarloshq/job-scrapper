import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aplicar, julgamentoDe } from '../src/semantico.js';
import { compatibilidade } from '../src/score.js';

const dados = {
  versao: 1,
  julgamentos: {
    'inhire:nomad': { nota: 33.5, resumo: 'fintech internacional', gaps: 'descricao curta', lidoEm: '2026-07-30' },
    'gupy:teto': { nota: 99, lidoEm: '2026-07-30' },
  },
};

test('vaga julgada recebe o semantico e fica marcada como lida', () => {
  const v = aplicar({ idExterno: 'inhire:nomad' }, dados);
  assert.equal(v.semantico, 33.5);
  assert.equal(v.lida, true);
  assert.equal(v.resumo, 'fintech internacional');
});

test('vaga nao julgada fica com semantico null e lida false', () => {
  // Isto e informacao, nao erro: quer dizer "ninguem leu esta vaga ainda".
  const v = aplicar({ idExterno: 'gupy:nunca-lida' }, dados);
  assert.equal(v.semantico, null);
  assert.equal(v.lida, false);
  assert.equal(julgamentoDe('gupy:nunca-lida', dados), null);
});

test('o indice final soma as duas partes', () => {
  // Caso real da Nomad: 51,5 deterministico + 33,5 semantico = 85%.
  const v = { idExterno: 'inhire:nomad', score: { determinado: 51.5 }, validada: true };
  aplicar(v, dados);
  assert.equal(compatibilidade(v, v.semantico), 85);
});

test('sem julgamento o indice sai pela metade, e nao passa de 60', () => {
  const v = { idExterno: 'gupy:nunca-lida', score: { determinado: 51.5 }, validada: true };
  aplicar(v, dados);
  assert.equal(compatibilidade(v, v.semantico), 52);
  assert.ok(compatibilidade(v, v.semantico) <= 60, 'sem leitura o teto e o proprio deterministico');
});

test('nota semantica nao passa do teto configurado', () => {
  const v = { idExterno: 'gupy:teto', score: { determinado: 60 }, validada: true };
  aplicar(v, dados);
  assert.equal(compatibilidade(v, v.semantico), 100, 'satura em 100, nao estoura');
});

test('julgamento sobrevive: guarda a PARCELA, nao o total', () => {
  // Se guardasse o total, o frescor pararia de decair e a nota envelheceria
  // mentindo. Guardando a parcela, o total se recalcula sozinho todo dia.
  const v1 = { idExterno: 'inhire:nomad', score: { determinado: 51.5 }, validada: true };
  const v2 = { idExterno: 'inhire:nomad', score: { determinado: 47.5 }, validada: true }; // 4 dias depois
  aplicar(v1, dados); aplicar(v2, dados);
  assert.equal(compatibilidade(v1, v1.semantico), 85);
  assert.equal(compatibilidade(v2, v2.semantico), 81, 'o frescor decaiu e o total acompanhou');
});

test('julgamento sobrevive à troca do id vencedor no dedupe', async () => {
  // Bug real de 2026-07-30: ligar o Greenhouse na Fase 5 fez o dedupe preferir
  // greenhouse:6127944004 sobre remotar:156774, e a nota de 87% da Arco sumiu.
  const { juntar } = await import('../src/dedupe.js');
  const d = { versao: 1, julgamentos: { 'remotar:156774': { nota: 30, lidoEm: '2026-07-30' } } };

  const { vagas } = juntar([
    { idExterno: 'remotar:156774', fonte: 'Remotar', titulo: 'SR Product Designer', link: 'https://job-boards.greenhouse.io/arcoeducacao/jobs/6127944004?utm_source=remotar' },
    { idExterno: 'greenhouse:6127944004', fonte: 'Greenhouse', titulo: 'SR Product Designer', link: 'https://job-boards.greenhouse.io/arcoeducacao/jobs/6127944004' },
  ]);
  assert.equal(vagas.length, 1);
  assert.equal(vagas[0].fonte, 'Greenhouse', 'a ATS de origem vence o agregador');
  assert.ok(vagas[0].idsAlternativos.includes('remotar:156774'), 'o vencedor herda o id antigo');

  aplicar(vagas[0], d);
  assert.equal(vagas[0].lida, true, 'a nota tem que seguir a vaga, nao o id');
  assert.equal(vagas[0].semantico, 30);
});
