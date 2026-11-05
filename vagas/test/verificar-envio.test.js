import { test } from 'node:test';
import assert from 'node:assert/strict';
import { avaliarPrecondicoes } from '../src/verificar-envio.js';

const base = {
  vaga: { idExterno: 'fonte:1', lida: true },
  card: { status: 'Aplicar' },
  autorizado: true,
  transmissao: true,
};

test('pré-condições locais não liberam clique sem arbitragem de navegador', () => {
  const resultado = avaliarPrecondicoes(base);
  assert.equal(resultado.precondicoesAtendidas, true);
  assert.equal(resultado.liberadoClique, false);
});

test('opt-in desligado, anúncio alterado ou identidade ambígua bloqueiam candidatura', () => {
  for (const entrada of [
    { ...base, autorizado: false },
    { ...base, vaga: { ...base.vaga, julgamentoDesatualizado: true } },
    { ...base, vaga: { ...base.vaga, conflitoIdentidade: true } },
    { ...base, transmissao: false },
  ]) {
    const resultado = avaliarPrecondicoes(entrada);
    assert.equal(resultado.precondicoesAtendidas, false);
    assert.equal(resultado.liberadoClique, false);
    assert.ok(resultado.motivos.length);
  }
});
