import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fontesAtivas, descontoMercado, idiomaDoCurriculo, validar } from '../src/mercado.js';

const FONTES = [
  { NOME: 'Gupy' }, { NOME: 'Remotar' }, { NOME: 'Vagas UX' },
  { NOME: 'Arc' }, { NOME: 'ATS internacional' }, { NOME: 'LinkedIn (Apify)' },
];
const nomes = (lista) => lista.map((f) => f.NOME);

test('foco nacional desliga as fontes internacionais e mantém o LinkedIn', () => {
  const ativas = nomes(fontesAtivas(FONTES, { mercado: { foco: 'nacional' } }));
  assert.deepEqual(ativas, ['Gupy', 'Remotar', 'Vagas UX', 'LinkedIn (Apify)']);
});

test('foco internacional desliga os portais brasileiros', () => {
  const ativas = nomes(fontesAtivas(FONTES, { mercado: { foco: 'internacional' } }));
  assert.deepEqual(ativas, ['Arc', 'ATS internacional', 'LinkedIn (Apify)']);
});

test('ambos liga tudo, e fontes_desligadas tira uma pelo nome sem tocar em código', () => {
  const ativas = nomes(fontesAtivas(FONTES, { mercado: { foco: 'ambos' }, fontes_desligadas: ['Vagas UX'] }));
  assert.equal(ativas.length, 5);
  assert.ok(!ativas.includes('Vagas UX'));
});

test('sem mercado no perfil, nada muda: liga tudo', () => {
  assert.equal(fontesAtivas(FONTES, {}).length, 6);
});

test('desconto só existe em "ambos" com prioridade, e nunca descarta', () => {
  const nacional = { descricao: 'Vaga de designer em São Paulo, salário em reais', salario: { moeda: 'BRL' } };
  const internacional = { descricao: 'Remote role, we pay in USD', salario: { moeda: 'USD' } };
  const ambosInt = { mercado: { foco: 'ambos', prioridade: 'internacional', desconto_fora_da_prioridade: 6 } };
  assert.equal(descontoMercado(internacional, ambosInt), 0);
  assert.equal(descontoMercado(nacional, ambosInt), 6);
  const ambosNac = { mercado: { foco: 'ambos', prioridade: 'nacional' } };
  assert.equal(descontoMercado(nacional, ambosNac), 0);
  assert.equal(descontoMercado(internacional, ambosNac), 6);
  assert.equal(descontoMercado(internacional, { mercado: { foco: 'nacional' } }), 0);
  assert.equal(descontoMercado(internacional, { mercado: { foco: 'ambos' } }), 0);
});

test('idioma do currículo base segue o mercado', () => {
  assert.equal(idiomaDoCurriculo({ mercado: { foco: 'nacional' } }), 'pt');
  assert.equal(idiomaDoCurriculo({ mercado: { foco: 'internacional' } }), 'en');
  assert.equal(idiomaDoCurriculo({ mercado: { foco: 'ambos', prioridade: 'internacional' } }), 'en');
  assert.equal(idiomaDoCurriculo({ mercado: { foco: 'ambos', prioridade: 'nacional' } }), 'pt');
});

test('validar recusa foco inventado e prioridade fora da lista', () => {
  assert.equal(validar({ foco: 'global' }).ok, false);
  assert.equal(validar({ foco: 'ambos', prioridade: 'europa' }).ok, false);
  assert.equal(validar({ foco: 'ambos', prioridade: 'nacional' }).ok, true);
});
