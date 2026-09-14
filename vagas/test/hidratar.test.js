import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hidratar } from '../src/hidratar.js';

const vaga = (extra = {}) => ({
  titulo: 'Product Designer Sênior', empresa: 'Empresa X',
  descricao: 'design system, discovery, figma, produto financeiro',
  modelo: 'remoto', remoto: true,
  publicadaEm: new Date(Date.now() - 2 * 86400000).toISOString(),
  ...extra,
});

test('hidratar separa ativas de barradas e calcula o índice final', () => {
  const { ativas, barradas } = hidratar([
    vaga({ idExterno: 'a' }),
    vaga({ idExterno: 'b', titulo: 'Designer de Sobrancelhas' }),
    vaga({ idExterno: 'c', modelo: 'presencial', remoto: false }),
  ]);
  assert.equal(ativas.length, 1);
  assert.equal(barradas, 2);
  assert.equal(ativas[0].idExterno, 'a');
  assert.equal(typeof ativas[0].compatibilidade, 'number');
  assert.ok(ativas[0].score, 'score deve estar preenchido');
});

test('vaga sem julgamento semântico não passa do teto determinístico', () => {
  // Isto é informação, não erro: quer dizer que ninguém leu a vaga ainda.
  const { ativas } = hidratar([vaga({ idExterno: 'sem-julgamento-nenhum' })]);
  assert.equal(ativas[0].semantico, null);
  assert.ok(ativas[0].compatibilidade <= 60, `esperava <= 60, veio ${ativas[0].compatibilidade}`);
});
