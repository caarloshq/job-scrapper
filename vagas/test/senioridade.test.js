import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pontos, ehInternacional } from '../src/senioridade.js';
import { perfil } from '../src/config.js';

const cfg = perfil.salario;
const p = (vaga, mensalBRL) => pontos('pleno', { vaga, mensalBRL, perfilSalario: cfg });

const PT_LONGO = 'Buscamos uma pessoa Product Designer para o nosso time de produto. Você vai trabalhar com discovery, pesquisa e design system, em parceria com engenharia e produto. Esperamos que você tenha experiência sólida com Figma e que saiba conduzir o processo de ponta a ponta, do problema até a entrega da solução para os nossos clientes.';
const EN_LONGO = 'We are looking for a Product Designer to join our team. You will work closely with product managers and engineers to shape the experiences that our customers use every day. The ideal candidate has strong experience with design systems and will own the design process from discovery through delivery.';

test('idioma decide a nacionalidade, não o ATS', () => {
  // Greenhouse hospeda Arco e Figma igual. A versão anterior dava bônus a
  // pleno brasileiro só por a empresa usar ferramenta gringa.
  assert.equal(ehInternacional({ fonte: 'Greenhouse', descricao: PT_LONGO }), false, 'Arco no Greenhouse é BR');
  assert.equal(ehInternacional({ fonte: 'Greenhouse', descricao: EN_LONGO }), true, 'Figma no Greenhouse é intl');
});

test('moeda estrangeira e marcação de dólar também valem', () => {
  assert.equal(ehInternacional({ pagaEmDolar: true, descricao: PT_LONGO }), true);
  assert.equal(ehInternacional({ salario: { moeda: 'USD' }, descricao: PT_LONGO }), true);
  assert.equal(ehInternacional({ salario: { moeda: 'BRL' }, descricao: PT_LONGO }), false);
});

test('NACIONAL: acima de R$ 11k vale sênior', () => {
  assert.equal(p({ descricao: PT_LONGO }, 15000), 10);
});

test('NACIONAL sem salário informado PERDE prioridade', () => {
  // Aqui, se não disseram o salário é porque não ajuda.
  assert.equal(p({ descricao: PT_LONGO }, null), 4);
});

test('NACIONAL abaixo da referência continua Pleno', () => {
  assert.equal(p({ descricao: PT_LONGO }, 9000), 4);
});

test('INTERNACIONAL sem salário informado vale sênior', () => {
  // Lá fora mid-level costuma pagar acima do sênior daqui, e não anunciar
  // valor é praxe — a ausência do número não é sinal de vaga pior.
  assert.equal(p({ descricao: EN_LONGO }, null), 10);
});

test('INTERNACIONAL com salário BAIXO informado não ganha o benefício', () => {
  // Se disseram o número e ele é ruim, o número manda.
  assert.equal(p({ descricao: EN_LONGO }, 6000), 4);
});

test('descrição curta demais não decide nacionalidade', () => {
  assert.equal(ehInternacional({ descricao: 'Product Designer' }), false);
  assert.equal(ehInternacional({ descricao: null }), false);
});

test('sênior e júnior não mudam', () => {
  assert.equal(pontos('senior', { vaga: { descricao: EN_LONGO }, mensalBRL: null, perfilSalario: cfg }), 10);
  assert.equal(pontos('junior', { vaga: { descricao: EN_LONGO }, mensalBRL: 99000, perfilSalario: cfg }), 0);
});
