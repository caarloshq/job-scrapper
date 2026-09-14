import { test } from 'node:test';
import assert from 'node:assert/strict';
import { janela, dataEfetiva, idadeEmDias, pontosFrescor } from '../src/frescor.js';

const agora = new Date('2026-07-29T12:00:00Z');
const diasAtras = (n) => new Date(agora.getTime() - n * 86400000).toISOString();

test('janelas por idade', () => {
  assert.equal(janela({ publicadaEm: diasAtras(3) }, agora), 'nova');
  assert.equal(janela({ publicadaEm: diasAtras(7) }, agora), 'nova');
  assert.equal(janela({ publicadaEm: diasAtras(15) }, agora), 'recente');
  assert.equal(janela({ publicadaEm: diasAtras(30) }, agora), 'parada');
  assert.equal(janela({ publicadaEm: diasAtras(60) }, agora), 'zumbi');
});

test('vaga publicada ha 40 dias mas editada ontem e vaga de ontem', () => {
  const v = { publicadaEm: diasAtras(40), atualizadaEm: diasAtras(1) };
  assert.equal(idadeEmDias(v, agora), 1);
  assert.equal(janela(v, agora), 'nova');
});

test('republicacao tambem conta como sinal de vida', () => {
  const v = { publicadaEm: diasAtras(50), republicadaEm: diasAtras(4) };
  assert.equal(janela(v, agora), 'nova');
});

test('zumbi com prazo futuro e explicito volta para recente', () => {
  const v = { publicadaEm: diasAtras(80), prazo: new Date(agora.getTime() + 30 * 86400000).toISOString() };
  assert.equal(janela(v, agora), 'recente');
});

test('sem data nenhuma nao vira zumbi por omissao', () => {
  assert.equal(janela({}, agora), 'desconhecida');
  assert.equal(dataEfetiva({}), null);
  assert.equal(pontosFrescor({}, agora), 1);
});

test('pontos de frescor decrescem', () => {
  assert.equal(pontosFrescor({ publicadaEm: diasAtras(1) }, agora), 5);
  assert.equal(pontosFrescor({ publicadaEm: diasAtras(6) }, agora), 4);
  assert.equal(pontosFrescor({ publicadaEm: diasAtras(12) }, agora), 2);
  assert.equal(pontosFrescor({ publicadaEm: diasAtras(25) }, agora), 1);
  assert.equal(pontosFrescor({ publicadaEm: diasAtras(90) }, agora), 0);
});

test('data invalida nao explode', () => {
  assert.equal(dataEfetiva({ publicadaEm: 'nao e data' }), null);
});
